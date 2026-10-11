# Design notes

Assumptions, decisions and trade-offs behind the Employee Compensation Service.
For how to run it, see the [README](../README.md).

- [Where each requirement is met](#where-each-requirement-is-met)
- [Assumptions](#assumptions)
- [Handling NULL bonuses](#handling-null-bonuses)
- [The optional 5% default bonus](#the-optional-5-default-bonus)
- [Decisions](#decisions)
- [Security and secrets](#security-and-secrets)
- [Reliability](#reliability)
- [Observability](#observability)
- [Alternatives considered](#alternatives-considered)
- [Known limitations and future work](#known-limitations-and-future-work)

## Where each requirement is met

| Requirement | Where |
|-------------|-------|
| HTTP-triggered Functions backed by SQL; no direct database access from clients | `src/functions/`, `src/repositories/` |
| Part A: create, get, list with department filter, update, delete | `src/functions/employees.ts` |
| Part B: six reports | `src/repositories/reportRepository.ts`, `src/functions/reports.ts` |
| Part C: no hardcoded connection string or secrets | `src/db/config.ts`, `scripts/setup.ts`, `infra/main.bicep` |
| Part C: graceful errors and correct status codes | `src/http/` |
| Part C (optional): 5% default bonus | `sql/002_views.sql` |
| SQL scripts to create and seed tables | `sql/` |

## Assumptions

Where the brief was open to interpretation:

| # | Question | Assumption |
|---|----------|------------|
| A1 | Does a bonus of `0` count as "never received a bonus"? | No. Only `NULL` does, as the brief defines `NULL` = no bonus. A recorded `0` is an award of zero. |
| A2 | Full replace (PUT) or partial update (PATCH)? | `PATCH` with merge-patch rules: absent fields are unchanged, `null` clears a nullable field. The brief's example ("changing their bonus") is a partial update. |
| A3 | Are `HireDate` and `Employee.DepartmentID` required? | No. The brief marks other columns "Not null" but not these, so both are nullable and optional. |
| A4 | Valid ranges? | `Salary > 0` and `Bonus >= 0`, enforced by validation and by `CHECK` constraints. |
| A5 | How are ties ranked? | Standard competition ranking (`RANK()`: 1, 2, 2, 4). All employees without a bonus share the last rank. |
| A6 | What if two people share the highest salary? | All of them are returned, each with its own "also highest total compensation" flag. |
| A7 | Does the 5% default affect the reports? | No. Reports treat `NULL` literally; the default appears only in employee responses. |
| A8 | Are departments managed through the API? | No. Part A asks only for employee CRUD. Departments are seeded (IDs without `IDENTITY`, as specified) and exposed as a read-only list. |
| A9 | `VARCHAR` cannot store many non-English names. | Kept `VARCHAR` as specified, with a UTF-8 collation so names such as "Zoë" or "Łukasz" are stored correctly. Lengths are validated in bytes, since `VARCHAR(50)` holds 50 UTF-8 bytes. |
| A10 | Pagination of the employee list? | Not implemented; the `{ items, count }` response leaves room to add it. |
| A11 | Concurrent updates to the same employee? | Last write wins (see future work). |

## Handling NULL bonuses

Each report is a single SQL query. The traps and how they are avoided:

| Report | SQL | Trap avoided |
|--------|-----|--------------|
| Total bonus | `COALESCE(SUM(COALESCE(Bonus, 0)), 0)` | `SUM` returns `NULL`, not 0, when no row has a bonus or there are no rows |
| Never received | `WHERE Bonus IS NULL` | `Bonus = NULL` is never true |
| Bonus % | `ROUND(Bonus * 100.0 / Salary, 2)` as `DECIMAL(17,2)`, `WHERE Bonus IS NOT NULL` | Integer division, float rounding (1.005% must round to 1.01), overflow, showing "no bonus" as 0% |
| Department vs average salary | `INNER JOIN … HAVING SUM(COALESCE(Bonus,0)) > AVG(Salary)` | Counting "equal" as "exceeds"; empty departments; comparing rounded values |
| Ranking | `RANK() OVER (ORDER BY CASE WHEN Bonus IS NULL THEN 1 ELSE 0 END, Bonus DESC)` | Dropping `NULL`s, or relying on database-specific `NULL` ordering (PostgreSQL sorts them first) |
| Top earner | `Salary + COALESCE(Bonus, 0)`; every tie returned | `Salary + NULL = NULL` silently removes people without a bonus |

The integration tests check each of these against hand-computed results, and each trap was confirmed to be
caught by reintroducing it on purpose (mutation testing). One honest exception: removing the explicit
`NULL`s-last `CASE` would not fail on SQL Server, which already sorts `NULL`s last in descending order. The
`CASE` is there for portability and to make the intent explicit.

JavaScript numbers are binary floating point (`Math.round(1.005 * 100) / 100` gives `1`), so no arithmetic
on money happens in TypeScript.

## The optional 5% default bonus

**Calculated when reading, not written into the table.** The rule lives in one view,
`vw_EmployeeCompensation`, which adds `effectiveBonus`, `isDefaultBonus` and `effectiveTotalCompensation`.

Why read-time:

- A stored `NULL` keeps meaning "no bonus awarded". Writing 5% into the table would make awards and
  defaults indistinguishable, and the "never received a bonus" report would always be empty.
- The default follows the current salary. A written value goes stale when the salary changes.
- New employees are covered immediately, without a scheduled job.
- It is reversible: change or drop the view.

The counter-argument is real: a bonus that has actually been **paid** is a financial record and must be stored,
never recalculated. The brief describes a default where none was set, which is a business rule, so read-time
fits. If the business wanted to pay default bonuses, the right design is an explicit, audited operation (for
example `POST /api/bonuses/award-defaults`) that writes the amounts and records that they came from the
default rule.

## Decisions

| Area | Decision | Main reason | Rejected |
|------|----------|-------------|----------|
| Hosting | Azure Functions, Flex Consumption | Microsoft's recommended serverless plan (Consumption is now legacy); costs nothing at this scale; scale-out can be capped (40 instances) to protect a small database | Consumption, Premium (cost), Dedicated, Container Apps |
| Language | TypeScript, Node 24, Functions v4 model | Close to Express; `strictNullChecks` forces `NULL` handling at compile time; easy clone-and-run | C# (more setup), Python (ODBC driver setup on every machine) |
| Database | Azure SQL free offer; SQL Server 2022 in Docker locally | The brief's schema is SQL Server style; free for the life of the subscription; the same T-SQL scripts run in both places | Basic tier (kept as a fallback to avoid cold starts), PostgreSQL, Cosmos DB |
| Data access | `mssql` driver with parameterized SQL in a repository layer | The reviewer can read the SQL directly; full control of retries and status codes | ORM (hides the SQL), Azure SQL bindings (errors after the handler returns cannot become proper status codes) |
| Validation | zod | One schema gives runtime validation and the TypeScript type | Hand-written checks |
| Infrastructure | Bicep | Declarative and repeatable; readable by reviewers | Portal clicks, CLI script |
| CI | GitHub Actions with a SQL Server service container | Every push runs the full suite against a real database; no Azure credentials needed | Continuous deployment (needs an app registration, which school tenants often restrict) |
| Region | East Asia | Supports both Flex Consumption and the SQL free offer within the subscription's allowed regions | Indonesia Central (lower latency, but no SQL free offer) |

## Security and secrets

- **Azure:** no database password exists. The Function App's system-assigned managed identity gets a Microsoft
  Entra token; the SQL server accepts Entra sign-ins only. The app's database user has `db_datareader` and
  `db_datawriter` only, so it cannot change the schema. Storage account keys are disabled; the app uses role
  assignments instead. App settings hold only non-secret values (server and database names).
- **Local:** `npm run setup` generates a random password into `.env` and `local.settings.json`, both gitignored.
  Only `*.example` templates with placeholders are committed. CI derives a throwaway password from the run ID.
- **API access:** data endpoints require a function key in Azure (`/health` is anonymous and returns no data).
  Keys are never committed.
- **Injection:** all values are SQL parameters. The only dynamic SQL (the `PATCH` `SET` clause) is built from a
  fixed column map in code.
- **Deployment:** `npm run deploy` packages only compiled JavaScript and production dependencies. A check with
  `--list-included-files` showed Core Tools ignoring some `.funcignore` patterns, including `.env`, so the
  package is built from an allow-list instead.

## Reliability

- **Serverless cold start.** After 60 idle minutes the database pauses. The first request then fails with a
  transient error until it resumes. The shared pool retries transient errors with backoff
  (1, 2, 4, 8, 15, 15 seconds, about 45 seconds of waiting, well under Azure's 230-second HTTP limit). If the
  database is still unavailable, the API returns `503` with `Retry-After: 30`.
  Measured on the deployed app: the first request after a pause took about 56 seconds and succeeded; the next
  ones took 110–200 ms from the client (12–30 ms on the server).
- **The driver's own retry is not enough.** `tedious` retries logins three times about 500 ms apart, and it
  drops the SQL error number on login failures (40613 arrives as a plain `ELOGIN`). Transient login failures are
  recognised by message, query failures by number.
- **No duplicate writes.** Reads and `PATCH` (setting the same values twice gives the same result) retry on any
  transient error. `POST` and `DELETE` retry only when the request never reached the database.
- **Connections.** One pool per instance (maximum 10 connections), and Flex scale-out capped at 40 instances.

## Observability

- Application Insights records every request (route, status, duration) automatically.
- Log lines carry only IDs, status codes, error names, SQL error numbers and constraint names. The logger's type
  accepts only those fields, so names, salaries and request bodies cannot be logged. Unexpected error messages
  are never logged or returned, because driver messages can echo submitted values.
- Every error response includes `correlationId` (the Functions invocation ID) to find the request in the logs.
- No availability tests: pinging every few minutes would keep the serverless database awake and use up the free
  allowance. Log Analytics ingestion is capped at 0.1 GB a day.

## Alternatives considered

- **Azure Table Storage** as the data store: no decimal type (money would be floating point), no aggregates, no
  `ORDER BY`, no relationships, and the brief asks for SQL.
- **Azure Logic Apps:** an HTTP-triggered Logic App reading SQL directly would bypass the Functions layer the
  brief requires. Scheduling (if needed) is simpler as a timer-triggered Function with code that runs locally.
- **An ORM:** the reports need window functions, `HAVING` and explicit `NULL` handling, which would end up as raw
  SQL anyway, while hiding the queries reviewers want to read.
- **Azure SQL input/output bindings:** less code, but output bindings are upsert-only and their errors happen after
  the handler returns, so they cannot be turned into `400`/`422` responses.
- **Writing the 5% default into the table:** see above.
- **Premium or Dedicated hosting:** removes cold starts but costs more per month than the whole budget for this
  project; the cold start is handled in code instead.

## Known limitations and future work

- **Concurrency:** last write wins. Next step: a `rowversion` column with `ETag` / `If-Match` for optimistic concurrency.
- **Pagination and sorting** for the employee list.
- **Authentication:** function keys are shared secrets, not user identity. Production would use Microsoft Entra ID
  (App Service authentication) or API Management.
- **Networking:** the SQL server allows Azure services through its firewall; access still needs an Entra identity
  with a database user. Production would use VNet integration and a private endpoint (Flex supports both).
- **Writes during an outage:** a `POST` that fails mid-request with a transient error returns `503`; the client
  cannot tell whether the insert happened. An idempotency key would make retries safe.
- **Continuous deployment** from GitHub Actions with federated credentials.
- **Audit history** of salary and bonus changes, for example with temporal tables.
