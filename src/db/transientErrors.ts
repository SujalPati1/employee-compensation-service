/**
 * Recognises database errors that are temporary, where trying again shortly is likely to work.
 * A serverless Azure SQL database raises these predictably while it resumes from auto-pause.
 * See https://learn.microsoft.com/azure/azure-sql/database/troubleshoot-common-errors-issues
 *
 * The mssql driver reports two kinds of error:
 *   ConnectionError  no connection was made, so the request never reached the database
 *   RequestError     the request was sent; it may or may not have taken effect
 */

// Error numbers raised by a running query. 4060 ("cannot open database") is left out on purpose:
// locally it usually means the database does not exist, and retrying would only delay the real error.
const TRANSIENT_SQL_ERROR_NUMBERS = new Set([
  10928, // resource limit reached
  10929, // resource limit reached
  40197, // service error while processing the request, e.g. during failover
  40501, // service is busy
  40613, // database is not currently available (e.g. resuming)
  49918, // not enough resources to process the request
  49919, // too many operations in progress
  49920, // too many operations in progress
]);

// Network-level failures reported by the driver.
const TRANSIENT_CONNECTION_CODES = new Set(['ESOCKET', 'ETIMEOUT', 'ECONNRESET', 'ECONNCLOSED']);

// Login failures lose their error number in the driver (40613 arrives as a plain ELOGIN),
// so transient ones are recognised by the server's wording instead.
const TRANSIENT_LOGIN_MESSAGE = /not currently available|currently busy|try again|retry|limit .* has been reached|cannot process request/i;

interface DriverError {
  name?: unknown;
  code?: unknown;
  number?: unknown;
  message?: unknown;
}

function asDriverError(error: unknown): DriverError {
  return typeof error === 'object' && error !== null ? (error as DriverError) : {};
}

/** True when the request never reached the database, so retrying cannot apply a change twice. */
export function isConnectionError(error: unknown): boolean {
  return asDriverError(error).name === 'ConnectionError';
}

export function isTransientDatabaseError(error: unknown): boolean {
  const { name, code, number, message } = asDriverError(error);

  if (typeof code === 'string' && TRANSIENT_CONNECTION_CODES.has(code)) return true;
  if (typeof number === 'number' && TRANSIENT_SQL_ERROR_NUMBERS.has(number)) return true;
  if (name === 'ConnectionError' && code === 'ELOGIN' && typeof message === 'string') {
    return TRANSIENT_LOGIN_MESSAGE.test(message);
  }
  return false;
}
