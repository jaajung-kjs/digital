import { z } from 'zod';
import { ASSET_STATUSES, DIRECTION_VALUES } from '@twin/core';

export const idParamSchema = z.string().uuid();
export const orgNameSchema = z.object({ name: z.string().trim().min(1) });
export const orgPatchSchema = z
  .object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() })
  .refine((p) => p.name !== undefined || p.sortOrder !== undefined, { message: '변경할 필드가 없습니다' });
export const branchCreateSchema = orgNameSchema.extend({ headquartersId: z.string().uuid() });
export const substationCreateSchema = orgNameSchema.extend({ branchId: z.string().uuid() });

const assetCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  /* 도면에 놓이는 것은 둘이다: 설비 품목으로 만든 **설비**(타입 없음)와 단품 **장비**(타입 있음).
     둘 중 하나는 있어야 한다는 판정은 커밋이 한다(설비 품목·타입이 실재하는지도 거기서 본다). */
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
  /** 이 설비를 만든 설비 품목 — **분류**다. 뿌리에만 적힌다. */
  assemblyId: z.string().uuid().nullish(),
  /** 이 부품이 나온 **구성 항목** — 자리를 옮겨도 「구성의 무엇인가」는 이것이 안다. */
  assemblyItemId: z.string().uuid().nullish(),
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
  .omit({ id: true, assemblyId: true, assemblyItemId: true, portCounts: true, portPositions: true })
  .partial()
  .extend({
    /**
     * 장비 품목을 바꾼다 — **포트가 통째로 다시 만들어진다**.
     *
     * 예전에는 아예 받지 않았다(`omit`). 그래서 종류를 잘못 고른 장비를 고칠 길이
     * 「지우고 다시 만들기」뿐이었고, 그러면 점검·고장이력·사진이 함께 사라졌다.
     * 위험한 것은 **케이블이 물린 포트가 사라지는 것**뿐이므로 그것만 막는다(포트를 줄일
     * 때와 같은 규칙).
     */
    typeId: z.string().uuid().nullish(),
    /**
     * 포트 하나를 고치는 것들. 포트는 장비 품목 명세에서 만들어지므로 **생성·삭제는 없고**
     * 고치기만 있다 — 그래서 자산 패치에 얹는다(별도 OCC 축을 만들지 않음).
     *
     * 값(광 심선의 손실·점검일, 회로의 용량·개폐)과 **이름**이 여기 온다. 이름을 고칠 수
     * 있어야 하는 까닭은 현장 대장·도면이 회로를 **실물 라벨**로 부르기 때문이다
     * (`NFB#11`·`SW-03`). 품목이 지어 준 이름(`분기 1`)만으로는 화면과 실물을 대조할 수 없다.
     */
    portPatches: z
      .array(z.object({
        portId: z.string().uuid(),
        fieldValues: z.record(z.unknown()).optional(),
        name: z.string().min(1).max(60).optional(),
      }))
      .optional(),
  });

/**
 * 기록(점검·고장이력·사진)의 공통 형상.
 *
 * `assetId` 는 **설비**(기록의 주인), `partAssetId` 는 그 안에서 이 기록이 가리키는 장비다
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
  /** 종류 안의 갈래 — 전원의 AC·DC. 갈래가 없는 종류는 비운다.
      몇 V 인지는 여기서 정하지 않는다 — 회로마다 다르므로 계통 표가 적는다. */
  variant: z.string().min(1).nullish(),
});
/** 설비 품목 장비 하나 — 어느 타입을, 누구 안의 어느 자리에. */
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

/**
 * 설비 안에서 이미 이어져 있는 줄 — 양끝은 **구성 항목의 포트**다.
 *
 * 포트 id 로 가리키지 않는 까닭: 구성 항목에는 포트가 없다(자산이 생길 때 선언에서 펴진다).
 * 그래서 선언이 이름을 붙이는 방식 그대로 `묶음:번호` 로 부른다.
 *
 * 항목 id 는 **화면이 쓰는 id**다 — 새 항목이면 `tmp-…` 이고, 서버가 항목을 만들면서
 * 실제 id 로 바꿔 준다(`writeAssemblyLinks`).
 */
const assemblyLinkSchema = z.object({
  id: z.string().min(1),
  aItemId: z.string().min(1),
  aGroup: z.string().min(1),
  aIndex: z.number().int().min(1),
  bItemId: z.string().min(1),
  bGroup: z.string().min(1),
  bIndex: z.number().int().min(1),
  categoryId: z.string().uuid().nullish(),
  specParams: z.record(z.unknown()).optional(),
});

export const assemblyUpsertSchema = z.object({
  /** 새로 만들 때는 비워 둔다 — 서버가 붙인다(참조용 식별자이지 현장에서 쓰는 값이 아니다). */
  key: z.string().regex(keyRe).optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  /* 격자는 받지 않는다 — 모든 설비가 같은 도화지를 쓴다(`ASSEMBLY_GRID`). */
  /* 「1식」 공량 — 비워 두면(null) 안에 든 자산의 공량을 합쳐 센다. */
  laborCode: z.string().trim().min(1).nullable().default(null),
  unitPrice: z.number().int().min(0).nullable().default(null),
  installManDays: z.number().min(0).nullable().default(null),
  removeManDays: z.number().min(0).nullable().default(null),
  relocateManDays: z.number().min(0).nullable().default(null),
  sortOrder: z.number().int(),
  // 빈 설비 품목도 저장할 수 있다 — 놓고 나서 그 설비만 채울 수 있다.
  items: z.array(assemblyItemSchema),
  /* 내부 배선 — 없는 설비 품목이 예사다(OFD 는 판끼리 안 잇는다). */
  links: z.array(assemblyLinkSchema).default([]),
});

export const typeUpsertSchema = z.object({
  /** 새로 만들 때는 비워 둔다 — 서버가 붙인다. */
  key: z.string().regex(keyRe).optional(),
  name: z.string().trim().min(1),
  categoryId: z.string().uuid(),
  sortOrder: z.number().int(),
  laborCode: z.string().trim().min(1).nullable(),
  /** 자재단가(원/대) — 설계서 재료비의 근거. 비우면 재료비 0. */
  unitPrice: z.number().int().min(0).nullable().default(null),
  installManDays: z.number().min(0),
  removeManDays: z.number().min(0),
  relocateManDays: z.number().min(0),
  ports: z.array(portTemplateBodySchema),
});
export const categoryCreateSchema = z.object({ key: z.string().min(1), name: z.string().trim().min(1), sortOrder: z.number().int() });
export const categoryPatchSchema = z.object({ name: z.string().trim().min(1).optional(), sortOrder: z.number().int().optional() });
/*
 * 그룹 하나 **통째로** — 제 이름·색과 그 안의 종류 목록 전체. 장비 품목이 포트를 자식으로
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
      /** 자재단가(원/m). */
      unitPrice: z.number().int().min(0).nullable().default(null),
      /* 공량은 자산·설비와 같은 세 칸이다 — null = 「안 적었다」, 0 = 「품이 안 든다」. */
      installManDays: z.number().min(0).nullable().default(null),
      removeManDays: z.number().min(0).nullable().default(null),
      relocateManDays: z.number().min(0).nullable().default(null),
      /** 광 선로인가 — 켜면 그 케이블에 선로 대장 값이 서고 선번장이 그것을 머리에 적는다. */
      managesFiberLine: z.boolean().default(false),
    }),
  ),
});

/**
 * 층도 **워킹카피의 것**이다 — 저장해야 서버로 간다.
 *
 * 예전에는 층만 즉시 쓰기였다(조직 CRUD 를 같이 썼다). 그래서 한 화면에서 두 가지 규칙이
 * 돌았다: 자산은 저장해야 반영되고 층은 누르는 즉시 반영됐다. 「저장 안 한 것」과 「저장한
 * 것」이 다르게 움직이면 그 경계마다 예외가 생긴다 — 그 층의 설비를 지워도 저장 전에는 층을
 * 못 지웠고(서버는 아직 설비가 있다고 본다), 되돌리기는 층에 듣지 않았다.
 */
const commitFloorCreateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
});

const floorPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sortOrder: z.number().int().optional(),
  /** 배경 도면 — 파싱 결과 그대로. `null` 이면 제거다. 구조는 파서가 정한다(`parseBackground`). */
  backgroundDrawing: z.unknown().nullable().optional(),
  backgroundOpacity: z.number().min(0).max(1).optional(),
});

export const commitPayloadSchema = z.object({
  floors: z
    .object({
      creates: z.array(commitFloorCreateSchema).optional(),
      updates: z.array(z.object({ id: z.string().uuid(), patch: floorPatchSchema })).optional(),
      deletes: z.array(z.string().uuid()).optional(),
    })
    .optional(),
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
      /* 사진의 **경로는 클라이언트가 정하지 않는다** — 파일이 요청에 함께 오고, 서버가
         제 이름을 지어 준다(`photoFiles.ts`). 예전에는 여기에 filePath 를 받아, 남의
         파일을 가리키는 줄을 만들 수 있었다. */
      photos: recordOps({ caption: z.string().nullish() }).optional(),
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
