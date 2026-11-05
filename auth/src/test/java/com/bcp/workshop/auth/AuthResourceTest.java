package com.bcp.workshop.auth;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.hamcrest.Matchers.nullValue;

@QuarkusTest
class AuthResourceTest {
    private static final String INJECTION_LIKE_VALUE = "' OR '1'='1";

    // Spec auth-login: "Valid credentials preserve the login success contract" (tarea 1.1).
    @Test
    void logsInWithWorkshopUser() {
        given()
                .contentType("application/json")
                .body(loginBody("student", "Workshop123!"))
                .when().post("/auth/login")
                .then()
                .statusCode(200)
                .body("token", notNullValue())
                .body("expiresIn", is(3600))
                .body("user.username", is("student"))
                .body("user.displayName", is("Workshop Student"))
                .body("user.role", is("STUDENT"))
                .body("debug", is("authenticated-with-legacy-flow"));
    }

    // Spec auth-login: "Injection-like value submitted as username" (tarea 1.2).
    // La contraseña es la válida para que solo el username sea el valor bajo prueba.
    @Test
    void rejectsInjectionLikeUsername() {
        given()
                .contentType("application/json")
                .body(loginBody(INJECTION_LIKE_VALUE, "Workshop123!"))
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("token", nullValue());
    }

    // Spec auth-login: "Injection-like value submitted as password" (tarea 1.2).
    @Test
    void rejectsInjectionLikePassword() {
        given()
                .contentType("application/json")
                .body(loginBody("student", INJECTION_LIKE_VALUE))
                .when().post("/auth/login")
                .then()
                .statusCode(401)
                .body("token", nullValue());
    }

    private static String loginBody(String username, String password) {
        return "{\"username\":\"" + username + "\",\"password\":\"" + password + "\",\"client\":\"angular-workshop\"}";
    }
}
