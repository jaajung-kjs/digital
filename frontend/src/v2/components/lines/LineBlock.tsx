import { useMemo } from 'react';
import { Route, Trash2 } from 'lucide-react';
import { CORE_ROLES, CORE_STATUSES, DEFAULT_CORE_STATUS, type CoreRole, type CoreStatus, type LinkEndRef, type SheetBlock, type SheetRow } from '@twin/core';
import {
  Button, EMPTY, HOVER_REVEAL, IconButton, StatusDot, TABLE_ROW, TableCard, TableGroupHead, TableGroupHeadButton, Td, Th, cn, formatDate,
  formatMeasure, latestMeasureText,
  type TableColumn,
} from '../../../components/ui';
import type { Core } from '../../model/types';
import { InlineEditCell } from '../InlineEditCell';
import { EditOnly, useCanEdit } from '../../useCanEdit';
import { coreStatusTone } from '../../tones';

/**
 * 코어 · 어댑터 · 자국 접속 · 대국 접속 · 상태 · 주/예비 · 회선 내역 · 비고 · 1310 손실 · 1550 손실 · 거리 · 측정일.
 * 내용 폭이 정해진 열은 px, 글 열(자국·대국·회선 내역·비고)은 남은 폭을 30 · 30 · 30 · 10 으로 나눈다.
 *
 * **단계는 「다 드는가」로 정한다**(§1.7-e2, `minWidth`) — 글 열 셋(자국 200 · 대국 190 · 회선 내역 180)이 읽히는 폭을 먼저
 * 지키고, 들지 않으면 낮은 순위부터 덜어 낸다. 그래서 판이 넓어질수록 글 열이 좁아지는 일이 없다:
 *  - wide: 전 열(측정 넷 · 상태 글자 · 비고).
 *  - mid: 측정 넷 → **「1310/1550 손실(dB)」** 한 열(「-6.435 / -4.420」, 거리·측정일은 칸 title), 상태 → **점만**, 비고 숨김.
 *  - narrow: 그마저 숨고 주/예비·어댑터도 숨는다.
 * 글 열은 어느 단계든 **두 줄까지** 접힌다(몇 글자로 잘리는 대신, 전문은 title).
 * 숨은 값은 코어 번호 단추의 title·접근 이름에 남고, 코어 번호를 누르면 측정 기록 창이 열린다.
 * 블록 안에서 측정이 하나도 없으면 측정 열은 서지 않고(채우는 곳은 측정 등록 창), 어댑터가 코어 번호와 같으면 어댑터 열도 서지 않는다.
 * 주/예비·비고가 블록 안에서 모두 비면: 조회 사용자에게는 서지 않고, 고칠 수 있는 사람에게는 **wide 에서만** 「—」로 선다(그 자리에서 채운다).
 * **수는 자르지 않는다** — 수 열은 제 값이 다 드는 고정 폭이고, 들지 않으면 병합되거나 숨는다.
 */
const COLUMNS: readonly TableColumn[] = [
  { key: 'no', width: '44px' },
  { key: 'jack', width: '60px', priority: 3 },
  { key: 'near', width: 30, minWidth: 200 },
  { key: 'far', width: 30, minWidth: 190 },
  { key: 'status', width: '88px', priority: 2 },
  { key: 'statusDot', width: '44px', merged: true },
  { key: 'role', width: '88px', priority: 3 }, // 「예비회선」이 다 드는 폭
  { key: 'purpose', width: 30, minWidth: 180 },
  { key: 'note', width: 10, minWidth: 100, priority: 2 },
  { key: 'loss1310', width: '104px', priority: 2 },
  { key: 'loss1550', width: '104px', priority: 2 },
  { key: 'dist', width: '96px', priority: 2 },
  { key: 'measuredOn', width: '96px', priority: 2 },
  { key: 'latest', width: '156px', merged: true, priority: 3 },
];
const MEASURE_KEYS = new Set(['loss1310', 'loss1550', 'dist', 'measuredOn', 'latest']);
/**
 * 고정 머리 칸의 바닥선은 **테두리가 아니라 그림자**다 — 겹친 테두리(collapse)는 표가 제자리에 그리므로
 * sticky 머리를 따라오지 않고, 그 반 픽셀 틈으로 아래를 지나가는 줄의 글자 윗동이 비쳤다.
 */
const HEAD = 'border-b-0 shadow-[inset_0_-1px_0_rgb(var(--border-2-rgb))]';

const statusLabel = (v: string) => CORE_STATUSES.find((c) => c.value === v)?.label ?? v;
/** 수 칸 — 빈 값 「—」는 늘 흐리게(같은 표의 다른 빈 칸과 같은 색). */
const numCell = (v: number | null) => (v == null ? <span className="text-content-faint">{EMPTY}</span> : formatMeasure(v));

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
  /** 블록 측정 등록. */
  onMeasure: () => void;
  /** 광선로 수정(추가와 같은 창). */
  onEdit: () => void;
  /** 코어 번호 → 측정 기록. */
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
  const text = (r: SheetRow, field: 'aPurpose' | 'bPurpose' | 'aNote' | 'bNote', current: string | null, name: string, muted: boolean, title?: string, clamp2 = false) => (
    <InlineEditCell
      value={current ?? ''} label={name} muted={muted} title={title} clamp2={clamp2}
      onCommit={(raw) => { const next = raw.trim() || null; if (next !== current) onUpdateCore(r.no, { [field]: next }); }}
    />
  );

  /* 블록 안에 측정이 하나도 없으면 측정 열은 서지 않는다(읽기 전용 열 — 채우는 곳은 측정 등록 창).
     어댑터가 코어 번호와 모두 같으면(1-1, 2-2 …) 어댑터 열도 서지 않는다 — 같은 수를 두 번 읽힐 뿐이다.
     주/예비·비고가 모두 비면 조회 사용자에게는 서지 않고, 고칠 수 있는 사람에게는 wide 에서만 선다(채우는 자리). */
  const canEdit = useCanEdit();
  const noMeasure = block.rows.every((r) => r.latest == null);
  const sameJack = block.rows.every((r) => String(r.jack) === String(r.no));
  const noRole = block.rows.every((r) => !r.role);
  const noNote = block.rows.every((r) => !r.note);
  const columns = useMemo(
    () => COLUMNS.map((c): TableColumn => {
      if ((noMeasure && MEASURE_KEYS.has(c.key)) || (sameJack && c.key === 'jack')) return { ...c, hidden: true };
      if ((noRole && c.key === 'role') || (noNote && c.key === 'note')) return canEdit ? { ...c, priority: 2 } : { ...c, hidden: true };
      return c;
    }),
    [noMeasure, sameJack, noRole, noNote, canEdit],
  );

  return (
    <section
      data-testid="sheet-block" data-line={block.lineId} data-side={block.side}
      aria-label={head.title}
      aria-current={focused ? 'true' : undefined}
      className={cn('scroll-mt-4', focused && 'outline outline-2 outline-primary')}
    >
      <TableCard columns={columns}>
        {({ shows }) => (<>
        <thead className="sticky top-0 z-sticky bg-surface-2">
          <TableGroupHead
            className={HEAD} data-testid="sheet-block-head"
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
              <EditOnly>
                <Button variant="secondary" size="xs" onClick={onMeasure}>측정 등록</Button>
                <Button variant="secondary" size="xs" onClick={onEdit}>광선로 수정</Button>
              </EditOnly>
            )}
          />
          <tr>
            <Th col="no" className={HEAD} align="right">코어</Th>
            <Th col="jack" className={HEAD} align="right">어댑터</Th>
            <Th col="near" className={HEAD}>자국 접속</Th>
            <Th col="far" className={HEAD}>대국 접속</Th>
            <Th col="status" className={HEAD}>상태</Th>
            <Th col="statusDot" className={HEAD}>상태</Th>
            <Th col="role" className={HEAD}>주/예비</Th>
            <Th col="purpose" className={HEAD}>회선 내역</Th>
            <Th col="note" className={HEAD}>비고</Th>
            {/* 단위는 이름 뒤 괄호(§1.7-g) — 머리줄은 한 줄이다. */}
            <Th col="loss1310" className={HEAD} align="right" unit="dB" title="1310 nm 손실">1310 손실</Th>
            <Th col="loss1550" className={HEAD} align="right" unit="dB" title="1550 nm 손실">1550 손실</Th>
            <Th col="dist" className={HEAD} align="right" unit="km" title="1550 거리(없으면 1310)">거리</Th>
            <Th col="measuredOn" className={HEAD}>측정일</Th>
            <Th col="latest" className={HEAD} align="right" unit="dB" title="최근 측정 1310 / 1550 손실(측정일·거리는 칸의 도움말)">1310/1550 손실</Th>
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
            /* 최근 측정 — 병합 칸은 손실 둘만(「-6.435 / -4.420」, 수가 잘리지 않는 폭), 온 글(측정일·파장·거리)은 title. */
            const latestFull = latestMeasureText(m, { withDate: true });
            /* 지금 서지 않는 칸의 값 — 코어 번호 단추의 title·접근 이름에 모은다. */
            const hidden = [
              !shows('jack') && !sameJack && `어댑터 ${r.jack}`,
              !shows('role') && r.role && (CORE_ROLES.find((x) => x.value === r.role)?.label ?? r.role),
              !shows('note') && r.note && `비고 ${r.note}`,
              !shows('loss1310') && !shows('latest') && m && `최근 측정 ${latestFull}`,
            ].filter(Boolean).join(' · ');
            /* 글 칸(자국·대국·회선 내역·비고)은 **두 줄까지** 접는다 — 몇 글자로 잘리는 대신(§1.7-e2). 넘치면 둘째 줄 끝 말줄임(전문은 title). */
            const textCls = 'line-clamp-2 break-words';
            return (
              <tr key={r.no} data-testid={`sheet-row-${r.no}`} className={cn(TABLE_ROW, 'group', bad && 'text-content-faint')}>
                <Td align="right" col="no">
                  <button type="button" className="w-full rounded px-1 text-right hover:text-primary" title={hidden || undefined} aria-label={`코어 ${r.no} 측정 기록`} aria-description={hidden || undefined} onClick={() => onOpenCore(r.no)}>{r.no}</button>
                </Td>
                <Td align="right" col="jack" className="text-content-muted">{r.jack}</Td>
                {/* 손잡이(지우개·잇기)는 **제 자리**를 갖는다 — 이름 위에 겹쳐 띄우면 이름 끝을 가리고, 손이 닿아야만
                    보이는 단추는 터치에서 영영 안 보인다(HOVER_REVEAL 이 호버 없는 기기에서는 늘 세운다). */}
                <Td col="near">
                  <span className="flex min-w-0 items-center gap-1">
                    {near != null ? (
                      <>
                        {nearEq
                          ? <button type="button" className={cn('min-w-0 flex-1 text-left hover:text-primary hover:underline', textCls, nearEq === selectedEquipmentId && 'font-medium text-primary')} title={near} onClick={() => onSelectEquipment(nearEq)}>{near}</button>
                          : <span className={cn('min-w-0 flex-1', textCls)} title={near}>{near}</span>}
                        <EditOnly>
                          <IconButton
                            size="sm" tone="danger" aria-label="연결 삭제" title="연결 삭제"
                            className={cn('shrink-0', HOVER_REVEAL)}
                            onClick={() => onUnlink(r.nearLinkId!, near)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </EditOnly>
                      </>
                    ) : (
                      <>
                        {/* 빈 칸은 대국 칸과 같은 「—」 — 빈 모양은 하나다. */}
                        <span className="min-w-0 flex-1 text-content-faint">{EMPTY}</span>
                        <EditOnly>
                          <span className={cn('shrink-0', HOVER_REVEAL)}>
                            <Button variant="secondary" size="xs" onClick={() => onConnect({ kind: 'core', lineId: block.lineId, no: r.no, side: block.side })}>연결</Button>
                          </span>
                        </EditOnly>
                      </>
                    )}
                  </span>
                </Td>
                {/* 중계경로는 「저 너머로 따라간다」 — 대국 접속 칸의 꼬리 자리(이 칸에는 제 손잡이가 없다). 자국 칸에 두면
                    그 자리만큼 자국 이름이 줄어든다. */}
                <Td col="far">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className={cn('min-w-0 flex-1', textCls, far == null ? 'text-content-faint' : !bad && 'text-content-muted')} title={far ?? undefined}>{far ?? EMPTY}</span>
                    {trace}
                  </span>
                </Td>
                <Td col="status">
                  <InlineEditCell
                    value={r.status} label="상태" choices={CORE_STATUSES} required
                    /* 점 칸은 한 줄 높이(h-5)에 가둔다 — 기준선에 맞추면 그 줄만 2px 부푼다(코어 줄은 눈으로 센다). */
                    format={(v) => (v === DEFAULT_CORE_STATUS ? <span className="text-content-muted">{statusLabel(v)}</span> : <span className="flex h-5 items-center"><StatusDot status={coreStatusTone(v)}>{statusLabel(v)}</StatusDot></span>)}
                    onCommit={(v) => { if (v !== r.status) onUpdateCore(r.no, { status: v as CoreStatus }); }}
                  />
                </Td>
                <Td col="statusDot">
                  <InlineEditCell
                    value={r.status} label="상태" choices={CORE_STATUSES} required
                    /* 좁은 판 — 점만(글자는 title·스크린리더). 정상도 흐린 점 하나로 자리를 지킨다. */
                    format={(v) => <StatusDot dotOnly status={v === DEFAULT_CORE_STATUS ? 'neutral' : coreStatusTone(v)}>{statusLabel(v)}</StatusDot>}
                    onCommit={(v) => { if (v !== r.status) onUpdateCore(r.no, { status: v as CoreStatus }); }}
                  />
                </Td>
                <Td col="role">
                  <InlineEditCell
                    value={r.role ?? ''} label="주/예비" choices={CORE_ROLES} muted={bad}
                    onCommit={(v) => { const next = (v || null) as CoreRole | null; if (next !== r.role) onUpdateCore(r.no, { role: next }); }}
                  />
                </Td>
                {(() => {
                  /* 상대 끝 용도는 참고일 뿐 — 칸의 title 에만 선다(고치는 것은 이 끝의 용도). */
                  const peer = r.peerPurpose ? `대국 회선 내역: ${r.peerPurpose}` : undefined;
                  return (
                    <Td col="purpose" title={peer}>
                      {text(r, purposeField, r.purpose, '회선 내역', bad, [r.purpose, peer].filter(Boolean).join('\n') || undefined, true)}
                    </Td>
                  );
                })()}
                <Td col="note">{text(r, noteField, r.note, '비고', bad, undefined, true)}</Td>
                <Td align="right" col="loss1310">{numCell(m?.loss1310 ?? null)}</Td>
                <Td align="right" col="loss1550">{numCell(m?.loss1550 ?? null)}</Td>
                <Td align="right" col="dist" title={distFrom1310 ? '1550 측정값이 없어 1310 거리 표시' : undefined}>
                  {numCell(dist)}
                  {distFrom1310 && <span className="ml-1 text-xs text-content-faint">(1310)</span>}
                </Td>
                <Td col="measuredOn" className="whitespace-nowrap tabular-nums">{m?.measuredOn ? formatDate(m.measuredOn) : <span className="text-content-faint">{EMPTY}</span>}</Td>
                <Td align="right" col="latest" title={m ? latestFull : undefined}>
                  {m ? latestMeasureText(m, { withWavelength: false, withDistance: false }) : <span className="text-content-faint">{EMPTY}</span>}
                </Td>
              </tr>
            );
          })}
        </tbody>
        </>)}
      </TableCard>
    </section>
  );
}
