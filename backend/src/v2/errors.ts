/** v2 자립 에러 — 구 utils/errors 에 의존하지 않는다 (Stage 7 삭제 격리). */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
