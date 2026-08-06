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
  typeId: z.string().uuid(),
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
  containerKey: z.string().nullish(),
  slotIndex: z.number().int().nullish(),
  slotSpan: z.number().int().min(1).nullish(),
  fieldValues: z.record(z.unknown()).optional(),
  portCounts: z.record(z.number().int().min(1)).optional(),
});

const assetPatchSchema = assetCreateSchema
  .omit({ id: true, typeId: true, portCounts: true })
  .partial();

const recordOps = <T extends z.ZodRawShape>(createShape: T) =>
  z.object({
    creates: z.array(z.object({ id: z.string().uuid(), assetId: z.string().uuid() }).extend(createShape)).optional(),
    updates: z.array(z.object({ id: z.string().uuid(), patch: z.object(createShape).partial() })).optional(),
    deletes: z.array(z.string().uuid()).optional(),
  });

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
const fieldDefSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  type: z.enum(['text', 'number', 'date', 'select']),
  unit: z.string().optional(),
  options: z.array(z.string()).optional(),
});
const containerSpecBodySchema = z.object({
  key: z.string().regex(keyRe),
  name: z.string().trim().min(1),
  slotCount: z.number().int().min(1).nullable(),
  allowSpan: z.boolean(),
  accepts: z.object({
    categoryKeys: z.array(z.string()).optional(),
    typeKeys: z.array(z.string()).optional(),
  }),
});
const portTemplateBodySchema = z.object({
  group: z.string().regex(keyRe),
  count: z.number().int().min(1),
  direction: z.enum(DIRECTION_VALUES),
  medium: z.string().min(1),
  namePattern: z.string().min(1),
  lineSide: z.boolean().optional(),
});
const linkRuleBodySchema = z.object({
  fromGroup: z.string().min(1),
  toGroup: z.string().min(1),
  mapping: z.enum(['byIndex', 'all']),
});
export const typeUpsertSchema = z.object({
  key: z.string().regex(keyRe),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  placeable: z.boolean(),
  defaultWidth: z.number().positive().nullable(),
  defaultHeight: z.number().positive().nullable(),
  laborType: z.string().trim().min(1).nullable(),
  installHours: z.number().min(0),
  removeHours: z.number().min(0),
  relocateHours: z.number().min(0),
  fieldDefs: z.array(fieldDefSchema),
  containers: z.array(containerSpecBodySchema),
  ports: z.array(portTemplateBodySchema),
  links: z.array(linkRuleBodySchema),
});
export const categoryCreateSchema = z.object({ key: z.string().min(1), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });
export const cableGroupPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().min(1).optional(),
  laborType: z.string().trim().min(1).nullable().optional(),
  installHoursPerM: z.number().min(0).optional(),
  removeHoursPerM: z.number().min(0).optional(),
});
export const cableCategoryCreateSchema = z.object({ groupId: z.string().uuid(), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const cableCategoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });

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
