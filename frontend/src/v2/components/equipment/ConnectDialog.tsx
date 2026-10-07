import { useEffect, useMemo, useRef, useState } from 'react';
import { CORE_STATUSES, DEFAULT_CORE_STATUS, endRefKey, isLinkMedium, validateState, type LinkEndRef } from '@twin/core';
import { Button, DetailRow, ErrorStrip, InsetBox, Input, ListHeading, ListRow, MessageStrip, Modal, SELECTED, Select, TableSearch } from '../../../components/ui';
import { useCatalog } from '../../model/hooks';
import { effectiveCores, toModelState } from '../../model/store/effective';
import { useWorkingCopy, workingCopyStore } from '../../model/store/workingCopy';
import type { Link } from '../../model/types';
import { newId } from '../../newId';
import { endLabel, endpointOptions, type EndpointOption } from './endpoints';

interface Props { substationId: string; from: LinkEndRef; open: boolean; onClose: () => void; onCreated: (linkId: string) => void }

const GROUPS = ['설비', '차단기', '코어'] as const;
const withLabel = (ref: LinkEndRef, label: string): LinkEndRef => (ref.kind === 'equipment' ? { ...ref, label: label.trim() || null } : ref);

/** 잇기 — 이쪽 끝(from)에 반대쪽 끝을 이 국의 목록에서 골라 연결 한 건을 만든다. */
export function ConnectDialog({ substationId, from, open, onClose, onCreated }: Props) {
  const catalog = useCatalog().data;
  const saved = useWorkingCopy((s) => s.saved);
  const overlays = useWorkingCopy((s) => s.overlays);
  const [query, setQuery] = useState('');
  const [pick, setPick] = useState<LinkEndRef | null>(null);
  const [cableTypeId, setCableTypeId] = useState('');
  const [length, setLength] = useState('');
  const [fromLabel, setFromLabel] = useState('');
  const [toLabel, setToLabel] = useState('');
  const draftId = useRef(newId());
  /** 이쪽 끝이 정상이 아닌 코어면 그 상태의 말(단선·사용불가) — 막지 않고 알린다. */
  const fromCoreBad = useMemo(() => {
    if (from.kind !== 'core') return null;
    const status = effectiveCores({ saved, overlays }, from.lineId).find((c) => c.no === from.no)?.status;
    if (!status || status === DEFAULT_CORE_STATUS) return null;
    return CORE_STATUSES.find((c) => c.value === status)?.label ?? status;
  }, [from, saved, overlays]);
  useEffect(() => {
    if (open) return;
    setQuery(''); setPick(null); setCableTypeId(''); setLength(''); setFromLabel(''); setToLabel('');
    draftId.current = newId();
  }, [open]);

  const options = useMemo(() => endpointOptions({ saved, overlays }, substationId), [saved, overlays, substationId]);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => options.filter((o) => q === '' || o.label.toLowerCase().includes(q)), [options, q]);
  const cables = (catalog?.cableTypes ?? []).filter((c) => isLinkMedium(c.medium));

  const lengthM = length.trim() === '' ? null : Number(length);
  const lengthOk = lengthM === null || (Number.isFinite(lengthM) && lengthM >= 0);

  const link: Link | null = useMemo(() => pick && ({
    id: draftId.current, substationId, cableTypeId: cableTypeId || null, lengthM: lengthOk ? lengthM : null,
    spec: null, note: null, pathPoints: [], a: withLabel(from, fromLabel), b: withLabel(pick, toLabel), updatedAt: '',
  }), [pick, substationId, cableTypeId, lengthM, lengthOk, from, fromLabel, toLabel]);

  /* 미리 보기 — 이 연결이 든 흠만 막는다(다른 데의 흠으로 잇기를 막지 않는다). */
  const issue = useMemo(() => {
    if (!link) return null;
    const next = { saved, overlays: { ...overlays, links: { ...overlays.links, creates: { ...overlays.links.creates, [link.id]: link } } } };
    return validateState(toModelState(next, catalog?.cableTypes)).find((i) => i.ids.includes(link.id))?.message ?? null;
  }, [link, saved, overlays, catalog]);

  const ok = link !== null && issue === null && lengthOk;

  function submit() {
    if (!ok || !link) return;
    workingCopyStore.getState().create('links', link);
    onCreated(link.id);
    onClose();
  }

  const row = (o: EndpointOption) => {
    const selected = pick !== null && endRefKey(pick) === endRefKey(o.ref);
    return (
      <ListRow key={endRefKey(o.ref)} className={o.taken ? 'opacity-50' : selected ? SELECTED : undefined} aria-disabled={o.taken || undefined} aria-selected={selected} onClick={o.taken ? undefined : () => setPick(o.ref)}>
        {o.label}
      </ListRow>
    );
  };

  return (
    <Modal
      open={open} onClose={onClose} title="연결 추가" size="md"
      footer={<><Button variant="secondary" onClick={onClose}>취소</Button><Button disabled={!ok} onClick={submit}>연결</Button></>}
    >
      <div className="space-y-2">
        <p className="text-xs text-content-muted">{`${from.kind === 'core' ? '자국 측 코어' : '본 설비 단자'}: ${endLabel({ saved, overlays }, from)}`}</p>
        {/* 단선·사용불가 코어에 잇는 것은 막지 않는다(우회 결선·기록 정리일 수 있다) — 알고 하게 할 뿐이다. */}
        {fromCoreBad && <MessageStrip tone="warning">{`이 코어는 ${fromCoreBad} 상태입니다`}</MessageStrip>}
        <TableSearch aria-label="상대 단자 검색" className="w-full" count="inside" placeholder="설비 · 차단기 · 코어 검색" value={query} onChange={setQuery} shown={shown.length} total={options.length} />
        <InsetBox className="max-h-56 overflow-y-auto p-1">
          {GROUPS.map((g) => {
            const rows = shown.filter((o) => o.group === g);
            if (rows.length === 0) return null;
            return (
              <div key={g}>
                <ListHeading>{g}</ListHeading>
                {rows.map(row)}
              </div>
            );
          })}
          {shown.length === 0 && <ListRow>검색 결과가 없습니다</ListRow>}
        </InsetBox>
        <DetailRow label="케이블 품목">
          <Select size="sm" aria-label="케이블 품목" value={cableTypeId} onChange={(e) => setCableTypeId(e.currentTarget.value)}>
            <option value="">선택 안 함</option>
            {cables.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </DetailRow>
        <DetailRow label="길이(m)">
          <Input size="sm" numeric aria-label="길이(m)" value={length} onChange={(e) => setLength(e.currentTarget.value)} />
        </DetailRow>
        {from.kind === 'equipment' && (
          <DetailRow label="단자 표기"><Input size="sm" aria-label="본 설비 단자 표기" value={fromLabel} onChange={(e) => setFromLabel(e.currentTarget.value)} /></DetailRow>
        )}
        {pick?.kind === 'equipment' && (
          <DetailRow label="상대 표기"><Input size="sm" aria-label="상대 단자 표기" value={toLabel} onChange={(e) => setToLabel(e.currentTarget.value)} /></DetailRow>
        )}
        <ErrorStrip message={issue ?? (lengthOk ? null : '길이는 0 이상의 숫자여야 합니다')} />
      </div>
    </Modal>
  );
}
