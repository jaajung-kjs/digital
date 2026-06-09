import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge, Button, IconButton } from '../../components/ui';
import { useWorkOrders, useWorkOrder } from './useWorkOrders';
import { ReportView } from '../editor/components/history/ReportView';
import type { AuditLog } from '../../types/maintenance';

interface WorkOrderHistoryPanelProps {
  floorId: string;
  onClose: () => void;
}

/**
 * #3 Task 3 — 작업지시서 이력 패널.
 *
 * 커밋 시 아카이브된 과거 작업지시서(설계서) 목록을 보여주고, 항목을 클릭하면
 * 아카이브된 ConstructionReport 를 ReportView(읽기 전용)로 렌더한다. ReportView 는
 * AuditLog.context.constructionReport 를 읽으므로, 상세 응답을 합성 AuditLog 로
 * 감싸 기존 UI 를 그대로 재사용한다. 아카이브는 읽기 전용이므로 onSaveOverrides
 * 는 no-op(편집/저장 흐름 없음).
 */
export function WorkOrderHistoryPanel({ floorId, onClose }: WorkOrderHistoryPanelProps) {
  const { data: list, isLoading } = useWorkOrders(floorId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail, isLoading: detailLoading } = useWorkOrder(floorId, selectedId);

  // ReportView 가 읽는 context shape 으로 합성 — constructionReport + reportOverrides.
  const syntheticLog: AuditLog | null = useMemo(() => {
    if (!detail) return null;
    return {
      id: detail.id,
      entityType: 'floor',
      entityId: floorId,
      action: 'WORK_ORDER',
      changedFields: [],
      hasSnapshot: false,
      createdAt: detail.createdAt,
      userName: detail.userName ?? undefined,
      context: {
        constructionReport: detail.constructionReport,
        ...(detail.reportOverrides ? { reportOverrides: detail.reportOverrides } : {}),
      },
    };
  }, [detail, floorId]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="absolute left-0 top-0 bottom-0 w-[380px] bg-surface border-r border-line shadow-[4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col animate-slide-in-left">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2 shrink-0">
        <h3 className="text-sm font-bold text-content">작업지시서 이력</h3>
        <IconButton aria-label="닫기" title="닫기" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>

      {/* Selected detail toolbar */}
      {selectedId && (
        <div className="flex items-center border-b border-line px-3 py-2 shrink-0">
          <span className="text-xs font-medium text-content">작업지시서</span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-content-faint"
            onClick={() => setSelectedId(null)}
            title="목록으로"
          >
            목록
          </Button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : selectedId ? (
          detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : syntheticLog ? (
            <ReportView
              log={syntheticLog}
              floorId={floorId}
              onSaveOverrides={() => {}}
              isSaving={false}
            />
          ) : (
            <div className="p-4 text-center text-sm text-content-faint py-12">설계서를 불러오지 못했습니다.</div>
          )
        ) : !list || list.length === 0 ? (
          <div className="p-4 text-center text-sm text-content-faint py-12">
            저장된 작업지시서가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {list.map((wo) => (
              <li key={wo.id}>
                <button
                  onClick={() => setSelectedId(wo.id)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-content">{formatDate(wo.createdAt)}</span>
                    {wo.summary?.itemCount != null && (
                      <Badge status="info">{wo.summary.itemCount}건</Badge>
                    )}
                  </div>
                  <div className="text-xs text-content-muted mt-0.5">{wo.userName ?? '알 수 없음'}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
