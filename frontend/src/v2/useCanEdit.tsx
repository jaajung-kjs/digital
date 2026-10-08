import { cloneElement, isValidElement, type ReactNode } from 'react';
import { EMPTY } from '../components/ui';
import { isAdminRole, useV2AuthStore } from './store/authStore';

/**
 * 이 사용자가 고칠 수 있나 — **화면의 권한 판정은 여기 하나다**(역할 비교를 화면마다 흩지 않는다).
 *
 * 서버는 조회 사용자(viewer)의 쓰기를 모두 403 으로 막는다. 화면이 그것을 모르면 조회 사용자가 변경을 몇 건이고
 * 쌓은 뒤에야 저장에서 거절당한다. 그래서 고치는 손잡이(추가·삭제·수정·연결·저장)는 아예 세우지 않고,
 * 인라인 칸은 읽는 줄로만 선다(`InlineEditCell`).
 */
export function useCanEdit(): boolean {
  return useV2AuthStore((s) => isAdminRole(s.user?.role));
}

/** 고칠 수 있는 사람에게만 보이는 것 — 단추·도구 묶음을 감싼다. */
export function EditOnly({ children }: { children: ReactNode }) {
  return useCanEdit() ? <>{children}</> : null;
}

/**
 * 고치는 칸 자리 — 관리자에게는 칸(`children`), 조회 사용자에게는 **읽는 값**(`value`, 비면 「—」).
 * 상세 카드의 `DetailRow` 안에 쓴다(표 칸은 `InlineEditCell` 이 스스로 한다).
 *
 * `DetailRow` 가 라벨을 잇느라 붙이는 `id`·`aria-required` 는 **안의 칸에 넘긴다** — 이 껍데기가 받고 버리면
 * 라벨이 아무것에도 이어지지 않아 칸(「상태」·「설비 품목」·「랙」 고르기)이 이름 없이 읽힌다.
 */
export function Editable({ children, value, id, 'aria-required': ariaRequired }: {
  children: ReactNode; value: ReactNode; id?: string; 'aria-required'?: boolean;
}) {
  const canEdit = useCanEdit();
  if (canEdit) {
    if (id !== undefined && isValidElement<{ id?: string; 'aria-required'?: boolean }>(children)) {
      return cloneElement(children, { id, ...(ariaRequired ? { 'aria-required': true } : {}) });
    }
    return <>{children}</>;
  }
  const empty = value == null || value === '';
  return <span id={id} className={empty ? 'text-sm text-content-faint' : 'truncate text-sm text-content'}>{empty ? EMPTY : value}</span>;
}
