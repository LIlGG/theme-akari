const DEFAULT_REQUEST_TIMEOUT = 8000;

export function withRequestTimeout(
  signal?: AbortSignal,
  timeout = DEFAULT_REQUEST_TIMEOUT,
) {
  const timeoutSignal = AbortSignal.timeout(timeout);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}
