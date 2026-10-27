package com.bcp.workshop.auth;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import org.jboss.logging.Logger;

@Provider
public class AuthExceptionMapper implements ExceptionMapper<Exception> {
    private static final Logger LOGGER = Logger.getLogger(AuthExceptionMapper.class);
    private static final String GENERIC_ERROR_MESSAGE = "Internal server error";

    @Override
    public Response toResponse(Exception exception) {
        if (exception instanceof WebApplicationException webException) {
            int status = webException.getResponse().getStatus();
            if (status == Response.Status.BAD_REQUEST.getStatusCode()) {
                return clientError(status, "Malformed request");
            }
            if (status == Response.Status.UNSUPPORTED_MEDIA_TYPE.getStatusCode()) {
                return clientError(status, "Unsupported media type");
            }
        }

        LOGGER.error("Authentication request failed", exception);
        return Response.status(Response.Status.INTERNAL_SERVER_ERROR)
                .entity(new ErrorResponse(GENERIC_ERROR_MESSAGE))
                .build();
    }

    private Response clientError(int status, String message) {
        return Response.status(status)
                .type("application/json")
                .entity(new ErrorResponse(message))
                .build();
    }
}
