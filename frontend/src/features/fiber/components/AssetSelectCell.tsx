import { useCallback } from 'react';
import { useTraceGraph } from '../../trace/traceGraph';
import { useAssetRefs } from '../../assets/useAssetRefs';
import { useSearchAssets } from '../../assets/useSearchAssets';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import { touchCoreInspect, opgwIdOfSlot } from '../coreMeta';
import { buildCoreOutCable } from '../fiberWrite';
import { generateTempId } from '../../../utils/idHelpers';
import { EditableField } from '../../assets/components/EditableField';
import type { Asset } from '../../../types/asset';

/**
 * 선번장 자국/대국 설비 드롭다운 — OUT 코어 케이블 생성/변경/해제. 자국·대국 대칭.
 * 그리드 공용 EditableField(type='select') 로 렌더 → 다른 셀(손실/거리/점검일)과 일관.
 *
 * 후보(candidates)는 대상 변전소를 검색-피커로 조회(`useSearchAssets`, page-in 없이 온디맨드):
 *   - 자국(local): substationId = slot.substationId (resident, 즉시).
 *   - 대국(remote): substationId = twin 슬롯의 substationId (비-resident → useAssetRefs 로 lazy 해소).
 * 연결 쓰기: 대상 슬롯(자국=slot.id / 대국=twinId)의 OUT 패치 케이블. 대국 패치는 전역 커밋으로 저장.
 */
export function AssetSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  // ── 모든 훅 top-level ────────────────────────────────────────────────────
  const { graph } = useTraceGraph();
  const cables = (graph?.cables ?? []) as unknown as CableLike[];

  const twinId = twinSlotIdOf(slot.id, cables);
  const targetSlotId = side === 'local' ? slot.id : twinId;

  // 대상 슬롯의 이 코어 OUT 패치 + 현재 연결 설비 id (endpoint 가드: roleAt fall-through 방지).
  const outCable = targetSlotId
    ? (cables.find((c) =>
        c.number === coreNumber &&
        (c.sourceAssetId === targetSlotId || c.targetAssetId === targetSlotId) &&
        roleAt(c, targetSlotId) === 'OUT',
      ) ?? null)
    : null;
  const currentId = outCable && targetSlotId ? other(outCable, targetSlotId) : null;

  // twin 슬롯 substationId(대국 후보 스코프) + 현재 설비 이름 — 동시 lazy 해소(resident 는 즉시).
  const refs = useAssetRefs(([twinId, currentId].filter(Boolean) as string[]));
  const targetSub = side === 'local'
    ? (slot.substationId ?? null)
    : (twinId ? (refs.get(twinId)?.substationId ?? null) : null);

  // 후보 = 대상 변전소 배치 설비. substationId 미해소(대국 async) 시 검색 비활성(전 시스템 fetch 방지).
  const { results } = useSearchAssets({
    substationId: targetSub ?? undefined,
    role: 'device',
    enabled: !!targetSub,
  });

  const { data: categories = [] } = useCableCategories();
  const cat = categories.find((c) => c.name === '광점퍼코드') ?? categories[0];

  const currentName = currentId
    ? (refs.get(currentId)?.name ?? graph?.nameById.get(currentId) ?? currentId)
    : null;

  const commit = useCallback((v: string) => {
    if (v === (currentId ?? '')) return;
    if (!targetSlotId) return;
    const wc = useSubstationWorkingCopy.getState();
    const opgwId = opgwIdOfSlot(slot.id, cables);
    const touch = () => { if (opgwId) touchCoreInspect(opgwId, coreNumber); };
    if (v === '') {
      if (outCable && window.confirm('이 코어 연결을 해제할까요?')) { wc.remove('cables', outCable.id); touch(); }
      return;
    }
    if (outCable) {
      // 설비 = 슬롯의 반대쪽 끝점 — source/target 순서 가정 없이 그 끝점만 교체(케이블 id·coreMeta 보존).
      const p = outCable.sourceAssetId === targetSlotId ? { targetAssetId: v } : { sourceAssetId: v };
      wc.patch('cables', outCable.id, p);
      touch();
    } else if (cat) {
      const cable = buildCoreOutCable({
        id: generateTempId(), assetId: v, slotId: targetSlotId, coreNumber,
        category: { id: cat.id, name: cat.name },
        pathPoints: null, pathLength: null, bufferLength: 4, totalLength: null,
      });
      wc.put('cables', cable as unknown as { id: string; [k: string]: unknown });
      touch();
    }
  }, [currentId, targetSlotId, outCable, cat, coreNumber, slot.id, cables]);

  // 현재 설비는 후보 검색결과에 없어도 항상 선택지로 보장.
  const options = [
    { value: '', label: '—' },
    ...(currentId && currentName && !results.some((r) => r.id === currentId)
      ? [{ value: currentId, label: currentName }] : []),
    ...results.map((r) => ({ value: r.id, label: r.name })),
  ];

  const disabled = !targetSlotId || !targetSub || !cat;

  return (
    <EditableField
      type="select"
      value={currentId ?? ''}
      options={options}
      disabled={disabled}
      ariaLabel={side === 'local' ? '자국설비' : '대국설비'}
      display={() => currentName ?? '—'}
      onCommit={commit}
    />
  );
}
