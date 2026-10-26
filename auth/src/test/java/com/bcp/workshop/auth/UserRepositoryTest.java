package com.bcp.workshop.auth;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserRepositoryTest {
    private final PasswordHasher passwordHasher = new PasswordHasher();

    @BeforeAll
    static void loadSqliteDriver() throws ClassNotFoundException {
        Class.forName("org.sqlite.JDBC");
    }

    @Test
    void migratesPlaintextUsersAndRemovesPlaintextColumn(@TempDir Path directory) throws Exception {
        Path databaseFile = directory.resolve("legacy.db");
        String databaseUrl = "jdbc:sqlite:" + databaseFile;
        try (Connection connection = DriverManager.getConnection(databaseUrl);
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("""
                    CREATE TABLE legacy_users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT UNIQUE,
                        password TEXT NOT NULL,
                        display_name TEXT NOT NULL,
                        role TEXT NOT NULL
                    )
                    """);
            statement.executeUpdate("""
                    INSERT INTO legacy_users(username, password, display_name, role)
                    VALUES ('legacy', 'LegacyTest123!', 'Legacy User', 'STUDENT')
                    """);
        }

        UserRepository repository = new UserRepository(databaseUrl, passwordHasher);
        repository.initialize();

        Optional<UserRecord> migratedUser = repository.findByUsername("legacy");
        assertTrue(migratedUser.isPresent());
        assertTrue(passwordHasher.verify("LegacyTest123!", migratedUser.orElseThrow().passwordHash()));
        assertFalse(migratedUser.orElseThrow().passwordHash().contains("LegacyTest123!"));
        assertTrue(repository.findByUsername("student").isPresent());

        try (Connection connection = DriverManager.getConnection(databaseUrl);
             Statement statement = connection.createStatement();
             ResultSet columns = statement.executeQuery("PRAGMA table_info(legacy_users)")) {
            while (columns.next()) {
                assertFalse("password".equals(columns.getString("name")));
            }
        }
    }

    @Test
    void parameterizedLookupDoesNotMatchUnstoredUsername(@TempDir Path directory) {
        String databaseUrl = "jdbc:sqlite:" + directory.resolve("users.db");
        UserRepository repository = new UserRepository(databaseUrl, passwordHasher);
        repository.initialize();

        assertTrue(repository.findByUsername("student").isPresent());
        assertTrue(repository.findByUsername("unknown'example").isEmpty());
    }
}
