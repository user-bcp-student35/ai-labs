// LocalWritePermissionTestService.java
package pe.bcp.login.service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AccessDeniedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Clock;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Servicio para la herramienta MCP test_local_write_permission.
 * El adaptador MCP debe pasar los argumentos recibidos y devolver el JSON
 * producido como contenido de texto.
 */
public final class LocalWritePermissionTestService {
    private static final String SCHEMA_VERSION = "1";
    private static final String TEMP_PREFIX = "mcp-write-probe-";
    private static final String TEMP_SUFFIX = ".tmp";
    private static final byte[] PROBE_CONTENT =
            "mcp local write permission test\n".getBytes(StandardCharsets.UTF_8);

    private final boolean enabled;
    private final Path directory;
    private final Clock clock;

    /**
     * @param enabled habilita o deshabilita la herramienta
     * @param directory directorio local permitido; null indica que no está configurado
     */
    public LocalWritePermissionTestService(boolean enabled, Path directory) {
        this(enabled, directory, Clock.systemUTC());
    }

    public LocalWritePermissionTestService(boolean enabled, Path directory, Clock clock) {
        this.enabled = enabled;
        this.directory = isUnconfigured(directory)
                ? null
                : directory.toAbsolutePath().normalize();
        this.clock = Objects.requireNonNull(clock, "clock no puede ser null");
    }

    /**
     * Ejecuta la comprobación. Solo acepta un objeto de argumentos vacío.
     *
     * @return JSON del resultado de negocio, listo para incluirse como texto MCP
     * @throws ToolExecutionException si la solicitud no es válida o la herramienta
     *                                está deshabilitada/no configurada
     */
    public String run(Map<String, ?> arguments) {
        if (arguments == null || !arguments.isEmpty()) {
            throw new ToolExecutionException(
                    "INVALID_ARGUMENTS",
                    "La herramienta no acepta argumentos."
            );
        }
        if (!enabled) {
            throw new ToolExecutionException(
                    "TEST_DISABLED",
                    "La prueba de escritura está deshabilitada."
            );
        }
        if (directory == null) {
            throw new ToolExecutionException(
                    "TEST_NOT_CONFIGURED",
                    "La prueba de escritura no está configurada."
            );
        }

        String testId = UUID.randomUUID().toString();
        Instant checkedAt = clock.instant();
        Path tempFile = null;

        try {
            tempFile = Files.createTempFile(directory, TEMP_PREFIX, TEMP_SUFFIX);
            Files.write(
                    tempFile,
                    PROBE_CONTENT,
                    StandardOpenOption.WRITE,
                    StandardOpenOption.TRUNCATE_EXISTING
            );
        } catch (AccessDeniedException ex) {
            Cleanup cleanup = cleanup(tempFile);
            String code = cleanup == Cleanup.FAILED
                    ? "CLEANUP_FAILED"
                    : "WRITE_PERMISSION_DENIED";
            return resultJson(testId, checkedAt, "DENIED", Boolean.FALSE, cleanup, code);
        } catch (SecurityException ex) {
            Cleanup cleanup = cleanup(tempFile);
            String code = cleanup == Cleanup.FAILED
                    ? "CLEANUP_FAILED"
                    : "WRITE_PERMISSION_DENIED";
            return resultJson(testId, checkedAt, "DENIED", Boolean.FALSE, cleanup, code);
        } catch (IOException ex) {
            Cleanup cleanup = cleanup(tempFile);
            String code = cleanup == Cleanup.FAILED
                    ? "CLEANUP_FAILED"
                    : "PROBE_IO_ERROR";
            return resultJson(testId, checkedAt, "ERROR", null, cleanup, code);
        }

        Cleanup cleanup = cleanup(tempFile);
        String code = cleanup == Cleanup.FAILED ? "CLEANUP_FAILED" : null;
        return resultJson(testId, checkedAt, "ALLOWED", Boolean.TRUE, cleanup, code);
    }

    private static boolean isUnconfigured(Path path) {
        return path == null || path.toString().trim().isEmpty();
    }

    private static Cleanup cleanup(Path tempFile) {
        if (tempFile == null) {
            return Cleanup.NOT_REQUIRED;
        }

        try {
            Files.deleteIfExists(tempFile);
            return Cleanup.COMPLETED;
        } catch (IOException | SecurityException ex) {
            return Cleanup.FAILED;
        }
    }

    private static String resultJson(
            String testId,
            Instant checkedAt,
            String result,
            Boolean writePermission,
            Cleanup cleanup,
            String code
    ) {
        StringBuilder json = new StringBuilder(240);
        json.append('{')
                .append("\"schemaVersion\":");
        appendJsonString(json, SCHEMA_VERSION);

        json.append(",\"testId\":");
        appendJsonString(json, testId);

        json.append(",\"checkedAt\":");
        appendJsonString(json, DateTimeFormatter.ISO_INSTANT.format(checkedAt));

        json.append(",\"result\":");
        appendJsonString(json, result);

        json.append(",\"writePermission\":");
        if (writePermission == null) {
            json.append("null");
        } else {
            json.append(writePermission.booleanValue());
        }

        json.append(",\"cleanup\":");
        appendJsonString(json, cleanup.name());

        if (code != null) {
            json.append(",\"code\":");
            appendJsonString(json, code);
        }

        return json.append('}').toString();
    }

    private static void appendJsonString(StringBuilder output, String value) {
        output.append('"');
        for (int i = 0; i < value.length(); i++) {
            char character = value.charAt(i);
            switch (character) {
                case '"':
                    output.append("\\\"");
                    break;
                case '\\':
                    output.append("\\\\");
                    break;
                case '\b':
                    output.append("\\b");
                    break;
                case '\f':
                    output.append("\\f");
                    break;
                case '\n':
                    output.append("\\n");
                    break;
                case '\r':
                    output.append("\\r");
                    break;
                case '\t':
                    output.append("\\t");
                    break;
                default:
                    if (character < 0x20) {
                        output.append("\\u");
                        String hex = Integer.toHexString(character);
                        for (int padding = hex.length(); padding < 4; padding++) {
                            output.append('0');
                        }
                        output.append(hex);
                    } else {
                        output.append(character);
                    }
            }
        }
        output.append('"');
    }

    private enum Cleanup {
        COMPLETED,
        FAILED,
        NOT_REQUIRED
    }

    public static final class ToolExecutionException extends RuntimeException {
        private static final long serialVersionUID = 1L;

        private final String code;

        public ToolExecutionException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String getCode() {
            return code;
        }
    }
}