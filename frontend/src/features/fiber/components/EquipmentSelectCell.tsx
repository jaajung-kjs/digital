import { useQuery } from '@tanstack/react-query';
import { useEffectiveCables } from '../../workingCopy/hooks';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { useTraceGraph, type SlimAssetDTO } from '../../trace/traceGraph';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import { buildCoreOutCable } from '../fiberWrite';
import { generateTempId } from '../../../utils/idHelpers';
import { api } from '../../../utils/api';
import { EditableField } from '../../assets/components/EditableField';
import type { Asset } from '../../../types/asset';

/** 선번장 자국/대국 설비 드롭다운 — OUT 코어 케이블 생성/변경/해제. */
export function EquipmentSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  const cables = useEffectiveCables() as unknown as CableLike[];
  const { graph } = useTraceGraph();
  const { data: categories = [] } = useCableCategories();
  const { data: slim = [] } = useQuery({
    queryKey: ['assets-slim'], staleTime: 30_000,
    queryFn: async () => (await api.get<{ data: SlimAssetDTO[] }>('/assets')).data.data,
  });
  const opjCat = categories.find((c) => c.code === 'CBL-OPJ');

  const twinId = twinSlotIdOf(slot.id, cables);
  const targetSlotId = side === 'local' ? slot.id : twinId;
  const targetSub = side === 'local'
    ? slot.substationId
    : (twinId ? (slim.find((a) => a.id === twinId)?.substationId ?? null) : null);

  const outCable = targetSlotId
    ? cables.find((c) => c.cableType === 'FIBER' && roleAt(c, targetSlotId) === 'OUT' && c.number === coreNumber)
    : undefined;
  const currentId = outCable && targetSlotId ? other(outCable, targetSlotId) : null;

  // 후보 = 대상 변전소 배치 설비, 구조/통로 자산(OFD·conduit) 제외.
  const candidates = slim.filter(
    (a) => a.substationId === targetSub && a.code !== 'OFD' && a.connectionKind !== 'conduit',
  );

  const disabled = !targetSlotId || !targetSub || !opjCat;
  const ariaLabel = side === 'local' ? '자국설비' : '대국설비';

  const commit = (v: string) => {
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
  };

  const nameOf = (id: string) => graph?.nameById.get(id) ?? slim.find((a) => a.id === id)?.name ?? id;
  const options = [{ value: '', label: '—' }, ...candidates.map((a) => ({ value: a.id, label: a.name ?? a.id }))];

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
