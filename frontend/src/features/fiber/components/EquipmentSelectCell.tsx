import { useTraceGraph } from '../../trace/traceGraph';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import type { Asset } from '../../../types/asset';

/**
 * 선번장 자국/대국 설비 셀 — **읽기전용 설비명**.
 * 코어 OUT 케이블이 닿은 설비 이름을 표시(미연결 '—'). 코어↔설비 *연결*은
 * 슬롯 포트 패널(SlotPortsPanel)의 "케이블 연결"(표준 케이블 흐름)에서 한다.
 */
export function EquipmentSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  const { graph } = useTraceGraph();
  const cables = (graph?.cables ?? []) as unknown as CableLike[];

  const twinId = twinSlotIdOf(slot.id, cables);
  const targetSlotId = side === 'local' ? slot.id : twinId;

  const outCable = targetSlotId
    ? cables.find((c) =>
        c.number === coreNumber &&
        (c.sourceAssetId === targetSlotId || c.targetAssetId === targetSlotId) &&
        roleAt(c, targetSlotId) === 'OUT')
    : undefined;
  const currentId = outCable && targetSlotId ? other(outCable, targetSlotId) : null;
  const name = currentId ? (graph?.nameById.get(currentId) ?? currentId) : null;

  return <span className="text-sm text-content">{name ?? <span className="text-content-faint">—</span>}</span>;
}
