import type { NodeType } from '../../types/organization';

export function childType(t: NodeType): NodeType | null {
  switch (t) {
    case 'headquarters': return 'branch';
    case 'branch': return 'substation';
    case 'substation': return 'floor';
    default: return null;
  }
}

/** NodeType → 한글 명사 (SSOT). 라벨·모달 제목 등 모든 표시에 재사용. */
export const NODE_NOUN: Record<NodeType, string> = {
  headquarters: '본부', branch: '지사', substation: '변전소', floor: '층',
};

/** "<자식 한글명> 추가" 라벨 — 자식 타입이 없으면(floor) null. */
export function childLabel(t: NodeType): string | null {
  const c = childType(t);
  return c ? `${NODE_NOUN[c]} 추가` : null;
}
