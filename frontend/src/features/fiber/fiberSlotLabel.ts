import { remoteSlotSubstation, type TraceGraph } from '../trace/traceGraph';

/**
 * 경로슬롯 표시 이름(파생, SSOT) = "자국 - 대국 -N #코어수".
 * 자국 = 슬롯 부모 OFD 의 변전소명, 대국 = twin 슬롯 변전소명, 코어수 = OPGW(IN-IN) specParams.cores.
 * -N = 같은 OFD→같은 대국 으로 가는 경로슬롯 순번(1부터). 같은 대국 슬롯이 1개여도 -1.
 *   순번은 형제 슬롯을 slotIndex(없으면 id) 로 정렬한 위치 — 시드의 -N 과 동일 순서.
 * 저장하지 않고 표시 지점마다 계산한다(변전소명 변경 시 자동 반영).
 */
export function fiberSlotLabel(slotId: string, graph: TraceGraph | null): string {
  if (!graph) return '';
  const ofdId = graph.parentById.get(slotId) ?? slotId;
  const local = graph.subNameById.get(ofdId) ?? null;
  const remote = remoteSlotSubstation(slotId, graph);
  const opgw = graph.cables.find(
    (c) => c.cableType === 'FIBER' && c.sourceRole === 'IN' && c.targetRole === 'IN'
      && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  const cores = Number((opgw?.specParams as Record<string, unknown> | undefined)?.cores ?? 0);
  const base = [local, remote].filter(Boolean).join(' - ');
  if (!base) return '';

  // 같은 OFD(자국) → 같은 대국 형제 슬롯들 중 이 슬롯의 순번(-N). 정렬: slotIndex → id.
  const order = (id: string) => graph.slotIndexById?.get(id) ?? Number.MAX_SAFE_INTEGER;
  const siblings = graph.assets
    .filter((a) => a.connectionKind === 'conduit'
      && graph.parentById.get(a.id) === ofdId
      && remoteSlotSubstation(a.id, graph) === remote)
    .sort((a, b) => order(a.id) - order(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = siblings.findIndex((a) => a.id === slotId) + 1;

  const route = n > 0 ? ` -${n}` : '';
  return cores ? `${base}${route} #${cores}` : `${base}${route}`;
}
