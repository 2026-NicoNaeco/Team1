/**
 * 백엔드 호출 도우미. 응답 시간 제한과 오류 모양(`{"error": {"code", "message"}}`)을 한곳에서 다룬다.
 */

/** 백엔드가 오류 응답을 줬거나, 응답하지 않았거나, 연결하지 못했을 때 */
export class BackendError extends Error {
  /** 백엔드 오류 코드(예: OUT_OF_SERVICE_AREA) 또는 TIMEOUT / NETWORK / BAD_RESPONSE */
  readonly code: string;
  /** HTTP 상태. 연결 자체가 안 됐으면 0 */
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.status = status;
  }
}

export interface RequestJsonOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** 테스트에서 fetch 를 바꿔 끼운다 */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15000;

function abortError(): Error {
  const e = new Error('요청을 취소했어요.');
  e.name = 'AbortError';
  return e;
}

/**
 * JSON 을 주고받는다. 호출한 쪽이 취소하면 AbortError 를 그대로 던지고(화면은 무시한다),
 * 시간이 지나면 TIMEOUT, 연결이 안 되면 NETWORK, 오류 응답이면 백엔드 코드로 BackendError 를 던진다.
 */
export async function requestJson<T>(url: string, options: RequestJsonOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl = fetch } = options;
  if (signal?.aborted) throw abortError();

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw abortError();
    if (timedOut) throw new BackendError('TIMEOUT', '서버가 제때 응답하지 않았어요.', 0);
    throw new BackendError('NETWORK', '서버에 연결하지 못했어요.', 0);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new BackendError('BAD_RESPONSE', '서버 응답을 읽지 못했어요.', response.status);
  }
  if (!response.ok) {
    const err = (json as { error?: { code?: string; message?: string } } | null)?.error;
    throw new BackendError(err?.code ?? `HTTP_${response.status}`, err?.message ?? '서버에서 오류가 났어요.', response.status);
  }
  return json as T;
}
