import { describe, expect, it } from 'vitest';
import { isConnectionError, isTransientDatabaseError } from '../../src/db/transientErrors';

const connectionError = (code: string, message = '') => ({ name: 'ConnectionError', code, message });
const requestError = (number: number) => ({ name: 'RequestError', code: 'EREQUEST', number, message: '' });

describe('isTransientDatabaseError', () => {
  it('treats a database that is resuming from auto-pause as transient (login message, no number)', () => {
    const resuming = connectionError(
      'ELOGIN',
      "Database 'Compensation' on server 'x' is not currently available. Please retry the connection later.",
    );
    expect(isTransientDatabaseError(resuming)).toBe(true);
  });

  it('does not retry a wrong password', () => {
    expect(isTransientDatabaseError(connectionError('ELOGIN', "Login failed for user 'sa'."))).toBe(false);
  });

  it.each(['ESOCKET', 'ETIMEOUT', 'ECONNRESET', 'ECONNCLOSED'])('treats network failure %s as transient', (code) => {
    expect(isTransientDatabaseError(connectionError(code))).toBe(true);
  });

  it.each([40613, 40501, 40197, 10928, 49918])('treats SQL error %i as transient', (number) => {
    expect(isTransientDatabaseError(requestError(number))).toBe(true);
  });

  it.each([547, 2628, 208])('does not retry real errors such as SQL error %i', (number) => {
    expect(isTransientDatabaseError(requestError(number))).toBe(false);
  });

  it('ignores values that are not errors', () => {
    expect(isTransientDatabaseError(undefined)).toBe(false);
    expect(isTransientDatabaseError('ESOCKET')).toBe(false);
  });
});

describe('isConnectionError', () => {
  it('distinguishes "never reached the database" from "request was sent"', () => {
    expect(isConnectionError(connectionError('ESOCKET'))).toBe(true);
    expect(isConnectionError(requestError(40613))).toBe(false);
  });
});
