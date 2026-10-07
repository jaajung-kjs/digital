import { Route, Trash2 } from 'lucide-react';
import { CORE_ROLES, CORE_STATUSES, DEFAULT_CORE_STATUS, type CoreRole, type CoreStatus, type LinkEndRef, type SheetBlock, type SheetRow } from '@twin/core';
import {
  Button, EMPTY, HOVER_REVEAL, IconButton, StatusDot, TABLE_ROW, TableCard, TableGroupHead, TableGroupHeadButton, Td, Th, cn, formatDate,
} from '../../../components/ui';
import type { Core } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';

/**
 * 코어 · 어댑터 · 자국 연결 · 대국 연결 · 상태 · 주/예비 · 용도 · 비고 · 1310 · 1550 · 거리 · 측정일.
 * 내용 폭이 정해진 열은 px, 이름 열(자국·대국·용도·비고)은 남은 폭을 30 : 23 : 27 : 20 으로 나눈다.
 * 비고는 단선 코어의 사정(「3번 단선 — 접속함 확인 요망」)을 적는 자리라 가장 좁으면 안 된다 — 폭은 대국(상대 끝,
 * 참고로 읽는 칸)에서 덜어 온다. 거리 칸은 1310 으로 물러선 값에 「(1310)」이 붙어도 들게 둔다.
 */
const WIDTHS = ['40px', '52px', 30, 23, '88px', '64px', 27, 20, '60px', '60px', '100px', '96px'] as const;
const COLS = WIDTHS.length;
/**
 * 고정 머리 칸의 바닥선은 **테두리가 아니라 그림자**다 — 겹친 테두리(collapse)는 표가 제자리에 그리므로
 * sticky 머리를 따라오지 않고, 그 반 픽셀 틈으로 아래를 지나가는 줄의 글자 윗동이 비쳤다.
 */
const HEAD = 'border-b-0 shadow-[inset_0_-1px_0_rgb(var(--border-2-rgb))]';

const statusLabel = (v: string) => CORE_STATUSES.find((c) => c.value === v)?.label ?? v;
const num = (v: number | null) => (v == null ? EMPTY : String(v));

export interface BlockHead {
  /** 단자 · 슬롯 · 어댑터 범위 — 단자가 비면 「단자 미지정」(블록의 이름, aria-label). */
  title: string;
  /** 단자 설비 이름 — 없으면(단자 미지정) null. 누르면 그 설비 상세로 간다. */
  terminal: string | null;
  /** 슬롯 · 어댑터 범위 — 단자가 없으면 null. */
  place: string | null;
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
  /** 블록 측정 입력. */
  onMeasure: () => void;
  /** 광선로 편집(추가와 같은 상자). */
  onEdit: () => void;
  /** 코어 번호 → 측정 이력. */
  onOpenCore: (no: number) => void;
  /** 머리의 단자 이름 → 그 설비 상세(현황). 슬롯에서 선번장으로 온 길을 되돌아가는 문이기도 하다. */
  onOpenEquipment: (equipmentId: string) => void;
  /** 코어 → 중계경로 추적(이 블록의 끝에서). */
  onTrace: (no: number) => void;
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
  block, head, focused, selectedEquipmentId, label, onSelectEquipment, onConnect, onUnlink, onUpdateCore, onFocus, onMeasure, onEdit, onOpenCore, onOpenEquipment, onTrace,
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
          <TableGroupHead
            colSpan={COLS} className={HEAD} data-testid="sheet-block-head"
            title={(
              <>
                {/* 단자 이름은 **그 설비로 가는 길**이다 — 슬롯에서 선번장으로 왔으면 여기로 되돌아간다. 나머지(슬롯·어댑터)는 이 블록을 고른다. */}
                {head.terminal != null && block.equipmentId != null ? (
                  <TableGroupHeadButton variant="link" title={`${head.terminal} 상세 보기`} onClick={() => onOpenEquipment(block.equipmentId!)}>
                    {head.terminal}
                  </TableGroupHeadButton>
                ) : (
                  <TableGroupHeadButton onClick={onFocus}>{head.title}</TableGroupHeadButton>
                )}
                {head.place && (
                  <>
                    <span aria-hidden className="font-normal text-content-faint"> · </span>
                    <TableGroupHeadButton onClick={onFocus}>{head.place}</TableGroupHeadButton>
                  </>
                )}
                <span className="ml-1.5">↔ {head.peer}</span>
              </>
            )}
            metas={[head.lineName, head.length, head.cable]}
            actions={(
              <>
                <Button variant="secondary" size="xs" onClick={onMeasure}>측정 입력</Button>
                <Button variant="secondary" size="xs" onClick={onEdit}>편집</Button>
              </>
            )}
          />
          <tr>
            <Th className={HEAD} align="right">코어</Th>
            <Th className={HEAD} align="right">어댑터</Th>
            <Th className={HEAD}>자국 접속</Th>
            <Th className={HEAD}>대국 접속</Th>
            <Th className={HEAD}>상태</Th>
            <Th className={HEAD}>주/예비</Th>
            <Th className={HEAD}>회선 내역</Th>
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
            /* 중계경로 — 이 코어에 어느 끝이든 연결이 있을 때만(빈 코어는 추적할 사슬이 없다). */
            const trace = (r.near != null || r.far != null) && (
              <IconButton
                size="sm" aria-label={`코어 ${r.no} 중계경로`} title="중계경로"
                className={cn('shrink-0', HOVER_REVEAL)}
                onClick={() => onTrace(r.no)}
              >
                <Route className="h-3.5 w-3.5" />
              </IconButton>
            );
            /* 거리는 1550 이 있으면 그것, 없으면 1310 — 물러선 값은 그렇다고 적는다(같은 칸에 다른 파장이 말없이 섞이지 않게). */
            const dist = m ? (m.dist1550 ?? m.dist1310) : null;
            const distFrom1310 = m != null && m.dist1550 == null && m.dist1310 != null;
            return (
              <tr key={r.no} data-testid={`sheet-row-${r.no}`} className={cn(TABLE_ROW, 'group', bad && 'text-content-faint')}>
                <Td align="right" data-col="no">
                  <button type="button" className="w-full rounded px-1 text-right hover:text-primary" aria-label={`코어 ${r.no} 측정 이력`} onClick={() => onOpenCore(r.no)}>{r.no}</button>
                </Td>
                <Td align="right" data-col="jack" className="text-content-muted">{r.jack}</Td>
                {/* 손잡이(지우개·잇기)는 **제 자리**를 갖는다 — 이름 위에 겹쳐 띄우면 이름 끝을 가리고, 손이 닿아야만
                    보이는 단추는 터치에서 영영 안 보인다(HOVER_REVEAL 이 호버 없는 기기에서는 늘 세운다). */}
                <Td data-col="near">
                  <span className="flex min-w-0 items-center gap-1">
                    {near != null ? (
                      <>
                        {nearEq
                          ? <button type="button" className={cn('min-w-0 flex-1 truncate text-left hover:text-primary hover:underline', nearEq === selectedEquipmentId && 'font-medium text-primary')} title={near} onClick={() => onSelectEquipment(nearEq)}>{near}</button>
                          : <span className="min-w-0 flex-1 truncate" title={near}>{near}</span>}
                        {trace}
                        <IconButton
                          size="sm" tone="danger" aria-label="연결 삭제" title="연결 삭제"
                          className={cn('shrink-0', HOVER_REVEAL)}
                          onClick={() => onUnlink(r.nearLinkId!, near)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconButton>
                      </>
                    ) : (
                      <>
                        {/* 빈 칸은 대국 칸과 같은 「—」 — 빈 모양은 하나다. */}
                        <span className="min-w-0 flex-1 text-content-faint">{EMPTY}</span>
                        {trace}
                        <span className={cn('shrink-0', HOVER_REVEAL)}>
                          <Button variant="secondary" size="xs" onClick={() => onConnect({ kind: 'core', lineId: block.lineId, no: r.no, side: block.side })}>연결</Button>
                        </span>
                      </>
                    )}
                  </span>
                </Td>
                <Td data-col="far" className={cn('truncate', far == null ? 'text-content-faint' : !bad && 'text-content-muted')} title={far ?? undefined}>{far ?? EMPTY}</Td>
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
                  const peer = r.peerPurpose ? `대국 회선 내역: ${r.peerPurpose}` : undefined;
                  return (
                    <Td data-col="purpose" title={peer}>
                      {text(r, purposeField, r.purpose, '회선 내역', bad, [r.purpose, peer].filter(Boolean).join('\n') || undefined)}
                    </Td>
                  );
                })()}
                <Td data-col="note">{text(r, noteField, r.note, '비고', bad)}</Td>
                <Td align="right" data-col="loss1310">{num(m?.loss1310 ?? null)}</Td>
                <Td align="right" data-col="loss1550">{num(m?.loss1550 ?? null)}</Td>
                <Td align="right" data-col="dist" title={distFrom1310 ? '1550 측정값이 없어 1310 거리 표시' : undefined}>
                  {num(dist)}
                  {distFrom1310 && <span className="ml-1 text-xs text-content-faint">(1310)</span>}
                </Td>
                <Td data-col="measuredOn" className="whitespace-nowrap tabular-nums">{m?.measuredOn ? formatDate(m.measuredOn) : EMPTY}</Td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    </section>
  );
}
