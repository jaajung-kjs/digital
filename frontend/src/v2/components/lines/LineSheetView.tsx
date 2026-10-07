import { useEffect, useMemo, useRef, useState } from 'react';
import type { LinkEndRef, SheetBlock } from '@twin/core';
import { Button, EmptyState, ErrorStrip, Select, TableSearch, ViewCard, useConfirm } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { deleteRows } from '../../model/store/deleteActions';
import { equipmentName } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Core } from '../../model/types';
import type { BlockFocus } from '../../useWorkspaceRoute';
import { ConnectDialog } from '../equipment/ConnectDialog';
import { endLabel } from '../equipment/endpoints';
import { LineBlock, type BlockHead } from './LineBlock';
import { CoreHistoryDialog } from './CoreHistoryDialog';
import { LineDialog } from './LineDialog';
import { MeasureBatchDialog } from './MeasureBatchDialog';
import { blockWhere, sheetBlocks } from './sheetSelectors';

/** 단자 거르개 — '' = 전체, 이것 = 단자 미지정, 그 밖은 단자 설비 id. */
const UNASSIGNED = '__unassigned__';

export interface LineSheetViewProps {
  substationId: string;
  selectedEquipmentId: string | null;
  onSelectEquipment: (id: string | null) => void;
  focus: BlockFocus | null;
  onFocus: (focus: BlockFocus | null) => void;
}

const blockKey = (b: { lineId: string; side: string }) => `${b.lineId}:${b.side}`;

/**
 * 선번장 — 이 국에 닿은 광선로를 **단자 설비 → 슬롯** 블록으로 늘어놓는다(OFD 선번장 엑셀의 자리).
 *
 * 블록·행·어댑터 번호·자국/대국 연결은 core `lineSheet` 가 정하고 여기는 보여 줄 뿐이다.
 * 고치는 것은 코어 값(상태·주/예비·이 끝의 용도·비고)과 **이 국 쪽 끝의 잇기**뿐이다 — 대국 연결은
 * 남의 국 것이라 읽기만 한다(그 국을 들르면 그 국 선번장에서 고친다).
 */
export function LineSheetView({
  substationId, selectedEquipmentId, onSelectEquipment, focus, onFocus,
}: LineSheetViewProps) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [terminal, setTerminal] = useState('');
  const [query, setQuery] = useState('');
  const [connectFrom, setConnectFrom] = useState<LinkEndRef | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* 광선로 추가·편집 상자 — 추가면 edit 없음, 편집이면 그 블록. */
  const [dialog, setDialog] = useState<{ edit?: BlockFocus } | null>(null);
  /* 블록 「측정 입력」 · 코어 번호 → 측정 이력. */
  const [measuring, setMeasuring] = useState<BlockFocus | null>(null);
  const [history, setHistory] = useState<(BlockFocus & { no: number }) | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const s = useMemo(() => ({ saved, overlays }), [saved, overlays]);
  const blocks = useMemo(() => sheetBlocks(s, substationId), [s, substationId]);

  /* 단자 선택지 — 블록이 있는 것만, 블록 차례대로. */
  const terminals = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of blocks) {
      const key = b.equipmentId ?? UNASSIGNED;
      if (!seen.has(key)) seen.set(key, b.equipmentId ? (equipmentName(s, b.equipmentId) ?? '—') : '단자 미지정');
    }
    return [...seen];
  }, [blocks, s]);
  /* 고른 단자가 사라졌으면(광선로를 옮겼다) 전체로 — 렌더에서 유도한다. */
  const activeTerminal = terminals.some(([k]) => k === terminal) ? terminal : '';

  const heads = useMemo(() => {
    const cableName = (id: string) => catalog?.cableTypes.find((c) => c.id === id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? null;
    const m = new Map<string, BlockHead>();
    for (const b of blocks) {
      const { where, peer } = blockWhere(s, b);
      const cable = cableName(b.cableTypeId);
      m.set(blockKey(b), {
        title: where,
        peer,
        lineName: b.name,
        length: b.lengthKm != null ? `${b.lengthKm} km` : null,
        cable: cable ? `${cable} ${b.coreCount}심` : `${b.coreCount}심`,
      });
    }
    return m;
  }, [blocks, s, catalog]);

  /* 거르기 — 단자로 블록을, 검색으로 블록(상대국·선로명) 또는 줄(용도·비고)을. */
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const has = (t: string | null | undefined) => !!t && t.toLowerCase().includes(q);
    const out: SheetBlock[] = [];
    for (const b of blocks) {
      if (activeTerminal && (b.equipmentId ?? UNASSIGNED) !== activeTerminal) continue;
      if (q === '') { out.push(b); continue; }
      const h = heads.get(blockKey(b));
      if (has(h?.peer) || has(b.name)) { out.push(b); continue; }
      const rows = b.rows.filter((r) => has(r.purpose) || has(r.peerPurpose) || has(r.note));
      if (rows.length > 0) out.push({ ...b, rows });
    }
    return out;
  }, [blocks, activeTerminal, q, heads]);
  const totalRows = useMemo(() => blocks.reduce((n, b) => n + b.rows.length, 0), [blocks]);
  const shownRows = shown.reduce((n, b) => n + b.rows.length, 0);

  /* 초점 블록이 바뀔 때만 화면 안으로(주소로 들어온 경우 포함). */
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusKey = focus ? blockKey(focus) : null;
  useEffect(() => {
    if (!focusKey) return;
    bodyRef.current?.querySelector<HTMLElement>('[data-testid="sheet-block"][aria-current="true"]')?.scrollIntoView?.({ block: 'start' });
  }, [focusKey]);

  /* 판이 가로로 넘쳐 오른쪽이 가려져 있는가 — 상세 패널이 서서 좁아졌을 때. 가려진 쪽 가장자리에 그늘을 세운다. */
  /* 그늘의 윗변은 머리 띠 높이를 외워 두지 않고 **스크롤 상자의 자리**에서 잰다(띠 높이가 바뀌어도 따라간다). */
  const frameRef = useRef<HTMLDivElement>(null);
  const [shadeTop, setShadeTop] = useState<number | null>(null);
  useEffect(() => {
    const box = bodyRef.current?.parentElement;
    if (!box) return;
    const check = () => {
      const clipped = box.scrollLeft + box.clientWidth < box.scrollWidth - 1;
      const frame = frameRef.current?.getBoundingClientRect().top ?? 0;
      setShadeTop(clipped ? Math.round(box.getBoundingClientRect().top - frame) : null);
    };
    check();
    box.addEventListener('scroll', check, { passive: true });
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(check);
    ro?.observe(box);
    if (bodyRef.current) ro?.observe(bodyRef.current);
    return () => { box.removeEventListener('scroll', check); ro?.disconnect(); };
  }, []);

  /* 측정 입력은 거르기 전 블록(코어 전부)으로 — 검색이 줄을 좁혀도 입력 표는 1..N 이다. */
  const measuringBlock = measuring ? blocks.find((b) => blockKey(b) === blockKey(measuring)) ?? null : null;

  const label = (ref: LinkEndRef) => endLabel(s, ref);
  const updateCore = (lineId: string) => (no: number, patch: Partial<Core>) => workingCopyStore.getState().updateCore(lineId, no, patch);
  async function unlink(linkId: string, target: string) {
    if (!(await confirm({ title: '연결 지우기', target, message: '이 코어 끝의 연결을 지웁니다.', confirmLabel: '지우기', danger: true }))) return;
    setError(deleteRows({ links: [linkId] }).blocked[0]?.reason ?? null);
  }

  const addLine = <Button variant="secondary" size="sm" onClick={() => setDialog({})}>광선로 추가</Button>;

  return (
    <div ref={frameRef} className="relative flex min-h-0 min-w-0 flex-1">
      <ViewCard
        body="scroll"
        bodyRef={bodyRef}
        tools={
          <div className="w-40 shrink-0">
            <Select size="sm" aria-label="단자" value={activeTerminal} onChange={(e) => setTerminal(e.currentTarget.value)}>
              <option value="">전체</option>
              {terminals.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </Select>
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5">
            {addLine}
            <TableSearch
              aria-label="선번장 검색" className="w-56" placeholder="상대국 · 선로명 · 용도 · 비고 검색"
              value={query} onChange={setQuery} shown={shownRows} total={totalRows}
            />
          </div>
        }
      >
        {error && <div className="mb-3"><ErrorStrip message={error} onDismiss={() => setError(null)} /></div>}
        {blocks.length === 0 ? (
          <EmptyState title="이 국에 닿은 광선로가 없습니다" description="「광선로 추가」로 상대국과 코어 수를 정하세요" action={addLine} />
        ) : shown.length === 0 ? (
          <EmptyState title="조건과 맞는 코어가 없습니다" />
        ) : (
          <div className="space-y-4">
            {shown.map((b) => {
              const f: BlockFocus = { lineId: b.lineId, side: b.side };
              return (
                <LineBlock
                  key={blockKey(b)}
                  block={b}
                  head={heads.get(blockKey(b))!}
                  focused={focusKey === blockKey(b)}
                  selectedEquipmentId={selectedEquipmentId}
                  label={label}
                  onSelectEquipment={onSelectEquipment}
                  onConnect={setConnectFrom}
                  onUnlink={(id, target) => void unlink(id, target)}
                  onUpdateCore={updateCore(b.lineId)}
                  onFocus={() => onFocus(f)}
                  onMeasure={() => setMeasuring(f)}
                  onEdit={() => setDialog({ edit: f })}
                  onOpenCore={(no) => setHistory({ ...f, no })}
                />
              );
            })}
          </div>
        )}
        {connectFrom && (
          <ConnectDialog substationId={substationId} from={connectFrom} open onClose={() => setConnectFrom(null)} onCreated={() => setError(null)} />
        )}
        {dialog && (
          <LineDialog
            substationId={substationId} edit={dialog.edit}
            onClose={() => setDialog(null)}
            /* 닫으면 그 블록으로 — 초점은 주소가 쥔다(`line`·`side`), 지웠으면 놓는다. */
            onDone={(f) => { setDialog(null); onFocus(f); }}
          />
        )}
        {measuringBlock && (
          <MeasureBatchDialog block={measuringBlock} onClose={() => setMeasuring(null)} />
        )}
        {history && <CoreHistoryDialog lineId={history.lineId} no={history.no} side={history.side} onClose={() => setHistory(null)} />}
        {confirmDialog}
      </ViewCard>
      {shadeTop != null && (
        <div
          aria-hidden data-testid="sheet-clip-shade"
          className="pointer-events-none absolute bottom-px right-px w-4 bg-gradient-to-l from-content/15 to-transparent"
          style={{ top: shadeTop }}
        />
      )}
    </div>
  );
}
