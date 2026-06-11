import { useEffect, useMemo, useState } from 'react';
import { SidePanel } from '../editor/components/SidePanel';
import { useSubstationWorkingCopy } from '../workingCopy/substationStore';
import { useEditorStore } from '../editor/stores/editorStore';
import { overlayToChanges } from './overlayToChanges';
import { useReportPreview } from './useReportPreview';
import { ReportView } from '../editor/components/history/ReportView';
import type { AuditLog } from '../../types/maintenance';
import type { ConstructionReport, ReportOverrides } from '../../types/constructionReport';

interface ReportPanelProps {
  floorId: string;
  onClose: () => void;
}

/**
 * #3 Task 2 — 라이브 설계서 패널.
 *
 * 활성 층의 staged 오버레이를 before/after 스냅샷으로 만들어 report-preview 로
 * dry-run, 받은 ConstructionReport 를 기존 ReportView 로 렌더한다. overrides
 * 편집은 ReportView 의 기존 메커니즘을 그대로 쓰되, 저장 시 overrides 를 다시
 * 프리뷰에 동봉해 서버가 재계산하게 한다(transient — 커밋 흐름은 Task 3).
 */
export function ReportPanel({ floorId, onClose }: ReportPanelProps) {
  const savedAssets = useSubstationWorkingCopy((s) => s.saved.assets);
  const savedCables = useSubstationWorkingCopy((s) => s.saved.cables);
  const overlayAssets = useSubstationWorkingCopy((s) => s.overlays.assets);
  const overlayCables = useSubstationWorkingCopy((s) => s.overlays.cables);
  const activeFloorId = useEditorStore((s) => s.activeFloorId) ?? floorId;

  const changes = useMemo(
    () =>
      overlayToChanges(
        { assets: savedAssets, cables: savedCables },
        { assets: overlayAssets, cables: overlayCables },
        activeFloorId,
      ),
    [savedAssets, savedCables, overlayAssets, overlayCables, activeFloorId],
  );

  const hasChanges =
    changes.before.equipment.length > 0 ||
    changes.after.equipment.length > 0 ||
    changes.before.cables.length > 0 ||
    changes.after.cables.length > 0;

  // overrides 는 transient — 저장 시 프리뷰에 다시 보내 서버가 재계산.
  const [overrides, setOverrides] = useState<ReportOverrides | undefined>(undefined);

  const preview = useReportPreview();
  const { mutate } = preview;

  // changes / overrides 가 바뀔 때마다 dry-run 재요청.
  // changesKey 로 안정화해 동일 입력의 중복 요청을 막는다.
  const changesKey = useMemo(() => JSON.stringify({ changes, overrides }), [changes, overrides]);
  useEffect(() => {
    if (!hasChanges) return;
    mutate({ floorId: activeFloorId, changes, overrides });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changesKey, hasChanges, activeFloorId, mutate]);

  const report = preview.data as ConstructionReport | undefined;

  // ReportView 는 AuditLog.context.constructionReport 를 읽는다 — 프리뷰 리포트를
  // 감싼 합성 AuditLog 를 만들어 기존 UI 를 그대로 재사용한다.
  const syntheticLog: AuditLog = useMemo(
    () => ({
      id: 'report-preview',
      entityType: 'floor',
      entityId: activeFloorId,
      action: 'preview',
      changedFields: [],
      hasSnapshot: false,
      createdAt: new Date().toISOString(),
      context: report ? { constructionReport: report } : null,
    }),
    [report, activeFloorId],
  );

  return (
    <SidePanel side="right" width={380} title="설계서 (미리보기)" onClose={onClose}>
      <div className="flex-1 overflow-y-auto min-h-0">
        {!hasChanges ? (
          <div className="p-4 text-center text-sm text-content-faint py-12">변경 없음</div>
        ) : preview.isPending && !report ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : preview.isError ? (
          <div className="p-4 text-center text-sm text-danger py-12">
            설계서를 계산하지 못했습니다.
          </div>
        ) : (
          <ReportView
            log={syntheticLog}
            floorId={activeFloorId}
            onSaveOverrides={setOverrides}
            isSaving={preview.isPending}
          />
        )}
      </div>
    </SidePanel>
  );
}
