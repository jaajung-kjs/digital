import {
  CIRCUIT_CURRENTS, CORE_ROLES, CORE_STATUSES, EQUIPMENT_STATUSES, MAX_CIRCUITS, MAX_CORES, MAX_PANELS, SIDES, SWITCH_STATES,
  type CommitPayload as CoreCommitPayload,
} from '@twin/core';
import { z } from 'zod';

/** 어휘의 값만 — 낱말 타입을 지켜야 core `CommitPayload` 와 맞춰 볼 수 있다. */
const values = <T extends readonly { value: string }[]>(xs: T) =>
  z.enum(xs.map((x) => x.value) as [T[number]['value'], ...T[number]['value'][]]);
const id = z.string().uuid();
const text = z.string().trim().min(1).nullable().optional();
/** 달력에 있는 날만 — 2024-02-31 은 Date 가 3월로 넘겨 버리므로 되짚어 본다(안 그러면 500). */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine((d) => { const t = new Date(`${d}T00:00:00.000Z`); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; }, '존재하지 않는 날짜입니다');
const ops = <C extends z.ZodTypeAny, P extends z.ZodTypeAny>(create: C, patch: P) => z.object({
  creates: z.array(create).optional(),
  updates: z.array(z.object({ id, patch })).optional(),
  deletes: z.array(id).optional(),
}).optional();

/* ── 층 — 워킹카피의 것(배경 도면 포함). 국을 넘는 변경안이라 만들 때 국을 적는다. ── */
const floorCreate = z.object({ id, substationId: id, name: z.string().trim().min(1), sortOrder: z.number().int() });
const floorPatch = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  backgroundDrawing: z.unknown().nullable().optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
});

/* ── 랙 ── */
const placement = {
  floorId: id.nullable().optional(),
  x: z.number().nullable().optional(), y: z.number().nullable().optional(),
  width: z.number().positive().nullable().optional(), height: z.number().positive().nullable().optional(),
  facing: z.enum(['위', '아래', '왼쪽', '오른쪽']).nullable().optional(),
};
const rackCreate = z.object({ id, substationId: id, name: z.string().trim().min(1), rackTypeId: id, ...placement });
const rackPatch = z.object({ name: z.string().trim().min(1).optional(), rackTypeId: id.optional(), ...placement });

/* ── 설비 — 국은 만든 뒤 바꾸지 않는다(랙은 같은 국 안에서 옮긴다). ── */
const equipmentFields = {
  name: z.string().trim().min(1),
  typeId: id,
  rackId: id,
  status: values(EQUIPMENT_STATUSES).optional(),
  model: text, maker: text, madeOn: text, serial: text,
  installDate: date.nullable().optional(),
  manager: text, note: text,
  circuitCount: z.number().int().min(0).max(MAX_CIRCUITS).optional(),
  panelCount: z.number().int().min(0).max(MAX_PANELS).nullable().optional(),
};
const equipmentCreate = z.object({ id, substationId: id, ...equipmentFields });
const equipmentPatch = z.object(equipmentFields).partial();

/* ── 회로 — 자연 키. 만들기·지우기는 회로 수로만. ── */
const circuitUpdate = z.object({
  equipmentId: id,
  no: z.number().int().min(1),
  patch: z.object({
    label: text, current: values(CIRCUIT_CURRENTS).nullable().optional(),
    voltage: text, capacity: text, phase: text,
    switch: values(SWITCH_STATES).nullable().optional(), purpose: text,
  }),
});

/* ── 광선로 — 끝의 국은 만든 뒤 바꾸지 않는다. ── */
const lineEnd = {
  equipmentId: id.nullable().optional(),
  panel: z.number().int().min(1).nullable().optional(),
  startNo: z.number().int().min(1).optional(),
};
const fiberLineCreate = z.object({
  id, cableTypeId: id, coreCount: z.number().int().min(1).max(MAX_CORES),
  name: text, lengthKm: z.number().min(0).nullable().optional(), segments: z.array(z.unknown()).optional(),
  a: z.object({ substationId: id, ...lineEnd }),
  b: z.object({ substationId: id, ...lineEnd }),
});
const fiberLinePatch = z.object({
  cableTypeId: id.optional(), coreCount: z.number().int().min(1).max(MAX_CORES).optional(),
  name: text, lengthKm: z.number().min(0).nullable().optional(), segments: z.array(z.unknown()).optional(),
  a: z.object(lineEnd).optional(), b: z.object(lineEnd).optional(),
});

/* ── 코어 — 자연 키. ── */
const coreUpdate = z.object({
  lineId: id, no: z.number().int().min(1),
  patch: z.object({ status: values(CORE_STATUSES).optional(), role: values(CORE_ROLES).nullable().optional(), aPurpose: text, aNote: text, bPurpose: text, bNote: text }),
});

/* ── 측정 ── */
const num = z.number().nullable().optional();
const measurementFields = {
  measuredOn: date.nullable().optional(), side: z.enum(SIDES),
  loss1310: num, dist1310: num, loss1550: num, dist1550: num, measuredBy: text,
};
const measurementCreate = z.object({ id, lineId: id, coreNo: z.number().int().min(1), ...measurementFields });
const measurementPatch = z.object(measurementFields).partial();

/* ── 연결 — 끝 대상은 만든 뒤 바꾸지 않는다. 설비 끝의 표기만 고친다. ── */
const linkEnd = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('equipment'), equipmentId: id, label: text }),
  z.object({ kind: z.literal('circuit'), equipmentId: id, no: z.number().int().min(1) }),
  z.object({ kind: z.literal('core'), lineId: id, no: z.number().int().min(1), side: z.enum(SIDES) }),
]);
const linkFields = {
  cableTypeId: id.nullable().optional(), lengthM: z.number().min(0).nullable().optional(),
  spec: text, note: text, pathPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
};
const linkCreate = z.object({ id, substationId: id, ...linkFields, a: linkEnd, b: linkEnd });
const linkPatch = z.object({ ...linkFields, aLabel: text, bLabel: text });

/* ── 기록 ── */
const recordOps = <S extends z.ZodRawShape>(shape: S) => z.object({
  creates: z.array(z.object({ id, equipmentId: id, ...shape })).optional(),
  updates: z.array(z.object({ id, patch: z.object(shape).partial() })).optional(),
  deletes: z.array(id).optional(),
}).optional();

export const commitPayloadSchema = z.object({
  floors: ops(floorCreate, floorPatch),
  racks: ops(rackCreate, rackPatch),
  equipment: ops(equipmentCreate, equipmentPatch),
  circuits: z.object({ updates: z.array(circuitUpdate).optional() }).optional(),
  fiberLines: ops(fiberLineCreate, fiberLinePatch),
  cores: z.object({ updates: z.array(coreUpdate).optional() }).optional(),
  coreMeasurements: ops(measurementCreate, measurementPatch),
  links: ops(linkCreate, linkPatch),
  records: z.object({
    maintenance: recordOps({ occurredAt: z.string().datetime(), content: z.string().min(1), action: z.string().nullish() }),
    inspections: recordOps({ inspectedAt: z.string().datetime(), content: z.string().min(1), result: z.string().nullish() }),
    /* 사진 경로는 클라이언트가 정하지 않는다 — 파일이 요청에 함께 오고 서버가 이름을 짓는다. */
    photos: recordOps({ caption: z.string().nullish() }),
  }).optional(),
  /** 행 키 → 그 행을 읽었을 때의 updatedAt. uuid 행은 id, 회로·코어는 `circuitKey`·`coreKey`. */
  baseVersions: z.record(z.string()).optional(),
});

export type CommitPayload = z.infer<typeof commitPayloadSchema>;

/* 프론트는 core 의 손으로 적은 `CommitPayload` 로 본문을 짓는다 — 이 스키마와 갈라지면 여기서
   컴파일이 깨진다(양방향 대입). 칸 하나를 이쪽에만 더하거나 어휘를 넓히면 둘 중 하나가 걸린다. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _payloadMatchesCore: Same<CommitPayload, CoreCommitPayload> = true;
void _payloadMatchesCore;
export type LinkEndInput = z.infer<typeof linkEnd>;
