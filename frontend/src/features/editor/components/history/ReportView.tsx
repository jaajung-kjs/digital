import { useState, useMemo, useCallback, useEffect } from 'react';
import { Button, Input } from '../../../../components/ui';
import {
  exportReportToCSV,
  actionBadgeColor,
  actionLabel,
} from '../../../../utils/constructionCalc';
import type {
  ReportOverrides,
  ConstructionReport,
} from '../../../../utils/constructionCalc';
import { SURCHARGE_RULES } from '../../../../config/constructionTemplates';
import type { AuditLog } from '../../../../types/maintenance';

// ============================================================
// ReportView — editable construction report (설계서)
// ============================================================

interface ReportViewProps {
  log: AuditLog;
  allLogs?: AuditLog[] | undefined;
  floorId: string;
  onSaveOverrides: (overrides: ReportOverrides) => void;
  isSaving: boolean;
}

export function ReportView({ log, allLogs: _allLogs, floorId: _roomId, onSaveOverrides, isSaving }: ReportViewProps) {
  const ctx = log.context as Record<string, unknown> | null | undefined;
  const baseReport = (ctx?.constructionReport as ConstructionReport | undefined) ?? null;
  const savedOverrides = (ctx?.reportOverrides as ReportOverrides) ?? null;

  const [editMode, setEditMode] = useState(false);
  const [surcharges, setSurcharges] = useState<string[]>(savedOverrides?.surcharges ?? []);
  const [addedItems, setAddedItems] = useState<ReportOverrides['addedItems']>(savedOverrides?.addedItems ?? []);
  const [removedItemIds, setRemovedItemIds] = useState<string[]>(savedOverrides?.removedItemIds ?? []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ description: '', quantity: 1, unit: '개', laborHours: 0 });

  // C3+C4: Initialize bomEdits/laborEdits from savedOverrides.modifiedItems
  const [bomEdits, setBomEdits] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (savedOverrides?.modifiedItems) {
      for (const m of savedOverrides.modifiedItems) {
        // We store all modified items; will be matched against bom/labor later
        init[m.itemId] = m.quantity;
      }
    }
    return init;
  });
  const [laborEdits, setLaborEdits] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    if (savedOverrides?.modifiedItems) {
      for (const m of savedOverrides.modifiedItems) {
        init[m.itemId] = m.quantity;
      }
    }
    return init;
  });

  const overrides = useMemo((): ReportOverrides => {
    // Merge bomEdits and laborEdits, deduplicating by itemId
    const modMap = new Map<string, number>();
    for (const [k, v] of Object.entries(bomEdits)) modMap.set(k, v);
    for (const [k, v] of Object.entries(laborEdits)) modMap.set(k, v);
    return {
      modifiedItems: [...modMap.entries()].map(([k, v]) => ({ itemId: k, quantity: v })),
      addedItems,
      removedItemIds,
      surcharges,
    };
  }, [bomEdits, laborEdits, surcharges, addedItems, removedItemIds]);

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
      bom = bom.filter((b) => !removed.has(b.key));
    }

    // Modify quantities
    for (const mod of overrides.modifiedItems) {
      const bomItem = bom.find((b) => b.key === mod.itemId);
      if (bomItem) bomItem.quantity = mod.quantity;
      const laborItem = labor.find((l) => l.workName === mod.itemId);
      if (laborItem) laborItem.hours = mod.quantity;
    }

    // Add manual items
    for (const added of overrides.addedItems) {
      bom.push({
        key: 'MANUAL',
        name: added.description,
        quantity: added.quantity,
        unit: added.unit,
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

  // Track previous isSaving to detect save completion
  const [wasSaving, setWasSaving] = useState(false);
  useEffect(() => {
    if (wasSaving && !isSaving) {
      // Save completed — reset edits
      setBomEdits({});
      setLaborEdits({});
      setEditMode(false);
    }
    setWasSaving(isSaving);
  }, [isSaving, wasSaving]);

  const handleSave = useCallback(() => {
    onSaveOverrides(overrides);
  }, [overrides, onSaveOverrides]);

  const handleAddItem = () => {
    if (!newItem.description.trim()) return;
    setAddedItems((prev) => [...prev, { ...newItem }]);
    setNewItem({ description: '', quantity: 1, unit: '개', laborHours: 0 });
    setShowAddForm(false);
  };

  const handleRemoveItem = (key: string) => {
    setRemovedItemIds((prev) => [...prev, key]);
  };

  if (!baseReport) {
    return (
      <div className="p-4 text-center text-sm text-content-faint py-12">
        이 버전의 설계서가 없습니다.
      </div>
    );
  }

  if (!report || report.diff.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-content-faint py-12">
        변경 내역이 없습니다.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* BOM Section */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-content">자재 수량</h4>
          <button
            onClick={() => setEditMode(!editMode)}
            className="text-xs text-primary hover:underline"
          >
            {editMode ? '완료' : '편집'}
          </button>
        </div>
        {report.bom.filter((b) => !b.isManual).length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-content-muted border-b border-line">
                <th className="text-left py-1 font-medium">분류</th>
                <th className="text-left py-1 font-medium w-12">구분</th>
                <th className="text-right py-1 font-medium w-14">수량</th>
                <th className="text-left py-1 font-medium w-8">단위</th>
                {editMode && <th className="w-6" />}
              </tr>
            </thead>
            <tbody>
              {report.bom.filter((b) => !b.isManual).map((b) => (
                <tr key={b.key} className="border-b border-line/50">
                  <td className="py-1 text-content">{b.name}</td>
                  <td className="py-1"><span className={`px-1 py-0.5 rounded text-xs ${b.action ? actionBadgeColor(b.action) : ''}`}>{b.action ? actionLabel(b.action) : ''}</span></td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <Input
                        type="number"
                        className="w-14 text-right px-1 py-0.5"
                        value={bomEdits[b.key] ?? b.quantity}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          setBomEdits((prev) => ({ ...prev, [b.key]: parseFloat(e.target.value) || 0 }))
                        }
                      />
                    ) : (
                      b.quantity
                    )}
                  </td>
                  <td className="py-1 text-content-faint">{b.unit}</td>
                  {editMode && (
                    <td className="py-1 text-center">
                      <button
                        onClick={() => handleRemoveItem(b.key)}
                        className="text-danger hover:opacity-70 text-xs"
                        title="삭제"
                      >&times;</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-content-faint">자재 변경 없음</p>
        )}
      </section>

      {/* Manual items Section */}
      {report.bom.filter((b) => b.isManual).length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-content mb-2">수동 추가</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-content-muted border-b border-line">
                <th className="text-left py-1 font-medium">항목명</th>
                <th className="text-right py-1 font-medium w-16">수량</th>
                <th className="text-left py-1 font-medium w-10">단위</th>
              </tr>
            </thead>
            <tbody>
              {report.bom.filter((b) => b.isManual).map((b, i) => (
                <tr key={b.key + i} className="border-b border-line/50">
                  <td className="py-1 text-content">{b.name}</td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <Input
                        type="number"
                        className="w-14 text-right px-1 py-0.5"
                        value={bomEdits[b.key + i] ?? b.quantity}
                        min={0}
                        step={0.01}
                        onChange={(e) =>
                          setBomEdits((prev) => ({ ...prev, [b.key + i]: parseFloat(e.target.value) || 0 }))
                        }
                      />
                    ) : (
                      b.quantity
                    )}
                  </td>
                  <td className="py-1 text-content-faint">{b.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Labor Section */}
      {report.labor.length > 0 && (
        <section>
          <h4 className="text-xs font-bold text-content mb-2">노무량</h4>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-content-muted border-b border-line">
                <th className="text-left py-1 font-medium">공종</th>
                <th className="text-left py-1 font-medium w-16">직종</th>
                <th className="text-right py-1 font-medium w-14">공수(인)</th>
              </tr>
            </thead>
            <tbody>
              {report.labor.map((l) => (
                <tr key={l.workName} className="border-b border-line/50">
                  <td className="py-1 text-content">{l.workName}</td>
                  <td className="py-1 text-content-muted">{l.laborType}</td>
                  <td className="py-1 text-right">
                    {editMode ? (
                      <Input
                        type="number"
                        className="w-12 text-right px-1 py-0.5"
                        value={laborEdits[l.workName] ?? l.hours}
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
        <h4 className="text-xs font-bold text-content mb-2">할증</h4>
        <div className="space-y-1">
          {SURCHARGE_RULES.map((rule) => (
            <label key={rule.code} className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={surcharges.includes(rule.code)}
                disabled={!editMode}
                onChange={(e) => {
                  setSurcharges((prev) =>
                    e.target.checked
                      ? [...prev, rule.code]
                      : prev.filter((c) => c !== rule.code),
                  );
                }}
                className="rounded border-line disabled:opacity-50"
              />
              <span className={editMode ? 'text-content' : 'text-content-faint'}>{rule.name}</span>
              <span className="text-content-faint">x{rule.multiplier}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Add item (I26) */}
      {editMode && (
        <section>
          {showAddForm ? (
            <div className="space-y-2 p-2 bg-surface-2 rounded border border-line">
              <Input
                type="text"
                placeholder="항목명"
                value={newItem.description}
                onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                className="text-xs px-2 py-1"
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  placeholder="수량"
                  value={newItem.quantity}
                  min={0}
                  step={0.01}
                  onChange={(e) => setNewItem((p) => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                  className="w-16 text-xs px-2 py-1"
                />
                <Input
                  type="text"
                  placeholder="단위"
                  value={newItem.unit}
                  onChange={(e) => setNewItem((p) => ({ ...p, unit: e.target.value }))}
                  className="w-12 text-xs px-2 py-1"
                />
                <Input
                  type="number"
                  placeholder="공수"
                  value={newItem.laborHours}
                  min={0}
                  step={0.01}
                  onChange={(e) => setNewItem((p) => ({ ...p, laborHours: parseFloat(e.target.value) || 0 }))}
                  className="w-16 text-xs px-2 py-1"
                />
              </div>
              <div className="flex gap-1">
                <Button size="sm" className="flex-1 justify-center" onClick={handleAddItem}>추가</Button>
                <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => setShowAddForm(false)}>취소</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full px-2 py-1.5 text-xs text-primary border border-dashed border-primary/40 rounded hover:bg-info-bg"
            >
              + 항목 추가
            </button>
          )}
        </section>
      )}

      {/* Total */}
      <section className="border-t border-line pt-2">
        <div className="flex justify-between text-sm font-bold text-content">
          <span>총 노무</span>
          <span>{report.totalLaborHours} 인</span>
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 justify-center" onClick={handleSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1 justify-center" onClick={() => exportReportToCSV(report)}>
          CSV 다운로드
        </Button>
      </div>
    </div>
  );
}
