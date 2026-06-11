import { useQuery } from '@tanstack/react-query';
import { api } from '../../../utils/api';
import { isTempId } from '../../../utils/idHelpers';
import type { MaintenanceLog } from '../../../types/maintenance';

/**
 * 고장이력(maintenance_logs) — **읽기 전용 쿼리만** 제공.
 *
 * git-like 불변식: 고장/수리 작성·수정·삭제는 즉시 백엔드로 보내지 않는다. editorStore 의
 * pendingLogs 큐에 스테이징했다가 단일 SAVE(commit) 시 flushPendingMedia 가 반영한다.
 * 그래서 여기엔 create/update/delete mutation 훅을 두지 않는다 — 직접 CRUD 경로 자체를
 * 없애 staging 우회(=git-like 위반) 버그가 구조적으로 불가능하게 한다.
 */
const LOG_KEYS = {
  all: ['maintenance-logs'] as const,
  list: (equipmentId: string) => [...LOG_KEYS.all, equipmentId] as const,
};

export function useMaintenanceLogs(equipmentId: string) {
  return useQuery({
    queryKey: LOG_KEYS.list(equipmentId),
    queryFn: async () => {
      const { data } = await api.get<{ data: MaintenanceLog[] }>(
        `/assets/${equipmentId}/maintenance-logs`,
      );
      return data.data;
    },
    enabled: !!equipmentId && !isTempId(equipmentId),
  });
}
