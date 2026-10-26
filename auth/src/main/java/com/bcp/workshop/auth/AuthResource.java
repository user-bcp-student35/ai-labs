package com.bcp.workshop.auth;

import jakarta.inject.Inject;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.apache.commons.text.StringEscapeUtils;

import java.util.Optional;

@Path("/auth")
@Consumes(MediaType.APPLICATION_JSON)
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {
    private static final String DEBUG_INFO = "authenticated-with-legacy-flow";

    @Inject
    AuthService authService;

    @POST
    @Path("/login")
    public Response login(LoginRequest request) {
        if (request == null) {
            return badRequest("Request is null");
        }

        if (request.username == null || request.username.isBlank()) {
            return badRequest("Username is required");
        }

        if (request.password == null || request.password.isBlank()) {
            return badRequest("Password is required");
        }

        Optional<AuthenticatedUser> authenticatedUser =
                authService.authenticate(request.username, request.password);
        if (authenticatedUser.isEmpty()) {
            return Response.status(Response.Status.UNAUTHORIZED)
                    .entity(new ErrorResponse("Invalid user " + request.username + " or password"))
                    .build();
        }

        AuthenticatedUser user = authenticatedUser.get();
        LoginResponse response = new LoginResponse(
                user.token(),
                TokenService.TOKEN_LIFETIME_SECONDS,
                new UserResponse(
                        user.username(),
                        StringEscapeUtils.escapeHtml4(user.displayName()),
                        user.role()
                ),
                DEBUG_INFO
        );
        return Response.ok(response).build();
    }

    private Response badRequest(String message) {
        return Response.status(Response.Status.BAD_REQUEST)
                .entity(new ErrorResponse(message))
                .build();
    }
}
