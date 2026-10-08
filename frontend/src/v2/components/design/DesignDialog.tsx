import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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
import './designPrint.css';

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
/** 인쇄(A4 세로, 9pt) — 종이 폭(약 700px)에 맞춰 수 칸을 줄이고 이름·품목에 자리를 준다. 차례는 화면과 같다. */
const PRINT_COL_W = ['40px', '44px', 58, 42, '56px', '32px', '72px', '88px', '64px', '68px'] as const;

/** 원 단위, 천 단위 구분. */
const won = (v: number) => v.toLocaleString('ko-KR');
const qtyText = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
const manDaysText = (v: number) => v.toFixed(3);
const pct = (v: number) => `${(v * 100).toFixed(3).replace(/\.?0+$/, '')}%`;

/** 「품목 미지정」은 core 가 품목 이름을 「—」로 둔 줄이다 — 이름 자리에 사정을 적는다. */
const UNRESOLVED = '—';

function ItemRow({ item, laborName }: { item: DesignItem; laborName: (code: string | null) => string | null }) {
  const work = WORK[item.kind];
  /* 사는 것이 없는 줄(철거·이설)은 재료비를 비운다 — 금액은 `materialCostOf` 하나가 센다. */
  const buys = work === INSTALL;
  const note = item.note && item.typeName !== UNRESOLVED ? item.note : null;
  /* 사는 줄인데 단가가 없으면 재료비는 「0」이 아니라 「—」 — 셈은 그대로 `materialCostOf`(0)다. 표시만. */
  const priced = buys && item.unitPrice != null;
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
      <Td align="right">{priced ? won(materialCostOf(item)) : EMPTY}</Td>
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

  const estimate = useDesignEstimate(items, report);
  const empty = items.length === 0;
  const notice = unpriced && <MessageStrip tone="info">값 변경(길이·품목 등)은 산출하지 않습니다.</MessageStrip>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설계서"
      size={empty ? 'md' : '2xl'}
      footer={(
        <>
          {/* 인쇄는 브라우저 인쇄 하나다 — 인쇄용 문서(아래 `DesignPrint`)만 종이에 서고 화면 크롬은 인쇄 CSS 가 걷는다. */}
          {!empty && catalog.data && <Button variant="secondary" size="sm" onClick={() => window.print()}>인쇄</Button>}
          <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
        </>
      )}
    >
      {!catalog.data ? (
        <p className="text-sm text-content-muted">불러오는 중…</p>
      ) : empty ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-content-muted">변경 내용이 없습니다.</p>
          {notice}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem] min-[1400px]:grid-cols-[minmax(0,1fr)_28rem]">
          <ItemsColumn items={items} groups={grouped ? groups : null} totalMaterialCost={report.totalMaterialCost} totalManDays={report.totalManDays} notice={notice} laborName={laborName} />
          <div className={cn(COLUMN_H, 'flex min-w-0 flex-col gap-3 overflow-auto')}>
            <CostColumn report={report} e={estimate} />
          </div>
          {input && (
            <DesignPrint
              items={items} groups={grouped ? groups : null} report={report} e={estimate} laborName={laborName}
              substationName={input.substationName}
            />
          )}
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
          <ItemsTable items={items} groups={groups} totalMaterialCost={totalMaterialCost} totalManDays={totalManDays} laborName={laborName} sticky />
          {notice}
        </div>
      </div>
      <OverflowShade top={shade.top} />
    </div>
  );
}

type Groups = { id: string; name: string; rows: DesignItem[] }[] | null;

/**
 * 산출 내역 표 — 화면과 인쇄가 같은 표를 쓴다. 화면은 머리·합계 줄이 붙어 있고(`sticky`), 인쇄는 줄이 쪽을 넘으면
 * 머리줄이 쪽마다 다시 선다(`thead` = table-header-group, 제목 줄 「산출 내역」도 그 안에 있다).
 */
function ItemsTable({ items, groups, totalMaterialCost, totalManDays, laborName, sticky = false, title, widths = ITEM_COL_W }: {
  items: DesignItem[];
  groups: Groups;
  totalMaterialCost: number;
  totalManDays: number;
  laborName: (code: string | null) => string | null;
  sticky?: boolean;
  /** 표 제목 줄 — 인쇄에서만(화면은 상자 제목이 말한다). */
  title?: string;
  widths?: readonly (number | `${number}px`)[];
}) {
  /** 사는 줄(신설)인데 자재단가가 없는 줄 — 재료비 합계에 0 으로 들어간다. */
  const unpriced = items.filter((it) => WORK[it.kind] === INSTALL && it.unitPrice == null).length;
  return (
    <TableCard widths={widths}>
      <thead className={cn(sticky && 'sticky top-0 z-sticky')}>
        {title && <TableGroupHead colSpan={ITEM_COLS} title={title} metas={[`${items.length}건`]} />}
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
      <tfoot className={cn(sticky && 'sticky bottom-0 bg-surface')}>
        <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
          <Td colSpan={5}>합계 {items.length}건</Td>
          <Td colSpan={2} align="right" className="text-xs font-normal text-warning" data-testid="design-unpriced">
            {unpriced > 0 && `자재단가 미입력 ${unpriced}건`}
          </Td>
          <Td align="right" data-testid="design-material-total">{won(totalMaterialCost)}</Td>
          <Td />
          <Td align="right" data-testid="design-mandays-total">{manDaysText(totalManDays)}</Td>
        </tr>
      </tfoot>
    </TableCard>
  );
}

/**
 * 공사비 셈 — 산출 조건(공사기간·계약방법·산재보험료 기준) 상태와 그로부터 낸 금액. 화면의 공사비 칸과 인쇄가
 * 같은 값을 읽는다(인쇄가 따로 셈하면 종이와 화면이 갈린다).
 */
function useDesignEstimate(items: DesignItem[], report: ReturnType<typeof computeReport>) {
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
  /* 공사기간은 1 이상의 정수(일) — 비었거나 잘못 적었으면 0 으로 셈하지 않고 막는다. */
  const daysText = days.replace(/,/g, '').trim();
  const daysValue = /^\d+$/.test(daysText) && Number(daysText) > 0 ? Number(daysText) : null;
  const daysIssue = daysValue == null ? '1 이상의 일수를 입력하세요' : null;
  const est = !missing && rates && daysValue != null
    ? computeEstimate({ materialCost, directLaborCost }, rates, { days: daysValue, contract, sanjaeBasis: sanjae })
    : null;
  const blocked = missing
    ? `${missing} 기준정보 미등록 — 기준정보에서 업로드하세요`
    : '공사기간 입력 오류 — 1 이상의 일수를 입력하세요';

  return {
    wages, wageReady, overhead, rates, days, setDays, daysIssue, daysValue, contract, setContract, sanjae, setSanjae,
    materialCost, directLaborCost, missingWage, band, est, blocked, unassigned, unassignedManDays,
  };
}
type DesignEstimate = ReturnType<typeof useDesignEstimate>;

/**
 * 오른쪽 칸 — 산출 조건 · 노무유형별 공량 · 공사비.
 *
 * 사람이 입력하는 것은 공사기간·계약방법·산재보험료 기준 셋뿐이다. 공사규모는 직접공사비가 정하고,
 * 요율은 기준정보(제비율)가 준다 — 기준정보가 없으면 금액을 0 으로 보이지 않고 막는다(판정 불가 ≠ 0).
 */
function CostColumn({ report, e }: { report: ReturnType<typeof computeReport>; e: DesignEstimate }) {
  const { wages, wageReady, overhead, days, setDays, daysIssue, contract, setContract, sanjae, setSanjae, materialCost, directLaborCost, band } = e;
  return (
    <>
      <DetailCard>
        <DetailCardHeader title="산출 조건" />
        <DetailRow label="공사기간" issue={daysIssue}>
          <Input size="sm" numeric suffix="일" invalid={daysIssue != null} value={days} onChange={(e) => setDays(e.currentTarget.value)} />
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
        {/* 노임단가가 없으면 직접공사비에 노무비가 빠진다 — 구간이 그 사실을 숨기지 않게 적는다. */}
        <DetailRow
          label="공사규모"
          hint={wageReady ? `직접공사비 ${won(Math.round(materialCost + directLaborCost))}원 기준 · 자동` : '노임단가 미등록 — 재료비만 반영'}
        >
          {band}
        </DetailRow>
        <DetailRow label="기준">
          {`노임단가 ${wages.effective ?? '미등록'} · 제비율 ${overhead?.effective ?? '미등록'}`}
        </DetailRow>
      </DetailCard>

      <LaborTable report={report} e={e} />

      <CostTable e={e} sticky />
    </>
  );
}

/** 노무유형별 공량 표 — 화면과 인쇄가 같은 표(현장 설계서에도 공량 집계가 선다). */
function LaborTable({ report, e }: { report: ReturnType<typeof computeReport>; e: DesignEstimate }) {
  const { wages, wageReady, unassigned, unassignedManDays } = e;
  return (
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
  );
}

/** 공사비 표 — 화면과 인쇄가 같은 표. 화면은 총공사비 줄이 붙어 있다(`sticky`). */
function CostTable({ e, sticky = false }: { e: DesignEstimate; sticky?: boolean }) {
  const { est, rates, materialCost, blocked, missingWage } = e;
  /* 율은 제 열에 선다 — 「근거 × 율」 한 칸이면 모수가 긴 줄에서 정작 율이 잘린다. */
  return (
    <TableCard widths={['132px', 100, '68px', '112px']}>
      <thead>
        <TableGroupHead colSpan={4} title="공사비" />
        <tr>
          <Th>항목</Th>
          <Th>근거</Th>
          <Th align="right">율</Th>
          <Th align="right" unit="원">금액</Th>
        </tr>
      </thead>
      <tbody>
        <CostRow label="재료비" basis="수량 × 자재단가" amount={est?.materialCost ?? materialCost} />
        {est ? (
          <>
            <CostRow label="직접노무비" basis="공량 × 노임단가" amount={est.directLaborCost} />
            <CostRow
              label="간접노무비"
              basis="직접노무비" rate={rates!.byDuration.간접노무비[est.sizeBand][est.durationBand]}
              amount={est.indirectLaborCost}
            />
            {est.expenses.map((e) => <CostRow key={e.label} label={e.label} basis={e.basis} rate={e.rate} amount={e.amount} />)}
            <CostRow label={est.overheadAdmin.label} basis={est.overheadAdmin.basis} rate={est.overheadAdmin.rate} amount={est.overheadAdmin.amount} />
            <CostRow label={est.profit.label} basis={est.profit.basis} rate={est.profit.rate} amount={est.profit.amount} />
            <CostRow label="부가가치세" basis="합계" rate={0.1} amount={est.vat} />
          </>
        ) : (
          <tr className={TABLE_ROW}>
            <Td colSpan={4} className="text-warning" data-testid="design-blocked">
              {blocked}
            </Td>
          </tr>
        )}
      </tbody>
      {/* 결론 줄은 굴러도 남는다 — 총공사비를 보려고 경비 열 줄을 지나가게 두지 않는다. */}
      {est && (
        <tfoot className={cn(sticky && 'sticky bottom-0 bg-surface')}>
          <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
            <Td>총공사비</Td>
            <Td colSpan={2} className="truncate font-normal text-warning">{missingWage > 0 && `노임 미반영 ${missingWage}건`}</Td>
            <Td align="right" data-testid="design-total">{won(est.total)}</Td>
          </tr>
        </tfoot>
      )}
    </TableCard>
  );
}

function CostRow({ label, basis, rate, amount }: { label: string; basis: string; rate?: number; amount: number }) {
  return (
    <tr className={TABLE_ROW}>
      <Td className="truncate" title={label}>{label}</Td>
      <Td className="truncate text-xs text-content-faint" title={basis}>{basis}</Td>
      <Td align="right" className="text-content-muted">{rate == null ? '' : pct(rate)}</Td>
      <Td align="right">{won(amount)}</Td>
    </tr>
  );
}

/** 오늘(이 컴퓨터의 날짜) — `YYYY-MM-DD`. 설계서의 작성일이다. */
function today(): string {
  const d = new Date();
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/**
 * 인쇄용 설계서 — 화면에서는 보이지 않고(`designPrint.css`) 인쇄할 때만 종이에 선다.
 *
 * `body` 바로 밑으로 나간다(포털) — 인쇄 CSS 가 `body` 의 다른 자식(앱 화면·상자·덮개)을 통째로 걷고 이것만 남긴다.
 * 상자 안에 두면 상자의 높이 제한·스크롤·테두리를 함께 걷어 내야 하고, 하나라도 남으면 종이에서 줄이 잘린다.
 * 값은 화면과 같은 셈(`useDesignEstimate`)을 읽는다 — 화면에서 바꾼 공사기간이 그대로 종이에 선다.
 */
function DesignPrint({ items, groups, report, e, laborName, substationName }: {
  items: DesignItem[];
  groups: Groups;
  report: ReturnType<typeof computeReport>;
  e: DesignEstimate;
  laborName: (code: string | null) => string | null;
  substationName: (id: string) => string;
}) {
  const order = new Intl.Collator('ko', { numeric: true });
  const places = [...new Set(items.flatMap((it) => it.substationIds))].map(substationName).sort(order.compare);
  const conditions = e.daysValue == null
    ? `공사기간 미입력 · 계약방법 ${e.contract} · 산재보험료 ${e.sanjae} 기준`
    : `공사기간 ${e.daysValue}일 · 계약방법 ${e.contract} · 산재보험료 ${e.sanjae} 기준`;
  return createPortal(
    <section data-design-print aria-label="설계서 인쇄본" className="flex flex-col gap-3 bg-surface text-content">
      <h1 className="text-sm font-semibold" data-design-print-title>설계서</h1>
      <DetailCard>
        <DetailRow label="대상 변전소" wide>{places.join(' · ')}</DetailRow>
        <DetailRow label="작성일" wide>{today()}</DetailRow>
        <DetailRow label="기준" wide>{`노임단가 ${e.wages.effective ?? '미등록'} · 제비율 ${e.overhead?.effective ?? '미등록'}`}</DetailRow>
        <DetailRow label="산출 조건" wide>{conditions}</DetailRow>
      </DetailCard>
      <ItemsTable
        title="산출 내역" widths={PRINT_COL_W} items={items} groups={groups} laborName={laborName}
        totalMaterialCost={report.totalMaterialCost} totalManDays={report.totalManDays}
      />
      <LaborTable report={report} e={e} />
      <CostTable e={e} />
    </section>,
    document.body,
  );
}
