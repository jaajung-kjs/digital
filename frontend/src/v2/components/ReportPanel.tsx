import { useMemo } from 'react';
import { computeReport } from '@twin/core';
import type { ReportItem, ReportKind } from '@twin/core';
import { Badge, Button, Modal } from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import { buildReportItems } from '../reportSelectors';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useV2Catalog, useWageCatalog } from '../hooks';

// kind → 구분 라벨
const KIND_LABEL: Record<ReportKind, string> = {
  'asset-install': '신설',
  'asset-remove': '철거',
  'asset-relocate': '이설',
  'cable-install': '신설(케이블)',
  'cable-remove': '철거(케이블)',
};

// kind → Badge status
const KIND_STATUS: Record<ReportKind, BadgeStatus> = {
  'asset-install': 'success',
  'asset-remove': 'danger',
  'asset-relocate': 'info',
  'cable-install': 'success',
  'cable-remove': 'danger',
};

interface ReportPanelProps {
  open: boolean;
  onClose: () => void;
}

function ReportRow({ item, laborName }: { item: ReportItem; laborName: (code: string | null) => string | null }) {
  return (
    <tr className="border-b border-line last:border-0">
      <td className="py-1.5 pr-3 align-middle">
        <Badge status={KIND_STATUS[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
      </td>
      <td className="py-1.5 pr-3 align-middle">
        <span className="text-sm text-content">{item.name}</span>
        {item.note && (
          <span className="ml-1.5 text-xs text-warning">{item.note}</span>
        )}
      </td>
      <td className="py-1.5 pr-3 align-middle text-sm text-content-muted">{item.typeName}</td>
      <td className="py-1.5 pr-3 align-middle text-sm text-content tabular-nums">
        {item.qty}{item.unit}
      </td>
      {/* 설계서에 서는 것은 **직종 이름**이다 — 저장된 것은 코드이고, 이름은 적용 중인
          노임단가 판에서 읽는다(판을 갈면 이름도 따라 바뀐다). */}
      <td className="py-1.5 pr-3 align-middle text-sm text-content-muted">
        {laborName(item.laborCode) ?? '—'}
      </td>
      <td className="py-1.5 align-middle text-sm text-content tabular-nums text-right">
        {item.hours.toFixed(2)}h
      </td>
    </tr>
  );
}

export function ReportPanel({ open, onClose }: ReportPanelProps) {
  /* 직종 이름은 적용 중인 노임단가 판에서 읽는다 — 저장된 것은 코드다. */
  const { nameOf: laborName } = useWageCatalog();
  const saved = useV2WorkingCopy((s) => s.saved);
  const overlays = useV2WorkingCopy((s) => s.overlays);
  const catalog = useV2Catalog();

  const report = useMemo(() => {
    const types = catalog.data?.types ?? [];
    const assemblies = catalog.data?.assemblies ?? [];
    const cableGroups = catalog.data?.cableGroups ?? [];
    const items = buildReportItems({ saved, overlays, types, assemblies, cableGroups });
    return computeReport(items);
  }, [saved, overlays, catalog.data]);

  const footer = (
    <Button variant="secondary" size="sm" onClick={onClose}>
      닫기
    </Button>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설계서 — 공량 미리보기"
      footer={footer}
      className="max-w-2xl"
    >
      {report.items.length === 0 ? (
        <p className="text-sm text-content-muted">산출할 변경이 없습니다.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* 항목 테이블 */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-1.5 pr-3 text-xs text-content-muted font-medium">구분</th>
                  <th className="pb-1.5 pr-3 text-xs text-content-muted font-medium">이름</th>
                  <th className="pb-1.5 pr-3 text-xs text-content-muted font-medium">타입/그룹</th>
                  <th className="pb-1.5 pr-3 text-xs text-content-muted font-medium">수량</th>
                  <th className="pb-1.5 pr-3 text-xs text-content-muted font-medium">노무</th>
                  <th className="pb-1.5 text-xs text-content-muted font-medium text-right">공량(h)</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item, i) => (
                  <ReportRow key={`${item.kind}-${item.name}-${i}`} item={item} laborName={laborName} />
                ))}
              </tbody>
            </table>
          </div>

          {/* 하단 합계 */}
          <div className="border-t border-line pt-3">
            {report.byLaborType.length > 0 && (
              <div className="mb-2 flex flex-col gap-0.5">
                {report.byLaborType.map(({ laborCode, totalHours }) => (
                  <div key={laborCode} className="flex justify-between text-xs text-content-muted">
                    <span>{laborName(laborCode) ?? laborCode}</span>
                    <span className="tabular-nums">{totalHours.toFixed(2)}h</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold text-content">
              <span>총합</span>
              <span className="tabular-nums">{report.totalHours.toFixed(2)}h</span>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
