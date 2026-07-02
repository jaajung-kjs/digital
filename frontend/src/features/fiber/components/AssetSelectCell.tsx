import { useTraceGraph } from '../../trace/traceGraph';
import { useAssetRefs } from '../../assets/useAssetRefs';
import { useSearchAssets } from '../../assets/useSearchAssets';
import { useCableCategories } from '../../cables/hooks/useCableCategories';
import { useSubstationWorkingCopy } from '../../workingCopy/substationStore';
import { roleAt, other, type CableLike } from '../slotRegister';
import { twinSlotIdOf } from '../slotPorts';
import { buildCoreOutCable } from '../fiberWrite';
import { generateTempId } from '../../../utils/idHelpers';
import type { Asset } from '../../../types/asset';

/**
 * 선번장 자국/대국 설비 셀.
 *
 * side='local': 읽기전용 — 근단 연결은 SlotPortsPanel 담당.
 * side='remote': 대국 설비 검색-피커 + 대국 OUT 패치 케이블 쓰기(전역 워킹카피).
 *   - 후보 = useSearchAssets({ substationId: 대국sub, role: 'device', enabled: !!twinSubstationId })
 *            — 대국 substationId 미해소 전 전 시스템 크로스-fetch 방지.
 *   - 현재 대국설비 이름 = useAssetRefs([twinId, remoteAssetId]) refs 우선(role 독립·일관).
 *   - 선택 → 기존 대국 OUT 패치 제거 후 buildCoreOutCable 로 신규 staged.
 *   - 해제(빈값) → 기존 패치만 제거.
 */
export function AssetSelectCell({ slot, coreNumber, side }: {
  slot: Asset; coreNumber: number; side: 'local' | 'remote';
}) {
  // ── 모든 훅 top-level ────────────────────────────────────────────────────
  const { graph } = useTraceGraph();
  const cables = (graph?.cables ?? []) as unknown as CableLike[];

  const twinId = twinSlotIdOf(slot.id, cables);

  // 대국 OUT 케이블 & 현재 대국설비 id — 훅 전 순수 계산(useAssetRefs 인자에 포함 목적).
  const remoteOutCable = twinId
    ? (cables.find((c) =>
        c.number === coreNumber &&
        (c.sourceAssetId === twinId || c.targetAssetId === twinId) &&
        roleAt(c, twinId) === 'OUT',
      ) ?? null)
    : null;
  const remoteAssetId = remoteOutCable && twinId ? other(remoteOutCable, twinId) : null;

  // 대국 슬롯의 substationId + 현재 대국설비 이름 — twinId·remoteAssetId 동시 lazy 해소.
  // (role 독립·일관: SlotPortsPanel/CableInspector 등 동일 패턴)
  const twinRefs = useAssetRefs(
    ([twinId, remoteAssetId].filter(Boolean) as string[]),
  );
  const twinSubstationId = twinId ? (twinRefs.get(twinId)?.substationId ?? null) : null;

  // 대국 설비 후보 — twinSubstationId 미해소 시 검색 비활성(전 시스템 device 무제한 fetch 방지).
  // OfdSlotRail 처럼 substationId 없이 쓰는 소비처가 있으므로 opt-in enabled 방식.
  const { results } = useSearchAssets({
    substationId: twinSubstationId ?? undefined,
    role: 'device',
    enabled: !!twinSubstationId,
  });

  // 케이블 종류(대국 OUT 패치용) — '광점퍼코드' 우선, 없으면 첫 번째.
  const { data: categories = [] } = useCableCategories();

  // ── 자국 OUT 케이블 (local side 표시용) ─────────────────────────────────
  const localOutCable = cables.find((c) =>
    c.number === coreNumber &&
    (c.sourceAssetId === slot.id || c.targetAssetId === slot.id) &&
    roleAt(c, slot.id) === 'OUT',
  ) ?? null;

  // ── side='local' → 읽기전용 ─────────────────────────────────────────────
  if (side === 'local') {
    const localAssetId = localOutCable ? other(localOutCable, slot.id) : null;
    const name = localAssetId ? (graph?.nameById.get(localAssetId) ?? localAssetId) : null;
    return (
      <span className="text-sm text-content">
        {name ?? <span className="text-content-faint">—</span>}
      </span>
    );
  }

  // ── side='remote' → 대국 설비 검색-피커 ─────────────────────────────────
  // remoteOutCable, remoteAssetId: 훅 전 계산으로 이전됨.

  // 현재 이름: useAssetRefs refs 우선(크로스변전소 일관), graph nameById 폴백.
  const remoteCurrentName = remoteAssetId
    ? (twinRefs.get(remoteAssetId)?.name ?? graph?.nameById.get(remoteAssetId) ?? null)
    : null;

  const handleChange = (newId: string) => {
    const wc = useSubstationWorkingCopy.getState();
    // 기존 대국 OUT 패치 제거
    if (remoteOutCable) wc.remove('cables', remoteOutCable.id);
    if (!newId || !twinId) return;
    // 케이블 종류 결정 — '광점퍼코드' 우선
    const cat = categories.find((c) => c.name === '광점퍼코드') ?? categories[0];
    if (!cat) return;
    // 대국 OUT 패치 케이블 staged (자국 세션 → 전역 워킹카피 overlay → 전역 커밋)
    const patch = buildCoreOutCable({
      id: generateTempId(),
      slotId: twinId,    // 대국 슬롯 = source(OUT)
      assetId: newId,    // 선택된 대국 설비 = target
      coreNumber,
      category: { id: cat.id, name: cat.name },
      pathPoints: null,
      pathLength: null,
      bufferLength: 4,
      totalLength: null,
    });
    wc.put('cables', patch as unknown as { id: string; [k: string]: unknown });
  };

  return (
    <select
      aria-label={`대국설비 코어 ${coreNumber}`}
      value={remoteAssetId ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      className="w-full text-sm text-content bg-surface border border-line rounded py-0.5 pl-2 pr-1 appearance-none focus:outline-none focus:border-primary"
    >
      <option value="">—</option>
      {results.map((r) => (
        <option key={r.id} value={r.id}>
          {r.substationName ? `${r.substationName} ` : ''}{r.name}
        </option>
      ))}
      {/* 현재 선택값이 검색 결과에 없을 때 fallback option — refs/graph nameById 로 이름 표시 */}
      {remoteAssetId && !results.find((r) => r.id === remoteAssetId) && remoteCurrentName && (
        <option value={remoteAssetId}>{remoteCurrentName}</option>
      )}
    </select>
  );
}
