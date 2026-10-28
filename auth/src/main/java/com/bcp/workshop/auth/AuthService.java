package com.bcp.workshop.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Optional;

@ApplicationScoped
public class AuthService {
    private static final String TIMING_PADDING_PASSWORD = "unknown-user-timing-padding";

    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final TokenService tokenService;
    private final String timingPaddingHash;

    @Inject
    public AuthService(
            UserRepository userRepository,
            PasswordHasher passwordHasher,
            TokenService tokenService
    ) {
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
        this.timingPaddingHash = passwordHasher.hash(TIMING_PADDING_PASSWORD);
    }

    public Optional<AuthenticatedUser> authenticate(String username, String password) {
        Optional<UserRecord> userRecord = userRepository.findByUsername(username);
        if (userRecord.isEmpty()) {
            passwordHasher.verify(password, timingPaddingHash);
            return Optional.empty();
        }

        UserRecord user = userRecord.get();
        if (!passwordHasher.verify(password, user.passwordHash())) {
            return Optional.empty();
        }

        String token = tokenService.create(user.username(), user.role());
        return Optional.of(new AuthenticatedUser(
                user.username(),
                user.displayName(),
                user.role(),
                token
        ));
    }
}
