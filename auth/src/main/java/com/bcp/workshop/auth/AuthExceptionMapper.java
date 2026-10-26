package com.bcp.workshop.auth;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

@Provider
public class AuthExceptionMapper implements ExceptionMapper<Exception> {
    private static final Logger LOGGER = Logger.getLogger(AuthExceptionMapper.class);
    private static final String GENERIC_ERROR_MESSAGE = "Internal server error";

    @Override
    public Response toResponse(Exception exception) {
        LOGGER.error("Authentication request failed", exception);
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(new ErrorResponse(GENERIC_ERROR_MESSAGE))
                .build();
    }
}
