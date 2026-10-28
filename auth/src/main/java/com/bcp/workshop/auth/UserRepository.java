package com.bcp.workshop.auth;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@ApplicationScoped
public class UserRepository {
    private static final String USERS_TABLE = "legacy_users";
    private static final String STUDENT_USERNAME = "student";
    private static final String STUDENT_PASSWORD = "Workshop123!";
    private static final String STUDENT_DISPLAY_NAME = "Workshop Student";
    private static final String STUDENT_ROLE = "STUDENT";
    private static final String TRAINER_USERNAME = "trainer";
    private static final String TRAINER_PASSWORD = "Trainer123!";
    private static final String TRAINER_DISPLAY_NAME = "Workshop Trainer";
    private static final String TRAINER_ROLE = "TRAINER";
    private static final String SQLITE_JDBC_PREFIX = "jdbc:sqlite:";
    private static final String IN_MEMORY_DATABASE = ":memory:";
    private static final String SQLITE_FILE_PREFIX = "file:";
    private static final String CREATE_USERS_TABLE_SQL = """
            CREATE TABLE legacy_users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL
            )
            """;
    private static final String FIND_USER_SQL = """
            SELECT id, username, password_hash, display_name, role
            FROM legacy_users
            WHERE username = ?
            """;

    private final String databaseUrl;
    private final boolean seedEnabled;
    private final PasswordHasher passwordHasher;

    @Inject
    public UserRepository(
            @ConfigProperty(name = "auth.db.url") String databaseUrl,
            @ConfigProperty(name = "auth.seed.enabled") boolean seedEnabled,
            PasswordHasher passwordHasher
    ) {
        this.databaseUrl = databaseUrl;
        this.seedEnabled = seedEnabled;
        this.passwordHasher = passwordHasher;
    }

    @PostConstruct
    void initialize() {
        try {
            createDatabaseDirectory();
            initializeSchemaAndSeedUsers();
        } catch (IOException | SQLException exception) {
            throw new IllegalStateException("Could not initialize authentication database", exception);
        }
    }

    public Optional<UserRecord> findByUsername(String username) {
        try (Connection connection = DriverManager.getConnection(databaseUrl);
             PreparedStatement statement = connection.prepareStatement(FIND_USER_SQL)) {
            statement.setString(1, username);
            try (ResultSet result = statement.executeQuery()) {
                if (!result.next()) {
                    return Optional.empty();
                }
                return Optional.of(new UserRecord(
                        result.getLong("id"),
                        result.getString("username"),
                        result.getString("password_hash"),
                        result.getString("display_name"),
                        result.getString("role")
                ));
            }
        } catch (SQLException exception) {
            throw new IllegalStateException("Could not query authentication database", exception);
        }
    }

    private void createDatabaseDirectory() throws IOException {
        if (!databaseUrl.startsWith(SQLITE_JDBC_PREFIX)) {
            return;
        }

        String databasePath = databaseUrl.substring(SQLITE_JDBC_PREFIX.length());
        if (databasePath.isBlank()
                || databasePath.equals(IN_MEMORY_DATABASE)
                || databasePath.startsWith(SQLITE_FILE_PREFIX)) {
            return;
        }

        Path parent = Path.of(databasePath).toAbsolutePath().getParent();
        if (parent != null) {
            Files.createDirectories(parent);
        }
    }

    private void initializeSchemaAndSeedUsers() throws SQLException {
        try (Connection connection = DriverManager.getConnection(databaseUrl)) {
            connection.setAutoCommit(false);
            try {
                if (!tableExists(connection)) {
                    createUsersTable(connection);
                } else {
                    migratePasswordColumnsIfRequired(connection);
                }
                if (seedEnabled) {
                    ensureSeedUser(
                            connection,
                            STUDENT_USERNAME,
                            STUDENT_PASSWORD,
                            STUDENT_DISPLAY_NAME,
                            STUDENT_ROLE
                    );
                    ensureSeedUser(
                            connection,
                            TRAINER_USERNAME,
                            TRAINER_PASSWORD,
                            TRAINER_DISPLAY_NAME,
                            TRAINER_ROLE
                    );
                }
                connection.commit();
            } catch (SQLException | RuntimeException exception) {
                connection.rollback();
                throw exception;
            }
        }
    }

    private boolean tableExists(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")) {
            statement.setString(1, USERS_TABLE);
            try (ResultSet result = statement.executeQuery()) {
                return result.next();
            }
        }
    }

    private void migratePasswordColumnsIfRequired(Connection connection) throws SQLException {
        Set<String> columns = getUserColumns(connection);
        boolean hasPasswordHash = columns.contains("password_hash");
        boolean hasPlaintextPassword = columns.contains("password");
        if (hasPasswordHash && !hasPlaintextPassword) {
            return;
        }
        if (!hasPasswordHash && !hasPlaintextPassword) {
            throw new SQLException("Authentication table has no password column to migrate");
        }

        List<LegacyUser> existingUsers = readLegacyUsers(connection, hasPasswordHash);
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate("DROP TABLE legacy_users");
        }
        createUsersTable(connection);
        for (LegacyUser user : existingUsers) {
            insertMigratedUser(connection, user);
        }
    }

    private Set<String> getUserColumns(Connection connection) throws SQLException {
        Set<String> columns = new HashSet<>();
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery("PRAGMA table_info(legacy_users)")) {
            while (result.next()) {
                columns.add(result.getString("name"));
            }
        }
        return columns;
    }

    private List<LegacyUser> readLegacyUsers(Connection connection, boolean hasPasswordHash) throws SQLException {
        String passwordColumn = hasPasswordHash ? "password_hash" : "password";
        String sql = "SELECT id, username, " + passwordColumn
                + " AS credential, display_name, role FROM legacy_users";
        List<LegacyUser> users = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            while (result.next()) {
                users.add(new LegacyUser(
                        result.getLong("id"),
                        result.getString("username"),
                        result.getString("credential"),
                        result.getString("display_name"),
                        result.getString("role"),
                        hasPasswordHash
                ));
            }
        }
        return users;
    }

    private void createUsersTable(Connection connection) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.executeUpdate(CREATE_USERS_TABLE_SQL);
        }
    }

    private void insertMigratedUser(Connection connection, LegacyUser user) throws SQLException {
        String passwordHash = user.hashedCredential() && isPasswordHash(user.credential())
                ? user.credential()
                : passwordHasher.hash(user.credential());
        String sql = """
                INSERT INTO legacy_users(id, username, password_hash, display_name, role)
                VALUES (?, ?, ?, ?, ?)
                """;
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setLong(1, user.id());
            statement.setString(2, user.username());
            statement.setString(3, passwordHash);
            statement.setString(4, user.displayName());
            statement.setString(5, user.role());
            statement.executeUpdate();
        }
    }

    private boolean isPasswordHash(String value) {
        return value != null && value.startsWith("pbkdf2-sha256$");
    }

    private void ensureSeedUser(
            Connection connection,
            String username,
            String password,
            String displayName,
            String role
    ) throws SQLException {
        try (PreparedStatement lookup = connection.prepareStatement(
                "SELECT 1 FROM legacy_users WHERE username = ?")) {
            lookup.setString(1, username);
            try (ResultSet result = lookup.executeQuery()) {
                if (result.next()) {
                    return;
                }
            }
        }

        String sql = """
                INSERT INTO legacy_users(username, password_hash, display_name, role)
                VALUES (?, ?, ?, ?)
                """;
        try (PreparedStatement insert = connection.prepareStatement(sql)) {
            insert.setString(1, username);
            insert.setString(2, passwordHasher.hash(password));
            insert.setString(3, displayName);
            insert.setString(4, role);
            insert.executeUpdate();
        }
    }

    private record LegacyUser(
            long id,
            String username,
            String credential,
            String displayName,
            String role,
            boolean hashedCredential
    ) {}
}
