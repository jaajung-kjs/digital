import { useEffect, useMemo, useState } from 'react';
import { MAX_CORES, isLineMedium, type Side } from '@twin/core';
import {
  Button, DetailCard, DetailCardHeader, DetailGrid, DetailRow, ErrorStrip, InsetBox, Input, IssueReveal, ListRow, Modal, SELECTED, Select, TableSearch, useConfirm,
} from '../../../components/ui';
import { useV2OrgTree } from '../../hooks';
import { useCatalog } from '../../model/hooks';
import { deleteRows, lineDeleteSummary, updateFiberLine } from '../../model/store/deleteActions';
import { bySubstation, effectiveRows, equipmentName } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { FiberLine } from '../../model/types';
import { newId } from '../../newId';
import { flattenTree } from '../../orgTreeSelectors';
import type { BlockFocus } from '../../useWorkspaceRoute';

export interface LineDialogProps {
  substationId: string;
  /** 고칠 블록 — 없으면 추가(이 국이 A 끝). 이쪽 끝 = 그 블록의 side. */
  edit?: BlockFocus;
  onClose: () => void;
  /** 닫은 뒤 초점을 둘 블록 — 지웠으면 null. */
  onDone: (focus: BlockFocus | null) => void;
}

/** 한 끝의 칸 — 글자 그대로 들고, 확정할 때 수로 읽는다. */
interface EndDraft { equipmentId: string; panel: string; startNo: string }

const other = (side: Side): Side => (side === 'A' ? 'B' : 'A');
const endOf = (l: FiberLine, side: Side): EndDraft => (side === 'A'
  ? { equipmentId: l.aEquipmentId ?? '', panel: l.aPanel?.toString() ?? '', startNo: String(l.aStartNo) }
  : { equipmentId: l.bEquipmentId ?? '', panel: l.bPanel?.toString() ?? '', startNo: String(l.bStartNo) });
const BLANK_END: EndDraft = { equipmentId: '', panel: '', startNo: '1' };

/** 1 이상의 정수 — 비었으면 null, 아니면 NaN. */
function positiveInt(raw: string): number | null {
  const t = raw.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 ? n : Number.NaN;
}

/**
 * 광선로 추가·편집 — **같은 상자**다(§1.7-m). 상대국 · 케이블 품목 · 코어 수 · 선로명 · 긍장, 그리고 양 끝의
 * 단자 설비 · 슬롯 · 시작번호.
 *
 * 끝의 국은 만든 뒤 바꾸지 않는다(서버 규칙) — 편집에서는 상대국을 이름으로만 보인다. 담는 곳은 워킹카피뿐이고
 * 서버로 가는 문은 위 저장 바 하나다. 코어 수를 줄일 때 잘릴 코어에 연결·측정이 있으면 확인을 누른 그 순간
 * 코어 수 칸에 까닭이 선다(판정은 `updateFiberLine`→`lineShrinkBlock`, 아무것도 바꾸지 않는다).
 */
export function LineDialog({ substationId, edit, onClose, onDone }: LineDialogProps) {
  const catalog = useCatalog().data;
  const orgTree = useV2OrgTree().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const loadedList = useWorkingCopy((s) => s.loaded);
  const loadErrors = useWorkingCopy((s) => s.loadErrors);
  const { confirm, confirmDialog } = useConfirm();
  const s = useMemo(() => ({ saved, overlays }), [saved, overlays]);

  /* 열 때 한 번 읽는다 — 상자는 열릴 때마다 새로 선다(부르는 쪽이 조건부로 그린다). */
  const [line] = useState(() => (edit ? effectiveRows(workingCopyStore.getState(), 'fiberLines').find((l) => l.id === edit.lineId) ?? null : null));
  const near: Side = edit?.side ?? 'A';
  const far = other(near);

  const [peerId, setPeerId] = useState(() => (line ? (far === 'A' ? line.aSubstationId : line.bSubstationId) : ''));
  const [cableTypeId, setCableTypeId] = useState(line?.cableTypeId ?? '');
  const [coreCount, setCoreCount] = useState(line ? String(line.coreCount) : '');
  const [name, setName] = useState(line?.name ?? '');
  const [length, setLength] = useState(line?.lengthKm?.toString() ?? '');
  const [nearEnd, setNearEnd] = useState<EndDraft>(line ? endOf(line, near) : BLANK_END);
  const [farEnd, setFarEnd] = useState<EndDraft>(line ? endOf(line, far) : BLANK_END);
  const [query, setQuery] = useState('');
  /* 막힌 순간의 까닭(§1.7-f) — 확인을 눌러 코어 수 줄이기가 막혔을 때만 서고, 코어 수를 고치면 걷힌다. */
  const [shrinkBlocked, setShrinkBlocked] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  /* 상대국 목록 — 조직 트리의 국 전부(이 국 포함), 트리 차례대로. */
  const flat = useMemo(() => (orgTree ? flattenTree(orgTree) : []), [orgTree]);
  const substations = useMemo(() => {
    /* 어디의 국인가는 「본부 · 지사」 — 「직할」은 본부마다 있어 지사 이름만으로는 갈리지 않는다. */
    const byId = new Map(flat.map((n) => [n.id, n]));
    const where = (parentId: string | null) => {
      const branch = parentId ? byId.get(parentId) : undefined;
      const hq = branch?.parentId ? byId.get(branch.parentId) : undefined;
      return [hq?.name, branch?.name].filter(Boolean).join(' · ');
    };
    return flat.filter((n) => n.kind === 'substation').map((n) => ({ id: n.id, name: n.name, where: where(n.parentId) }));
  }, [flat]);
  const nameOf = (id: string) => substations.find((x) => x.id === id)?.name ?? saved.substations[id]?.name ?? '';
  const q = query.trim().toLowerCase();
  const shownSubs = substations.filter((x) => q === '' || x.name.toLowerCase().includes(q) || x.where.toLowerCase().includes(q));

  /* 상대국을 고르면 그 국을 들른다 — 단자 설비 목록을 위해. 이미 들렀으면 아무 일도 없다. */
  useEffect(() => {
    if (peerId) void workingCopyStore.getState().ensureLoaded(peerId);
  }, [peerId]);
  const peerLoaded = peerId !== '' && loadedList.includes(peerId);
  const peerError = peerId ? loadErrors[peerId] ?? null : null;
  /* 들르기 전(효과가 아직 안 돈 첫 프레임 포함)과 읽는 중은 같다 — 다 읽었거나 실패하기 전까지는 기다린다. */
  const peerLoading = peerId !== '' && !peerLoaded && !peerError;

  const cables = (catalog?.cableTypes ?? []).filter((c) => isLineMedium(c.medium));
  const equipmentOf = (sid: string, current: string) => {
    const list = bySubstation(effectiveRows(s, 'equipment'), sid).map((e) => ({ id: e.id, name: e.name }));
    /* 들르지 않은 국의 단자 설비도 지금 값으로는 선다(이름은 참조로 안다). */
    if (current && !list.some((e) => e.id === current)) list.push({ id: current, name: equipmentName(s, current) ?? '—' });
    return list.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  };

  /* ── 검증 ── */
  const count = positiveInt(coreCount);
  const countIssue = count === null || Number.isNaN(count) || count > MAX_CORES ? `코어 수는 1–${MAX_CORES} 사이의 정수입니다` : null;
  const lengthKm = length.trim() === '' ? null : Number(length);
  const lengthIssue = lengthKm !== null && !(Number.isFinite(lengthKm) && lengthKm >= 0) ? '긍장은 0 이상의 숫자입니다' : null;
  const endIssues = (e: EndDraft) => ({
    panel: Number.isNaN(positiveInt(e.panel)) ? '슬롯은 1 이상의 정수입니다' : null,
    startNo: positiveInt(e.startNo) === null || Number.isNaN(positiveInt(e.startNo)) ? '시작번호는 1 이상의 정수입니다' : null,
  });
  const nearIssues = endIssues(nearEnd);
  const farIssues = endIssues(farEnd);
  const ok = peerId !== '' && cableTypeId !== '' && !countIssue && !lengthIssue
    && !nearIssues.panel && !nearIssues.startNo && !farIssues.panel && !farIssues.startNo;

  /** 끝 칸 → 광선로 칸(그 끝의 side 로). 단자가 비면 슬롯도 비운다. */
  const endFields = (side: Side, e: EndDraft): Partial<FiberLine> => {
    const eqId = e.equipmentId || null;
    const panel = eqId ? positiveInt(e.panel) : null;
    const startNo = positiveInt(e.startNo) ?? 1;
    return side === 'A' ? { aEquipmentId: eqId, aPanel: panel, aStartNo: startNo } : { bEquipmentId: eqId, bPanel: panel, bStartNo: startNo };
  };

  function submit() {
    if (!ok || count == null) return;
    const fields: Partial<FiberLine> = {
      cableTypeId, coreCount: count, name: name.trim() || null, lengthKm,
      ...endFields(near, nearEnd), ...endFields(far, farEnd),
    };
    if (!line) {
      const id = newId();
      const row: FiberLine = {
        id, segments: [], updatedAt: '', cableTypeId, coreCount: count, name: null, lengthKm: null,
        aSubstationId: substationId, aSubstationName: nameOf(substationId), aEquipmentId: null, aPanel: null, aStartNo: 1,
        bSubstationId: peerId, bSubstationName: nameOf(peerId), bEquipmentId: null, bPanel: null, bStartNo: 1,
        ...fields,
      };
      workingCopyStore.getState().create('fiberLines', row);
      onDone({ lineId: id, side: 'A' });
      return;
    }
    /* 바뀐 칸만 싣는다 — 그대로인 칸을 실으면 변경 1건이 공연히 선다. */
    const patch = Object.fromEntries(Object.entries(fields).filter(([k, v]) => !Object.is(line[k as keyof FiberLine], v))) as Partial<FiberLine>;
    /* 코어 수 줄이기가 막히면 아무것도 바뀌지 않고 그 까닭이 코어 수 칸에 선다(판정은 스토어·core 한 곳). */
    if (Object.keys(patch).length > 0) {
      const { blocked } = updateFiberLine(line.id, patch);
      if (blocked) { setShrinkBlocked(blocked); return; }
    }
    onDone({ lineId: line.id, side: near });
  }

  async function remove() {
    if (!line) return;
    const n = lineDeleteSummary(line.id);
    const ask = await confirm({
      title: '광선로 삭제',
      target: line.name ?? `${line.aSubstationName} ↔ ${line.bSubstationName}`,
      message: `함께 삭제됩니다 — 코어 ${n.cores} · 측정 ${n.measurements} · 연결 ${n.links}`,
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ask) return;
    const blocked = deleteRows({ fiberLines: [line.id] }).blocked[0]?.reason ?? null;
    setRemoveError(blocked);
    if (!blocked) onDone(null);
  }

  const endCard = (side: 'near' | 'far', sid: string, e: EndDraft, set: (e: EndDraft) => void, issues: ReturnType<typeof endIssues>) => {
    const who = side === 'near' ? '자국 측' : '대국 측';
    const waiting = side === 'far' && peerLoading;
    const failed = side === 'far' ? peerError : null;
    const retry = () => void workingCopyStore.getState().ensureLoaded(sid);
    const list = sid && !waiting ? equipmentOf(sid, e.equipmentId) : [];
    return (
      <DetailCard>
        <DetailCardHeader title={`${who} 단자${sid ? ` · ${nameOf(sid)}` : ''}`} />
        <DetailRow label="단자 설비">
          <Select
            size="sm" aria-label={`${who} 단자 설비`} value={waiting ? '' : e.equipmentId} disabled={!sid || waiting || !!failed}
            onChange={(ev) => set({ ...e, equipmentId: ev.currentTarget.value })}
          >
            {waiting ? <option value="">불러오는 중…</option> : <option value="">{sid ? '단자 미지정' : '상대국을 먼저 선택하세요'}</option>}
            {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
          {failed && (
            <div className="flex items-center gap-1">
              <ErrorStrip className="min-w-0 flex-1" message={failed} />
              <Button variant="secondary" size="xs" onClick={retry}>다시 시도</Button>
            </div>
          )}
        </DetailRow>
        <DetailRow label="슬롯" issue={issues.panel}>
          <Input size="sm" numeric aria-label={`${who} 슬롯`} invalid={!!issues.panel} disabled={!e.equipmentId} value={e.panel} onChange={(ev) => set({ ...e, panel: ev.currentTarget.value })} />
        </DetailRow>
        <DetailRow label="시작번호" issue={issues.startNo}>
          <Input size="sm" numeric aria-label={`${who} 시작번호`} invalid={!!issues.startNo} value={e.startNo} onChange={(ev) => set({ ...e, startNo: ev.currentTarget.value })} />
        </DetailRow>
      </DetailCard>
    );
  };

  const nearSid = line ? (near === 'A' ? line.aSubstationId : line.bSubstationId) : substationId;

  return (
    <Modal
      open onClose={onClose} size="lg" title={line ? '광선로 편집' : '광선로 추가'}
      footer={
        <>
          {line && <Button variant="secondary" tone="danger" className="mr-auto" onClick={() => void remove()}>광선로 삭제</Button>}
          <Button variant="secondary" onClick={onClose}>취소</Button>
          <Button disabled={!ok} onClick={submit}>{line ? '확인' : '추가'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        <ErrorStrip message={removeError} onDismiss={() => setRemoveError(null)} />
        <DetailCard>
          <DetailCardHeader title="광선로" />
          {line ? (
            <DetailRow label="상대국" hint="상대국은 변경할 수 없습니다 — 변경하려면 삭제 후 다시 추가하세요">
              {nameOf(peerId) + (peerId === nearSid ? ' (동일 변전소 내)' : '')}
            </DetailRow>
          ) : (
            <DetailRow label="상대국" required align="start" wide>
              <div className="space-y-1 py-1">
                <TableSearch aria-label="상대국 검색" className="w-full" count="inside" placeholder="변전소 · 본부 · 지사 검색" value={query} onChange={setQuery} shown={shownSubs.length} total={substations.length} />
                <InsetBox className="max-h-40 overflow-y-auto p-1">
                  {shownSubs.map((x) => (
                    <ListRow
                      key={x.id} aria-current={x.id === peerId ? 'true' : undefined} className={x.id === peerId ? SELECTED : undefined}
                      trailing={x.id === substationId ? '동일 변전소 내' : x.where}
                      /* 국을 바꾸면 상대 끝 칸은 처음부터 — 앞 국의 단자 설비가 새 국 끝에 남으면 남의 국 설비를 가리킨다. */
                      onClick={() => { if (x.id !== peerId) { setPeerId(x.id); setFarEnd(BLANK_END); } }}
                    >
                      {x.name}
                    </ListRow>
                  ))}
                  {shownSubs.length === 0 && <ListRow>검색 결과가 없습니다</ListRow>}
                </InsetBox>
              </div>
            </DetailRow>
          )}
          <DetailRow label="케이블 품목" required>
            <Select size="sm" aria-label="케이블 품목" value={cableTypeId} onChange={(e) => setCableTypeId(e.currentTarget.value)}>
              <option value="">선택</option>
              {cables.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </DetailRow>
          {/* 줄이기가 막힌 까닭은 손대기 전이라도 곧바로 보인다 — 방금 확인을 누른 결과다. */}
          <IssueReveal.Provider value={shrinkBlocked != null}>
            <DetailRow label="코어 수" required issue={shrinkBlocked ?? (coreCount.trim() === '' ? null : countIssue)}>
              <Input
                size="sm" numeric aria-label="코어 수" invalid={shrinkBlocked != null || (coreCount.trim() !== '' && !!countIssue)} value={coreCount}
                onChange={(e) => { setCoreCount(e.currentTarget.value); setShrinkBlocked(null); }}
              />
            </DetailRow>
          </IssueReveal.Provider>
          <DetailRow label="선로명">
            <Input size="sm" aria-label="선로명" value={name} onChange={(e) => setName(e.currentTarget.value)} />
          </DetailRow>
          <DetailRow label="긍장" issue={lengthIssue}>
            <Input size="sm" numeric suffix="km" aria-label="긍장" invalid={!!lengthIssue} value={length} onChange={(e) => setLength(e.currentTarget.value)} />
          </DetailRow>
        </DetailCard>
        <DetailGrid>
          {endCard('near', nearSid, nearEnd, setNearEnd, nearIssues)}
          {endCard('far', peerId, farEnd, setFarEnd, farIssues)}
        </DetailGrid>
      </div>
      {confirmDialog}
    </Modal>
  );
}
