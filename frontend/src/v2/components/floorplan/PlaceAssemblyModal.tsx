import { useMemo, useState } from 'react';
import { Button, DetailRow, Input, Modal, InsetBox } from '../../../components/ui';
import type { V2Assembly } from '../../types';

/**
 * 설비 종류를 도면에 놓을 때 — **물어볼 것은 현장 이름 하나뿐**이다.
 *
 * 무엇이 몇 개 들어가는지는 설비 종류가 이미 안다. 부품을 하나씩 고르게 하면 설비 종류를 만든 뜻이
 * 없다. 대신 무엇이 함께 생기는지는 **보여 준다** — 놓고 나서 놀라지 않게.
 */
export function PlaceAssemblyModal({
  assembly, onClose, onPlace,
}: {
  assembly: V2Assembly;
  onClose: () => void;
  onPlace: (rootName: string) => void;
}) {
  const [name, setName] = useState('');

  /** 함께 생기는 것 — 타입이 아니라 설비 종류가 적어 둔 이름으로 센다. */
  const parts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of assembly.items) counts.set(i.name, (counts.get(i.name) ?? 0) + 1);
    return [...counts.entries()];
  }, [assembly]);

  const canPlace = name.trim().length > 0;

  return (
    <Modal open onClose={onClose} title={`${assembly.name} 놓기`}>
      <div className="space-y-3">
        <DetailRow label="이름">
          <Input
            aria-label="설비 이름"
            value={name}
            autoFocus
            placeholder="예: 통신랙 A"
            onChange={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canPlace) onPlace(name.trim());
            }}
          />
        </DetailRow>

        {parts.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-content-muted">함께 생기는 것</p>
            <InsetBox as="ul" className="text-sm text-content-muted">
              {parts.map(([partName, n]) => (
                <li key={partName} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{partName}</span>
                  {n > 1 && <span className="shrink-0 text-xs text-content-faint">× {n}</span>}
                </li>
              ))}
            </InsetBox>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>취소</Button>
          <Button size="sm" disabled={!canPlace} onClick={() => onPlace(name.trim())}>놓기</Button>
        </div>
      </div>
    </Modal>
  );
}
