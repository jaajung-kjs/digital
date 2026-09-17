import { useMemo, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import type { V2Conflict } from '../types';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useEffectiveAssets, useEffectiveCables } from '../store/useWorkingCopy';

interface ConflictDialogProps {
  conflicts: V2Conflict[];
  substationId: string;
  onClear: () => void;
}

/** 충돌 id가 effective 케이블로 해소되면 "케이블: {a자산}↔{b자산}", 아니면 축약 id */
function useConflictLabel(conflictId: string): string {
  const effectiveAssets = useEffectiveAssets();
  const effectiveCables = useEffectiveCables();
  return useMemo(() => {
    const cable = effectiveCables.find((c) => c.id === conflictId);
    if (cable) {
      // 포트 → 자산 해소
      const portToAsset = new Map<string, string>();
      for (const a of effectiveAssets) {
        for (const p of a.ports) {
          portToAsset.set(p.id, a.name);
        }
      }
      const aName = portToAsset.get(cable.aPortId) ?? cable.aPortId.slice(0, 8);
      const bName = portToAsset.get(cable.bPortId) ?? cable.bPortId.slice(0, 8);
      return `케이블: ${aName}↔${bName}`;
    }
    // 자산이면 이름 사용
    const asset = effectiveAssets.find((a) => a.id === conflictId);
    if (asset) return asset.name;
    // 미해소 → 축약 id
    return conflictId.slice(0, 8);
  }, [conflictId, effectiveAssets, effectiveCables]);
}

function ConflictItem({ conflict }: { conflict: V2Conflict }) {
  const label = useConflictLabel(conflict.id);
  const reasonLabel = (reason: V2Conflict['reason']) =>
    reason === 'deleted' ? '서버에서 삭제됨' :
    reason === 'exists' ? '이미 존재하는 설비(재시도 중복)' :
    '다른 사용자가 수정함';

  return (
    <li className="flex items-center gap-2 text-xs text-content">
      <span className="min-w-0 truncate font-mono text-content-faint">{label}</span>
      <span className="shrink-0 text-danger">{reasonLabel(conflict.reason)}</span>
    </li>
  );
}

export function ConflictDialog({ conflicts, substationId, onClear }: ConflictDialogProps) {
  const [reloading, setReloading] = useState(false);

  if (conflicts.length === 0) return null;

  async function handleRefresh() {
    setReloading(true);
    try {
      await useV2WorkingCopy.getState().load(substationId);
      onClear();
    } finally {
      setReloading(false);
    }
  }

  /* 공용 `Modal` 을 쓴다. 예전에는 여기만 마크업을 직접 만들어서 **초점 가두기·Esc·
     `aria-labelledby` 가 전부 빠져 있었다** — 같은 것을 두 번 적으면 한쪽만 고쳐진다.
     닫기는 「새로고침」 하나뿐이라 백드롭·Esc 로는 닫지 않는다(저장이 막힌 상태다). */
  return (
    <Modal
      open
      onClose={() => {}}
      title="저장 충돌"
      footer={
        <Button size="sm" disabled={reloading} onClick={() => void handleRefresh()}>
          {reloading ? '새로고침 중…' : '서버 기준으로 새로고침'}
        </Button>
      }
    >
      <p className="mb-3 text-xs text-content-muted">아래 항목이 서버와 충돌하여 저장되지 않았습니다.</p>
      <ul className="space-y-1">
        {conflicts.map((c) => (
          <ConflictItem key={c.id} conflict={c} />
        ))}
      </ul>
    </Modal>
  );
}
