import { afterEach, beforeEach } from 'vitest';
import { useV2AuthStore } from '../v2/store/authStore';

/** 이 describe 의 시험을 **조회 사용자**로 — 끝나면 관리자로 돌려 둔다(시험 기본은 관리자, `setup.ts`). */
export function asViewer(): void {
  beforeEach(() => useV2AuthStore.setState({ user: { id: 'test-viewer', username: 'viewer', role: 'viewer' }, isAuthenticated: true }));
  afterEach(() => useV2AuthStore.setState({ user: { id: 'test-admin', username: 'admin', role: 'admin' }, isAuthenticated: true }));
}
