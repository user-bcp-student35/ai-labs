package com.bcp.workshop.auth;

public record AuthenticatedUser(String username, String displayName, String role, String token) {}
