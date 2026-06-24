import { useCallback } from 'react';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useTraceGraph, equipmentInSubstation } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import { touchCoreInspect, opgwIdOfSlot } from '../coreMeta';
import { buildCoreOutCable } from '../fiberWrite';
import { generateTempId } from '../../../utils/idHelpers';
import { EditableField } from '../../assets/components/EditableField';
import type { Asset } from '../../../types/asset';

/** 선번장 자국/대국 설비 드롭다운 — OUT 코어 케이블 생성/변경/해제. */
export function EquipmentSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  const { graph } = useTraceGraph();
  // 자산·연결 모두 그래프 단일 SSOT(slim+staged 병합)에서 읽는다 — 저장 전 staged 도 후보·대국에 보임.
  const cables = (graph?.cables ?? []) as unknown as CableLike[];
  const { data: categories = [] } = useCableCategories();
  const opjCat = categories.find((c) => c.code === 'CBL-OPJ');

  const twinId = twinSlotIdOf(slot.id, cables);
  const targetSlotId = side === 'local' ? slot.id : twinId;
  const targetSub = side === 'local'
    ? slot.substationId
    : (twinId ? (graph?.subById.get(twinId) ?? null) : null);

  // endpoint 가드 필수: roleAt 은 targetSlotId 가 endpoint 가 아니면 targetRole 로 fall-through 하므로,
  // 가드 없이는 다른 슬롯(예: 자국)의 targetRole='OUT' 케이블이 대국 조회에 잘못 매칭된다(전염 버그).
  const outCable = targetSlotId
    ? cables.find((c) =>
        c.number === coreNumber &&
        (c.sourceAssetId === targetSlotId || c.targetAssetId === targetSlotId) &&
        roleAt(c, targetSlotId) === 'OUT')
    : undefined;
  const currentId = outCable && targetSlotId ? other(outCable, targetSlotId) : null;

  // 후보 = 대상 변전소 배치 설비(OFD·conduit 제외). 그래프 파생 → staged 설비도 저장 전 노출.
  const candidates = graph ? equipmentInSubstation(graph, targetSub) : [];

  const disabled = !targetSlotId || !targetSub || !opjCat;
  const ariaLabel = side === 'local' ? '자국설비' : '대국설비';

  const commit = useCallback((v: string) => {
    if (v === (currentId ?? '')) return;
    const wc = useSubstationWorkingCopy.getState();
    // 설비 연결/변경/해제도 "코어를 만진" 것 → 점검일을 오늘로 자동 갱신(OPGW coreMeta 소유).
    const opgwId = opgwIdOfSlot(slot.id, cables);
    const touch = () => { if (opgwId) touchCoreInspect(opgwId, coreNumber); };
    if (v === '') {
      if (outCable && window.confirm('이 코어 연결을 해제할까요?')) { wc.remove('cables', outCable.id); touch(); }
      return;
    }
    if (outCable) {
      // 설비는 슬롯의 반대쪽 끝점 — source/target 순서 가정 없이 그 끝점만 교체.
      const patch = outCable.sourceAssetId === targetSlotId ? { targetAssetId: v } : { sourceAssetId: v };
      wc.patch('cables', outCable.id, patch);
      touch();
    } else if (targetSlotId && opjCat) {
      const cable = buildCoreOutCable({
        id: generateTempId(), equipmentId: v, slotId: targetSlotId, coreNumber,
        category: opjCat, pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
      });
      wc.put('cables', cable as unknown as { id: string; [k: string]: unknown });
      touch();
    }
  }, [currentId, outCable?.id, targetSlotId, opjCat, coreNumber, slot.id, cables]);

  // 이름 출처도 그래프 단일 SSOT.
  const nameOf = (id: string) => graph?.nameById.get(id) ?? id;
  // 현재 연결된 설비는 후보 필터가 제외해도 항상 선택지로 보장.
  const optionAssets = currentId && !candidates.some((a) => a.id === currentId)
    ? [{ id: currentId, name: nameOf(currentId) }, ...candidates]
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
