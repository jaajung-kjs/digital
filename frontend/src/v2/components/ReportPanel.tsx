import { useMemo, useState } from 'react';
import { computeEstimate, computeReport } from '@twin/core';
import type { ReportItem, ReportKind } from '@twin/core';
import { Badge, Button, Input, Select, Modal, EMPTY } from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import { buildReportItems, estimateInput } from '../reportSelectors';
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
      {/* 산출 내역에 서는 것은 **직종 이름**이다 — 저장된 것은 코드이고, 이름은 적용 중인
          노임단가 판에서 읽는다(판을 갈면 이름도 따라 바뀐다). */}
      <td className="py-1.5 pr-3 align-middle text-sm text-content-muted">
        {laborName(item.laborCode) ?? EMPTY}
      </td>
      <td className="py-1.5 align-middle text-sm text-content tabular-nums text-right">
        {item.manDays.toFixed(3)}
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
      title="산출 내역 — 공량 미리보기"
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
                  <th className="pb-1.5 text-xs text-content-muted font-medium text-right">공량(인)</th>
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
                {report.byLaborType.map(({ laborCode, totalManDays }) => (
                  <div key={laborCode} className="flex justify-between text-xs text-content-muted">
                    <span>{laborName(laborCode) ?? laborCode}</span>
                    <span className="tabular-nums">{totalManDays.toFixed(3)}인</span>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold text-content">
              <span>총 공량</span>
              <span className="tabular-nums">{report.totalManDays.toFixed(3)}인</span>
            </div>
          </div>

          <EstimateSection items={report.items} />
        </div>
      )}
    </Modal>
  );
}

const won = (v: number) => `${v.toLocaleString()}원`;
const pct = (v: number) => `${(v * 100).toFixed(3).replace(/\.?0+$/, '')}%`;

/**
 * 금액 — 물량에서 **총공사비**까지.
 *
 * 사람이 넣는 것은 공사기간 한 칸과 계약방법뿐이다. 공사규모는 직접공사비가 정하고, 요율은
 * 적용 중인 제비율 판이 준다 — 그래서 「적산 기준」가 없으면 여기서 멈추고 그렇게 말한다.
 */
function EstimateSection({ items }: { items: ReportItem[] }) {
  const catalog = useV2Catalog();
  const { wageOf } = useWageCatalog();
  const overhead = catalog.data?.overheadStandard ?? null;
  const [days, setDays] = useState('30');
  const [contract, setContract] = useState<'경쟁' | '수의'>('경쟁');

  const input = useMemo(() => estimateInput(items, wageOf), [items, wageOf]);

  if (!overhead) {
    return (
      <div className="border-t border-line pt-3 text-xs text-content-faint">
        금액을 내려면 「설비관리대장 → 적산 기준」에서 제비율을 먼저 올리세요.
      </div>
    );
  }

  const est = computeEstimate(input, overhead, {
    days: Number(days) || 0,
    contract,
    sanjaeBasis: '한전',
  });

  const Row = ({ label, value, note }: { label: string; value: number; note?: string }) => (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-sm text-content">
        {label}
        {note && <span className="ml-1.5 text-xs text-content-faint">{note}</span>}
      </span>
      <span className="text-sm text-content tabular-nums">{won(value)}</span>
    </div>
  );

  return (
    <div className="border-t border-line pt-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-semibold text-content">금액</span>
        <span className="text-xs text-content-faint">
          {est.sizeBand} · 기준 {overhead.effective}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-20">
            <Input
              aria-label="공사기간(일)"
              size="sm"
              type="number"
              value={days}
              onChange={(e) => setDays(e.currentTarget.value)}
            />
          </div>
          <span className="text-xs text-content-muted">일</span>
          <div className="w-24">
            <Select
              aria-label="계약방법"
              size="sm"
              value={contract}
              onChange={(e) => setContract(e.currentTarget.value as '경쟁' | '수의')}
            >
              <option value="경쟁">경쟁</option>
              <option value="수의">수의</option>
            </Select>
          </div>
        </div>
      </div>

      <Row label="재료비" value={est.materialCost} />
      <Row label="직접노무비" value={est.directLaborCost} />
      <Row label="간접노무비" value={est.indirectLaborCost} note={`직접노무비 × ${pct(est.laborCost === est.directLaborCost ? 0 : est.indirectLaborCost / est.directLaborCost)}`} />
      {est.expenses.map((e) => (
        <Row key={e.label} label={e.label} value={e.amount} note={`${e.basis} × ${pct(e.rate)}`} />
      ))}
      <Row label={est.overheadAdmin.label} value={est.overheadAdmin.amount} note={`${est.overheadAdmin.basis} × ${pct(est.overheadAdmin.rate)}`} />
      <Row label={est.profit.label} value={est.profit.amount} note={`${est.profit.basis} × ${pct(est.profit.rate)}`} />
      <Row label="부가세" value={est.vat} note="합계 × 10%" />
      <div className="mt-1 flex items-baseline justify-between border-t border-line pt-1.5">
        <span className="text-sm font-semibold text-content">총 공사비</span>
        <span className="text-sm font-semibold text-content tabular-nums">{won(est.total)}</span>
      </div>
    </div>
  );
}
