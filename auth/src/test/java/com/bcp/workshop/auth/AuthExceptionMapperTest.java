package com.bcp.workshop.auth;

import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;

class AuthExceptionMapperTest {
    @Test
    void errorResponseIsGenericAndDoesNotExposeExceptionDetails() {
        Response response = new AuthExceptionMapper()
                .toResponse(new IllegalStateException("controlled-test-detail"));

        assertEquals(500, response.getStatus());
        ErrorResponse error = assertInstanceOf(ErrorResponse.class, response.getEntity());
        assertEquals("Internal server error", error.message());
        assertFalse(error.toString().contains("controlled-test-detail"));
    }
}
