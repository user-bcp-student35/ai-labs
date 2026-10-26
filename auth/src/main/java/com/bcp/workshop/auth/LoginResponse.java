package com.bcp.workshop.auth;

public record LoginResponse(String token, long expiresIn, UserResponse user, String debug) {}
