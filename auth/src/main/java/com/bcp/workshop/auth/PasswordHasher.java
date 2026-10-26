package com.bcp.workshop.auth;

import jakarta.enterprise.context.ApplicationScoped;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

@ApplicationScoped
public class PasswordHasher {
    private static final String HASH_PREFIX = "pbkdf2-sha256";
    private static final String KEY_ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATION_COUNT = 600_000;
    private static final int MINIMUM_ITERATION_COUNT = 600_000;
    private static final int MAXIMUM_ITERATION_COUNT = 1_200_000;
    private static final int SALT_LENGTH_BYTES = 16;
    private static final int HASH_LENGTH_BITS = 256;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    public String hash(String password) {
        byte[] salt = new byte[SALT_LENGTH_BYTES];
        SECURE_RANDOM.nextBytes(salt);
        byte[] hash = deriveHash(password.toCharArray(), salt, ITERATION_COUNT);

        return String.join("$",
                HASH_PREFIX,
                Integer.toString(ITERATION_COUNT),
                Base64.getEncoder().withoutPadding().encodeToString(salt),
                Base64.getEncoder().withoutPadding().encodeToString(hash)
        );
    }

    public boolean verify(String password, String encodedHash) {
        String[] parts = encodedHash.split("\\$", -1);
        if (parts.length != 4 || !HASH_PREFIX.equals(parts[0])) {
            return false;
        }

        int iterations = parseIterations(parts[1]);
        if (iterations < MINIMUM_ITERATION_COUNT || iterations > MAXIMUM_ITERATION_COUNT) {
            return false;
        }

        byte[] salt;
        byte[] expectedHash;
        try {
            salt = Base64.getDecoder().decode(parts[2]);
            expectedHash = Base64.getDecoder().decode(parts[3]);
        } catch (IllegalArgumentException exception) {
            return false;
        }
        if (salt.length != SALT_LENGTH_BYTES || expectedHash.length != HASH_LENGTH_BITS / Byte.SIZE) {
            return false;
        }

        byte[] actualHash = deriveHash(password.toCharArray(), salt, iterations);
        return MessageDigest.isEqual(expectedHash, actualHash);
    }

    private int parseIterations(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException exception) {
            return 0;
        }
    }

    private byte[] deriveHash(char[] password, byte[] salt, int iterations) {
        PBEKeySpec keySpec = new PBEKeySpec(password, salt, iterations, HASH_LENGTH_BITS);
        try {
            return SecretKeyFactory.getInstance(KEY_ALGORITHM)
                    .generateSecret(keySpec)
                    .getEncoded();
        } catch (GeneralSecurityException exception) {
            throw new IllegalStateException("Password hashing is unavailable", exception);
        } finally {
            keySpec.clearPassword();
            java.util.Arrays.fill(password, '\0');
        }
    }
}
