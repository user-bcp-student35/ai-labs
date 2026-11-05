# Design

## Context

See `proposal.md` for the motivation and `specs/auth-login/spec.md` for the observable requirements.

The login flow is limited to the `auth/` component. `AuthResource.login` validates the request, delegates credential lookup to `LegacyDatabase.findByCredentials`, and creates the existing token and response only when a user is returned. The repository currently builds its SQLite query by concatenating the username and password into SQL and executing it with a `Statement`. The existing endpoint test covers successful login but does not characterize rejection of injection-like credentials.

The change must keep `POST /auth/login`, its existing validation and response behavior, and the current user schema. No database migration or new dependency is needed.

## Goals / Non-Goals

**Goals:**

- Make username and password values data-only inputs to the credential lookup.
- Preserve the established login status codes and successful response contract.
- Add endpoint-level tests for valid credentials and injection-like values in each credential field before changing the lookup.
- Keep the implementation and tests within `auth/`.

**Non-Goals:**

- Refactor authentication into new API, service, repository, or security layers.
- Change request validation, account storage, token creation, token contents or expiry, or response fields.
- Change database initialization, introduce schema migrations, add dependencies, or modify `api/`, `web/`, or general evidence documents.

## Contracts Protected

- The endpoint remains `POST /auth/login`.
- Missing request, username, or password continue to use the existing HTTP 400 behavior.
- Unknown or non-matching credentials continue to return HTTP 401 without a token.
- Valid workshop credentials continue to return HTTP 200 with the existing response shape, including `user.username`, `token`, and the other currently emitted fields.
- Submitted credential values are compared as literal values; they must not affect SQL syntax or authenticate unless they match a stored account.

## Components Affected

- `auth/src/main/java/com/bcp/workshop/auth/LegacyDatabase.java`: the credential lookup implementation.
- `auth/src/test/java/com/bcp/workshop/auth/AuthResourceTest.java`: endpoint characterization and regression coverage.
- `AuthResource` and token generation should remain unchanged unless implementation exposes a directly necessary, narrowly scoped adjustment to preserve the stated contract.

## Decisions

### Bind credentials through a prepared statement

Replace the dynamically concatenated query execution with a fixed SQL statement containing placeholders for username and password. Bind both values using the JDBC `PreparedStatement` API and retain try-with-resources for connection, statement, and result set lifecycle.

This keeps account matching in the database while ensuring credential content cannot become query syntax. Escaping or filtering input is not an equivalent substitute: it is easy to get wrong and would alter valid credential values.

**Alternatives considered:**

- Escape quotes or reject strings containing SQL-like tokens: rejected because escaping is fragile and blacklist validation can reject legitimate credentials while failing to cover SQL syntax variants.
- Replace SQLite or introduce an ORM: rejected because the defect is localized to one JDBC query and neither a new persistence layer nor dependency is needed.
- Refactor the full login flow into additional layers: rejected because it expands scope without being necessary to secure this lookup or preserve the endpoint contract.

### Characterize the endpoint before changing the lookup

First extend the auth endpoint tests to capture successful login behavior and rejection behavior for injection-like values in both username and password. Include a password payload that reproduces the current concatenated-query bypass, as well as the inputs specified by the capability. Assert status and absence of a token on rejection; for success, assert the established response fields rather than only the status.

This sequence makes the protected behavior explicit before the persistence change. The tests should use the existing isolated workshop test account and must not add real credentials or secrets.

### Keep the endpoint and response mapping unchanged

The lookup remains behind `LegacyDatabase.findByCredentials`; a missing match continues through the existing unauthorized response path, and a match continues through existing token and response generation. This minimizes behavior changes and keeps the fix limited to the data-access boundary.

**Alternative considered:** Move validation, lookup, and response construction into new classes. Rejected for this issue because it is a broader architectural change and risks changing established behavior unrelated to parameterization.

## Incremental Strategy

1. Add or extend `AuthResourceTest` characterization for the complete successful response contract and unauthorized responses for the required injection-like username and password inputs.
2. Run the focused auth tests and confirm that the password-injection regression case demonstrates the current vulnerability before changing production behavior.
3. Change only the SQL execution in `LegacyDatabase.findByCredentials` to use bound parameters.
4. Run the auth test suite and the auth coverage/reporting command configured by the component. Confirm valid login still satisfies the characterized response assertions and both injection cases return HTTP 401 without a token.
5. Review the final diff to ensure the endpoint contract and files outside `auth/` remain unchanged.

## Risks / Trade-offs

- [A test payload may not reproduce the current bypass consistently across SQLite/JDBC parsing behavior] → Use a payload that is verified against the current query in the characterization step, retain the exact capability scenarios, and assert only the specified HTTP outcomes.
- [A response assertion may accidentally freeze incidental details] → Characterize the existing response and preserve it as required by the proposal; do not broaden assertions to unrelated headers or implementation details.
- [Database lookup exceptions are currently handled inside `LegacyDatabase` by returning no user] → Keep exception-handling changes out of this security fix unless required for the parameterized lookup; avoid silently changing the endpoint's error contract as part of this bounded change.
- [Coverage may remain below the component's 85% target] → Run the configured auth coverage report and add focused tests for changed behavior without weakening JaCoCo or other quality gates.

## Migration Plan and Rollback

No schema, data, configuration, or dependency migration is required. Deploy the application with the parameterized lookup after the auth tests pass.

If a production regression requires rollback, revert and redeploy only the lookup change. This rollback restores the original injection risk, so use it only as a temporary mitigation while diagnosing the regression, then reapply and verify the parameterized fix before normal operation. No rollback of persisted data is needed.
