/**
 * apiError.ts — 에러→표시 문구 번역의 유일 지점 (§6-4)
 *
 * 백엔드 HttpError 직렬화(router.ts 의 { error, message, details })를 axios
 * 에러에서 읽어 사용자 표시용 메시지로 변환한다.
 *
 * 범위: **표시 문구 번역**은 이 모듈이 유일 지점이다. response.data 의 다른
 * 필드를 도메인 목적으로 읽는 것(예: useCommit 의 409 conflict details·
 * ownerSubstationNames 처리)은 번역이 아니므로 여기 오지 않는다.
 */
import { isAxiosError } from 'axios';

interface ApiErrorPayload {
  message?: string;
  error?: string;
  details?: unknown;
}

function apiErrorData(err: unknown): ApiErrorPayload | undefined {
  if (!isAxiosError(err)) return undefined;
  return err.response?.data as ApiErrorPayload | undefined;
}

/**
 * axios err.response.data.message 우선, 없으면 fallback.
 * 빈 문자열/공백뿐인 메시지는 "없음"과 동일하게 취급 — 빈 알림창 노출 방지.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const message = apiErrorData(err)?.message;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
}
