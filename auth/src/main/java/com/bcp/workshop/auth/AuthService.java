package com.bcp.workshop.auth;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.Optional;

@ApplicationScoped
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordHasher passwordHasher;
    private final TokenService tokenService;

    @Inject
    public AuthService(
            UserRepository userRepository,
            PasswordHasher passwordHasher,
            TokenService tokenService
    ) {
        this.userRepository = userRepository;
        this.passwordHasher = passwordHasher;
        this.tokenService = tokenService;
    }

    public Optional<AuthenticatedUser> authenticate(String username, String password) {
        Optional<UserRecord> userRecord = userRepository.findByUsername(username);
        if (userRecord.isEmpty() || !passwordHasher.verify(password, userRecord.get().passwordHash())) {
            return Optional.empty();
        }

        UserRecord user = userRecord.get();
        String token = tokenService.create(user.username(), user.role());
        return Optional.of(new AuthenticatedUser(
                user.username(),
                user.displayName(),
                user.role(),
                token
        ));
    }
}
