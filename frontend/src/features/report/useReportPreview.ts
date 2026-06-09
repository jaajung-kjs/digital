import { useMutation } from '@tanstack/react-query';
import { api } from '../../utils/api';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import type {
  ConstructionReport,
  ReportPreviewChanges,
  ReportOverrides,
} from '../../types/constructionReport';

export interface ReportPreviewArgs {
  floorId: string;
  changes: ReportPreviewChanges;
  overrides?: ReportOverrides;
}

/**
 * #3 Task 2 — 활성 층 오버레이 → 설계서 dry-run.
 *
 * POST /substations/:id/report-preview 로 before/after 스냅샷(+overrides)을 보내
 * ConstructionReport 를 받는다. substationId 는 통합 working copy store 에서 읽는다
 * (DB 저장 없음 — 순수 계산이라 mutation 으로 둔다).
 */
export function useReportPreview() {
  return useMutation<ConstructionReport, unknown, ReportPreviewArgs>({
    mutationFn: async ({ floorId, changes, overrides }) => {
      const substationId = useSubstationWorkingCopy.getState().substationId;
      if (!substationId) throw new Error('변전소가 로드되지 않았습니다.');
      const { data } = await api.post(`/substations/${substationId}/report-preview`, {
        floorId,
        changes,
        overrides,
      });
      return data.data as ConstructionReport;
    },
  });
}
