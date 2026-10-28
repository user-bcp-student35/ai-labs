package com.bcp.workshop.auth;

import io.smallrye.jwt.auth.principal.JWTParser;
import io.smallrye.jwt.build.Jwt;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusMock;
import io.smallrye.jwt.auth.principal.ParseException;
import jakarta.inject.Inject;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.containsString;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
class AuthResourceTest {
    @Inject
    JWTParser tokenParser;

    @Inject
    UserRepository userRepository;

    @Inject
    PasswordHasher passwordHasher;

    @Inject
    TokenService tokenService;

    @Test
    void reportsHealthyStatus() {
        given()
                .when().get("/q/health")
                .then()
                .statusCode(200)
                .body("status", is("UP"));
    }

    @Test
    void reportsNoHealthChecksWithoutAuthorization() {
        given()
                .when().get("/q/health")
                .then()
                .statusCode(200)
                .body("checks", hasSize(0));
    }

    @Test
    void logsInWithWorkshopUserAndReturnsObservedResponse() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\"Workshop123!\",\"client\":\"angular-workshop\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(200)
                .body("user.username", is("student"))
                .body("user.displayName", is("Workshop Student"))
                .body("user.role", is("STUDENT"))
                .body("token", notNullValue())
                .body("expiresIn", is(3600))
                .body("debug", is("authenticated-with-legacy-flow"));
    }

    @Test
    void logsInWhenOptionalClientFieldIsAbsent() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(200)
                .body("user.username", is("student"))
                .body("token", notNullValue());
    }

    @Test
    void returnsGenericServerErrorWhenAuthenticationThrowsUnexpectedly() {
        AuthService failingAuthService = new AuthService(
                userRepository,
                passwordHasher,
                tokenService
        ) {
            @Override
            public Optional<AuthenticatedUser> authenticate(String username, String password) {
                throw new IllegalStateException("controlled-test-detail");
            }
        };
        QuarkusMock.installMockForType(failingAuthService, AuthService.class);

        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(500)
                .body("message", is("Internal server error"));
    }

    @Test
    void rejectsBlankUsername() {
        given()
                .contentType("application/json")
                .body("{\"username\":\" \",\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Username is required"));
    }

    @Test
    void rejectsMissingUsernameField() {
        given()
                .contentType("application/json")
                .body("{\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Username is required"));
    }

    @Test
    void rejectsNullUsername() {
        given()
                .contentType("application/json")
                .body("{\"username\":null,\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Username is required"));
    }

    @Test
    void rejectsBlankPassword() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\" \"}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Password is required"));
    }

    @Test
    void rejectsMissingPasswordField() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Password is required"));
    }

    @Test
    void rejectsNullPassword() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":null}")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", is("Password is required"));
    }

    @Test
    void rejectsInvalidCredentials() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"unknown\",\"password\":\"invalid\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("message", is("Invalid user unknown or password"));
    }

    @Test
    void rejectsIncorrectPasswordForExistingUser() {
        given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\"incorrect\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("message", is("Invalid user student or password"));
    }

    @Test
    void returnsSignedTokenWithExplicitClaimsAndExpiry() throws ParseException {
        String token = given()
                .contentType("application/json")
                .body("{\"username\":\"student\",\"password\":\"Workshop123!\"}")
                .when().post("/auth/login")
                .then()
                .statusCode(200)
                .extract()
                .path("token");

        JsonWebToken verifiedToken = tokenParser.parse(token);

        assertEquals("student", verifiedToken.getSubject());
        assertTrue(verifiedToken.getGroups().contains("STUDENT"));
        assertTrue(verifiedToken.getExpirationTime() > Instant.now().getEpochSecond());
    }

    @Test
    void rejectsAlteredSignatureAndExpiredToken() {
        String validToken = Jwt.issuer("ai-labs-auth")
                .subject("student")
                .groups("STUDENT")
                .expiresAt(Instant.now().plus(Duration.ofHours(1)))
                .sign();
        String[] tokenParts = validToken.split("\\.");
        String firstSignatureCharacter = tokenParts[2].startsWith("a") ? "b" : "a";
        String alteredToken = tokenParts[0] + "." + tokenParts[1] + "."
                + firstSignatureCharacter + tokenParts[2].substring(1);
        String expiredToken = Jwt.issuer("ai-labs-auth")
                .subject("student")
                .groups("STUDENT")
                .expiresAt(Instant.now().minus(Duration.ofHours(1)))
                .sign();

        assertThrows(ParseException.class, () -> tokenParser.parse(alteredToken));
        assertThrows(ParseException.class, () -> tokenParser.parse(expiredToken));
    }

    @Test
    void exposesCurrentCorsBehaviorForAnyOrigin() {
        given()
                .header("Origin", "https://unapproved.example")
                .header("Access-Control-Request-Method", "POST")
                .when().options("/auth/login")
                .then()
                .header("Access-Control-Allow-Origin", is("https://unapproved.example"));
    }

    @Test
    void rejectsNullRequestBody() {
        given()
                .contentType("application/json")
                .body("null")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .body("message", containsString("Request is null"));
    }

    @Test
    void returnsJsonBadRequestForMalformedJson() {
        given()
                .contentType("application/json")
                .body("{")
                .when().post("/auth/login")
                .then()
                .statusCode(400)
                .contentType("application/json")
                .body("message", is("Malformed request"));
    }

    @Test
    void returnsJsonUnsupportedMediaTypeForUnsupportedContentType() {
        given()
                .contentType("text/plain")
                .body("username=student&password=Workshop123!")
                .when().post("/auth/login")
                .then()
                .statusCode(415)
                .contentType("application/json")
                .body("message", is("Unsupported media type"));
    }
}
