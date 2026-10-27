package com.bcp.workshop.auth;

public record UserRecord(long id, String username, String passwordHash, String displayName, String role) {}
