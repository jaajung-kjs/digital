/**
 * apiError.ts — 에러→표시 문구 번역의 유일 지점 (§6-4)
 *
 * 백엔드 HttpError 직렬화(router.ts 의 { error, message, details })를 axios
 * 에러에서 읽어 사용자 표시용 메시지/코드/타입스펙 이슈로 변환한다. 이 모듈
 * 하나만이 번역을 담당하며, 다른 곳에서 response.data 를 직접 파싱하지 않는다.
 */
import { isAxiosError } from 'axios';
import type { TypeSpecIssue } from '@twin/core';

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

/** axios err.response.data.error (없으면 null) */
export function apiErrorCode(err: unknown): string | null {
  return apiErrorData(err)?.error ?? null;
}

/** INVALID_TYPE_SPEC 의 details 배열 (아니면 null) */
export function apiErrorIssues(err: unknown): TypeSpecIssue[] | null {
  const data = apiErrorData(err);
  if (data?.error !== 'INVALID_TYPE_SPEC') return null;
  return Array.isArray(data.details) ? (data.details as TypeSpecIssue[]) : null;
}
