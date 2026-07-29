/**
 * adminUtils.tsx — 어드민 에디터 공유 유틸
 */
import type { TypeSpecIssue } from '@twin/core';

/** path에 해당하는 첫 번째 이슈 메시지 (없으면 null) */
export function issueFor(issues: TypeSpecIssue[], path: string): string | null {
  return issues.find((i) => i.path === path)?.message ?? null;
}

/** 필드 하단 에러 메시지 — text-xs text-danger */
export function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return <span className="text-xs text-danger">{message}</span>;
}
