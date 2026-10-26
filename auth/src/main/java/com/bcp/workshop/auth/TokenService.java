package com.bcp.workshop.auth;

import io.smallrye.jwt.build.Jwt;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.Duration;
import java.time.Instant;

@ApplicationScoped
public class TokenService {
    private static final String TOKEN_ISSUER = "ai-labs-auth";
    private static final Duration TOKEN_LIFETIME = Duration.ofHours(1);
    static final long TOKEN_LIFETIME_SECONDS = TOKEN_LIFETIME.toSeconds();

    public String create(String username, String role) {
        return Jwt.issuer(TOKEN_ISSUER)
                .subject(username)
                .groups(role)
                .expiresAt(Instant.now().plus(TOKEN_LIFETIME))
                .sign();
    }
}
