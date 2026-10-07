/**
 * 순서 저장 — **목록 단위로, 한 문**.
 *
 * 트리에서 줄을 끌면 「그 부모의 자식 전체가 이 순서다」가 정해진다. 그것을 그대로 보낸다:
 * 받은 차례대로 `sortOrder` 를 0,1,2… 로 다시 매긴다. 「하나만 고치고 뒤엣것을 밀기」는
 * 부르는 쪽이 번호를 셈해야 하고, 화면이 본 순서와 서버의 순서가 어긋날 길을 남긴다.
 *
 * 조직(본부·지사·변전소)과 마스터(분야·랙 종류·설비 종류·케이블 종류)이 같은 문을 쓴다 —
 * 예전에는 조직만 순서를 바꿀 수 있었고, 같은 트리 판을 쓰는 마스터들은 못 했다. 종류마다
 * 길을 따로 내면 그렇게 갈린다.
 */
import { Router } from 'express';
import { z } from 'zod';
import { adminOnly, authenticate } from './auth.middleware.js';
import { nextDb } from './db.js';
import { HttpError } from './errors.js';

/** 순서를 갖는 목록들 — 이름은 화면이 쓰는 말과 같다. */
const DELEGATES = {
  headquarters: () => nextDb.headquarters,
  branches: () => nextDb.branch,
  substations: () => nextDb.substation,
  categories: () => nextDb.category,
  'rack-types': () => nextDb.rackType,
  'equipment-types': () => nextDb.equipmentType,
  'cable-types': () => nextDb.cableType,
} as const;

const orderSchema = z.object({
  kind: z.enum(Object.keys(DELEGATES) as [keyof typeof DELEGATES, ...Array<keyof typeof DELEGATES>]),
  /** 새 순서 — 한 부모의 자식 전체. 빠진 것이 있으면 그 자리는 예전 번호로 남는다. */
  ids: z.array(z.string().uuid()).min(1),
});

export const orderRouter = Router();
orderRouter.use(authenticate);

orderRouter.patch('/order', adminOnly, async (req, res, next) => {
  try {
    const { kind, ids } = orderSchema.parse(req.body);
    const delegate = DELEGATES[kind]() as { update: (args: unknown) => Promise<unknown> };
    /* 한 트랜잭션 — 절반만 매겨진 순서는 목록을 뒤섞는다. */
    await nextDb.$transaction(
      ids.map((id, i) => delegate.update({ where: { id }, data: { sortOrder: i } }) as never),
    );
    res.status(204).end();
  } catch (e) {
    /* 없는 id 가 섞이면 전부 되돌아간다 — 무엇이 잘못됐는지 말해 준다. */
    if (e instanceof Error && e.message.includes('Record to update not found')) {
      next(new HttpError(404, 'NOT_FOUND', '순서를 변경할 대상을 찾을 수 없습니다'));
      return;
    }
    next(e);
  }
});
