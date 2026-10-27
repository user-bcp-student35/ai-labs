package com.bcp.workshop.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordHasherTest {
    private final PasswordHasher passwordHasher = new PasswordHasher();

    @Test
    void storesUniqueSaltedHashesAndVerifiesPassword() {
        String firstHash = passwordHasher.hash("Workshop123!");
        String secondHash = passwordHasher.hash("Workshop123!");

        assertNotEquals(firstHash, secondHash);
        assertTrue(passwordHasher.verify("Workshop123!", firstHash));
        assertFalse(passwordHasher.verify("incorrect", firstHash));
    }

    @Test
    void rejectsMalformedOrUnsupportedHash() {
        assertFalse(passwordHasher.verify("password", "not-a-hash"));
        assertFalse(passwordHasher.verify("password", "pbkdf2-sha256$invalid$salt$hash"));
        assertFalse(passwordHasher.verify("password", "pbkdf2-sha256$600000$!$!"));
        assertFalse(passwordHasher.verify("password", "pbkdf2-sha256$1200001$c2FsdA$aGFzaA"));
    }
}
