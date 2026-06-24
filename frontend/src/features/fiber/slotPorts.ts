import { roleAt, other, type CableLike } from './slotRegister';
import type { TraceGraph } from '../trace/traceGraph';

export type PortState = 'empty' | 'half' | 'full'; // 미연결 / 편도 / 양측

export interface SlotPort {
  coreNumber: number;
  localCableId: string | null;
  remoteCableId: string | null;
  localAssetId: string | null;
  remoteAssetId: string | null;
  state: PortState;
}

interface SlotLike { id: string }

/** 슬롯의 OPGW(IN-IN) 반대편(twin) 슬롯 id. 없으면 null. */
export function twinSlotIdOf(slotId: string, cables: CableLike[]): string | null {
  const opgw = cables.find(
    (c) => roleAt(c, slotId) === 'IN'
      && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  return opgw ? other(opgw, slotId) : null;
}

/**
 * 광슬롯의 포트(코어) 파생 — 자국(slot) + 대국(twin slot) 양쪽 OUT 점유로 상태 판정.
 * 용량(코어수)은 OPGW 케이블이 소유한다(단일 SSOT). 모든 슬롯은 OPGW 와 1:1 로 짝지어져
 * 있으므로 OPGW.cores 가 곧 슬롯 용량. 점유코어는 안전 바닥값(데이터 깨짐 방어).
 */
export function buildSlotPorts(
  slot: SlotLike,
  cables: CableLike[],
  _graph: TraceGraph | null, // reserved — 향후 far-name 투영용, 현재 미사용
): SlotPort[] {
  const fiberOnSlot = cables.filter(
    (c) => c.sourceAssetId === slot.id || c.targetAssetId === slot.id,
  );
  const opgw = fiberOnSlot.find((c) => roleAt(c, slot.id) === 'IN');
  const opgwCores = Number((opgw?.specParams as Record<string, unknown> | undefined)?.cores ?? 0);
  const maxOcc = fiberOnSlot.reduce((m, c) => (roleAt(c, slot.id) === 'OUT' ? Math.max(m, c.number ?? 0) : m), 0);
  const capacity = Math.max(opgwCores, maxOcc);
  if (capacity <= 0) return [];

  const twinId = twinSlotIdOf(slot.id, cables);

  // OUT 코어 케이블을 (endpoint assetId, coreNumber) 로 1회 인덱싱 — 포트마다 전체 스캔 방지.
  const outIndex = new Map<string, CableLike>();
  for (const c of cables) {
    if (c.number == null) continue;
    if (c.sourceRole === 'OUT' && c.sourceAssetId) outIndex.set(`${c.sourceAssetId}:${c.number}`, c);
    if (c.targetRole === 'OUT' && c.targetAssetId) outIndex.set(`${c.targetAssetId}:${c.number}`, c);
  }
  const outAt = (assetId: string | null, n: number): CableLike | undefined =>
    assetId == null ? undefined : outIndex.get(`${assetId}:${n}`);

  const ports: SlotPort[] = [];
  for (let n = 1; n <= capacity; n++) {
    const localOut = outAt(slot.id, n);
    const remoteOut = outAt(twinId, n);
    const localAssetId = localOut ? other(localOut, slot.id) : null;
    const remoteAssetId = remoteOut && twinId ? other(remoteOut, twinId) : null;
    const state: PortState = localOut && remoteOut ? 'full' : localOut || remoteOut ? 'half' : 'empty';
    ports.push({
      coreNumber: n,
      localCableId: localOut?.id ?? null,
      remoteCableId: remoteOut?.id ?? null,
      localAssetId,
      remoteAssetId,
      state,
    });
  }
  return ports;
}
