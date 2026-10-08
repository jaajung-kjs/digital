import { useQuery } from '@tanstack/react-query';
import type { CoreRole, CoreStatus, LinkEndRef } from '@twin/core';
import { httpClient as api } from '../httpClient';

/**
 * 범위 광 데이터(`GET /v2/nodes/:id/network`) — 본부·지사·국 아래 광선로·코어·코어 끝 연결,
 * 그리고 그 사슬이 범위 밖으로 나가면 닿는 데까지(서버가 따라간다). 읽기 전용.
 */
export interface NetworkLine {
  id: string; name: string | null; lengthKm: number | null; cableTypeId: string; coreCount: number;
  aSubstationId: string; bSubstationId: string;
  aEquipmentId: string | null; aPanel: number | null; aStartNo: number;
  bEquipmentId: string | null; bPanel: number | null; bStartNo: number;
}
export interface Network {
  substations: { id: string; name: string; inScope: boolean }[];
  lines: NetworkLine[];
  cores: { lineId: string; no: number; status: CoreStatus; role: CoreRole | null }[];
  links: { id: string; substationId: string; a: LinkEndRef; b: LinkEndRef }[];
  equipment: { id: string; name: string; substationId: string; typeName: string }[];
  /** 깊이 상한에서 멈췄나 — 그러면 `truncatedCores` 너머의 연결은 싣지 않았다(경로가 길어 일부만). */
  truncated: boolean;
  truncatedCores: { lineId: string; no: number }[];
}

async function fetchNetwork(nodeId: string): Promise<Network> {
  return (await api.get(`/v2/nodes/${nodeId}/network`)).data;
}

export const NETWORK_KEY = ['v2', 'network'] as const;

/** 노드(본부·지사·국) 범위 광 데이터. 저장 전 변경은 싣지 않는다 — 겹치는 것은 `effectiveNetwork`. */
export function useNetwork(nodeId: string | null) {
  return useQuery({
    queryKey: [...NETWORK_KEY, nodeId],
    queryFn: () => fetchNetwork(nodeId as string),
    enabled: !!nodeId,
    staleTime: 30_000,
  });
}
