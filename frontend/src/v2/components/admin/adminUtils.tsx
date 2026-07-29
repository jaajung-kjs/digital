/**
 * adminUtils.tsx — 어드민 에디터 공유 유틸
 */
import type { TypeSpecIssue } from '@twin/core';

/** path에 해당하는 첫 번째 이슈 메시지 (없으면 null) */
export function issueFor(issues: TypeSpecIssue[], path: string): string | null {
  return issues.find((i) => i.path === path)?.message ?? null;
}
