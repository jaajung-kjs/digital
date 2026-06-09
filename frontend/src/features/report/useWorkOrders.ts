import { useQuery } from '@tanstack/react-query';
import { api } from '../../utils/api';
import type { ConstructionReport, ReportOverrides } from '../../types/constructionReport';

// ──────────────────────────────────────────────────────────────────────────
// #3 Task 3 — 작업지시서 이력 조회 훅.
//
// 커밋 시 아카이브된 설계서(작업지시서)를 목록/상세로 읽는다. 아카이브 자체는
// useCommitWorkingCopy 가 POST /floors/:id/work-orders 로 수행하고, 여기서는
// 읽기만 한다. queryKey 는 'work-orders' 로 두어 아카이브 후 invalidate 한다.
// ──────────────────────────────────────────────────────────────────────────

export interface WorkOrderSummary {
  itemCount?: number;
}

export interface WorkOrderListItem {
  id: string;
  createdAt: string;
  userName: string | null;
  summary: WorkOrderSummary | null;
}

export interface WorkOrderDetail {
  id: string;
  createdAt: string;
  userName: string | null;
  context: Record<string, unknown>;
  constructionReport: ConstructionReport | null;
  reportOverrides: ReportOverrides | null;
  summary: WorkOrderSummary | null;
}

export const WORK_ORDER_KEYS = {
  all: ['work-orders'] as const,
  list: (floorId: string) => [...WORK_ORDER_KEYS.all, floorId] as const,
  detail: (floorId: string, id: string) => [...WORK_ORDER_KEYS.all, floorId, id] as const,
};

/** 작업지시서 이력 목록(메타데이터). */
export function useWorkOrders(floorId: string | undefined) {
  return useQuery({
    queryKey: WORK_ORDER_KEYS.list(floorId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: WorkOrderListItem[] }>(
        `/floors/${floorId}/work-orders`,
      );
      return data.data;
    },
    enabled: !!floorId,
  });
}

/** 작업지시서 상세(아카이브된 ConstructionReport 전체). */
export function useWorkOrder(floorId: string | undefined, workOrderId: string | null) {
  return useQuery({
    queryKey: WORK_ORDER_KEYS.detail(floorId!, workOrderId!),
    queryFn: async () => {
      const { data } = await api.get<{ data: WorkOrderDetail }>(
        `/floors/${floorId}/work-orders/${workOrderId}`,
      );
      return data.data;
    },
    enabled: !!floorId && !!workOrderId,
  });
}
