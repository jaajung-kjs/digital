import { Trash2 } from 'lucide-react';
import { CORE_ROLES, CORE_STATUSES, DEFAULT_CORE_STATUS, type CoreRole, type CoreStatus, type LinkEndRef, type SheetBlock, type SheetRow } from '@twin/core';
import { Button, EMPTY, IconButton, StatusDot, TABLE_ROW, TableCard, Td, Th, cn, formatDate } from '../../../components/ui';
import type { Core } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';

/**
 * 코어 · 어댑터 · 자국 연결 · 대국 연결 · 상태 · 주/예비 · 용도 · 비고 · 1310 · 1550 · 거리 · 측정일.
 * 내용 폭이 정해진 열은 px, 이름 열(자국·대국·용도·비고)은 남은 폭을 29 : 29 : 27 : 15 로 나눈다 — 1280 에서 자국·대국 칸에 「PTP 춘천-북춘천」이 통째로 든다.
 */
const WIDTHS = ['40px', '52px', 29, 29, '88px', '64px', 27, 15, '60px', '60px', '60px', '96px'] as const;
const COLS = WIDTHS.length;
/**
 * 고정 머리 칸의 바닥선은 **테두리가 아니라 그림자**다 — 겹친 테두리(collapse)는 표가 제자리에 그리므로
 * sticky 머리를 따라오지 않고, 그 반 픽셀 틈으로 아래를 지나가는 줄의 글자 윗동이 비쳤다.
 */
const HEAD = 'border-b-0 shadow-[inset_0_-1px_0_rgb(var(--border-2-rgb))]';

const statusLabel = (v: string) => CORE_STATUSES.find((c) => c.value === v)?.label ?? v;
const num = (v: number | null) => (v == null ? EMPTY : String(v));

export interface BlockHead {
  /** 단자 · 슬롯 · 어댑터 범위 — 단자가 비면 「단자 미지정」. */
  title: string;
  peer: string;
  lineName: string | null;
  length: string | null;
  cable: string | null;
}

export interface LineBlockProps {
  block: SheetBlock;
  head: BlockHead;
  focused: boolean;
  /** 상세 패널에 열린 설비 — 그 설비에 이어진 자국 연결 칸을 칠한다. */
  selectedEquipmentId: string | null;
  /** 끝 이름(`endLabel`). */
  label: (ref: LinkEndRef) => string;
  onSelectEquipment: (id: string) => void;
  onConnect: (from: LinkEndRef) => void;
  onUnlink: (linkId: string, target: string) => void;
  onUpdateCore: (no: number, patch: Partial<Core>) => void;
  onFocus: () => void;
  /** 측정 입력(Task 5) · 편집(Task 4) · 코어 측정 이력(Task 5) — 주지 않으면 단추가 잠긴다. */
  onMeasure?: () => void;
  onEdit?: () => void;
  onOpenCore?: (no: number) => void;
}

/** 자국 연결 칸에서 누를 설비 — 설비·차단기 끝이면 그 설비, 코어 끝(점퍼)이면 없음. */
const equipmentOf = (ref: LinkEndRef): string | null => (ref.kind === 'core' ? null : ref.equipmentId);

/**
 * 선번장 블록 하나 — 한 광선로의 **이 국 쪽 끝**(단자 · 슬롯). 머리 한 줄 + 코어 표.
 *
 * 머리는 표의 머리(`thead`)에 함께 든다 — 48심 블록을 굴려 내려가도 「어느 블록의 몇 번 열인가」가
 * 함께 남는다(고정 머리글, §1.7-b).
 */
export function LineBlock({
  block, head, focused, selectedEquipmentId, label, onSelectEquipment, onConnect, onUnlink, onUpdateCore, onFocus, onMeasure, onEdit, onOpenCore,
}: LineBlockProps) {
  const purposeField = block.side === 'A' ? 'aPurpose' : 'bPurpose';
  const noteField = block.side === 'A' ? 'aNote' : 'bNote';
  const text = (r: SheetRow, field: 'aPurpose' | 'bPurpose' | 'aNote' | 'bNote', current: string | null, name: string, muted: boolean, title?: string) => (
    <InlineEditCell
      value={current ?? ''} label={name} muted={muted} title={title}
      onCommit={(raw) => { const next = raw.trim() || null; if (next !== current) onUpdateCore(r.no, { [field]: next }); }}
    />
  );

  return (
    <section
      data-testid="sheet-block" data-line={block.lineId} data-side={block.side}
      aria-label={head.title}
      aria-current={focused ? 'true' : undefined}
      /* 표가 우선이다 — 상세 패널이 서서 판이 좁아져도 열을 짓누르지 않고(수가 옆 칸으로 넘친다) 판이
         가로로 구른다. 1280 에서 패널이 닫혀 있으면 이 폭이 판 안에 든다. */
      className={cn('min-w-[940px] scroll-mt-4', focused && 'outline outline-2 outline-primary')}
    >
      <TableCard widths={WIDTHS}>
        <thead className="sticky top-0 z-sticky bg-surface-2">
          <tr>
            {/* 머리글 칸은 말줄임 감싸개 없이(`bare`) — 단추 묶음이 `sticky right-0` 으로 판 오른쪽에 남아야 한다. */}
            <Th colSpan={COLS} bare className={HEAD}>
              <span data-testid="sheet-block-head" className="flex min-w-0 items-center gap-3">
                <button type="button" className="min-w-0 shrink-0 truncate text-left text-sm font-semibold text-content hover:text-primary" onClick={onFocus}>
                  {head.title}
                </button>
                <span className="shrink-0 font-semibold text-content">↔ {head.peer}</span>
                {([['name', head.lineName], ['length', head.length], ['cable', head.cable]] as const).filter(([, t]) => t).map(([k, t]) => (
                  <span key={k} className="min-w-0 truncate font-normal text-content-muted" title={t!}>{t}</span>
                ))}
                <span className="sticky right-0 ml-auto flex shrink-0 items-center gap-1 bg-surface-2 pl-2">
                  <Button variant="secondary" size="xs" disabled={!onMeasure} onClick={onMeasure}>측정 입력</Button>
                  <Button variant="secondary" size="xs" disabled={!onEdit} onClick={onEdit}>편집</Button>
                </span>
              </span>
            </Th>
          </tr>
          <tr>
            <Th className={HEAD} align="right">코어</Th>
            <Th className={HEAD} align="right">어댑터</Th>
            <Th className={HEAD}>자국 연결</Th>
            <Th className={HEAD}>대국 연결</Th>
            <Th className={HEAD}>상태</Th>
            <Th className={HEAD}>주/예비</Th>
            <Th className={HEAD}>용도</Th>
            <Th className={HEAD}>비고</Th>
            {/* 단위는 머리글 아랫줄(§1.7-g) — 수 칸 폭에 「1310 dB」가 한 줄로 들지 않는다. */}
            <Th className={HEAD} align="right" unit="dB" title="1310 nm 손실">1310</Th>
            <Th className={HEAD} align="right" unit="dB" title="1550 nm 손실">1550</Th>
            <Th className={HEAD} align="right" unit="km" title="1550 거리(없으면 1310)">거리</Th>
            <Th className={HEAD}>측정일</Th>
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r) => {
            const bad = r.status !== DEFAULT_CORE_STATUS;
            const near = r.near ? label(r.near) : null;
            const nearEq = r.near ? equipmentOf(r.near) : null;
            const far = r.far ? label(r.far) : null;
            const m = r.latest;
            const dist = m ? (m.dist1550 ?? m.dist1310) : null;
            return (
              <tr key={r.no} data-testid={`sheet-row-${r.no}`} className={cn(TABLE_ROW, 'group', bad && 'text-content-faint')}>
                <Td align="right" data-col="no">
                  {onOpenCore
                    ? <button type="button" className="w-full rounded px-1 text-right hover:text-primary" aria-label={`코어 ${r.no} 측정 이력`} onClick={() => onOpenCore(r.no)}>{r.no}</button>
                    : r.no}
                </Td>
                <Td align="right" data-col="jack" className="text-content-muted">{r.jack}</Td>
                {/* 지우개는 이름 위에 떠서 드러난다 — 자리를 잡아 두면 그만큼 이름이 잘린다(호버에서만 보이므로 떨림도 없다). */}
                <Td data-col="near" className="relative">
                  {near != null ? (
                    <>
                      {nearEq
                        ? <button type="button" className={cn('block w-full truncate text-left hover:text-primary hover:underline', nearEq === selectedEquipmentId && 'font-medium text-primary')} title={near} onClick={() => onSelectEquipment(nearEq)}>{near}</button>
                        : <span className="block truncate" title={near}>{near}</span>}
                      <IconButton
                        size="sm" tone="danger" aria-label="연결 지우기" title="연결 지우기"
                        className="absolute right-1 top-1/2 -translate-y-1/2 bg-surface opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                        onClick={() => onUnlink(r.nearLinkId!, near)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </>
                  ) : (
                    <span className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                      <Button variant="secondary" size="xs" onClick={() => onConnect({ kind: 'core', lineId: block.lineId, no: r.no, side: block.side })}>잇기</Button>
                    </span>
                  )}
                </Td>
                <Td data-col="far" className={cn('truncate', !bad && 'text-content-muted')} title={far ?? undefined}>{far ?? EMPTY}</Td>
                <Td data-col="status">
                  <InlineEditCell
                    value={r.status} label="상태" choices={CORE_STATUSES} required
                    /* 점 칸은 한 줄 높이(h-5)에 가둔다 — 기준선에 맞추면 그 줄만 2px 부푼다(코어 줄은 눈으로 센다). */
                    format={(v) => (v === DEFAULT_CORE_STATUS ? <span className="text-content-muted">{statusLabel(v)}</span> : <span className="flex h-5 items-center"><StatusDot status="warning">{statusLabel(v)}</StatusDot></span>)}
                    onCommit={(v) => { if (v !== r.status) onUpdateCore(r.no, { status: v as CoreStatus }); }}
                  />
                </Td>
                <Td data-col="role">
                  <InlineEditCell
                    value={r.role ?? ''} label="주/예비" choices={CORE_ROLES} muted={bad}
                    onCommit={(v) => { const next = (v || null) as CoreRole | null; if (next !== r.role) onUpdateCore(r.no, { role: next }); }}
                  />
                </Td>
                {(() => {
                  /* 상대 끝 용도는 참고일 뿐 — 칸의 title 에만 선다(고치는 것은 이 끝의 용도). */
                  const peer = r.peerPurpose ? `상대 끝 용도: ${r.peerPurpose}` : undefined;
                  return (
                    <Td data-col="purpose" title={peer}>
                      {text(r, purposeField, r.purpose, '용도', bad, [r.purpose, peer].filter(Boolean).join('\n') || undefined)}
                    </Td>
                  );
                })()}
                <Td data-col="note">{text(r, noteField, r.note, '비고', bad)}</Td>
                <Td align="right" data-col="loss1310">{num(m?.loss1310 ?? null)}</Td>
                <Td align="right" data-col="loss1550">{num(m?.loss1550 ?? null)}</Td>
                <Td align="right" data-col="dist">{num(dist)}</Td>
                <Td data-col="measuredOn" className="whitespace-nowrap tabular-nums">{m?.measuredOn ? formatDate(m.measuredOn) : EMPTY}</Td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </section>
  );
}
