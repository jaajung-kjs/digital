import { useState, useMemo, useCallback } from 'react';
import { useIsAdmin } from '../../../stores/authStore';
import { useSnapshotStore } from '../stores/snapshotStore';
import {
  useRoomAuditLogs,
  useDeleteAuditLog,
  usePreviewSnapshot,
  useLoadSnapshot,
  usePatchAuditLogContext,
} from '../hooks/useRoomAuditLogs';
import {
  exportReportToCSV,
  actionBadgeColor,
  actionIcon,
  actionLabel,
} from '../../../utils/constructionCalc';
import type {
  ReportOverrides,
  ConstructionReport,
} from '../../../utils/constructionCalc';
import { SURCHARGE_RULES } from '../../../config/constructionTemplates';
import type { AuditLog } from '../../../types/maintenance';

interface ChangeHistoryPanelProps {
  roomId: string;
  onClose: () => void;
}

type ReportTab = 'history' | 'report' | 'preview';

export function ChangeHistoryPanel({ roomId, onClose }: ChangeHistoryPanelProps) {
  const { data: logs, isLoading } = useRoomAuditLogs(roomId);
  const deleteMutation = useDeleteAuditLog(roomId);
  const preview = usePreviewSnapshot(roomId);
  const loadSnapshot = useLoadSnapshot(roomId);
  const patchContext = usePatchAuditLogContext(roomId);
  const isAdmin = useIsAdmin();

  const snapshotActive = useSnapshotStore((s) => s.active);
  const snapshotId = useSnapshotStore((s) => s.snapshotId);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('history');

  const isFetching = preview.isPending;

  const selectedLog = useMemo(
    () => logs?.find((l) => l.id === selectedLogId) ?? null,
    [logs, selectedLogId],
  );

  const handleDelete = async (logId: string) => {
    if (!confirm('이 변경 이력을 삭제하시겠습니까?')) return;
    setDeletingId(logId);
    try {
      await deleteMutation.mutateAsync(logId);
      if (selectedLogId === logId) {
        setSelectedLogId(null);
        setActiveTab('history');
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handlePreview = async (log: AuditLog) => {
    if (isFetching || !log.version) return;
    await preview.enter(log.id, log.actionDetail || '이전 버전', log.version);
  };

  const handleRestore = () => {
    if (!snapshotId) return;
    if (!confirm('이 상태를 편집기에 불러오시겠습니까?\n저장 버튼을 누르기 전까지 실제 반영되지 않습니다.')) return;
    loadSnapshot.restoreFromPreview();
    onClose();
  };

  const handleClose = () => {
    if (snapshotActive) preview.exit();
    onClose();
  };

  const handleSelectLog = (log: AuditLog) => {
    setSelectedLogId(log.id);
    setActiveTab('history');
  };

  const hasReport = (log: AuditLog) => log.hasSnapshot;

  return (
    <div
      className="absolute left-0 top-0 bottom-0 w-[380px] bg-white border-r border-gray-200 shadow-[4px_0_12px_rgba(0,0,0,0.08)] z-20 flex flex-col animate-slide-in-left"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <h3 className="text-sm font-bold text-gray-900">도면 변경 이력</h3>
        <button
          onClick={handleClose}
          className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors"
          title="닫기"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Preview mode banner */}
      {snapshotActive && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 shrink-0">
          <p className="text-xs font-medium text-amber-800 mb-2">과거 도면을 미리보는 중입니다</p>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={handleRestore}
                disabled={loadSnapshot.isPending}
                className="flex-1 px-2 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                이 상태로 복원
              </button>
            )}
            <button
              onClick={preview.exit}
              className="flex-1 px-2 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
            >
              현재 도면으로 돌아가기
            </button>
          </div>
        </div>
      )}

      {/* Tabs when a log is selected */}
      {selectedLogId && (
        <div className="flex border-b border-gray-200 shrink-0">
          <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')}>
            변경 내역
          </TabButton>
          {selectedLog && hasReport(selectedLog) && (
            <>
              <TabButton active={activeTab === 'report'} onClick={() => setActiveTab('report')}>
                설계서
              </TabButton>
              <TabButton active={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>
                도면 보기
              </TabButton>
            </>
          )}
          <button
            onClick={() => { setSelectedLogId(null); setActiveTab('history'); }}
            className="ml-auto px-2 text-xs text-gray-400 hover:text-gray-600"
            title="목록으로"
          >
            목록
          </button>
        </div>
      )}

      {!snapshotActive && !selectedLogId && (
        <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/50 shrink-0">
          <p className="text-xs text-gray-500">도면 변경 항목을 클릭하면 해당 시점의 도면을 미리 볼 수 있습니다.</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : !logs || logs.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400 py-12">
            변경 이력이 없습니다.
          </div>
        ) : selectedLogId && selectedLog ? (
          activeTab === 'history' ? (
            <DiffView log={selectedLog} allLogs={logs} />
          ) : activeTab === 'report' ? (
            <ReportView
              log={selectedLog}
              allLogs={logs}
              roomId={roomId}
              onSaveOverrides={(overrides) => {
                const ctx = (selectedLog as AuditLog & { context?: Record<string, unknown> }).context ?? {};
                patchContext.mutate({
                  logId: selectedLog.id,
                  context: { ...ctx, reportOverrides: overrides },
                });
              }}
              isSaving={patchContext.isPending}
            />
          ) : (
            <div className="p-4">
              <button
                onClick={() => handlePreview(selectedLog)}
                disabled={isFetching || !selectedLog.version}
                className="w-full px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {isFetching ? '로딩 중...' : '도면 미리보기'}
              </button>
            </div>
          )
        ) : (
          <LogList
            logs={logs}
            snapshotActive={snapshotActive}
            snapshotId={snapshotId}
            isFetching={isFetching}
            isAdmin={isAdmin}
            deletingId={deletingId}
            onSelect={handleSelectLog}
            onPreview={handlePreview}
            onDelete={handleDelete}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

interface LogListProps {
  logs: AuditLog[];
  snapshotActive: boolean;
  snapshotId: string | null;
  isFetching: boolean;
  isAdmin: boolean;
  deletingId: string | null;
  onSelect: (log: AuditLog) => void;
  onPreview: (log: AuditLog) => void;
  onDelete: (logId: string) => void;
}

function LogList({
  logs, snapshotActive, snapshotId, isFetching,
  isAdmin, deletingId, onSelect, onPreview, onDelete,
}: LogListProps) {
  return (
    <div className="p-3 space-y-2">
      {logs.map((log) => {
        const isActive = snapshotActive && snapshotId === log.id;
        const canPreview = log.hasSnapshot;
        return (
          <div
            key={log.id}
            onClick={() => onSelect(log)}
            className={`p-3 rounded-lg border group transition-colors cursor-pointer ${
              isActive
                ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300'
                : canPreview
                  ? isFetching
                    ? 'border-blue-300 bg-blue-50 cursor-wait'
                    : 'border-gray-100 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
                  : 'border-gray-100 bg-gray-50/60 hover:border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 min-w-0">
                {isActive && (
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                )}
                <span className="text-sm font-semibold text-gray-900">
                  {log.actionDetail}
                </span>
                {canPreview && (
                  <span className="text-xs text-gray-400" title="설계서 보기 가능">
                    📋
                  </span>
                )}
                {isFetching && isActive && (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canPreview && log.version && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPreview(log); }}
                    className="p-0.5 text-gray-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="도면 미리보기"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(log.id); }}
                    disabled={deletingId === log.id}
                    className="p-0.5 text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                    title="이력 삭제"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(log.createdAt).toLocaleString('ko-KR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {log.userName && ` · ${log.userName}`}
            </p>

            {log.changedFields.length > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                {log.changedFields.join(', ')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// DiffView — show change details for a log entry
// ============================================================

function DiffView({ log }: { log: AuditLog; allLogs: AuditLog[] | undefined }) {
  // Read pre-computed report from context (stored at save time)
  const report = useMemo(() => {
    const ctx = log.context as Record<string, unknown> | null | undefined;
    return (ctx?.constructionReport as ConstructionReport | undefined) ?? null;
  }, [log]);

  return (
    <div className="p-4 space-y-3">
      <div className="mb-2">
        <h4 className="text-sm font-bold text-gray-900">{log.actionDetail}</h4>
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(log.createdAt).toLocaleString('ko-KR')}
          {log.userName && ` · ${log.userName}`}
        </p>
      </div>

      {log.changedFields.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">변경 항목</p>
          <div className="flex flex-wrap gap-1">
            {log.changedFields.map((f) => (
              <span key={f} className="inline-block px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {report && report.diff.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-600 mb-1">변경 상세</p>
          <div className="space-y-1">
            {report.diff.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-xs">
                <span className={`px-1.5 py-0.5 rounded font-mono ${actionBadgeColor(d.action)}`}>
                  {actionIcon(d.action)}
                </span>
                <span className="text-gray-700 truncate">
                  {d.name}{d.specification ? ` ${d.specification}` : ''}
                </span>
                {d.length != null && (
                  <span className="text-gray-400 shrink-0">{d.length}m</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!report || report.diff.length === 0) && log.changedFields.length === 0 && (
        <p className="text-xs text-gray-400">상세 변경 내역이 없습니다.</p>
      )}
    </div>
  );
}

// ============================================================
// ReportView — editable construction report (설계서)
// ============================================================

interface ReportViewProps {
  log: AuditLog;
  allLogs: AuditLog[] | undefined;
  roomId: string;
  onSaveOverrides: (overrides: ReportOverrides) => void;
  isSaving: boolean;
}

function ReportView({ log, allLogs: _allLogs, roomId: _roomId, onSaveOverrides, isSaving }: ReportViewProps) {
  const ctx = log.context as Record<string, unknown> | null | undefined;
  const baseReport = (ctx?.constructionReport as ConstructionReport | undefined) ?? null;
  const savedOverrides = (ctx?.reportOverrides as ReportOverrides) ?? null;

  const [editMode, setEditMode] = useState(false);
  const [surcharges, setSurcharges] = useState<string[]>(savedOverrides?.surcharges ?? []);
  const [bomEdits, setBomEdits] = useState<Record<string, number>>({});
  const [laborEdits, setLaborEdits] = useState<Record<string, number>>({});

  const overrides = useMemo((): ReportOverrides => ({
    modifiedItems: [
      ...Object.entries(bomEdits).map(([k, v]) => ({ itemId: k, quantity: v })),
      ...Object.entries(laborEdits).map(([k, v]) => ({ itemId: k, quantity: v })),
    ],
    addedItems: savedOverrides?.addedItems ?? [],
    removedItemIds: savedOverrides?.removedItemIds ?? [],
    surcharges,
  }), [bomEdits, laborEdits, surcharges, savedOverrides]);

  // Apply overrides on top of the pre-computed base report
  const report: ConstructionReport | null = useMemo(() => {
    if (!baseReport) return null;

    // If no overrides are active, return the base report as-is
    const hasOverrides = overrides.modifiedItems.length > 0
      || overrides.addedItems.length > 0
      || overrides.removedItemIds.length > 0
      || overrides.surcharges.length > 0;

    if (!hasOverrides) return baseReport;

    // Apply overrides to a copy of the base report
    let bom = [...baseReport.bom.map(b => ({ ...b }))];
    let labor = [...baseReport.labor.map(l => ({ ...l }))];

    // Remove items
    if (overrides.removedItemIds.length > 0) {
      const removed = new Set(overrides.removedItemIds);
      bom = bom.filter((b) => !removed.has(b.materialCategoryCode));
    }

    // Modify quantities
    for (const mod of overrides.modifiedItems) {
      const bomItem = bom.find((b) => b.materialCategoryCode === mod.itemId);
      if (bomItem) bomItem.quantity = mod.quantity;
      const laborItem = labor.find((l) => l.workName === mod.itemId);
      if (laborItem) laborItem.hours = mod.quantity;
    }

    // Add manual items
    for (const added of overrides.addedItems) {
      bom.push({
        materialCategoryCode: added.materialCategoryCode ?? 'MANUAL',
        name: added.description,
        quantity: added.quantity,
        unit: added.unit,
        isAccessory: false,
        isManual: true,
      });
      if (added.laborHours) {
        labor.push({ workName: added.description, laborType: '통신내선공', hours: added.laborHours });
      }
    }

    // Apply surcharges
    if (overrides.surcharges.length > 0) {
      let multiplier = 1;
      for (const code of overrides.surcharges) {
        const rule = SURCHARGE_RULES.find((r) => r.code === code);
        if (rule) multiplier *= rule.multiplier;
      }
      for (const l of labor) { l.hours *= multiplier; }
    }

    // Round
    for (const b of bom) { b.quantity = Math.ceil(b.quantity * 100) / 100; }
    for (const l of labor) { l.hours = Math.round(l.hours * 100) / 100; }

    const totalLaborHours = Math.round(labor.reduce((sum, l) => sum + l.hours, 0) * 100) / 100;

    return { diff: baseReport.diff, bom, labor, totalLaborHours };
  }, [baseReport, overrides]);

  const handleSave = useCallback(() => {
    onSaveOverrides(overrides);
  }, [overrides, onSaveOverrides]);

  if (!baseReport) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 py-12">
        이 버전의 설계서가 없습니다.
      </div>
    );
  }

  if (!report || report.diff.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-gray-400 py-12">
        변경 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* BOM Section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-gray-900">자재 수량</h4>
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {editMode ? '완료' : '편집'}
          </button>
        </div>
        {report.bom.filter((b) => !b.isAccessory).length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-1 font-medium">분류</th>
                <th className="text-left py-1 font-medium">규격</th>
                <th className="text-left py-1 font-medium w-12">구분</th>
                <th className="text-right py-1 font-medium w-14">수량</th>
                <th className="text-left py-1 font-medium w-8">단위</th>
              </tr>
            </thead>
            <tbody>
              {report.bom.filter((b) => !b.isAccessory).map((b) => (
                <tr key={b.materialCategoryCode + (b.action ?? '') + b.name} className="border-b border-gray-50">
                  <td className="py-1 text-gray-700">{b.name}</td>
                  <td className="py-1 text-gray-500">{b.specification || '-'}</td>
                  <td className="py-1"><span className={`px-1 py-0.5 rounded text-[10px] ${b.action ? actionBadgeColor(b.action) : ''}`}>{b.action ? actionLabel(b.action) : ''}</span></td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        className="w-14 text-right border rounded px-1 py-0.5"
                        defaultValue={b.quantity}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          setBomEdits((prev) => ({ ...prev, [b.materialCategoryCode]: parseFloat(e.target.value) || 0 }))
                        }
                      />
                    ) : (
                      b.quantity
                    )}
                  </td>
                  <td className="py-1 text-gray-400">{b.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-gray-400">자재 변경 없음</p>
        )}
      </section>

      {/* Accessories Section */}
      {report.bom.filter((b) => b.isAccessory).length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-gray-900 mb-2">부속자재 (자동)</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-1 font-medium">분류</th>
                <th className="text-right py-1 font-medium w-16">수량</th>
                <th className="text-left py-1 font-medium w-10">단위</th>
              </tr>
            </thead>
            <tbody>
              {report.bom.filter((b) => b.isAccessory).map((b) => (
                <tr key={b.materialCategoryCode} className="border-b border-gray-50">
                  <td className="py-1 text-gray-700">{b.name}</td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        className="w-14 text-right border rounded px-1 py-0.5"
                        defaultValue={b.quantity}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          setBomEdits((prev) => ({ ...prev, [b.materialCategoryCode]: parseFloat(e.target.value) || 0 }))
                        }
                      />
                    ) : (
                      b.quantity
                    )}
                  </td>
                  <td className="py-1 text-gray-400">{b.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Labor Section */}
      {report.labor.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-gray-900 mb-2">노무량</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b">
                <th className="text-left py-1 font-medium">공종</th>
                <th className="text-left py-1 font-medium w-16">직종</th>
                <th className="text-right py-1 font-medium w-14">공수(인)</th>
              </tr>
            </thead>
            <tbody>
              {report.labor.map((l) => (
                <tr key={l.workName} className="border-b border-gray-50">
                  <td className="py-1 text-gray-700">{l.workName}</td>
                  <td className="py-1 text-gray-500">{l.laborType}</td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <input
                        type="number"
                        className="w-12 text-right border rounded px-1 py-0.5"
                        defaultValue={l.hours}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          setLaborEdits((prev) => ({ ...prev, [l.workName]: parseFloat(e.target.value) || 0 }))
                        }
                      />
                    ) : (
                      l.hours
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Surcharges */}
      <section>
        <h4 className="text-xs font-bold text-gray-900 mb-2">할증</h4>
        <div className="space-y-1">
          {SURCHARGE_RULES.map((rule) => (
            <label key={rule.code} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={surcharges.includes(rule.code)}
                onChange={(e) => {
                  setSurcharges((prev) =>
                    e.target.checked
                      ? [...prev, rule.code]
                      : prev.filter((c) => c !== rule.code),
                  );
                }}
                className="rounded border-gray-300"
              />
              <span className="text-gray-700">{rule.name}</span>
              <span className="text-gray-400">x{rule.multiplier}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Total */}
      <section className="border-t pt-2">
        <div className="flex justify-between text-sm font-bold">
          <span>총 노무</span>
          <span>{report.totalLaborHours} 인</span>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
        <button
          onClick={() => exportReportToCSV(report)}
          className="flex-1 px-3 py-1.5 text-xs font-medium bg-white text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
        >
          CSV 다운로드
        </button>
      </div>
    </div>
  );
}
