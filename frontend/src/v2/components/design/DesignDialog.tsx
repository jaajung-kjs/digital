import { useMemo, useState, type ReactNode } from 'react';
import { computeEstimate, computeReport, designItems, materialCostOf, sizeBand } from '@twin/core';
import type { DesignItem, DesignTarget, EstimateParams, OverheadRates, ReportKind } from '@twin/core';
import {
  Badge, Button, DetailCard, DetailCardHeader, DetailRow, EMPTY, Input, MessageStrip, Modal, OverflowShade, SegmentedControl,
  TABLE_ROW, TableCard, TableGroupHead, Td, Th, cn, useOverflowShade,
} from '../../../components/ui';
import type { BadgeStatus } from '../../../components/ui';
import { useV2OrgTree, useWageCatalog } from '../../hooks';
import { useCatalog } from '../../model/hooks';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { flattenTree } from '../../orgTreeSelectors';
import { designInput, hasUnpricedChanges } from './designSelectors';

/**
 * 두 칸이 각자 구르는 높이 — 상자는 내용만큼만 크고(최대 85vh) 이 높이에서 멈춘다.
 * 8.75rem 은 상자에서 칸이 못 쓰는 자리다 — 머리줄(49) + 본문 여백(32) + 단추줄(57).
 */
const COLUMN_H = 'max-h-[calc(85vh-8.75rem)]';

/** 작업 → 구분(신설·철거·이설). 대상(랙·설비·케이블·광선로)은 core 가 적은 `target` 이 말한다. */
const INSTALL = { label: '신설', status: 'success' as BadgeStatus };
const REMOVE = { label: '철거', status: 'danger' as BadgeStatus };
const RELOCATE = { label: '이설', status: 'info' as BadgeStatus };
const WORK: Record<ReportKind, { label: string; status: BadgeStatus }> = {
  'rack-install': INSTALL, 'equipment-install': INSTALL, 'cable-install': INSTALL,
  'rack-remove': REMOVE, 'equipment-remove': REMOVE, 'cable-remove': REMOVE,
  'rack-relocate': RELOCATE, 'equipment-relocate': RELOCATE,
};
const TARGET: Record<DesignTarget, string> = { rack: '랙', equipment: '설비', link: '케이블', line: '광선로' };

/**
 * 산출 내역 열 폭 — 수·배지는 고정 폭(잘리면 안 된다), 이름·품목·노무유형은 비율(넘치면 말줄임).
 * 차례: 구분 · 대상 · 이름 · 품목 · 수량 · 단위 · 자재단가 · 재료비 · 노무유형 · 공량.
 */
const ITEM_COL_W = ['52px', '60px', 60, 40, '64px', '40px', '88px', '100px', '84px', '76px'] as const;
const ITEM_COLS = ITEM_COL_W.length;

/** 원 단위, 천 단위 구분. */
const won = (v: number) => v.toLocaleString('ko-KR');
const qtyText = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const manDaysText = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(v * 100).toFixed(3).replace(/\.?0+$/, '')}%`;
/** 근거 — 「(재료비+노무비) × 4.378%」. 모수가 합이면 괄호로 묶는다(곱이 먼저 읽히지 않게). */
const basisText = (basis: string, rate: number) => `${basis.includes('+') ? `(${basis})` : basis} × ${pct(rate)}`;

/** 「품목 미지정」은 core 가 품목 이름을 「—」로 둔 줄이다 — 이름 자리에 사정을 적는다. */
const UNRESOLVED = '—';

function ItemRow({ item, laborName }: { item: DesignItem; laborName: (code: string | null) => string | null }) {
  const work = WORK[item.kind];
  /* 사는 것이 없는 줄(철거·이설)은 재료비를 비운다 — 금액은 `materialCostOf` 하나가 센다. */
  const buys = work === INSTALL;
  const note = item.note && item.typeName !== UNRESOLVED ? item.note : null;
  return (
    <tr className={TABLE_ROW}>
      <Td><Badge status={work.status}>{work.label}</Badge></Td>
      <Td className="whitespace-nowrap text-content-muted">{TARGET[item.target]}</Td>
      {/* 사정(「길이 미입력」)은 이름 **앞**에 선다 — 뒤에 두면 이름이 길 때 함께 잘려 사라진다. */}
      <Td title={note ? `${note} · ${item.name}` : item.name}>
        <span className="flex items-center gap-1.5">
          {note && <Badge status="warning" className="shrink-0">{note}</Badge>}
          <span className="min-w-0 truncate text-content">{item.name}</span>
        </span>
      </Td>
      {item.typeName === UNRESOLVED
        ? <Td className="truncate text-warning">품목 미지정</Td>
        : <Td className="truncate text-content-muted" title={item.typeName}>{item.typeName}</Td>}
      <Td align="right">{qtyText(item.qty)}</Td>
      <Td className="text-content-muted">{item.unit}</Td>
      {/* 단가는 적혀 있으면 늘 보인다 — 철거 줄에서도 그것이 그 물건의 값이다. */}
      <Td align="right" className="text-content-muted">{item.unitPrice == null ? EMPTY : won(item.unitPrice)}</Td>
      <Td align="right">{buys ? won(materialCostOf(item)) : EMPTY}</Td>
      <Td className="truncate text-content-muted">{laborName(item.laborCode) ?? EMPTY}</Td>
      <Td align="right">{manDaysText(item.manDays)}</Td>
    </tr>
  );
}

/** 국별 묶음 — 대표 국(`primarySubstationId`)으로 묶는다. 묶음마다 합계는 내지 않는다(두 국에 걸친 줄이 두 번 세진다). */
function groupBySubstation(items: DesignItem[], nameOf: (id: string) => string) {
  const groups = new Map<string, DesignItem[]>();
  for (const it of items) {
    const g = groups.get(it.primarySubstationId);
    if (g) g.push(it);
    else groups.set(it.primarySubstationId, [it]);
  }
  const order = new Intl.Collator('ko', { numeric: true });
  return [...groups.entries()]
    .map(([id, rows]) => ({ id, name: nameOf(id), rows }))
    .sort((a, b) => order.compare(a.name, b.name));
}

interface DesignDialogProps {
  open: boolean;
  onClose: () => void;
}

/**
 * 설계서 — **저장 전 변경안 전체**(여러 국에 걸쳐도 한 부)의 산출 내역과 공사비.
 *
 * 항목은 길고(변경 수만큼) 금액은 길이가 정해져 있으니 옆으로 나눈다 — 구르는 것은 항목뿐이고
 * 공사비는 늘 제자리에 있다. 합계는 core 가 낸 **평평한 목록 하나**에서만 낸다.
 */
export function DesignDialog({ open, onClose }: DesignDialogProps) {
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const catalog = useCatalog();
  const { data: orgTree } = useV2OrgTree();
  const { nameOf: laborName } = useWageCatalog();

  const orgName = useMemo(() => {
    const m = new Map(orgTree ? flattenTree(orgTree).map((n) => [n.id, n.name]) : []);
    return (id: string) => m.get(id) ?? null;
  }, [orgTree]);

  const input = useMemo(
    () => (catalog.data ? designInput({ saved, overlays }, catalog.data, orgName) : null),
    [saved, overlays, catalog.data, orgName],
  );
  const items = useMemo(() => (input ? designItems(input) : []), [input]);
  const report = useMemo(() => computeReport(items), [items]);
  const unpriced = useMemo(() => hasUnpricedChanges({ saved, overlays }), [saved, overlays]);

  const groups = useMemo(
    () => (input ? groupBySubstation(items, input.substationName) : []),
    [items, input],
  );
  const grouped = groups.length > 1;

  const empty = items.length === 0;
  const notice = unpriced && <MessageStrip tone="info">값 변경(길이·품목 등)은 산출하지 않습니다.</MessageStrip>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설계서"
      size={empty ? 'md' : '2xl'}
      footer={<Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>}
    >
      {!catalog.data ? (
        <p className="text-sm text-content-muted">불러오는 중…</p>
      ) : empty ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-content-muted">변경 내용이 없습니다.</p>
          {notice}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <ItemsColumn items={items} groups={grouped ? groups : null} totalMaterialCost={report.totalMaterialCost} totalManDays={report.totalManDays} notice={notice} laborName={laborName} />
          <div className={cn(COLUMN_H, 'flex min-w-0 flex-col gap-3 overflow-auto')}>
            <CostColumn items={items} report={report} />
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * 산출 내역 — 길면 여기만 구른다. 머리글과 합계 줄은 붙어 있다. 상자가 좁아지면(작은 화면) 열을 짓누르지 않고
 * 가로로 구르며 그늘이 「열이 더 있다」를 말한다(바닥 폭 46rem).
 */
function ItemsColumn({ items, groups, totalMaterialCost, totalManDays, notice, laborName }: {
  items: DesignItem[];
  /** 국이 둘 이상일 때만 — 하나면 묶음 머리를 세우지 않는다. */
  groups: { id: string; name: string; rows: DesignItem[] }[] | null;
  totalMaterialCost: number;
  totalManDays: number;
  notice: ReactNode;
  laborName: (code: string | null) => string | null;
}) {
  const shade = useOverflowShade();
  return (
    <div ref={shade.frameRef} className="relative min-w-0">
      <div className={cn(COLUMN_H, 'min-w-0 overflow-auto')}>
        <div ref={shade.bodyRef} className="flex min-w-[46rem] flex-col gap-2">
          <TableCard widths={ITEM_COL_W}>
            <thead className="sticky top-0 z-sticky">
              <tr>
                <Th>구분</Th>
                <Th>대상</Th>
                <Th>이름</Th>
                <Th>품목</Th>
                <Th align="right">수량</Th>
                <Th>단위</Th>
                <Th align="right" unit="원">자재단가</Th>
                <Th align="right" unit="원">재료비</Th>
                <Th>노무유형</Th>
                <Th align="right" unit="인·일">공량</Th>
              </tr>
            </thead>
            {groups ? (
              groups.map((g) => (
                <tbody key={g.id} data-testid="design-group">
                  <TableGroupHead colSpan={ITEM_COLS} title={g.name} metas={[`${g.rows.length}건`]} />
                  {g.rows.map((it, i) => <ItemRow key={i} item={it} laborName={laborName} />)}
                </tbody>
              ))
            ) : (
              <tbody>
                {items.map((it, i) => <ItemRow key={i} item={it} laborName={laborName} />)}
              </tbody>
            )}
            {/* 합계는 평평한 목록에서 — 묶음 소계를 더하지 않는다(두 국에 걸친 줄이 두 번 세진다). */}
            <tfoot className="sticky bottom-0 bg-surface">
              <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
                <Td colSpan={7}>합계 {items.length}건</Td>
                <Td align="right" data-testid="design-material-total">{won(totalMaterialCost)}</Td>
                <Td />
                <Td align="right" data-testid="design-mandays-total">{manDaysText(totalManDays)}</Td>
              </tr>
            </tfoot>
          </TableCard>
          {notice}
        </div>
      </div>
      <OverflowShade top={shade.top} />
    </div>
  );
}

/**
 * 오른쪽 칸 — 산출 조건 · 노무유형별 공량 · 공사비.
 *
 * 사람이 입력하는 것은 공사기간·계약방법·산재보험료 기준 셋뿐이다. 공사규모는 직접공사비가 정하고,
 * 요율은 기준정보(제비율)가 준다 — 기준정보가 없으면 금액을 0 으로 보이지 않고 막는다(판정 불가 ≠ 0).
 */
function CostColumn({ items, report }: { items: DesignItem[]; report: ReturnType<typeof computeReport> }) {
  const catalog = useCatalog();
  const wages = useWageCatalog();
  const overhead = catalog.data?.overheadStandard ?? null;
  const wageReady = wages.rows.length > 0;
  const [days, setDays] = useState('30');
  const [contract, setContract] = useState<EstimateParams['contract']>('경쟁');
  const [sanjae, setSanjae] = useState<EstimateParams['sanjaeBasis']>('한전');

  /* 직접노무비 = 공량 × 노임단가. 노임이 없는 줄은 0 으로 세고 몇 건인지 말한다. */
  const { directLaborCost, missingWage } = useMemo(() => {
    let cost = 0;
    let missing = 0;
    for (const it of items) {
      const wage = wages.wageOf(it.laborCode);
      if (wage == null) { if (it.manDays > 0) missing++; continue; }
      cost += it.manDays * wage;
    }
    return { directLaborCost: cost, missingWage: missing };
  }, [items, wages]);

  const unassigned = items.filter((it) => it.laborCode == null);
  const unassignedManDays = unassigned.reduce((n, it) => n + it.manDays, 0);
  const materialCost = report.totalMaterialCost;
  const band = sizeBand(Math.round(materialCost) + Math.round(directLaborCost));

  const missing = [!wageReady && '노임단가', !overhead && '제비율'].filter(Boolean).join('·');
  const rates = overhead as unknown as OverheadRates | null;
  const est = !missing && rates
    ? computeEstimate({ materialCost, directLaborCost }, rates, { days: Number(days.replace(/,/g, '')) || 0, contract, sanjaeBasis: sanjae })
    : null;

  return (
    <>
      <DetailCard>
        <DetailCardHeader title="산출 조건" />
        <DetailRow label="공사기간">
          <Input size="sm" numeric suffix="일" value={days} onChange={(e) => setDays(e.currentTarget.value)} />
        </DetailRow>
        <DetailRow label="계약방법">
          <SegmentedControl
            aria-label="계약방법" value={contract} onChange={setContract}
            items={[{ key: '경쟁', label: '경쟁' }, { key: '수의', label: '수의' }]}
          />
        </DetailRow>
        <DetailRow label="산재보험료">
          <SegmentedControl
            aria-label="산재보험료 기준" value={sanjae} onChange={setSanjae}
            items={[{ key: '한전', label: '한전 기준' }, { key: '조달청', label: '조달청 기준' }]}
          />
        </DetailRow>
        <DetailRow label="공사규모" hint={`직접공사비 ${won(Math.round(materialCost + directLaborCost))}원 기준 · 자동`}>
          {band}
        </DetailRow>
        <DetailRow label="기준">
          {`노임단가 ${wages.effective ?? '미등록'} · 제비율 ${overhead?.effective ?? '미등록'}`}
        </DetailRow>
      </DetailCard>

      <TableCard widths={[100, '72px', '92px']}>
        <thead>
          <TableGroupHead colSpan={3} title="노무유형별 공량" />
          <tr>
            <Th>노무유형</Th>
            <Th align="right" unit="인·일">공량</Th>
            <Th align="right" unit="원/일">노임단가</Th>
          </tr>
        </thead>
        <tbody>
          {report.byLaborType.map(({ laborCode, totalManDays }) => {
            const wage = wages.wageOf(laborCode);
            return (
              <tr key={laborCode} className={TABLE_ROW}>
                <Td className="truncate">{wages.nameOf(laborCode)}</Td>
                <Td align="right">{manDaysText(totalManDays)}</Td>
                {!wageReady
                  ? <Td align="right" className="text-warning">미등록</Td>
                  : wage == null
                    ? <Td align="right" className="text-warning">단가 없음</Td>
                    : <Td align="right">{won(wage)}</Td>}
              </tr>
            );
          })}
          {unassigned.length > 0 && (
            <tr className={TABLE_ROW}>
              <Td className="truncate text-warning">노무유형 미지정 {unassigned.length}건</Td>
              <Td align="right">{manDaysText(unassignedManDays)}</Td>
              <Td align="right" className="text-content-muted">{EMPTY}</Td>
            </tr>
          )}
          <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
            <Td>총 공량</Td>
            <Td align="right">{manDaysText(report.totalManDays)}</Td>
            <Td />
          </tr>
        </tbody>
      </TableCard>

      <TableCard widths={['136px', 100, '112px']}>
        <thead>
          <TableGroupHead colSpan={3} title="공사비" />
          <tr>
            <Th>항목</Th>
            <Th>근거</Th>
            <Th align="right" unit="원">금액</Th>
          </tr>
        </thead>
        <tbody>
          <CostRow label="재료비" basis="수량 × 자재단가" amount={materialCost} />
          {est ? (
            <>
              <CostRow label="직접노무비" basis="공량 × 노임단가" amount={est.directLaborCost} />
              <CostRow
                label="간접노무비"
                basis={basisText('직접노무비', rates!.byDuration.간접노무비[est.sizeBand][est.durationBand])}
                amount={est.indirectLaborCost}
              />
              {est.expenses.map((e) => <CostRow key={e.label} label={e.label} basis={basisText(e.basis, e.rate)} amount={e.amount} />)}
              <CostRow label={est.overheadAdmin.label} basis={basisText(est.overheadAdmin.basis, est.overheadAdmin.rate)} amount={est.overheadAdmin.amount} />
              <CostRow label={est.profit.label} basis={basisText(est.profit.basis, est.profit.rate)} amount={est.profit.amount} />
              <CostRow label="부가가치세" basis="합계 × 10%" amount={est.vat} />
            </>
          ) : (
            <tr className={TABLE_ROW}>
              <Td colSpan={3} className="text-warning" data-testid="design-blocked">
                {missing} 기준정보 미등록 — 기준정보에서 업로드하세요
              </Td>
            </tr>
          )}
        </tbody>
        {/* 결론 줄은 굴러도 남는다 — 총공사비를 보려고 경비 열 줄을 지나가게 두지 않는다. */}
        {est && (
          <tfoot className="sticky bottom-0 bg-surface">
            <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
              <Td>총공사비</Td>
              <Td className="truncate font-normal text-warning">{missingWage > 0 && `노임 미반영 ${missingWage}건`}</Td>
              <Td align="right" data-testid="design-total">{won(est.total)}</Td>
            </tr>
          </tfoot>
        )}
      </TableCard>
    </>
  );
}

function CostRow({ label, basis, amount }: { label: string; basis: string; amount: number }) {
  return (
    <tr className={TABLE_ROW}>
      <Td className="truncate" title={label}>{label}</Td>
      <Td className="truncate text-xs text-content-faint" title={basis}>{basis}</Td>
      <Td align="right">{won(amount)}</Td>
    </tr>
  );
}
