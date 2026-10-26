package com.bcp.workshop.auth;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthServiceTest {
    @Test
    void authenticatesValidWorkshopCredentials() {
        PasswordHasher passwordHasher = new PasswordHasher();
        UserRecord userRecord = new UserRecord(
                1L,
                "student",
                passwordHasher.hash("Workshop123!"),
                "Workshop Student",
                "STUDENT"
        );
        AuthService authService = createService(userRecord, passwordHasher);

        Optional<AuthenticatedUser> authenticatedUser =
                authService.authenticate("student", "Workshop123!");

        assertTrue(authenticatedUser.isPresent());
        assertEquals("student", authenticatedUser.orElseThrow().username());
        assertEquals("Workshop Student", authenticatedUser.orElseThrow().displayName());
        assertEquals("STUDENT", authenticatedUser.orElseThrow().role());
        assertFalse(authenticatedUser.orElseThrow().token().isBlank());
    }

    @Test
    void rejectsUnknownUserAndIncorrectPassword() {
        PasswordHasher passwordHasher = new PasswordHasher();
        UserRecord userRecord = new UserRecord(
                1L,
                "student",
                passwordHasher.hash("Workshop123!"),
                "Workshop Student",
                "STUDENT"
        );
        AuthService authService = createService(userRecord, passwordHasher);

        assertTrue(authService.authenticate("unknown", "password").isEmpty());
        assertTrue(authService.authenticate("student", "incorrect").isEmpty());
    }

    private AuthService createService(UserRecord userRecord, PasswordHasher passwordHasher) {
        UserRepository userRepository = new UserRepository("jdbc:sqlite::memory:", passwordHasher) {
            @Override
            public Optional<UserRecord> findByUsername(String username) {
                if (!userRecord.username().equals(username)) {
                    return Optional.empty();
                }
                return Optional.of(userRecord);
            }
        };
        TokenService tokenService = new TokenService() {
            @Override
            public String create(String username, String role) {
                return "test-token";
            }
        };
        return new AuthService(userRepository, passwordHasher, tokenService);
    }
}
