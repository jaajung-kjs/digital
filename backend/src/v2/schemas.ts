import { z } from 'zod';
import { ASSET_STATUSES, DIRECTION_VALUES } from '@twin/core';

export const idParamSchema = z.string().uuid();
export const orgNameSchema = z.object({ name: z.string().trim().min(1) });
export const orgPatchSchema = z
  .object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() })
  .refine((p) => p.name !== undefined || p.sortOrder !== undefined, { message: '변경할 필드가 없습니다' });
export const branchCreateSchema = orgNameSchema.extend({ headquartersId: z.string().uuid() });
export const substationCreateSchema = orgNameSchema.extend({ branchId: z.string().uuid() });
export const floorCreateSchema = orgNameSchema.extend({ substationId: z.string().uuid() });

const assetCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  /* 도면에 놓이는 것은 둘이다: 설비 종류으로 만든 **설비**(타입 없음)와 단품 **부품**(타입 있음).
     둘 중 하나는 있어야 한다는 판정은 커밋이 한다(설비 종류·타입이 실재하는지도 거기서 본다). */
  typeId: z.string().uuid().nullish(),
  /* 상태 어휘는 core 의 ASSET_STATUSES 가 유일한 출처다.
     예전에는 z.string() 이라 어떤 문자열이든 통과했고, 실제로 '점검필요'·'need_check' 같은
     사전에 없는 값이 저장돼 화면에 원시값 그대로 나왔다(라벨 조회 실패 시 값을 그대로 쓴다).
     화면의 Select 는 세 값만 주므로 UI 로는 못 만들지만, API 는 막을 것이 없었다. */
  status: z.enum(ASSET_STATUSES.map((s) => s.value) as [string, ...string[]]).optional(),
  floorId: z.string().uuid().nullish(),
  x: z.number().nullish(),
  y: z.number().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  parentAssetId: z.string().uuid().nullish(),
  /** 이 설비를 만든 설비 종류 — **분류**다. 뿌리에만 적힌다. */
  assemblyId: z.string().uuid().nullish(),
  col: z.number().int().min(0).nullish(),
  row: z.number().int().min(0).nullish(),
  colSpan: z.number().int().min(1).nullish(),
  rowSpan: z.number().int().min(1).nullish(),
  fieldValues: z.record(z.unknown()).optional(),
  portCounts: z.record(z.number().int().min(1)).optional(),
  /** 다심 포트의 코어 수 오버라이드 — 12심 판과 24심 판이 같은 타입일 수 있다. */
  portPositions: z.record(z.number().int().min(1)).optional(),
  /**
   * 화면이 정해 둔 포트 id — 키는 `그룹:번호`.
   *
   * 자산을 놓는 순간 화면도 포트를 만든다(저장 전에도 포트 탭·선번장·계통이 보여야 하므로).
   * 그때 그 포트에 케이블을 이어 두었다면, 저장 뒤에도 같은 포트를 가리켜야 한다.
   * **구조는 명세가 정하고 id 만 받는다** — 없는 포트를 지어낼 수는 없다.
   */
  portIds: z.record(z.string().uuid()).optional(),
});

const assetPatchSchema = assetCreateSchema
  .omit({ id: true, typeId: true, assemblyId: true, portCounts: true, portPositions: true })
  .partial()
  .extend({
    /* 포트 하나에 딸린 값(광 심선의 손실·점검일 등). 포트는 자산 종류 명세에서 만들어지므로
       생성·삭제는 없고 값만 고친다 — 그래서 자산 패치에 얹는다(별도 OCC 축을 만들지 않음). */
    portFieldValues: z
      .array(z.object({ portId: z.string().uuid(), fieldValues: z.record(z.unknown()) }))
      .optional(),
  });

/**
 * 기록(점검·고장이력·사진)의 공통 형상.
 *
 * `assetId` 는 **설비**(기록의 주인), `partAssetId` 는 그 안에서 이 기록이 가리키는 부품이다
 * — 「L3 스위치 고장」처럼. 비우면 설비 전체에 대한 기록이다.
 */
const recordOps = <T extends z.ZodRawShape>(createShape: T) => {
  const target = { partAssetId: z.string().uuid().nullish() };
  return z.object({
    creates: z
      .array(z.object({ id: z.string().uuid(), assetId: z.string().uuid() }).extend(target).extend(createShape))
      .optional(),
    updates: z
      .array(z.object({ id: z.string().uuid(), patch: z.object({ ...target, ...createShape }).partial() }))
      .optional(),
    deletes: z.array(z.string().uuid()).optional(),
  });
};

const cableCreateSchema = z.object({
  id: z.string().uuid(),
  aPortId: z.string().uuid(),
  bPortId: z.string().uuid(),
  categoryId: z.string().uuid().nullish(),
  name: z.string().trim().min(1).nullish(),
  pathPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  specParams: z.record(z.unknown()).optional(),
});

const cablePatchSchema = z.object({
  name: z.string().trim().min(1).nullish().optional(),
  categoryId: z.string().uuid().nullish().optional(),
  pathPoints: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  specParams: z.record(z.unknown()).optional(),
});

// ---------- 카탈로그 관리 (Stage 6) ----------
const keyRe = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const portTemplateBodySchema = z.object({
  group: z.string().regex(keyRe),
  count: z.number().int().min(1),
  direction: z.enum(DIRECTION_VALUES),
  medium: z.string().min(1),
  namePattern: z.string().min(1),
  /** 이 포트가 나르는 심선 수. 안 적으면 1(보통 포트). */
  positions: z.number().int().min(1).optional(),
});
/** 설비 종류 부품 하나 — 어느 타입을, 누구 안의 어느 자리에. */
const assemblyItemSchema = z.object({
  id: z.string().min(1),
  typeId: z.string().uuid(),
  name: z.string().trim().min(1),
  col: z.number().int().min(0).nullable(),
  row: z.number().int().min(0).nullable(),
  colSpan: z.number().int().min(1).nullable(),
  rowSpan: z.number().int().min(1).nullable(),
  portCounts: z.record(z.number().int().min(1)).optional(),
  portPositions: z.record(z.number().int().min(1)).optional(),
});

export const assemblyUpsertSchema = z.object({
  /** 새로 만들 때는 비워 둔다 — 서버가 붙인다(참조용 식별자이지 현장에서 쓰는 값이 아니다). */
  key: z.string().regex(keyRe).optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  /** 이 설비 안의 자리 — 설비 종류가 격자를 갖는다(자산 종류가 아니라). */
  gridCols: z.number().int().min(1),
  gridRows: z.number().int().min(1),
  /* 「1식」 공량 — 비워 두면(null) 안에 든 자산의 공량을 합쳐 센다. */
  laborCode: z.string().trim().min(1).nullable().default(null),
  installHours: z.number().min(0).nullable().default(null),
  removeHours: z.number().min(0).nullable().default(null),
  relocateHours: z.number().min(0).nullable().default(null),
  sortOrder: z.number().int(),
  // 빈 설비 종류도 저장할 수 있다 — 놓고 나서 그 설비만 채울 수 있다.
  items: z.array(assemblyItemSchema),
});

export const typeUpsertSchema = z.object({
  /** 새로 만들 때는 비워 둔다 — 서버가 붙인다. */
  key: z.string().regex(keyRe).optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  sortOrder: z.number().int(),
  laborCode: z.string().trim().min(1).nullable(),
  installHours: z.number().min(0),
  removeHours: z.number().min(0),
  relocateHours: z.number().min(0),
  ports: z.array(portTemplateBodySchema),
});
export const categoryCreateSchema = z.object({ key: z.string().min(1), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });
/*
 * 그룹 하나 **통째로** — 제 이름·색과 그 안의 종류 목록 전체. 자산 종류가 포트를 자식으로
 * 안고 한 번의 PUT 으로 나가는 것과 같은 모양이다. 종류는 그룹 없이 홀로 서지 못하므로 낱개
 * CRUD 를 두지 않는다: 이름 바꾸기·추가·삭제·순서가 각자 다른 길로 나가면 「고치고 → 저장」이
 * 한 화면에서 세 가지 뜻을 갖는다.
 *
 * 목록에 없는 종류는 지워진다(쓰이는 중이면 서버가 거부한다). 순서는 배열 순서다.
 * `key` 는 `PORT_KINDS` 가 정하는 고정 어휘라 받지 않는다 — 포트가 무엇과 이어지는지를
 * 그 키로 판정하므로, 늘리거나 갈아 끼울 수 있으면 안 된다.
 */
export const cableGroupPutSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().min(1),
  categories: z.array(
    z.object({
      /** 이미 있는 것이면 그 id, 새로 만드는 줄이면 없다. */
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1),
      laborCode: z.string().trim().min(1).nullable(),
      installHoursPerM: z.number().min(0),
      removeHoursPerM: z.number().min(0),
    }),
  ),
});

export const commitPayloadSchema = z.object({
  assets: z
    .object({
      creates: z.array(assetCreateSchema).optional(),
      updates: z.array(z.object({ id: z.string().uuid(), patch: assetPatchSchema })).optional(),
      deletes: z.array(z.string().uuid()).optional(),
    })
    .optional(),
  cables: z
    .object({
      creates: z.array(cableCreateSchema).optional(),
      updates: z.array(z.object({ id: z.string().uuid(), patch: cablePatchSchema })).optional(),
      deletes: z.array(z.string().uuid()).optional(),
    })
    .optional(),
  records: z
    .object({
      maintenance: recordOps({ occurredAt: z.string().datetime(), content: z.string().min(1), action: z.string().nullish() }).optional(),
      inspections: recordOps({ inspectedAt: z.string().datetime(), content: z.string().min(1), result: z.string().nullish() }).optional(),
      photos: recordOps({ filePath: z.string().min(1), caption: z.string().nullish() }).optional(),
    })
    .optional(),
  baseVersions: z.record(z.string()).optional(),
});
export type CommitPayload = z.infer<typeof commitPayloadSchema>;

// ---------- 인증 ----------
export const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export const logoutSchema = z.object({
  refreshToken: z.string().min(1),
});
