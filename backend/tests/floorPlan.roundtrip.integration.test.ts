import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { floorsRouter } from '../src/routes/floors.routes.js';
import { rackModulesRouter } from '../src/routes/rackModules.routes.js';
import { authRouter } from '../src/routes/auth.routes.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import prisma from '../src/config/prisma.js';

describe('FloorPlan 라운드트립 계약 (Asset 마이그레이션 불변 방패)', () => {
  let app: Express;
  let token: string;
  let hqId: string, branchId: string, subId: string, floorId: string;
  let rackCatId: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/auth', authRouter);
    app.use('/api/floors', floorsRouter);
    app.use('/api/rack-modules', rackModulesRouter);
    app.use(errorHandler);

    const login = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    token = login.body.accessToken;

    const hq = await prisma.headquarters.create({ data: { name: '__rt_hq__' } });
    hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__rt_br__', headquartersId: hq.id } });
    branchId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__rt_sub__', branchId: br.id } });
    subId = sub.id;
    const floor = await prisma.floor.create({ data: { substationId: sub.id, name: '__rt_floor__', floorNumber: '1' } });
    floorId = floor.id;
    // 랙 모듈 카테고리 1개 확보 (시드된 것 사용)
    // ⚠️ 마이그레이션 민감 라인 — 이후 Task 13에서 AssetType 으로 교체된다(rack_module_categories 테이블 삭제 때문).
    const cat = await prisma.rackModuleCategory.findFirstOrThrow({ where: { isActive: true } });
    rackCatId = cat.id;
  });

  afterAll(async () => {
    await prisma.floor.delete({ where: { id: floorId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: branchId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('PUT plan(설비2+모듈1+케이블1) → GET plan 이 동일 형태로 돌려준다', async () => {
    const put = await request(app)
      .put(`/api/floors/${floorId}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        equipment: [
          { tempId: 'temp-rack', kind: 'RACK', name: '랙A', positionX: 10, positionY: 20, width: 80, height: 200, rotation: 0, totalU: 42 },
          // HVAC(비-OFD/비-RACK) 를 케이블 타깃으로 사용 — 현 계약상 OFD endpoint 는
          // fiberPathId+fiberPortNumber 필수, RACK 은 endpoint 불가이므로 일반 설비로 폴리모픽 케이블 검증.
          { tempId: 'temp-hvac', kind: 'HVAC', name: 'HVAC-1', positionX: 300, positionY: 50, width: 100, height: 60 },
        ],
        rackModules: [
          { tempId: 'temp-mod', rackEquipmentId: 'temp-rack', categoryId: rackCatId, name: '모듈1', slotIndex: 0, slotSpan: 1 },
        ],
        cables: [
          { source: { moduleId: 'temp-mod' }, target: { equipmentId: 'temp-hvac' }, cableType: 'LAN', pathPoints: [[10, 20], [300, 50]] },
        ],
      })
      .expect(200);

    // PUT /plan 응답은 { data: { equipmentIdMap, rackModuleIdMap, ... } } 로 래핑된다.
    const maps = put.body.data;
    expect(Object.keys(maps.equipmentIdMap)).toContain('temp-rack');
    expect(Object.keys(maps.equipmentIdMap)).toContain('temp-hvac');
    expect(Object.keys(maps.rackModuleIdMap)).toContain('temp-mod');
    const rackId = maps.equipmentIdMap['temp-rack'];
    const hvacId = maps.equipmentIdMap['temp-hvac'];
    const modId = maps.rackModuleIdMap['temp-mod'];

    const get = await request(app).get(`/api/floors/${floorId}/plan`).set('Authorization', `Bearer ${token}`).expect(200);
    // GET /plan 응답도 { data: { equipment, cables, fiberPaths, ... } } 로 래핑된다.
    const plan = get.body.data;
    const eqRack = plan.equipment.find((e: any) => e.id === rackId);
    expect(eqRack).toMatchObject({ kind: 'RACK', name: '랙A', positionX: 10, positionY: 20, width: 80, height: 200, totalU: 42 });
    const eqHvac = plan.equipment.find((e: any) => e.id === hvacId);
    expect(eqHvac).toMatchObject({ kind: 'HVAC', name: 'HVAC-1', positionX: 300, positionY: 50, width: 100, height: 60 });

    const cable = plan.cables[0];
    expect(cable.sourceModuleId).toBe(modId);
    expect(cable.targetEquipmentId).toBe(hvacId);
    expect(cable.cableType).toBe('LAN');

    const mods = await request(app).get(`/api/rack-modules?rackId=${rackId}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(mods.body.data[0]).toMatchObject({ rackEquipmentId: rackId, name: '모듈1', slotIndex: 0, slotSpan: 1, categoryId: rackCatId });
  });
});
