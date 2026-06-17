import type { NodeType } from '../../types/organization';

export function childType(t: NodeType): NodeType | null {
  switch (t) {
    case 'headquarters': return 'branch';
    case 'branch': return 'substation';
    case 'substation': return 'floor';
    default: return null;
  }
}

const CHILD_NOUN: Record<NodeType, string | null> = {
  headquarters: '지사', branch: '변전소', substation: '층', floor: null,
};
export function childLabel(t: NodeType): string | null {
  const n = CHILD_NOUN[t];
  return n ? `${n} 추가` : null;
}
