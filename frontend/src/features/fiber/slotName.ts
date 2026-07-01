import { isOpgwTwin } from '../cables/cableEndpoint';
import type { TraceGraph } from '../trace/traceGraph';

/**
 * 경로슬롯 표시 이름(생성 시 1회 조립). 포맷 = "자국 - 대국 -N #코어수".
 * 자국/대국 하나라도 없으면 있는 것만. base 가 비면 '', n<=0 이면 -N 생략, cores<=0 이면 # 생략.
 * 저장된 뒤엔 다른 자산처럼 name 을 그대로 읽는다(재계산 없음).
 */
export function composeSlotName(local: string | null, remote: string | null, n: number, cores: number): string {
  const base = [local, remote].filter(Boolean).join(' - ');
  if (!base) return '';
  const route = n > 0 ? ` -${n}` : '';
  return cores ? `${base}${route} #${cores}` : `${base}${route}`;
}

/** 슬롯의 대국(twin) 변전소 id — OPGW(IN-IN) 반대쪽 슬롯의 substationId. */
function twinSubOf(slotId: string, graph: TraceGraph): string | null {
  const opgw = graph.cables.find(
    (c) => isOpgwTwin(c) && (c.sourceAssetId === slotId || c.targetAssetId === slotId),
  );
  if (!opgw) return null;
  const twin = opgw.sourceAssetId === slotId ? opgw.targetAssetId : opgw.sourceAssetId;
  return twin ? (graph.subById?.get(twin) ?? null) : null;
}

/**
 * 새 경로슬롯의 -N(선로번호) = 같은 OFD 아래에서 같은 대국 변전소로 가는 기존 형제 슬롯 수 + 1.
 * 자국은 항상 resident → 정확. 대국측은 대국 미적재 시 best-effort(Global Constraints).
 */
export function nextRouteNumber(ofdId: string, twinSubId: string | null, graph: TraceGraph): number {
  if (!twinSubId) return 1;
  const count = graph.assets.filter(
    (a) => graph.roleById.get(a.id) === 'slot'
      && graph.parentById.get(a.id) === ofdId
      && twinSubOf(a.id, graph) === twinSubId,
  ).length;
  return count + 1;
}
