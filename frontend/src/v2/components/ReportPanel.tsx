import { useMemo, useState } from 'react';
import { computeEstimate, computeReport, materialCostOf } from '@twin/core';
import type { ReportItem, ReportKind } from '@twin/core';
import { Badge, Button, Input, Select, Modal, EMPTY, cn, Td, Th, TableCard, TABLE_ROW } from '../../components/ui';
import type { BadgeStatus } from '../../components/ui';
import { buildReportItems, estimateInput } from '../reportSelectors';
import { useV2WorkingCopy } from '../store/workingCopyStore';
import { useV2Catalog, useWageCatalog } from '../hooks';

/**
 * 두 칸이 각자 구르는 높이 — 상자는 내용만큼만 크고(최대 85vh) 이 높이에서 멈춘다.
 *
 * 상자를 늘 85vh 로 세우면 세 줄짜리 산출에도 빈 판이 절반이다. 칸에 한도를 두면 짧으면
 * 짧은 대로 앉고, 길어지면 **그 칸만** 구른다 — 항목이 백 줄이어도 금액은 제자리에 있다.
 *
 * 8.75rem 은 상자에서 칸이 못 쓰는 자리다 — 머리줄(49) + 본문 여백(32) + 단추줄(57).
 */
const COLUMN_H = 'max-h-[calc(85vh-8.75rem)]';

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

/**
 * 한 줄 — **무엇을 몇 개, 얼마에, 몇 품에**.
 *
 * 자재비 칸이 없던 동안 왼쪽은 공량만 세고 금액은 오른쪽 합계에만 있었다. 그래서 「이 설비가
 * 얼마인가」를 물으면 답할 데가 없었고, 재료비 합계가 맞는지도 따라갈 수 없었다.
 *
 * 사는 것이 없는 줄(철거·이설)은 단가가 적혀 있어도 비워 둔다 — 판정은 `materialCostOf` 하나다.
 */
/**
 * 산출 내역 여덟 열의 폭(%) — 합 100.
 *
 * 값이 한 줄에 들어갈 만큼씩 준다: 구분은 가장 긴 배지(「철거(케이블)」 77px), 단가는 가장
 * 큰 금액(「18,000,000원」), 공량은 「0.250」. 이름·타입·노무는 넘치면 말줄임이다 —
 * 잘려도 되는 것은 글이고, 잘리면 안 되는 것은 수다.
 */
const REPORT_COL_W = [13, 19, 15, 7, 16, 13, 8, 9] as const;

function ReportRow({ item, laborName }: { item: ReportItem; laborName: (code: string | null) => string | null }) {
  const material = materialCostOf(item);
  const buys = item.kind === 'asset-install' || item.kind === 'cable-install';
  return (
    /* 줄 높이는 **표가 정한다**(`TABLE_ROW`, 28px) — 예전에는 이 표만 `<tr>` 을 손으로
       짜고 칸마다 `py-1.5` 를 얹어 같은 앱의 다른 표보다 줄이 두꺼웠다(§1.5). */
    <tr className={TABLE_ROW}>
      <Td>
        <Badge status={KIND_STATUS[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
      </Td>
      {/* 이름은 **잘린다**(줄바꿈하지 않는다) — 「UPS #1」이 UPS/#1 두 줄로 쪼개지면
          줄 높이가 그 줄만 두 배가 된다(§1.7-g). */}
      <Td className="truncate text-content">
        {item.name}
        {item.note && <span className="ml-1.5 text-xs text-warning">{item.note}</span>}
      </Td>
      <Td className="truncate text-content-muted">{item.typeName}</Td>
      <Td align="right" className="text-content">
        {item.qty}{item.unit}
      </Td>
      {/* 단가는 **적혀 있으면 늘 보인다** — 철거 줄에서도, 그것이 그 물건의 값이다. */}
      <Td align="right" className="text-content-muted">
        {item.unitPrice == null ? EMPTY : won(item.unitPrice)}
      </Td>
      <Td align="right" className="text-content">{buys ? won(material) : EMPTY}</Td>
      {/* 산출 내역에 서는 것은 **직종 이름**이다 — 저장된 것은 코드이고, 이름은 적용 중인
          노임단가 판에서 읽는다(판을 갈면 이름도 따라 바뀐다). */}
      <Td className="truncate text-content-muted">{laborName(item.laborCode) ?? EMPTY}</Td>
      <Td align="right" className="text-content">{item.manDays.toFixed(3)}</Td>
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

  const empty = report.items.length === 0;

  return (
    /**
     * **한눈에 보는 상자다** — 무엇을 얼마나 세었고 그래서 얼마인가가 같은 화면에 선다.
     *
     * 예전에는 좁은 상자에 표·공량 합계·금액을 위에서 아래로 쌓았다. 그래서 「총 공사비」를
     * 보려면 항목 스무 줄을 지나 굴러야 했고, 금액을 보는 동안 그 금액이 무엇에서 나왔는지는
     * 화면 밖이었다. 항목은 길고(변경 수만큼) 금액은 길이가 정해져 있으니 **옆으로 나눈다** —
     * 구르는 것은 항목뿐이고 요약은 늘 제자리에 있다.
     *
     * 산출할 것이 없으면 높이를 채우지 않는다 — 한 줄짜리 말에 85vh 짜리 빈 판은 어색하다.
     */
    <Modal
      open={open}
      onClose={onClose}
      title="산출 내역 — 공량 미리보기"
      footer={footer}
      size={empty ? 'md' : '2xl'}
    >
      {empty ? (
        <p className="text-sm text-content-muted">산출할 변경이 없습니다.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* 항목 — 길면 여기만 구른다. 머리줄은 붙어 있어 무슨 열인지 잃지 않는다. */}
          <div className={cn(COLUMN_H, 'overflow-auto')}>
            {/* 머리글도 **앱의 것**을 쓴다(`Th`) — 예전에는 여덟 칸을 손으로 짜서 다른 표와
                글자 굵기·여백이 달랐다. 열 폭은 `TableCard` 가 정한다(합 100). */}
            <TableCard widths={REPORT_COL_W}>
              <thead>
                <tr className="sticky top-0 z-sticky border-b border-line">
                  <Th>구분</Th>
                  <Th>이름</Th>
                  <Th>타입/그룹</Th>
                  <Th align="right">수량</Th>
                  <Th align="right">단가</Th>
                  <Th align="right">자재비</Th>
                  <Th>노무</Th>
                  {/* 단위는 머리글 **아래**에 — 「공량(인)」 한 덩어리는 값보다 넓어 칸을 넘겼다. */}
                  <Th align="right" unit="인">공량</Th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((item, i) => (
                  <ReportRow key={`${item.kind}-${item.name}-${i}`} item={item} laborName={laborName} />
                ))}
              </tbody>
            </TableCard>
          </div>

          {/* 요약 — 공량 합계와 금액. 좁은 화면에서는 표 아래로 내려온다. */}
          <div className={cn(COLUMN_H, 'flex flex-col overflow-auto border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0')}>
            <div>
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
              {/* 공량의 결론도 늘 보인다 — 위로 붙어 남는다(금액의 결론은 아래로 붙는다). */}
              <div className="sticky top-0 flex justify-between border-t border-line bg-surface pb-0.5 pt-1.5 text-sm font-semibold text-content">
                <span>총 공량</span>
                <span className="tabular-nums">{report.totalManDays.toFixed(3)}인</span>
              </div>
            </div>

            <EstimateSection items={report.items} />
          </div>
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
 * 적용 중인 제비율 판이 준다 — 그래서 「기준정보」가 없으면 여기서 멈추고 그렇게 말한다.
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
        금액을 내려면 「설비관리대장 → 기준정보」에서 제비율을 먼저 올리세요.
      </div>
    );
  }

  const est = computeEstimate(input, overhead, {
    days: Number(days) || 0,
    contract,
    sanjaeBasis: '한전',
  });

  /* 금액은 **절대 잘리지 않는다** — 좁아지면 근거(요율)가 먼저 줄어든다. */
  const Row = ({ label, value, note }: { label: string; value: number; note?: string }) => (
    <div className="flex items-baseline justify-between gap-2 py-0.5">
      <span className="min-w-0 truncate text-sm text-content">
        {label}
        {note && <span className="ml-1.5 text-xs text-content-faint">{note}</span>}
      </span>
      <span className="shrink-0 text-sm text-content tabular-nums">{won(value)}</span>
    </div>
  );

  return (
    <div className="border-t border-line pt-3">
      {/* 좁은 칸에서는 이름줄과 손잡이줄이 두 줄로 앉는다 — 한 줄에 우겨 넣으면 칸이 찌그러진다. */}
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
      {/* 결론은 **늘 보인다** — 칸이 구르더라도 맨 아래에 붙어 남는다. */}
      <div className="sticky bottom-0 mt-1 flex items-baseline justify-between border-t border-line bg-surface pt-1.5">
        <span className="text-sm font-semibold text-content">총 공사비</span>
        <span className="text-sm font-semibold text-content tabular-nums">{won(est.total)}</span>
      </div>
    </div>
  );
}
