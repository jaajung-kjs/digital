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
    (c) => c.cableType === 'FIBER' && roleAt(c, slotId) === 'IN'
      && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  return opgw ? other(opgw, slotId) : null;
}

/**
 * 광슬롯의 포트(코어) 파생 — 자국(slot) + 대국(twin slot) 양쪽 OUT 점유로 상태 판정.
 * 빈 케이블을 만들지 않고 OPGW 용량(specParams.cores)에서 1..N 을 파생한다.
 */
export function buildSlotPorts(
  slot: SlotLike,
  cables: CableLike[],
  _graph: TraceGraph | null, // reserved — 향후 far-name 투영용, 현재 미사용
): SlotPort[] {
  const fiberOnSlot = cables.filter(
    (c) => c.cableType === 'FIBER' && (c.sourceAssetId === slot.id || c.targetAssetId === slot.id),
  );
  const opgw = fiberOnSlot.find((c) => roleAt(c, slot.id) === 'IN');
  if (!opgw) return [];
  const capacity = Number((opgw.specParams as Record<string, unknown> | undefined)?.cores ?? 0);
  if (capacity <= 0) return [];

  const twinId = twinSlotIdOf(slot.id, cables);

  // OUT 코어 케이블을 (endpoint assetId, coreNumber) 로 1회 인덱싱 — 포트마다 전체 스캔 방지.
  const outIndex = new Map<string, CableLike>();
  for (const c of cables) {
    if (c.cableType !== 'FIBER' || c.number == null) continue;
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
