import { HttpRequest, InvocationContext } from '@azure/functions';

interface RequestOptions {
  params?: Record<string, string>;
  /** An object is sent as JSON; a string is sent as-is (to test malformed bodies). */
  body?: unknown;
}

/** Builds a request as the Functions host would deliver it. `path` is relative to /api, e.g. "employees?departmentId=1". */
export function httpRequest(method: string, path: string, options: RequestOptions = {}): HttpRequest {
  const { params, body } = options;
  return new HttpRequest({
    method,
    url: `http://localhost:7071/api/${path}`,
    params,
    body: body === undefined ? undefined : { string: typeof body === 'string' ? body : JSON.stringify(body) },
  });
}

/** A quiet invocation context with a fixed correlation id. */
export function invocationContext(): InvocationContext {
  return new InvocationContext({ invocationId: 'test-invocation-id', functionName: 'test', logHandler: () => undefined });
}
