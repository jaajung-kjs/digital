import { useCallback } from 'react';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useTraceGraph } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { useSlimAssets } from '../../assets/hooks/useSlimAssets';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import { buildCoreOutCable } from '../fiberWrite';
import { generateTempId } from '../../../utils/idHelpers';
import { EditableField } from '../../assets/components/EditableField';
import type { Asset } from '../../../types/asset';

/** 선번장 자국/대국 설비 드롭다운 — OUT 코어 케이블 생성/변경/해제. */
export function EquipmentSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  const { graph } = useTraceGraph();
  // 연결 상태는 전역 SSOT(graph.cables = 전역 /cables + staged 오버레이)에서 읽는다 — 변전소 스코프 없음(대국 케이블도 보임).
  const cables = (graph?.cables ?? []) as unknown as CableLike[];
  const { data: categories = [] } = useCableCategories();
  const { data: slim = [] } = useSlimAssets();
  const opjCat = categories.find((c) => c.code === 'CBL-OPJ');

  const twinId = twinSlotIdOf(slot.id, cables);
  const targetSlotId = side === 'local' ? slot.id : twinId;
  const targetSub = side === 'local'
    ? slot.substationId
    : (twinId ? (slim.find((a) => a.id === twinId)?.substationId ?? null) : null);

  // endpoint 가드 필수: roleAt 은 targetSlotId 가 endpoint 가 아니면 targetRole 로 fall-through 하므로,
  // 가드 없이는 다른 슬롯(예: 자국)의 targetRole='OUT' 케이블이 대국 조회에 잘못 매칭된다(전염 버그).
  const outCable = targetSlotId
    ? cables.find((c) =>
        c.cableType === 'FIBER' &&
        c.number === coreNumber &&
        (c.sourceAssetId === targetSlotId || c.targetAssetId === targetSlotId) &&
        roleAt(c, targetSlotId) === 'OUT')
    : undefined;
  const currentId = outCable && targetSlotId ? other(outCable, targetSlotId) : null;

  // 후보 = 대상 변전소 배치 설비, 구조/통로 자산(OFD·conduit) 제외.
  const candidates = slim.filter(
    (a) => a.substationId === targetSub && a.code !== 'OFD' && a.connectionKind !== 'conduit',
  );

  const disabled = !targetSlotId || !targetSub || !opjCat;
  const ariaLabel = side === 'local' ? '자국설비' : '대국설비';

  const commit = useCallback((v: string) => {
    if (v === (currentId ?? '')) return;
    const wc = useSubstationWorkingCopy.getState();
    if (v === '') {
      if (outCable && window.confirm('이 코어 연결을 해제할까요?')) wc.remove('cables', outCable.id);
      return;
    }
    if (outCable) {
      wc.patch('cables', outCable.id, { sourceAssetId: v });
    } else if (targetSlotId && opjCat) {
      const cable = buildCoreOutCable({
        id: generateTempId(), equipmentId: v, slotId: targetSlotId, coreNumber,
        category: opjCat, pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
      });
      wc.put('cables', cable as unknown as { id: string; [k: string]: unknown });
    }
  }, [currentId, outCable?.id, targetSlotId, opjCat, coreNumber]);

  // 옵션 라벨·읽기모드 표시 동일 이름 출처(slim 우선, graph 폴백).
  const nameOf = (id: string) => slim.find((a) => a.id === id)?.name ?? graph?.nameById.get(id) ?? id;
  // 현재 연결된 설비는 후보 필터가 제외해도 항상 선택지로 보장.
  const optionAssets = currentId && !candidates.some((a) => a.id === currentId)
    ? [...slim.filter((a) => a.id === currentId), ...candidates]
    : candidates;
  const options = [{ value: '', label: '—' }, ...optionAssets.map((a) => ({ value: a.id, label: a.name ?? a.id }))];

  return (
    <EditableField
      value={currentId ?? ''}
      type="select"
      ariaLabel={ariaLabel}
      disabled={disabled}
      options={options}
      display={(v) => (v ? nameOf(v) : '—')}
      onCommit={commit}
    />
  );
}
