import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { isPrismaError, nextDb } from './db.js';
import { HttpError } from './errors.js';
import { branchCreateSchema, idParamSchema, orgNameSchema, orgPatchSchema, substationCreateSchema } from './schemas.js';

export const orgRouter = Router();

/**
 * 조직 이름 중복(P2002) → 409. 그 외 오류는 그대로 통과시킨다.
 *
 * 조직에는 유니크 제약이 넷 있다 — Headquarters.name(전역), Substation.name(전역),
 * Branch[headquartersId,name], Floor[substationId,name]. 이걸 잡지 않으면 중복 이름
 * 입력이 500 INTERNAL_SERVER_ERROR 로 나가 사용자에게 "서버 오류"로 보인다.
 * 생성 4곳과 이름변경(템플릿 PATCH)이 같은 판단을 하므로 여기 한 곳에 둔다.
 */
function asDuplicateName(e: unknown): unknown {
  return isPrismaError(e, 'P2002')
    ? new HttpError(409, 'DUPLICATE_NAME', '이미 같은 이름이 있습니다')
    : e;
}
orgRouter.use(authenticate);

// GET /org-tree — 전체 조직 트리 조회
orgRouter.get('/org-tree', async (_req, res, next) => {
  try {
    const headquarters = await nextDb.headquarters.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        branches: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            substations: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: {
                floors: {
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                  // 조직 트리는 앱 진입 시마다 재조회된다(staleTime 30s) — 층당
                  // 수백KB인 backgroundDrawing 을 여기서 실어 나르면 안 된다.
                  // 그 필드는 평면도(RackPlanView)가 워킹카피의 층에서만 읽는다.
                  select: { id: true, name: true, sortOrder: true, substationId: true },
                },
              },
            },
          },
        },
      },
    });
    res.json({ headquarters });
  } catch (e) {
    next(asDuplicateName(e));
  }
});

// POST /org/headquarters — 본사 생성
orgRouter.post('/org/headquarters', adminOnly, async (req, res, next) => {
  try {
    const { name } = orgNameSchema.parse(req.body);
    const max = await nextDb.headquarters.aggregate({ _max: { sortOrder: true } });
    const row = await nextDb.headquarters.create({ data: { name, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    res.status(201).json(row);
  } catch (e) {
    next(asDuplicateName(e));
  }
});

// POST /org/branches — 지점 생성
orgRouter.post('/org/branches', adminOnly, async (req, res, next) => {
  try {
    const { headquartersId, name } = branchCreateSchema.parse(req.body);
    // 부모 존재 검증
    const parent = await nextDb.headquarters.findUnique({ where: { id: headquartersId } });
    if (!parent) throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다');
    // 해당 부모 범위의 max sortOrder
    const max = await nextDb.branch.aggregate({
      _max: { sortOrder: true },
      where: { headquartersId },
    });
    const row = await nextDb.branch.create({
      data: { headquartersId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(row);
  } catch (e) {
    next(asDuplicateName(e));
  }
});

// POST /org/substations — 변전소 생성
orgRouter.post('/org/substations', adminOnly, async (req, res, next) => {
  try {
    const { branchId, name } = substationCreateSchema.parse(req.body);
    // 부모 존재 검증
    const parent = await nextDb.branch.findUnique({ where: { id: branchId } });
    if (!parent) throw new HttpError(422, 'INVALID_PARENT', '상위 조직이 없습니다');
    // 해당 부모 범위의 max sortOrder
    const max = await nextDb.substation.aggregate({
      _max: { sortOrder: true },
      where: { branchId },
    });
    const row = await nextDb.substation.create({
      data: { branchId, name, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    res.status(201).json(row);
  } catch (e) {
    next(asDuplicateName(e));
  }
});

/* 층을 만들고 고치고 지우는 길은 여기 없다 — **층은 워킹카피의 것**이다(커밋 채널).
   조직 셋과 달리 층은 변전소 **안의 내용**이라, 같은 화면에서 자산과 함께 편집된다.
   즉시 쓰기로 두면 한 화면에 규칙이 둘 돌아 그 경계마다 예외가 생겼다(`commitPayloadSchema`). */

// 본부/지점/변전소 3종의 PATCH·DELETE 핸들러는 델리게이트만 다른 동일 스켈레톤이므로
// 고정 3종 테이블(kind → 델리게이트·자식카운트 함수)로 파라미터화한다.
// 주의: 변전소는 자식이 두 관계(floor + rack + fiberLine)에 걸쳐 있어 childCount 함수가 다른 3종과 모양이 다르다 —
// 이 비대칭은 문자열 분기가 아니라 테이블 값(함수) 차이로만 표현한다.
interface OrgKindEntry {
  path: 'headquarters' | 'branches' | 'substations';
  delegate: {
    findUnique: (args: { where: { id: string } }) => Promise<{ id: string } | null>;
    update: (args: { where: { id: string }; data: { name?: string; sortOrder?: number } }) => Promise<unknown>;
    delete: (args: { where: { id: string } }) => Promise<unknown>;
  };
  // 자식 존재 시 DELETE 를 막기 위한 카운트 — kind별로 참조하는 자식 관계가 다르다.
  childCount: (id: string) => Promise<number>;
  // 막혔을 때 **무엇이** 막았는지 — 「하위 항목이 있습니다」로는 화면에서 아무것도 못 찾는다.
  // 층은 특히 그렇다: 도면에 안 놓인 자산도 층에 딸려 있어 캔버스는 비어 보인다.
  childLabel: string;
}

const orgKinds: OrgKindEntry[] = [
  {
    path: 'headquarters',
    delegate: nextDb.headquarters,
    childCount: (id) => nextDb.branch.count({ where: { headquartersId: id } }),
    childLabel: '지사',
  },
  {
    path: 'branches',
    delegate: nextDb.branch,
    childCount: (id) => nextDb.substation.count({ where: { branchId: id } }),
    childLabel: '변전소',
  },
  {
    path: 'substations',
    delegate: nextDb.substation,
    // 변전소 자식: 층·랙·광선로 끝 — 광선로는 두 국에 걸치므로 어느 끝이든 센다
    childCount: async (id) =>
      (await nextDb.floor.count({ where: { substationId: id } }))
      + (await nextDb.rack.count({ where: { substationId: id } }))
      + (await nextDb.fiberLine.count({ where: { OR: [{ aSubstationId: id }, { bSubstationId: id }] } })),
    childLabel: '층·랙·광선로',
  },
];

for (const { path, delegate, childCount, childLabel } of orgKinds) {
  // PATCH /org/<kind>/:id — 이름/정렬 수정 (4종 공통 스켈레톤)
  orgRouter.patch(`/org/${path}/:id`, adminOnly, async (req, res, next) => {
    try {
      const id = idParamSchema.parse(req.params.id);
      const patch = orgPatchSchema.parse(req.body);
      // 존재 검증
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
      const updated = await delegate.update({ where: { id }, data: patch });
      res.json(updated);
    } catch (e) {
      next(asDuplicateName(e));
    }
  });

  // DELETE /org/<kind>/:id — 자식 있으면 409, 없으면 삭제 (4종 공통 스켈레톤)
  orgRouter.delete(`/org/${path}/:id`, adminOnly, async (req, res, next) => {
    try {
      const id = idParamSchema.parse(req.params.id);
      // 존재 검증
      const row = await delegate.findUnique({ where: { id } });
      if (!row) throw new HttpError(404, 'NOT_FOUND', '해당 조직을 찾을 수 없습니다');
      // 자식 확인
      const count = await childCount(id);
      if (count > 0) {
        throw new HttpError(409, 'HAS_CHILDREN', `${childLabel} ${count}개가 딸려 있어 삭제할 수 없습니다`);
      }
      await delegate.delete({ where: { id } });
      res.status(204).end();
    } catch (e) {
      next(asDuplicateName(e));
    }
  });
}
