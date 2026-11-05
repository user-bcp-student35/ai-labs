// LocalWritePermissionTestServiceTest.java
package pe.bcp.login.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

class LocalWritePermissionTestServiceTest {

    @Test
    void writesAndRemovesTemporaryFileWithoutReturningDirectory() throws IOException {
        Path directory = Files.createTempDirectory("mcp-write-test-");
        Clock clock = Clock.fixed(
                Instant.parse("2026-11-05T21:40:00Z"),
                ZoneOffset.UTC
        );

        try {
            LocalWritePermissionTestService service =
                    new LocalWritePermissionTestService(true, directory, clock);

            String json = service.run(Collections.<String, Object>emptyMap());

            assertTrue(json.contains("\"result\":\"ALLOWED\""));
            assertTrue(json.contains("\"writePermission\":true"));
            assertTrue(json.contains("\"cleanup\":\"COMPLETED\""));
            assertTrue(json.contains("\"checkedAt\":\"2026-11-05T21:40:00Z\""));
            assertFalse(json.contains(directory.toString()));

            try (Stream<Path> files = Files.list(directory)) {
                assertEquals(0L, files.count());
            }
        } finally {
            Files.deleteIfExists(directory);
        }
    }

    @Test
    void rejectsAdditionalArgumentsBeforeWriting() throws IOException {
        Path directory = Files.createTempDirectory("mcp-write-test-");

        try {
            LocalWritePermissionTestService service =
                    new LocalWritePermissionTestService(true, directory);

            LocalWritePermissionTestService.ToolExecutionException exception =
                    assertThrows(
                            LocalWritePermissionTestService.ToolExecutionException.class,
                            () -> service.run(Collections.singletonMap("path", "/tmp"))
                    );

            assertEquals("INVALID_ARGUMENTS", exception.getCode());
            try (Stream<Path> files = Files.list(directory)) {
                assertEquals(0L, files.count());
            }
        } finally {
            Files.deleteIfExists(directory);
        }
    }

    @Test
    void rejectsDisabledOrUnconfiguredTool() {
        LocalWritePermissionTestService disabled =
                new LocalWritePermissionTestService(false, null);

        LocalWritePermissionTestService.ToolExecutionException disabledException =
                assertThrows(
                        LocalWritePermissionTestService.ToolExecutionException.class,
                        () -> disabled.run(Collections.<String, Object>emptyMap())
                );
        assertEquals("TEST_DISABLED", disabledException.getCode());

        LocalWritePermissionTestService unconfigured =
                new LocalWritePermissionTestService(true, null);

        LocalWritePermissionTestService.ToolExecutionException configException =
                assertThrows(
                        LocalWritePermissionTestService.ToolExecutionException.class,
                        () -> unconfigured.run(Collections.<String, Object>emptyMap())
                );
        assertEquals("TEST_NOT_CONFIGURED", configException.getCode());
    }

    @Test
    void reportsIoErrorWithoutExposingConfiguredPath() throws IOException {
        Path parent = Files.createTempDirectory("mcp-write-test-");
        Path missingDirectory = parent.resolve("does-not-exist");

        try {
            LocalWritePermissionTestService service =
                    new LocalWritePermissionTestService(true, missingDirectory);

            String json = service.run(Collections.<String, Object>emptyMap());

            assertTrue(json.contains("\"result\":\"ERROR\""));
            assertTrue(json.contains("\"writePermission\":null"));
            assertTrue(json.contains("\"cleanup\":\"NOT_REQUIRED\""));
            assertTrue(json.contains("\"code\":\"PROBE_IO_ERROR\""));
            assertFalse(json.contains(missingDirectory.toString()));
        } finally {
            Files.deleteIfExists(parent);
        }
    }
}