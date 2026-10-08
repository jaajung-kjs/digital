/**
 * 설비 한 대의 **변경 이력** — 커밋마다 쓰인 ChangeLog(`commit/service.ts` 의 `summarize`)를 읽어,
 * 그 설비에 닿은 줄만 추린다. 여기는 판정만 한다(순수) — DB 를 읽는 것은 `history.routes.ts`.
 *
 * 닿은 줄:
 * - `equipment` — 그 설비 행(id 가 같다).
 * - `circuit` — 그 설비의 차단기(`circuitKey(equipmentId, no)`).
 * - `link` — 끝 하나가 그 설비거나 그 설비의 차단기인 연결. 만들기는 요청 본문(a·b), 고치기·지우기는 적용 전 행의 끝(ends)으로 본다.
 * - `maintenance` · `inspection` · `photo` — 그 설비의 기록. 만들기는 본문의 equipmentId, 고치기·지우기는 적용 전 행.
 *
 * 싣지 않는 것(한계): 광선로·코어·측정. 광선로 끝(슬롯)은 광선로의 값이고, 선번장이 그 이력을 볼 자리다.
 */

export type ChangeEntity = 'equipment' | 'circuit' | 'link' | 'maintenance' | 'inspection' | 'photo';
export type ChangeAction = 'create' | 'update' | 'delete';

/** 연결의 다른 끝 — 이름은 읽는 쪽이 채운다(`peerIds`). */
export type PeerRef =
  | { kind: 'equipment'; equipmentId: string }
  | { kind: 'circuit'; equipmentId: string; no: number }
  | { kind: 'core'; lineId: string; no: number };

export interface ChangeField { name: string; before: unknown; after: unknown }
export interface ChangeItem {
  entity: ChangeEntity;
  action: ChangeAction;
  /** 행 id(차단기는 circuitKey). */
  id: string;
  /** 차단기 번호 — 차단기 줄만. */
  no?: number;
  /** 연결의 다른 끝 — 연결 줄만. */
  peer?: PeerRef;
  /** 다른 끝의 지금 이름(설비 또는 광선로) — 읽을 때 채운다. 지금은 없으면 null. */
  peerName?: string | null;
  fields: ChangeField[];
}

type LogOp = { entity?: unknown; id?: unknown; op?: unknown; before?: unknown; after?: unknown };
type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const ACTIONS: readonly ChangeAction[] = ['create', 'update', 'delete'];
const RECORD_ENTITIES: Record<string, ChangeEntity> = { maintenance: 'maintenance', inspection: 'inspection', photo: 'photo' };

/** 이력 칸에서 뺄 열 — 식별·소속·시각·배치 좌표(사람이 읽는 값이 아니다). */
const HIDDEN = new Set([
  'id', 'substationId', 'equipmentId', 'createdAt', 'updatedAt', 'linkId', 'ends', 'a', 'b', 'pathPoints', 'filePath',
]);

/** 값이 같은가 — 날짜는 날 단위로(행은 ISO 시각, 본문은 `YYYY-MM-DD`). */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === undefined || v === '' ? null : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T00:00:00(\.000)?Z$/.test(v) ? v.slice(0, 10) : v);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

/** 고치기 — 본문(patch)의 칸마다 적용 전 값과 견준다. 같은 칸은 뺀다. */
function updateFields(before: Obj | null, patch: Obj): ChangeField[] {
  return Object.keys(patch)
    .filter((k) => !HIDDEN.has(k))
    .map((k) => ({ name: k, before: before?.[k] ?? null, after: patch[k] ?? null }))
    .filter((f) => !same(f.before, f.after));
}

/** 만들기 — 값이 있는 칸만(빈 칸까지 적으면 「—」 줄이 늘 뿐이다). */
function createFields(after: Obj): ChangeField[] {
  return Object.keys(after)
    .filter((k) => !HIDDEN.has(k) && after[k] !== null && after[k] !== undefined && after[k] !== '')
    .map((k) => ({ name: k, before: null, after: after[k] }));
}

/** 끝 하나가 이 설비(또는 그 차단기)인가 — 요청 본문의 끝(`{ kind, equipmentId, no, … }`). */
function bodyEndOn(end: unknown, eqId: string): boolean {
  return isObj(end) && (end.kind === 'equipment' || end.kind === 'circuit') && end.equipmentId === eqId;
}
function bodyPeer(end: unknown): PeerRef | undefined {
  if (!isObj(end)) return undefined;
  if (end.kind === 'equipment' && typeof end.equipmentId === 'string') return { kind: 'equipment', equipmentId: end.equipmentId };
  if (end.kind === 'circuit' && typeof end.equipmentId === 'string' && typeof end.no === 'number') return { kind: 'circuit', equipmentId: end.equipmentId, no: end.no };
  if (end.kind === 'core' && typeof end.lineId === 'string' && typeof end.no === 'number') return { kind: 'core', lineId: end.lineId, no: end.no };
  return undefined;
}
/** DB 의 끝 행(`LinkEnd`) — 정확히 하나가 차 있다. */
function rowEndOn(end: Obj, eqId: string): boolean {
  return end.equipmentId === eqId || end.circuitEquipmentId === eqId;
}
function rowPeer(end: Obj | undefined): PeerRef | undefined {
  if (!end) return undefined;
  if (typeof end.equipmentId === 'string') return { kind: 'equipment', equipmentId: end.equipmentId };
  if (typeof end.circuitEquipmentId === 'string' && typeof end.circuitNo === 'number') return { kind: 'circuit', equipmentId: end.circuitEquipmentId, no: end.circuitNo };
  if (typeof end.coreLineId === 'string' && typeof end.coreNo === 'number') return { kind: 'core', lineId: end.coreLineId, no: end.coreNo };
  return undefined;
}

/**
 * 연결 한 줄 — 이 설비 쪽 끝을 「포트(label)」, 다른 끝을 「상대 포트(peerLabel)」로 고쳐 적는다.
 * 본문은 끝을 A·B 로 적는데(aLabel·bLabel), 읽는 사람에게는 어느 쪽이 이 설비인지가 뜻이다.
 */
function linkItem(op: LogOp, action: ChangeAction, eqId: string): ChangeItem | null {
  const id = String(op.id);
  if (action === 'create') {
    const after = isObj(op.after) ? op.after : {};
    const aMine = bodyEndOn(after.a, eqId);
    if (!aMine && !bodyEndOn(after.b, eqId)) return null;
    const [mine, other] = aMine ? [after.a, after.b] : [after.b, after.a];
    const fields = createFields(after);
    const label = isObj(mine) ? mine.label : null;
    const peerLabel = isObj(other) ? other.label : null;
    if (label) fields.push({ name: 'label', before: null, after: label });
    if (peerLabel) fields.push({ name: 'peerLabel', before: null, after: peerLabel });
    return { entity: 'link', action, id, peer: bodyPeer(other), fields };
  }
  const before = isObj(op.before) ? op.before : null;
  const ends = (Array.isArray(before?.ends) ? before!.ends : []).filter(isObj);
  const a = ends.find((e) => e.end === 'A');
  const b = ends.find((e) => e.end === 'B');
  const aMine = !!a && rowEndOn(a, eqId);
  if (!aMine && !(b && rowEndOn(b, eqId))) return null;
  const [mine, other] = aMine ? [a, b] : [b, a];
  const mineKey = aMine ? 'aLabel' : 'bLabel';
  const otherKey = aMine ? 'bLabel' : 'aLabel';
  if (action === 'delete') return { entity: 'link', action, id, peer: rowPeer(other), fields: [] };
  const patch = isObj(op.after) ? { ...op.after } : {};
  const flatBefore: Obj = { ...before, label: mine?.label ?? null, peerLabel: other?.label ?? null };
  if (mineKey in patch) patch.label = patch[mineKey];
  if (otherKey in patch) patch.peerLabel = patch[otherKey];
  delete patch.aLabel; delete patch.bLabel;
  return { entity: 'link', action, id, peer: rowPeer(other), fields: updateFields(flatBefore, patch) };
}

/**
 * 커밋 한 건의 줄들(`summary.ops`) 중 설비 `eqId` 에 닿은 것 — 커밋에 적힌 차례 그대로.
 * 알 수 없는 꼴의 줄은 조용히 건너뛴다(옛 요약이 섞여 있어도 이력이 깨지지 않게).
 */
export function equipmentChangeItems(ops: unknown, eqId: string): ChangeItem[] {
  if (!Array.isArray(ops)) return [];
  const out: ChangeItem[] = [];
  const circuitPrefix = `circuit:${eqId}:`;
  for (const raw of ops) {
    if (!isObj(raw)) continue;
    const op = raw as LogOp;
    const action = ACTIONS.find((a) => a === op.op);
    if (!action || typeof op.id !== 'string') continue;
    const before = isObj(op.before) ? op.before : null;
    const after = isObj(op.after) ? op.after : null;
    switch (op.entity) {
      case 'equipment': {
        if (op.id !== eqId) break;
        const fields = action === 'create' ? createFields(after ?? {}) : action === 'update' ? updateFields(before, after ?? {}) : [];
        if (action === 'update' && fields.length === 0) break;
        out.push({ entity: 'equipment', action, id: op.id, fields });
        break;
      }
      case 'circuit': {
        if (!op.id.startsWith(circuitPrefix)) break;
        const no = Number(op.id.slice(circuitPrefix.length));
        const fields = updateFields(before, after ?? {});
        if (fields.length === 0) break;
        out.push({ entity: 'circuit', action, id: op.id, no, fields });
        break;
      }
      case 'link': {
        const item = linkItem(op, action, eqId);
        if (item && !(action === 'update' && item.fields.length === 0)) out.push(item);
        break;
      }
      default: {
        const entity = typeof op.entity === 'string' ? RECORD_ENTITIES[op.entity] : undefined;
        if (!entity) break;
        const owner = action === 'create' ? after?.equipmentId : before?.equipmentId;
        if (owner !== eqId) break;
        const fields = action === 'create' ? createFields(after ?? {}) : action === 'update' ? updateFields(before, after ?? {}) : createFields(before ?? {});
        if (action === 'update' && fields.length === 0) break;
        /* 지운 기록은 무엇이었는지를 적는다(before 를 after 자리에 두지 않는다 — 값은 before). */
        out.push({ entity, action, id: op.id, fields: action === 'delete' ? fields.map((f) => ({ name: f.name, before: f.after, after: null })) : fields });
      }
    }
  }
  return out;
}

/** 다음 쪽 커서 — `at` 과 id(같은 시각이면 id 로 가른다). */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}
export function decodeCursor(c: string): { at: Date; id: string } | null {
  const [iso, id] = Buffer.from(c, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  return id && !Number.isNaN(at.getTime()) ? { at, id } : null;
}
