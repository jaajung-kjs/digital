import { useEffect, useMemo, useRef, useState } from 'react';
import type { LinkEndRef, SheetBlock } from '@twin/core';
import { Button, EMPTY, EmptyState, ErrorStrip, Select, TableSearch, ViewCard, scrollBoxToTop, useConfirm } from '../../../components/ui';
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
import { PathTraceDialog } from '../paths/PathTraceDialog';
import { blockWhere, sheetBlocks } from './sheetSelectors';
import { useCanEdit } from '../../useCanEdit';
import { deleteConfirm } from '../deleteConfirm';

/** 단자 거르개 — '' = 전체, 이것 = 단자 미지정, 그 밖은 단자 설비 id. */
const UNASSIGNED = '__unassigned__';

export interface LineSheetViewProps {
  substationId: string;
  selectedEquipmentId: string | null;
  onSelectEquipment: (id: string | null) => void;
  focus: BlockFocus | null;
  onFocus: (focus: BlockFocus | null) => void;
  /** 블록 머리의 단자 이름 → 그 설비 상세(현황 판). */
  onOpenEquipment: (equipmentId: string) => void;
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
  substationId, selectedEquipmentId, onSelectEquipment, focus, onFocus, onOpenEquipment,
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
  /* 코어 → 중계경로 추적. */
  const [tracing, setTracing] = useState<{ lineId: string; coreNo: number; side: BlockFocus['side'] } | null>(null);
  const { confirm, confirmDialog } = useConfirm();
  const canEdit = useCanEdit();

  const s = useMemo(() => ({ saved, overlays }), [saved, overlays]);
  const blocks = useMemo(() => sheetBlocks(s, substationId), [s, substationId]);

  /* 단자 선택지 — 블록이 있는 것만, 블록 차례대로. */
  const terminals = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of blocks) {
      const key = b.equipmentId ?? UNASSIGNED;
      if (!seen.has(key)) seen.set(key, b.equipmentId ? (equipmentName(s, b.equipmentId) ?? EMPTY) : '접속 설비 미지정');
    }
    return [...seen];
  }, [blocks, s]);
  /* 고른 단자가 사라졌으면(광선로를 옮겼다) 전체로 — 렌더에서 유도한다. */
  const activeTerminal = terminals.some(([k]) => k === terminal) ? terminal : '';

  const heads = useMemo(() => {
    const cableName = (id: string) => catalog?.cableTypes.find((c) => c.id === id)?.name.replace(/\s*\(.*\)\s*$/, '') ?? null;
    const m = new Map<string, BlockHead>();
    for (const b of blocks) {
      const { where, terminal, place, peer } = blockWhere(s, b);
      const cable = cableName(b.cableTypeId);
      m.set(blockKey(b), {
        title: where,
        terminal,
        place,
        peer,
        lineName: b.name,
        length: b.lengthKm != null ? `${b.lengthKm} km` : null,
        cable: cable ? `${cable} ${b.coreCount}심` : `${b.coreCount}심`,
      });
    }
    return m;
  }, [blocks, s, catalog]);

  /* 거르기 — 단자로 블록을, 검색으로 블록(상대국·선로명) 또는 줄(용도·비고·자국/대국 연결 이름)을.
     연결 이름까지 보아야 「송광치」로 그 국에 이어진 코어가 걸린다. */
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const has = (t: string | null | undefined) => !!t && t.toLowerCase().includes(q);
    const out: SheetBlock[] = [];
    for (const b of blocks) {
      if (activeTerminal && (b.equipmentId ?? UNASSIGNED) !== activeTerminal) continue;
      if (q === '') { out.push(b); continue; }
      const h = heads.get(blockKey(b));
      if (has(h?.peer) || has(b.name)) { out.push(b); continue; }
      const rows = b.rows.filter((r) => has(r.purpose) || has(r.peerPurpose) || has(r.note)
        || (r.near != null && has(endLabel(s, r.near))) || (r.far != null && has(endLabel(s, r.far))));
      if (rows.length > 0) out.push({ ...b, rows });
    }
    return out;
  }, [blocks, activeTerminal, q, heads, s]);
  const totalRows = useMemo(() => blocks.reduce((n, b) => n + b.rows.length, 0), [blocks]);
  const shownRows = shown.reduce((n, b) => n + b.rows.length, 0);

  /* 초점 블록이 바뀔 때만 화면 안으로(주소로 들어온 경우 포함). */
  const bodyRef = useRef<HTMLDivElement>(null);
  const focusKey = focus ? blockKey(focus) : null;
  useEffect(() => {
    if (!focusKey) return;
    const body = bodyRef.current;
    scrollBoxToTop(body, body?.querySelector<HTMLElement>('[data-testid="sheet-block"][aria-current="true"]') ?? null);
  }, [focusKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* 측정 입력은 거르기 전 블록(코어 전부)으로 — 검색이 줄을 좁혀도 입력 표는 1..N 이다. */
  const measuringBlock = measuring ? blocks.find((b) => blockKey(b) === blockKey(measuring)) ?? null : null;

  const label = (ref: LinkEndRef) => endLabel(s, ref);
  const updateCore = (lineId: string) => (no: number, patch: Partial<Core>) => workingCopyStore.getState().updateCore(lineId, no, patch);
  async function unlink(linkId: string, target: string) {
    if (!(await confirm(deleteConfirm('연결', target)))) return;
    setError(deleteRows({ links: [linkId] }).blocked[0]?.reason ?? null);
  }

  const addLine = canEdit ? <Button variant="secondary" size="sm" onClick={() => setDialog({})}>광선로 추가</Button> : null;

  return (
      <ViewCard
        body="scroll"
        bodyRef={bodyRef}
        tools={
          <div className="w-40 shrink-0">
            <Select size="sm" aria-label="접속 설비" value={activeTerminal} onChange={(e) => setTerminal(e.currentTarget.value)}>
              <option value="">전체</option>
              {terminals.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </Select>
          </div>
        }
        actions={
          /* 줄 수 있어야 검색 칸이 준다 — 감싸개가 제 폭을 고집하면 `TableSearch` 의 `min-w-0` 이 듣지 않는다. */
          <div className="flex min-w-0 items-center gap-1.5">
            {addLine}
            <TableSearch
              aria-label="선번장 검색" className="w-72" placeholder="상대국 · 선로명 · 접속 · 회선 내역 · 비고 검색"
              value={query} onChange={setQuery} shown={shownRows} total={totalRows}
            />
          </div>
        }
      >
        {error && <ErrorStrip message={error} onDismiss={() => setError(null)} />}
        {blocks.length === 0 ? (
          <EmptyState title="이 변전소에 수용된 광선로가 없습니다" description={canEdit ? '「광선로 추가」로 상대국과 코어 수를 지정하세요' : undefined} action={addLine ?? undefined} />
        ) : shown.length === 0 ? (
          <EmptyState title={query.trim() ? `'${query.trim()}'에 해당하는 코어가 없습니다` : '조건에 해당하는 코어가 없습니다'} />
        ) : (
          <div className="flex flex-col gap-3">
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
                  onOpenEquipment={onOpenEquipment}
                  onTrace={(no) => setTracing({ lineId: b.lineId, coreNo: no, side: b.side })}
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
        {tracing && <PathTraceDialog substationId={substationId} at={tracing} onClose={() => setTracing(null)} />}
        {confirmDialog}
      </ViewCard>
  );
}
