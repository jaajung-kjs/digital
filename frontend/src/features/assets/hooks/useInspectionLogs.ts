import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { InspectionLog } from '../../../types/inspection';

/**
 * 점검 이력(inspection_logs) — **읽기 전용 쿼리만** 제공.
 *
 * git-like 불변식: 점검 작성/수정/삭제는 즉시 백엔드로 보내지 않는다. editorStore 의
 * pendingInspections 큐에 스테이징했다가 단일 SAVE(commit) 시 flushPendingMedia 가
 * 반영한다. 그래서 여기엔 create/update/delete mutation 훅을 두지 않는다 — 직접
 * CRUD 경로 자체를 없애 staging 우회(=git-like 위반) 버그가 구조적으로 불가능하게 한다.
 */
const INSPECTION_KEYS = {
  all: ['inspection-logs'] as const,
  list: (assetId: string) => [...INSPECTION_KEYS.all, assetId] as const,
};

export function useInspectionLogs(assetId: string) {
  return useQuery({
    queryKey: INSPECTION_KEYS.list(assetId),
    queryFn: async () => {
      const { data } = await api.get<{ data: InspectionLog[] }>(
        `/assets/${assetId}/inspections`,
      );
      return data.data;
    },
    enabled: !!assetId && !isTempId(assetId),
  });
}
