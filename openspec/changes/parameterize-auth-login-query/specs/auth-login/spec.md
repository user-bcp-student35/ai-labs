# Spec Delta

## Purpose

Defines the observable login behavior for valid credentials and ensures submitted credentials cannot bypass authentication by changing the meaning of the credential lookup.

## ADDED Requirements

### Requirement: Valid credentials preserve the login success contract
The system SHALL continue to authenticate valid credentials through `POST /auth/login` and return the established successful response.

#### Scenario: Login with valid workshop credentials
- **WHEN** a client submits `student` and `Workshop123!` to `POST /auth/login`
- **THEN** the response is HTTP 200 and includes `user.username` equal to `student` and a non-null `token`

### Requirement: Credential input cannot bypass authentication
The system SHALL treat credential values as account data and SHALL NOT authenticate a request unless its submitted username and password match a stored account.

#### Scenario: Injection-like value submitted as username
- **WHEN** a client submits `' OR '1'='1` as the username to `POST /auth/login`
- **THEN** the response is HTTP 401 and does not include a `token`

#### Scenario: Injection-like value submitted as password
- **WHEN** a client submits `' OR '1'='1` as the password to `POST /auth/login`
- **THEN** the response is HTTP 401 and does not include a `token`
