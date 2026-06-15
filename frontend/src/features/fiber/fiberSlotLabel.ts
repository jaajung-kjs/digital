import { remoteSlotSubstation, type TraceGraph } from '../trace/traceGraph';

/**
 * 경로슬롯 표시 이름(파생, SSOT) = "자국 - 대국 #코어수".
 * 자국 = 슬롯 부모 OFD 의 변전소명, 대국 = twin 슬롯 변전소명, 코어수 = OPGW(IN-IN) specParams.cores.
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
  return cores ? `${base} #${cores}` : base;
}
