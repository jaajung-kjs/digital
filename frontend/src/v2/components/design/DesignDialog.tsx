import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { compareName, computeEstimate, computeReport, designItems, laborCosts, materialCostOf, sizeBand } from '@twin/core';
import type { DesignItem, DesignTarget, EstimateParams, OverheadRates, ReportKind } from '@twin/core';
import {
  Badge, Button, DetailCard, DetailCardHeader, DetailRow, EMPTY, Input, MessageStrip, Modal, SegmentedControl,
  EmptyRow, TABLE_ROW, TableCard, TableGroupHead, TableSubHead, Td, Th, cn, formatManDaysFixed, formatPercent, formatQty, percentDigits, formatSourceDate, formatWon,
  today, useTableLayout, type TableColumn, type TableTier,
} from '../../../components/ui';
import type { BadgeStatus } from '../../../components/ui';
import { useV2OrgTree, useWageCatalog } from '../../hooks';
import { useCatalog } from '../../model/hooks';
import { useWorkingCopy } from '../../model/store/workingCopy';
import { flattenTree } from '../../orgTreeSelectors';
import { TONE, WORK_KIND_TONE } from '../../tones';
import { designInput, hasUnpricedChanges } from './designSelectors';
import './designPrint.css';
import './designPage.css';

/**
 * 두 칸이 각자 구르는 높이 — 상자는 내용만큼만 크고(최대 85vh) 이 높이에서 멈춘다.
 * 8.75rem 은 상자에서 칸이 못 쓰는 자리다 — 머리줄(49) + 본문 여백(32) + 단추줄(57).
 */
const COLUMN_H = 'max-h-[calc(85vh-8.75rem)]';

/** 작업 → 구분(신설·철거·이설). 대상(랙·설비·케이블·광선로)은 core 가 적은 `target` 이 말한다. */
/* 공사 구분은 범주다 — 셋 다 neutral, 글자로 가른다(결정 7 · `WORK_KIND_TONE`). */
const INSTALL = { label: '신설', status: WORK_KIND_TONE };
const REMOVE = { label: '철거', status: WORK_KIND_TONE };
const RELOCATE = { label: '이설', status: WORK_KIND_TONE };
const WORK: Record<ReportKind, { label: string; status: BadgeStatus }> = {
  'rack-install': INSTALL, 'equipment-install': INSTALL, 'cable-install': INSTALL,
  'rack-remove': REMOVE, 'equipment-remove': REMOVE, 'cable-remove': REMOVE,
  'rack-relocate': RELOCATE, 'equipment-relocate': RELOCATE,
};
const TARGET: Record<DesignTarget, string> = { rack: '랙', equipment: '설비', link: '케이블', line: '광선로' };

/**
 * 산출 내역 열 — 수·배지는 고정 폭(잘리면 안 된다, 머리글 「자재단가(원)」이 다 드는 폭), 이름·품목은 비율(넘치면 말줄임).
 * 차례: 구분 · 대상 · 이름 · 품목 · 수량 · 단위 · 자재단가 · 재료비 · 노무유형 · 공량.
 *
 * 화면에서 상자가 좁으면(§1.7-e) 「구분」+「대상」 → 「신설 · 랙」, 「단위」는 수량 뒤(「1대」·「12 m」)로 병합되고,
 * 자재단가·노무유형·품목이 숨는다(이름 칸 title 에 남는다). **인쇄는 늘 전 열**이다(`tier="wide"`, 종이 폭 고정).
 */
const ITEM_COLUMNS: readonly TableColumn[] = [
  { key: 'kind', width: '52px', priority: 2 },
  { key: 'target', width: '60px', priority: 2 },
  { key: 'kindTarget', width: '96px', merged: true },
  { key: 'name', width: 60 },
  { key: 'type', width: 40, priority: 3 },
  { key: 'qty', width: '80px' },
  { key: 'unit', width: '44px', priority: 2 },
  { key: 'unitPrice', width: '100px', priority: 3 },
  { key: 'material', width: '116px' },
  { key: 'labor', width: '84px', priority: 3 },
  { key: 'manDays', width: '92px' },
];
/**
 * 인쇄(A4 세로, 9pt) — 종이 폭(약 718px)에 맞춰 수 칸을 줄이고 이름·품목에 자리를 준다. 차례는 화면과 같다.
 * 수 칸은 큰 공사가 들어가는 폭이다 — 재료비 10억(「1,000,000,000」), 수량 99,999 m(45 km 광선로 = 45,000).
 */
const PRINT_WIDTH: Record<string, TableColumn['width']> = {
  kind: '40px', target: '44px', name: 58, type: 42, qty: '64px', unit: '40px', unitPrice: '92px', material: '100px', labor: '72px', manDays: '72px',
};
const PRINT_COLUMNS: readonly TableColumn[] = ITEM_COLUMNS.map((c) => ({ ...c, width: PRINT_WIDTH[c.key] ?? c.width }));

/* 수 꼴은 공용 helper 하나씩(`format.ts`) — 금액은 core 가 이미 원 단위로 맞췄다(`materialCostOf`·`computeEstimate`).
   공량은 **설계서에서만** 늘 3자리(`formatManDaysFixed`, 문서 관행), 그 밖 화면은 꼬리 0 제거. */
const manDaysText = formatManDaysFixed;

/** 띄워 쓰는 단위(SI) — 그 밖(대·개·식)은 셈 단위라 수에 붙인다. */
const SI_UNITS: ReadonlySet<string> = new Set(['m', 'km', 'A', 'V', 'kV', 'dB']);

/** 「품목 미지정」은 core 가 품목 이름을 「—」로 둔 줄이다 — 이름 자리에 사정을 적는다. */
const UNRESOLVED = '—';

function ItemRow({ item, laborName }: { item: DesignItem; laborName: (code: string | null) => string | null }) {
  const { shows } = useTableLayout();
  const work = WORK[item.kind];
  /* 사는 것이 없는 줄(철거·이설)은 자재단가·재료비를 함께 「—」로 둔다 — 단가만 보이면 재료비가 빠진 줄로 읽힌다.
     금액은 `materialCostOf` 하나가 센다. */
  const buys = work === INSTALL;
  const note = item.note && item.typeName !== UNRESOLVED ? item.note : null;
  /* 사는 줄인데 단가가 없으면 재료비는 「0」이 아니라 「—」 — 셈은 그대로 `materialCostOf`(0)다. 표시만. */
  const priced = buys && item.unitPrice != null;
  const unitPrice = buys && item.unitPrice != null ? formatWon(item.unitPrice) : EMPTY;
  const labor = laborName(item.laborCode) ?? EMPTY;
  const typeName = item.typeName === UNRESOLVED ? '품목 미지정' : item.typeName;
  /* 숨은 열의 값은 이름 칸 title 에 모은다 — 화면에서 사라지는 값은 없다. */
  const hidden = [
    !shows('type') && `품목 ${typeName}`,
    !shows('unitPrice') && `자재단가 ${unitPrice}`,
    !shows('labor') && `노무유형 ${labor}`,
  ].filter(Boolean).join(' · ');
  const nameTitle = [note, item.name, hidden].filter(Boolean).join(' · ');
  return (
    <tr className={TABLE_ROW}>
      <Td col="kind"><Badge status={work.status}>{work.label}</Badge></Td>
      <Td col="target" className="whitespace-nowrap text-content-muted">{TARGET[item.target]}</Td>
      <Td col="kindTarget" className="whitespace-nowrap">
        <Badge status={work.status}>{work.label}</Badge>
        <span className="ml-1 text-content-muted">{TARGET[item.target]}</span>
      </Td>
      {/* 사정(「길이 미입력」)은 이름 **앞**에 선다 — 뒤에 두면 이름이 길 때 함께 잘려 사라진다. */}
      <Td col="name" title={nameTitle}>
        <span className="flex items-center gap-1.5">
          {note && <Badge status={TONE.warning} className="shrink-0">{note}</Badge>}
          <span className="min-w-0 truncate text-content">{item.name}</span>
        </span>
      </Td>
      {item.typeName === UNRESOLVED
        ? <Td col="type" className="truncate text-warning">품목 미지정</Td>
        : <Td col="type" className="truncate text-content-muted" title={item.typeName}>{item.typeName}</Td>}
      <Td col="qty" align="right">
        {/* 좁으면 단위가 수량 뒤에 — SI 단위만 띄우고 셈 단위는 붙인다(「12 m」·「1대」, §0). */}
        {formatQty(item.qty)}
        {!shows('unit') && <span className={cn(SI_UNITS.has(item.unit) && 'ml-1', 'text-content-muted')}>{item.unit}</span>}
      </Td>
      <Td col="unit" className="text-content-muted">{item.unit}</Td>
      <Td col="unitPrice" align="right" className="text-content-muted">{unitPrice}</Td>
      <Td col="material" align="right">{priced ? formatWon(materialCostOf(item)) : EMPTY}</Td>
      <Td col="labor" className="truncate text-content-muted">{labor}</Td>
      {/* 품목에 공량이 안 적힌 줄 — 셈은 0 으로 하되(합계에 0) 「0.000」으로 숨기지 않는다. */}
      {item.manDaysMissing
        ? <Td col="manDays" align="right" className="text-warning" title="공량 미입력 — 0으로 계산">미입력</Td>
        : <Td col="manDays" align="right">{manDaysText(item.manDays)}</Td>}
    </tr>
  );
}

/** 줄 열쇠 — 같은 id 가 작업을 둘 갖지 않는다(신설·철거·이설은 서로 배타). */
const rowKey = (it: DesignItem) => `${it.target}:${it.id}`;

interface Group {
  id: string;
  name: string;
  /** 이 국이 대표 국인 줄 — 수량·금액이 서는 곳. */
  rows: DesignItem[];
  /** 이 국에도 걸치지만 다른 국 묶음에 실린 줄(두 국 광선로의 B 끝, 국을 옮긴 이설의 옮긴 국) — 참고로만 선다. */
  refs: DesignItem[];
}
type Groups = Group[] | null;

/**
 * 국별 묶음 — 줄은 대표 국(`primarySubstationId`) 묶음에만 수량과 함께 선다. 걸친 다른 국 묶음에는 「어디에 실렸는지」만
 * 흐린 줄로 적는다 — 그 국 묶음만 보는 사람이 빠진 줄로 읽지 않게. 묶음마다 합계는 내지 않는다(두 번 세진다).
 */
function groupBySubstation(items: DesignItem[], nameOf: (id: string) => string): Group[] {
  const groups = new Map<string, Group>();
  const at = (id: string) => {
    let g = groups.get(id);
    if (!g) groups.set(id, (g = { id, name: nameOf(id), rows: [], refs: [] }));
    return g;
  };
  for (const it of items) {
    at(it.primarySubstationId).rows.push(it);
    for (const id of it.substationIds) if (id !== it.primarySubstationId) at(id).refs.push(it);
  }
  return [...groups.values()].sort((a, b) => compareName(a.name, b.name));
}

/** 묶음 이름 — 대표 국의 묶음은 늘 있다(줄이 거기 실린다). */
const groupName = (groups: Group[], id: string) => groups.find((g) => g.id === id)?.name ?? id;

/** 인쇄 중 표시 — `<html>` 에 단다. 인쇄 CSS 는 이 표시가 있을 때만 앱 화면을 걷는다(앱의 다른 인쇄를 비우지 않게). */
export const PRINTING_CLASS = 'design-printing';
/** `afterprint` 가 오지 않는 브라우저를 위한 걷기 — 인쇄 CSS 만 거는 표시라 화면에는 흔적이 없다. */
const PRINT_FALLBACK_MS = 10_000;

/** 설계서만 종이에 — 표시를 달고 인쇄한 뒤 `afterprint`(또는 시간)에 걷는다. */
export function printDesign(): void {
  const root = document.documentElement;
  root.classList.add(PRINTING_CLASS);
  let finished = false;
  const done = () => {
    if (finished) return; // afterprint 와 예비 시한 중 먼저 온 쪽만 — 다음 인쇄의 클래스를 걷지 않게
    finished = true;
    root.classList.remove(PRINTING_CLASS);
    window.removeEventListener('afterprint', done);
    clearTimeout(timer);
  };
  /* 시한은 print() 전에 건다 — Chromium 은 print() 안에서 afterprint 를 쏘므로 뒤에 걸면 지울 수 없다. */
  const timer = setTimeout(done, PRINT_FALLBACK_MS);
  window.addEventListener('afterprint', done);
  window.print();
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
  const notice = unpriced && <MessageStrip tone="info">수정 사항(길이·품목 등)은 산출하지 않습니다</MessageStrip>;
  /* 문서 창 제목은 「<문서> — <범위>」(CONVENTIONS §1.8) — 어느 변전소의 설계서인지 제목이 말한다. */
  const scope = groups.length === 0 ? null : groups.length === 1 ? groups[0]!.name : `${groups[0]!.name} 외 ${groups.length - 1}개 변전소`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={scope ? `설계서 — ${scope}` : '설계서'}
      size={empty ? 'md' : '2xl'}
      footer={(
        <>
          {/* 인쇄는 브라우저 인쇄 하나다 — 인쇄용 문서(아래 `DesignPrint`)만 종이에 서고 화면 크롬은 인쇄 CSS 가 걷는다. */}
          {!empty && catalog.data && <Button variant="secondary" size="sm" onClick={printDesign}>인쇄</Button>}
          <Button variant="secondary" size="sm" onClick={onClose}>닫기</Button>
        </>
      )}
    >
      {!catalog.data ? (
        <p className="text-sm text-content-muted">불러오는 중…</p>
      ) : empty ? (
        <div className="flex flex-col gap-3">
          <EmptyRow>산출할 항목이 없습니다</EmptyRow>
          {notice}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[minmax(0,1fr)_26rem] min-[1400px]:grid-cols-[minmax(0,1fr)_28rem]">
          <ItemsColumn items={items} groups={grouped ? groups : null} report={report} notice={notice} laborName={laborName} />
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
 * 산출 내역 — 길면 여기만 (세로로) 구른다. 머리글과 합계 줄은 붙어 있다. 상자가 좁아지면 열이 순위대로 병합·숨는다
 * (`ITEM_COLUMNS`) — 가로로 구르지 않는다.
 */
function ItemsColumn({ items, groups, report, notice, laborName }: {
  items: DesignItem[];
  /** 국이 둘 이상일 때만 — 하나면 묶음 머리를 세우지 않는다. */
  groups: Groups;
  report: Report;
  notice: ReactNode;
  laborName: (code: string | null) => string | null;
}) {
  return (
    <div className={cn(COLUMN_H, 'min-w-0 overflow-y-auto overflow-x-hidden')}>
      <div className="flex min-w-0 flex-col gap-3">
        <ItemsTable items={items} groups={groups} report={report} laborName={laborName} sticky />
        {notice}
      </div>
    </div>
  );
}

type Report = ReturnType<typeof computeReport>;

/** 사는 줄(신설)인데 자재단가가 없는 줄 — 재료비 합계에 0 으로 들어간다. */
const unpricedCount = (items: DesignItem[]) => items.filter((it) => WORK[it.kind] === INSTALL && it.unitPrice == null).length;
/** 품목에 공량이 안 적힌 줄 — 공량 합계에 0 으로 들어간다. */
const manDaysMissingCount = (items: DesignItem[]) => items.filter((it) => it.manDaysMissing).length;

/**
 * 산출 내역 표 — 화면과 인쇄가 같은 표를 쓴다. 화면은 머리·합계 줄이 붙어 있고(`sticky`), 인쇄는 줄이 쪽을 넘으면
 * 머리줄이 쪽마다 다시 선다(`thead` = table-header-group, 제목 줄 「산출 내역」도 그 안에 있다).
 */
function ItemsTable({ items, groups, report, laborName, sticky = false, title, columns = ITEM_COLUMNS, tier }: {
  items: DesignItem[];
  groups: Groups;
  report: Report;
  laborName: (code: string | null) => string | null;
  sticky?: boolean;
  /** 표 제목 줄 — 인쇄에서만(화면은 상자 제목이 말한다). */
  title?: string;
  columns?: readonly TableColumn[];
  /** 인쇄는 늘 전 열(`wide`). */
  tier?: TableTier;
}) {
  const unpriced = unpricedCount(items);
  const noManDays = manDaysMissingCount(items);
  return (
    <TableCard columns={columns} tier={tier}>
      <thead className={cn(sticky && 'sticky top-0 z-sticky')}>
        {title && <TableGroupHead title={title} metas={[`${items.length}건`]} />}
        <tr>
          <Th col="kind">구분</Th>
          <Th col="target">대상</Th>
          <Th col="kindTarget">구분 · 대상</Th>
          <Th col="name">이름</Th>
          <Th col="type">품목</Th>
          <Th col="qty" align="right">수량</Th>
          <Th col="unit">단위</Th>
          <Th col="unitPrice" align="right" unit="원">자재단가</Th>
          <Th col="material" align="right" unit="원">재료비</Th>
          <Th col="labor">노무유형</Th>
          <Th col="manDays" align="right" unit="인">공량</Th>
        </tr>
      </thead>
      {groups ? (
        groups.map((g) => (
          <tbody key={g.id} data-testid="design-group">
            <TableGroupHead title={g.name} metas={[`${g.rows.length}건`]} />
            {g.rows.map((it) => <ItemRow key={rowKey(it)} item={it} laborName={laborName} />)}
            {g.refs.map((it) => (
              <TableSubHead
                key={`ref:${rowKey(it)}`} data-testid="design-ref"
                name={`${TARGET[it.target]} ${it.name}`} meta={`${groupName(groups, it.primarySubstationId)} 묶음에 포함`}
              />
            ))}
          </tbody>
        ))
      ) : (
        <tbody>
          {items.map((it) => <ItemRow key={rowKey(it)} item={it} laborName={laborName} />)}
        </tbody>
      )}
      {/* 합계는 평평한 목록에서 — 묶음 소계를 더하지 않는다(두 국에 걸친 줄이 두 번 세진다). */}
      <tfoot className={cn(sticky && 'sticky bottom-0 bg-surface')}>
        <TotalRow items={items} unpriced={unpriced} noManDays={noManDays} report={report} />
      </tfoot>
    </TableCard>
  );
}

/** 합계 줄 — 재료비·공량 칸 아래에 선다(앞 칸 수는 지금 서는 열에서 센다). */
function TotalRow({ items, unpriced, noManDays, report }: { items: DesignItem[]; unpriced: number; noManDays: number; report: Report }) {
  const { shows } = useTableLayout();
  const lead = ['kind', 'target', 'kindTarget', 'name', 'type', 'qty', 'unit', 'unitPrice'].filter(shows).length;
  return (
        <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
          {/* 0 으로 셈한 줄의 수는 「합계」 곁에 — 좁은 수 칸 밑에 두면 줄이 꺾인다. */}
          <Td colSpan={lead}>
            <span className="flex flex-wrap items-baseline">
              <span>합계 {items.length}건</span>
              {unpriced > 0 && <span className="ml-3 text-xs font-normal text-warning" data-testid="design-unpriced">자재단가 미입력 {unpriced}건</span>}
              {noManDays > 0 && <span className="ml-3 text-xs font-normal text-warning" data-testid="design-mandays-missing">공량 미입력 {noManDays}건</span>}
            </span>
          </Td>
          <Td align="right" data-testid="design-material-total">{formatWon(report.totalMaterialCost)}</Td>
          <Td col="labor" />
          <Td align="right" data-testid="design-mandays-total">{manDaysText(report.totalManDays)}</Td>
        </tr>
  );
}

/**
 * 공사비 셈 — 산출 조건(공사기간·계약방법·산재보험료 기준) 상태와 그로부터 낸 금액. 화면의 공사비 칸과 인쇄가
 * 같은 값을 읽는다(인쇄가 따로 셈하면 종이와 화면이 갈린다).
 */
/** 산출 조건 — 사람이 적는 넷. 이 브라우저 세션 동안 남는다(상자를 다시 열어도 처음으로 돌아가지 않는다). */
interface Conditions {
  name: string;
  days: string;
  contract: EstimateParams['contract'];
  sanjae: EstimateParams['sanjaeBasis'];
}
const CONDITIONS_KEY = 'design-conditions';
const DEFAULT_CONDITIONS: Conditions = { name: '', days: '30', contract: '경쟁', sanjae: '한전' };

/** 세션 저장소는 막혀 있을 수 있다(사생활 보호 창 등) — 못 읽으면 처음 값, 못 쓰면 이 화면에서만 남는다. */
function readConditions(): Conditions {
  try {
    const raw = window.sessionStorage.getItem(CONDITIONS_KEY);
    if (!raw) return DEFAULT_CONDITIONS;
    const v = JSON.parse(raw) as Partial<Conditions>;
    return {
      name: typeof v.name === 'string' ? v.name : DEFAULT_CONDITIONS.name,
      days: typeof v.days === 'string' ? v.days : DEFAULT_CONDITIONS.days,
      contract: v.contract === '수의' ? '수의' : '경쟁',
      sanjae: v.sanjae === '조달청' ? '조달청' : '한전',
    };
  } catch {
    return DEFAULT_CONDITIONS;
  }
}

function useConditions() {
  const [c, setC] = useState(readConditions);
  useEffect(() => {
    try { window.sessionStorage.setItem(CONDITIONS_KEY, JSON.stringify(c)); } catch { /* 이 화면에서만 남는다 */ }
  }, [c]);
  const set = <K extends keyof Conditions>(key: K) => (value: Conditions[K]) => setC((prev) => ({ ...prev, [key]: value }));
  return { ...c, setName: set('name'), setDays: set('days'), setContract: set('contract'), setSanjae: set('sanjae') };
}

function useDesignEstimate(items: DesignItem[], report: Report) {
  const catalog = useCatalog();
  const wages = useWageCatalog();
  const overhead = catalog.data?.overheadStandard ?? null;
  const wageReady = wages.rows.length > 0;
  const { name, setName, days, setDays, contract, setContract, sanjae, setSanjae } = useConditions();

  /* 노무유형별 공량·노무비와 직접노무비 — 셈과 반올림은 core(`laborCosts`) 한 곳이다. */
  const { rows: laborRows, directLaborCost } = useMemo(
    () => laborCosts(report.byLaborType, wages.wageOf, wages.nameOf), [report, wages]);
  /* 노임이 없는 줄은 0 으로 세고 몇 건인지 말한다. */
  const missingWage = items.filter((it) => it.manDays > 0 && wages.wageOf(it.laborCode) == null).length;
  const unpriced = unpricedCount(items);
  const noManDays = manDaysMissingCount(items);

  const unassigned = items.filter((it) => it.laborCode == null);
  const unassignedManDays = unassigned.reduce((n, it) => n + it.manDays, 0);
  const materialCost = report.totalMaterialCost;
  const band = sizeBand(materialCost + directLaborCost);

  const missing = [!wageReady && '노임단가', !overhead && '제비율'].filter(Boolean).join('·');
  const rates = overhead as unknown as OverheadRates | null;
  /* 공사기간은 1 이상의 정수(일) — 비었거나 잘못 적었으면 0 으로 셈하지 않고 막는다. */
  const daysText = days.replace(/,/g, '').trim();
  const daysValue = /^\d+$/.test(daysText) && Number(daysText) > 0 ? Number(daysText) : null;
  const daysIssue = daysValue == null ? '1 이상의 일수를 입력하세요' : null;
  const est = !missing && rates && daysValue != null
    ? computeEstimate({ materialCost, directLaborCost }, rates, { days: daysValue, contract, sanjaeBasis: sanjae })
    : null;
  /* 화면은 할 일을 말하고, 종이는 사실만 적는다(종이에서 「업로드하세요」는 할 수 없는 말이다). */
  const blocked = missing
    ? { screen: `${missing} 기준정보 미등록 — 기준정보에서 업로드하세요`, paper: `${missing} 미등록 — 공사비 미산출` }
    : { screen: '공사기간 입력 오류 — 1 이상의 일수를 입력하세요', paper: '공사기간 미입력 — 공사비 미산출' };

  return {
    wages, wageReady, overhead, rates, name, setName, days, setDays, daysIssue, daysValue, contract, setContract, sanjae, setSanjae,
    materialCost, directLaborCost, laborRows, missingWage, unpriced, noManDays, band, est, blocked, unassigned, unassignedManDays,
  };
}
type DesignEstimate = ReturnType<typeof useDesignEstimate>;

/**
 * 오른쪽 칸 — 산출 조건 · 노무유형별 공량 · 공사비.
 *
 * 사람이 입력하는 것은 공사기간·계약방법·산재보험료 기준 셋뿐이다. 공사규모는 직접공사비가 정하고,
 * 요율은 기준정보(제비율)가 준다 — 기준정보가 없으면 금액을 0 으로 보이지 않고 막는다(판정 불가 ≠ 0).
 */
function CostColumn({ report, e }: { report: Report; e: DesignEstimate }) {
  const { wages, wageReady, overhead, name, setName, days, setDays, daysIssue, contract, setContract, sanjae, setSanjae, materialCost, directLaborCost, band } = e;
  return (
    <>
      <DetailCard>
        <DetailCardHeader title="산출 조건" />
        <DetailRow label="공사명">
          <Input size="sm" value={name} onChange={(e) => setName(e.currentTarget.value)} />
        </DetailRow>
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
          hint={wageReady ? `직접공사비 ${formatWon(materialCost + directLaborCost)}원 기준 · 자동 적용` : '노임단가 미등록 — 재료비만 반영'}
        >
          {band}
        </DetailRow>
        <DetailRow label="기준">
          <span title={[wages.effective, overhead?.effective].filter(Boolean).join(' · ') || undefined}>
            {`노임단가 ${wages.effective ? formatSourceDate(wages.effective) : '미등록'} · 제비율 ${overhead?.effective ? formatSourceDate(overhead.effective) : '미등록'}`}
          </span>
        </DetailRow>
      </DetailCard>

      <LaborTable report={report} e={e} />

      <CostTable e={e} sticky />
    </>
  );
}

/**
 * 노무유형별 공량 표 — 화면과 인쇄가 같은 표(현장 설계서에도 공량 집계가 선다). 노무비 열의 합이 직접노무비다 —
 * 공사비 표의 직접노무비를 여기서 더해 볼 수 있다.
 */
function LaborTable({ report, e, paper = false }: { report: Report; e: DesignEstimate; paper?: boolean }) {
  const { wageReady, laborRows, directLaborCost, unassigned, unassignedManDays } = e;
  return (
    <TableCard widths={[100, '84px', '108px', '104px']} className={cn(paper && 'break-inside-avoid')}>
      <thead>
        <TableGroupHead colSpan={4} title="노무유형별 공량" />
        <tr>
          <Th>노무유형</Th>
          <Th align="right" unit="인">공량</Th>
          <Th align="right" unit="원/일">노임단가</Th>
          <Th align="right" unit="원">노무비</Th>
        </tr>
      </thead>
      <tbody>
        {laborRows.map((r) => (
          <tr key={r.laborCode} className={TABLE_ROW}>
            <Td className="truncate" title={r.name}>{r.name}</Td>
            <Td align="right">{manDaysText(r.manDays)}</Td>
            {r.wage == null
              ? <Td align="right" className="text-warning">미등록</Td>
              : <Td align="right">{formatWon(r.wage)}</Td>}
            <Td align="right">{r.cost == null ? EMPTY : formatWon(r.cost)}</Td>
          </tr>
        ))}
        {unassigned.length > 0 && (
          <tr className={TABLE_ROW}>
            <Td className="truncate text-warning">노무유형 미지정 {unassigned.length}건</Td>
            <Td align="right">{manDaysText(unassignedManDays)}</Td>
            <Td align="right" className="text-content-muted">{EMPTY}</Td>
            <Td align="right" className="text-content-muted">{EMPTY}</Td>
          </tr>
        )}
        <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
          <Td>총공량</Td>
          <Td align="right">{manDaysText(report.totalManDays)}</Td>
          <Td />
          <Td align="right" data-testid="design-labor-total">{wageReady ? formatWon(directLaborCost) : EMPTY}</Td>
        </tr>
      </tbody>
    </TableCard>
  );
}

/** 총공사비 옆에 서는 사정 — 0 으로 셈한 것이 몇 건인가. 없으면 아무것도 서지 않는다. */
function CostFlags({ e }: { e: DesignEstimate }) {
  const flags = [
    e.missingWage > 0 && `노무비 미반영 ${e.missingWage}건`,
    e.unpriced > 0 && `자재단가 미입력 ${e.unpriced}건`,
    e.noManDays > 0 && `공량 미입력 ${e.noManDays}건`,
  ].filter((f): f is string => !!f);
  return flags.map((f) => <span key={f} className="block text-warning">{f}</span>);
}

/**
 * 공사비 표(원가계산서) — 화면과 인쇄가 같은 표. 화면은 총공사비 줄이 붙어 있다(`sticky`).
 *
 * 차례는 원가계산서 그대로다: 재료비 → 노무비(직접·간접 → 계) → 경비(… → 계) → 순공사원가 → 일반관리비 → 이윤 →
 * 총원가(공급가액) → 부가가치세 → 총공사비. 소계는 `computeEstimate` 가 낸 값을 읽기만 한다.
 */
function CostTable({ e, sticky = false, paper = false }: { e: DesignEstimate; sticky?: boolean; paper?: boolean }) {
  const { est, rates, materialCost, directLaborCost, wageReady, blocked } = e;
  /* 율은 제 열에 선다 — 「근거 × 율」 한 칸이면 모수가 긴 줄에서 정작 율이 잘린다. 열 안의 자릿수는 하나로(「10.0%」 옆 「3.21%」가 아니게). */
  const digits = est ? percentDigits([rates?.byDuration.간접노무비[est.sizeBand][est.durationBand], ...est.expenses.map((x) => x.rate), est.overheadAdmin.rate, est.profit.rate, 0.1]) : 0;
  return (
    /* 종이에서는 원가계산서가 쪽에 걸쳐 갈리지 않는다 — 남은 자리가 모자라면 새 쪽에서 시작한다. */
    <TableCard widths={['140px', 100, '80px', '120px']} className={cn(paper && 'break-inside-avoid')}>
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
        <CostRow digits={digits} label="재료비" basis="수량 × 자재단가" amount={est?.materialCost ?? materialCost} />
        {est ? (
          <>
            <CostRow digits={digits} label="직접노무비" basis="공량 × 노임단가" amount={est.directLaborCost} />
            <CostRow
              digits={digits} label="간접노무비"
              basis="직접노무비" rate={rates!.byDuration.간접노무비[est.sizeBand][est.durationBand]}
              amount={est.indirectLaborCost}
            />
            <CostRow digits={digits} label="노무비 계" basis="직접노무비+간접노무비" amount={est.laborCost} total />
            {est.expenses.map((x) => <CostRow digits={digits} key={x.label} label={x.label} basis={x.basis} rate={x.rate} amount={x.amount} />)}
            <CostRow digits={digits} label="경비 계" basis="" amount={est.expenseTotal} total />
            <CostRow digits={digits} label="순공사원가" basis="재료비+노무비+경비" amount={est.netCost} total />
            <CostRow digits={digits} label={est.overheadAdmin.label} basis={est.overheadAdmin.basis} rate={est.overheadAdmin.rate} amount={est.overheadAdmin.amount} />
            <CostRow digits={digits} label={est.profit.label} basis={est.profit.basis} rate={est.profit.rate} amount={est.profit.amount} />
            <CostRow digits={digits} label="총원가(공급가액)" basis="순공사원가+일반관리비+이윤" amount={est.subtotal} total />
            <CostRow digits={digits} label="부가가치세" basis="공급가액" rate={0.1} amount={est.vat} />
          </>
        ) : (
          <>
            {/* 제비율이 없어도 노임단가가 있으면 직접노무비까지는 낸다 — 그 뒤가 막힌다. */}
            {wageReady && <CostRow digits={digits} label="직접노무비" basis="공량 × 노임단가" amount={directLaborCost} />}
            <tr className={TABLE_ROW}>
              <Td colSpan={4} className="text-warning" data-testid="design-blocked">
                {paper ? blocked.paper : blocked.screen}
              </Td>
            </tr>
          </>
        )}
      </tbody>
      {/* 결론 줄은 굴러도 남는다 — 총공사비를 보려고 경비 열 줄을 지나가게 두지 않는다. */}
      {est && (
        <tfoot className={cn(sticky && 'sticky bottom-0 bg-surface')}>
          <tr className={cn(TABLE_ROW, 'border-t border-line-strong font-semibold')}>
            <Td>총공사비</Td>
            <Td colSpan={2} className="text-xs font-normal" data-testid="design-flags"><CostFlags e={e} /></Td>
            <Td align="right" data-testid="design-total">{formatWon(est.total)}</Td>
          </tr>
        </tfoot>
      )}
    </TableCard>
  );
}

function CostRow({ label, basis, rate, amount, digits, total = false }: { label: string; basis: string; rate?: number | null; amount: number; digits: number; total?: boolean }) {
  return (
    <tr className={cn(TABLE_ROW, total && 'font-semibold')}>
      <Td className="truncate" title={label}>{label}</Td>
      <Td className="truncate text-xs font-normal text-content-faint" title={basis}>{basis}</Td>
      <Td align="right" className="text-content-muted">{rate == null ? '' : formatPercent(rate, digits)}</Td>
      <Td align="right">{formatWon(amount)}</Td>
    </tr>
  );
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
  report: Report;
  e: DesignEstimate;
  laborName: (code: string | null) => string | null;
  substationName: (id: string) => string;
}) {
  const places = [...new Set(items.flatMap((it) => it.substationIds))].map(substationName).sort(compareName);
  const conditions = e.daysValue == null
    ? `공사기간 미입력 · 계약방법 ${e.contract} · 산재보험료 ${e.sanjae} 기준`
    : `공사기간 ${e.daysValue}일 · 계약방법 ${e.contract} · 산재보험료 ${e.sanjae} 기준`;
  return createPortal(
    <section data-design-print aria-label="설계서 인쇄본" className="flex flex-col gap-3 bg-surface text-content">
      <h1 className="text-sm font-semibold" data-design-print-title>설계서</h1>
      <DetailCard>
        <DetailRow label="공사명" wide>{e.name.trim() || '(공사명 미입력)'}</DetailRow>
        <DetailRow label="대상 변전소" wide>{places.join(' · ')}</DetailRow>
        <DetailRow label="작성일" wide>{today()}</DetailRow>
        <DetailRow label="기준" wide>{`노임단가 ${e.wages.effective ? formatSourceDate(e.wages.effective) : '미등록'} · 제비율 ${e.overhead?.effective ? formatSourceDate(e.overhead.effective) : '미등록'}`}</DetailRow>
        <DetailRow label="산출 조건" wide>{conditions}</DetailRow>
      </DetailCard>
      <ItemsTable title="산출 내역" columns={PRINT_COLUMNS} tier="wide" items={items} groups={groups} laborName={laborName} report={report} />
      <LaborTable report={report} e={e} paper />
      <CostTable e={e} paper />
    </section>,
    document.body,
  );
}
