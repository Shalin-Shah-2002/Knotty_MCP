# Knotty — Planned Features

## 1. `validateEndpoint`

Check that a given endpoint has full descriptions, examples, response schemas for all status codes, and a defined `operationId`. Returns a "spec quality" score per endpoint.

## 2. `generatePostmanCollection`

Export the spec as a ready-to-import Postman/Insomnia/Hoppscotch collection. Currently you only let Claude call endpoints — let users also hand off to their favorite GUI tool.

## 3. `auditSecurity`

Flag endpoints missing auth, sensitive fields in responses (emails/SSN/tokens), sequential IDs that should be UUIDs, missing security schemes.

## 4. `detectSpecSmells`

Find inconsistencies: list endpoints without pagination, mixed camelCase/snake_case, missing error responses, inconsistent status codes, no `operationId`.

## 5. `generateCurlCommands`

One-click curl/HTTPie commands for any endpoint (with auth header + sample body) — paste into terminal or share in Slack.

## 6. `generateAuthMatrix`

Auto-build a matrix: every endpoint × {no token, valid token, expired token, wrong-scope token}. Run it live and report which combos leak access.

## 7. `generateBoundaryTests`

Per field, derive tests at min/max/min-1/max+1/empty/null/huge. Execute and compare against documented 4xx.

## 8. `generateNegativeTests`

Drop each required field one-by-one, send wrong types, send unknown extra fields, send empty body. Verify the spec'd 400 actually fires.

## 9. `generateSchemaConformanceTests`

Call the endpoint live, then validate the *actual* response against the *declared* schema. Catches drift between spec and reality (the silent killer).

## 10. `generatePaginationTests`

page=0, page=-1, page=999999, limit=0, limit=huge, reused cursor, cursor skipping. Run live.

## 11. `generateIdempotencyTests`

Send the same POST/PUT twice (with and without `Idempotency-Key`) and diff results. Catches double-create bugs.

## 12. `generateRegressionSnapshot`

Snapshot current live responses per endpoint; next run diffs against the snapshot so spec changes get caught against reality, not just against the new spec.

## 13. `generateFuzzTests`

Schema-aware fuzzing: deeply nested objects, very long strings, type-confused values, Unicode/emoji payloads. Designed to surface 500s.

## 14. `detectAuthGapsOnWrites`

Specifically audits POST/PUT/PATCH/DELETE missing security schemes. Write ops are the dangerous ones — a missing auth on GET is bad, on DELETE is catastrophic.

## 15. `detectMassAssignment`

PUT/PATCH accepting the full schema (including `role`, `isAdmin`, `status`) → mass-assignment risk. Flags writable fields that shouldn't be client-set.

## 16. `detectPaginationInconsistency`

cursor vs offset vs page vs `Link` header. Pick one; flag when multiple styles coexist.

## 17. `detectIdFormatInconsistency`

UUID here, auto-increment int there, string elsewhere. Same entity, different ID types across endpoints = integration bugs.

## 18. `detectStatusCodeInconsistency`

POST returning 201 on one endpoint, 200 on another; DELETE returning 204 vs 200. Enforces convention per verb.

## 19. `detectNamingMix`

snake_case / camelCase / kebab-case mixed across paths, params, and fields. Surfaces the dominant style + violations.

## 20. `detectErrorShapeInconsistency`

Error bodies should follow ONE shape (`{error: {code, message}}`). Flag endpoints using different error envelopes.

## 21. `detectVersioningInconsistency`

`/v1/` in path here, `Accept: version=2` header there, no versioning elsewhere.
