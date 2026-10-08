import type { NetworkInput } from '@twin/core';
import type { Network, NetworkLine } from '../../model/networkApi';
import { effectiveCores, effectiveRows, outsideLinks, substationName } from '../../model/store/effective';
import type { WorkingCopyState } from '../../model/store/workingCopy';

type S = Pick<WorkingCopyState, 'saved' | 'overlays'>;

/** 중계경로를 그리는 데 드는 것 — core 추적 입력과 이름 풀이. */
export interface NetworkView {
  input: NetworkInput;
  line: (id: string) => NetworkLine | undefined;
  substationName: (id: string) => string;
  equipmentName: (id: string) => string | null;
  /** 서버가 깊이 상한에서 멈춰 그 너머 연결을 싣지 않은 코어인가 — 끊긴 자리의 까닭(「경로가 길어 일부만」). */
  isTruncated: (lineId: string, no: number) => boolean;
  /** 범위 데이터가 깊이 상한에서 잘렸나. */
  truncated: boolean;
}

/**
 * 서버 범위 데이터(`useNetwork`) 위에 **저장 전 변경**을 겹친다 — 저장 안 한 패치도 추적에 든다.
 *
 * 경계: 저장 전 패치가 **본부 범위 밖 광선로**(서버 범위 데이터에 없는 선)의 코어를 가리켜도 그 선은 들른 국에 닿아
 * 있으므로 effective 광선로로 들어온다 — 다만 그 너머(범위 밖 국의 연결)는 서버가 그 선을 따라간 적이 없어서
 * 저장 전에는 모른다(저장 뒤 다시 읽으면 서버가 따라간다). 그때 사슬은 그 선의 먼 끝에서 「경로 미완결」로 멈춘다.
 *
 * 들른 국(워킹카피에 실린 국)의 광선로·코어·연결은 **effective 가 정답**이다: 서버 것을 버리고 effective 를 쓴다
 * (지운 것은 빠지고, 새로 만든 것은 들어온다). 들르지 않은 국의 것만 서버 것을 쓴다 — 단 지우기로 한 연결
 * (광선로 삭제 펼침이 먼 국 연결까지 지운다)은 뺀다. 서버가 아직 안 준 것(조직 트리 대기 등)은 빈 것으로 본다.
 */
export function effectiveNetwork(server: Network | undefined, s: S): NetworkView {
  const loaded = new Set(Object.keys(s.saved.substations));
  const gone = new Set(s.overlays.links.deletes);
  const touchesLoaded = (l: { aSubstationId: string; bSubstationId: string }) => loaded.has(l.aSubstationId) || loaded.has(l.bSubstationId);

  const ownLines: NetworkLine[] = effectiveRows(s, 'fiberLines').map((l) => ({
    id: l.id, name: l.name, lengthKm: l.lengthKm, cableTypeId: l.cableTypeId, coreCount: l.coreCount,
    aSubstationId: l.aSubstationId, bSubstationId: l.bSubstationId,
    aEquipmentId: l.aEquipmentId, aPanel: l.aPanel, aStartNo: l.aStartNo,
    bEquipmentId: l.bEquipmentId, bPanel: l.bPanel, bStartNo: l.bStartNo,
  }));
  const ownLineIds = new Set(ownLines.map((l) => l.id));
  const lines = [...(server?.lines ?? []).filter((l) => !touchesLoaded(l) && !ownLineIds.has(l.id)), ...ownLines];
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const cores = [
    ...(server?.cores ?? []).filter((c) => lineById.has(c.lineId) && !ownLineIds.has(c.lineId)).map((c) => ({ lineId: c.lineId, no: c.no, role: c.role })),
    ...ownLines.flatMap((l) => effectiveCores(s, l.id).map((c) => ({ lineId: c.lineId, no: c.no, role: c.role }))),
  ];

  const links = new Map<string, NetworkInput['links'][number]>();
  for (const l of server?.links ?? []) if (!loaded.has(l.substationId) && !gone.has(l.id)) links.set(l.id, { id: l.id, a: l.a, b: l.b });
  for (const l of outsideLinks(s)) if (!links.has(l.id)) links.set(l.id, { id: l.id, a: l.a, b: l.b });
  for (const l of effectiveRows(s, 'links')) links.set(l.id, { id: l.id, a: l.a, b: l.b });

  /* 설비 — 들른 국은 effective, 아니면 서버, 그래도 없으면 대국 참조. */
  const eq = new Map<string, { name: string; substationId: string }>();
  for (const e of s.saved.refEquipment) eq.set(e.id, e);
  for (const e of server?.equipment ?? []) eq.set(e.id, e);
  for (const e of effectiveRows(s, 'equipment')) eq.set(e.id, e);

  const serverSubs = new Map((server?.substations ?? []).map((x) => [x.id, x.name]));
  const cut = new Set((server?.truncatedCores ?? []).map((c) => `${c.lineId}:${c.no}`));

  return {
    input: {
      lines: lines.map((l) => ({ id: l.id, aSubstationId: l.aSubstationId, bSubstationId: l.bSubstationId })),
      cores,
      links: [...links.values()],
      equipmentSubstation: (id) => eq.get(id)?.substationId ?? null,
    },
    line: (id) => lineById.get(id),
    substationName: (id) => substationName(s, id) ?? serverSubs.get(id) ?? '—',
    equipmentName: (id) => eq.get(id)?.name ?? null,
    isTruncated: (lineId, no) => cut.has(`${lineId}:${no}`),
    truncated: server?.truncated ?? false,
  };
}
