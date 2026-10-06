/**
 * 마스터 — 분야·랙 종류·설비 종류·케이블 종류. **넷 다 단순 표**다.
 *
 * 옛 카탈로그는 포트 템플릿·구성 그리드·내부 결선을 안고 있어 한 종류를 고치는 데 구조
 * 검사(TYPE_IN_USE 의 구조 변경 판정·accepts 정규화)가 따랐다. 이제 종류는 이름과 품셈뿐이라
 * 「쓰이는 중이면 못 지운다」와 「쓰이는 케이블 종류의 매체는 못 바꾼다」 둘만 남는다.
 */
import { CABLE_MEDIA } from '@twin/core';
import { Router } from 'express';
import { adminOnly, authenticate } from './auth.middleware.js';
import { catalogBodies, catalogPatches, CATALOG_KINDS, type CatalogKind } from './catalog.schemas.js';
import { isPrismaError, nextDb } from './db.js';
import { HttpError } from './errors.js';

export const catalogRouter = Router();
catalogRouter.use(authenticate);

interface Delegate {
  create(args: { data: object }): Promise<unknown>;
  update(args: { where: { id: string }; data: object }): Promise<unknown>;
  delete(args: { where: { id: string } }): Promise<unknown>;
  findUnique(args: { where: { id: string } }): Promise<unknown>;
}

/** 종류마다 다른 것은 델리게이트와 「무엇이 쓰고 있나」 셈뿐이다 — 테이블 값으로만 가른다. */
const KINDS: Record<CatalogKind, { delegate: () => Delegate; usage: (id: string) => Promise<number> }> = {
  categories: { delegate: () => nextDb.category as unknown as Delegate, usage: (id) => nextDb.equipmentType.count({ where: { categoryId: id } }) },
  'rack-types': { delegate: () => nextDb.rackType as unknown as Delegate, usage: (id) => nextDb.rack.count({ where: { rackTypeId: id } }) },
  'equipment-types': { delegate: () => nextDb.equipmentType as unknown as Delegate, usage: (id) => nextDb.equipment.count({ where: { typeId: id } }) },
  'cable-types': {
    delegate: () => nextDb.cableType as unknown as Delegate,
    usage: async (id) => (await nextDb.link.count({ where: { cableTypeId: id } })) + (await nextDb.fiberLine.count({ where: { cableTypeId: id } })),
  },
};

function kindOf(raw: string): CatalogKind {
  if (!(CATALOG_KINDS as string[]).includes(raw)) throw new HttpError(404, 'NOT_FOUND', '없는 목록입니다');
  return raw as CatalogKind;
}

catalogRouter.get('/catalog', async (_req, res, next) => {
  try {
    const order = [{ sortOrder: 'asc' as const }, { name: 'asc' as const }];
    const [categories, rackTypes, equipmentTypes, cableTypes, activeStandards, rates] = await Promise.all([
      nextDb.category.findMany({ orderBy: order }),
      nextDb.rackType.findMany({ orderBy: order }),
      nextDb.equipmentType.findMany({ orderBy: order }),
      nextDb.cableType.findMany({ orderBy: order }),
      /* 적용 중인 기준정보를 카탈로그에 싣는다 — 노임은 노무유형 고르기의 어휘이자 설계서의
         단가이고, 제비율은 설계서의 요율이다. 화면마다 따로 조회하면 「어느 판을 봤나」가 갈린다. */
      nextDb.laborStandard.findMany({ where: { active: true } }),
      /* 직종 노임은 시계열 — 코드마다 가장 최근 값이 현재 단가다. */
      nextDb.laborRate.findMany({ orderBy: [{ code: 'asc' }, { effectiveOn: 'desc' }] }),
    ]);
    const latestByCode = new Map<string, (typeof rates)[number]>();
    for (const r of rates) if (!latestByCode.has(r.code)) latestByCode.set(r.code, r);
    const latest = rates.reduce<(typeof rates)[number] | null>((acc, r) => (acc === null || r.effectiveOn > acc.effectiveOn ? r : acc), null);
    const overhead = activeStandards.find((s) => s.kind === 'overhead') ?? null;
    res.json({
      categories, rackTypes, equipmentTypes, cableTypes, media: CABLE_MEDIA,
      wageStandard: latestByCode.size > 0
        ? {
            latestDate: latest?.effectiveLabel ?? null,
            rows: [...latestByCode.values()].map((r) => ({
              code: r.code, name: r.name, sector: r.sector, wage: r.wage,
              marker: r.marker, markerNote: r.markerNote, effectiveLabel: r.effectiveLabel,
            })),
          }
        : null,
      overheadStandard: overhead ? { id: overhead.id, ...(overhead.payload as Record<string, unknown>) } : null,
    });
  } catch (e) {
    next(e);
  }
});

catalogRouter.post('/catalog/:kind', adminOnly, async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind);
    const body = catalogBodies[kind].parse(req.body);
    res.status(201).json(await KINDS[kind].delegate().create({ data: body }));
  } catch (e) {
    next(isPrismaError(e, 'P2002') ? new HttpError(409, 'KEY_TAKEN', '같은 키가 이미 있습니다') : e);
  }
});

catalogRouter.patch('/catalog/:kind/:id', adminOnly, async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind);
    const patch = catalogPatches[kind].parse(req.body);
    const d = KINDS[kind].delegate();
    const current = (await d.findUnique({ where: { id: req.params.id } })) as { medium?: string } | null;
    if (!current) throw new HttpError(404, 'NOT_FOUND', '해당 종류를 찾을 수 없습니다');
    /* 쓰이는 케이블 종류의 매체를 바꾸면 그것을 쓰는 연결·광선로가 한꺼번에 검증에서 떨어져
       그 국들이 저장할 수 없게 된다 — 매체는 쓰이지 않을 때만 바꾼다. */
    const nextMedium = (patch as { medium?: string }).medium;
    if (kind === 'cable-types' && nextMedium !== undefined && nextMedium !== current.medium) {
      const used = await KINDS[kind].usage(req.params.id);
      if (used > 0) throw new HttpError(409, 'TYPE_IN_USE', `${used}건이 이 케이블 종류를 쓰고 있어 매체를 바꿀 수 없습니다 — 새 종류를 만들어 옮기세요`);
    }
    res.json(await d.update({ where: { id: req.params.id }, data: patch }));
  } catch (e) {
    next(e);
  }
});

catalogRouter.delete('/catalog/:kind/:id', adminOnly, async (req, res, next) => {
  try {
    const kind = kindOf(req.params.kind);
    const { delegate, usage } = KINDS[kind];
    const d = delegate();
    if (!(await d.findUnique({ where: { id: req.params.id } }))) throw new HttpError(404, 'NOT_FOUND', '해당 종류를 찾을 수 없습니다');
    const used = await usage(req.params.id);
    if (used > 0) throw new HttpError(409, 'TYPE_IN_USE', `${used}건이 이 종류를 쓰고 있어 지울 수 없습니다`);
    await d.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e) {
    next(e);
  }
});
