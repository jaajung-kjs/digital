import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../src/config/prisma.js';
import { commitSubstation } from '../src/services/substationCommit.service.js';
import { substationCommitSchema } from '../src/schemas/substationCommit.schema.js';

describe('substationCommitSchema: fiberCores', () => {
  it('fiberCores create/update/delete 를 파싱한다', () => {
    const parsed = substationCommitSchema.parse({
      fiberCores: {
        creates: [{ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5, purpose: '통합단말', circuitText: '원주 GR2링' }],
        updates: [{ id: 'fc1', baseVersion: null, patch: { spliceType: '패치', usageOverride: '사용' } }],
        deletes: [{ id: 'fc2', baseVersion: null }],
      },
    });
    expect(parsed.fiberCores?.creates[0]).toMatchObject({ tempId: 't1', fiberPathId: 'fp1', coreNumber: 5 });
    expect(parsed.fiberCores?.updates[0].patch).toMatchObject({ spliceType: '패치', usageOverride: '사용' });
    expect(parsed.fiberCores?.deletes[0].id).toBe('fc2');
  });
});

/**
 * Task 4 — 커밋 서비스가 실제로 FiberCore 행을 create/update/delete 하는지(Step-4 코드 경로)를
 * 실 테스트 DB(통합)로 검증한다. substationCommit.integration.test.ts 의 시드 스타일을 그대로 따른다.
 * OFD 자산 2개 + FiberPath 1개를 시드한 뒤 commitSubstation() 을 in-process 로 직접 호출.
 */
describe('substationCommit 서비스 — fiberCores create/update/delete', () => {
  let userId: string;
  let hqId: string, brId: string, subId: string, ofdTypeId: string;
  let ofdAId: string, ofdBId: string, fiberPathId: string;

  beforeAll(async () => {
    userId = (await prisma.user.findFirstOrThrow({ where: { username: 'admin' } })).id;
    const hq = await prisma.headquarters.create({ data: { name: '__fc_hq__' } }); hqId = hq.id;
    const br = await prisma.branch.create({ data: { name: '__fc_br__', headquartersId: hq.id } }); brId = br.id;
    const sub = await prisma.substation.create({ data: { name: '__fc_sub__', branchId: br.id } }); subId = sub.id;
    ofdTypeId = (await prisma.assetType.findFirstOrThrow({ where: { placementKind: 'OFD', isActive: true } })).id;

    const a = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: 'OFD-A' } });
    const b = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: 'OFD-B' } });
    ofdAId = a.id; ofdBId = b.id;
    const fp = await prisma.fiberPath.create({
      data: { ofdAId, ofdBId, portCount: 48, createdById: userId, updatedById: userId },
    });
    fiberPathId = fp.id;
  });

  afterAll(async () => {
    await prisma.fiberCore.deleteMany({ where: { fiberPathId } }).catch(() => {});
    await prisma.fiberPath.delete({ where: { id: fiberPathId } }).catch(() => {});
    await prisma.asset.deleteMany({ where: { substationId: subId } }).catch(() => {});
    await prisma.substation.delete({ where: { id: subId } }).catch(() => {});
    await prisma.branch.delete({ where: { id: brId } }).catch(() => {});
    await prisma.headquarters.delete({ where: { id: hqId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('create → update(spliceType 패치) → delete 가 실제 DB 행에 반영된다 (resolveFiber 로 fiberPathId 해소)', async () => {
    // ── create (core 5, purpose 통합단말) ──
    const createInput = substationCommitSchema.parse({
      fiberCores: {
        creates: [{ tempId: 'fcNew', fiberPathId, coreNumber: 5, purpose: '통합단말' }],
      },
    });
    const created = await commitSubstation(subId, createInput, userId);
    const fcId = created.idMaps.fiberCores['fcNew'];
    expect(fcId).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.updated.fiberCores.some((r) => r.id === fcId)).toBe(true);

    const row = await prisma.fiberCore.findUniqueOrThrow({ where: { id: fcId } });
    expect(row.fiberPathId).toBe(fiberPathId);
    expect(row.coreNumber).toBe(5);
    expect(row.purpose).toBe('통합단말');
    expect(row.createdById).toBe(userId);

    // ── update (spliceType 패치) ──
    const updateInput = substationCommitSchema.parse({
      fiberCores: { updates: [{ id: fcId, baseVersion: null, patch: { spliceType: '패치' } }] },
    });
    const updated = await commitSubstation(subId, updateInput, userId);
    expect(updated.updated.fiberCores.some((r) => r.id === fcId)).toBe(true);
    const afterUpdate = await prisma.fiberCore.findUniqueOrThrow({ where: { id: fcId } });
    expect(afterUpdate.spliceType).toBe('패치');
    // 패치하지 않은 필드는 유지
    expect(afterUpdate.purpose).toBe('통합단말');

    // ── delete ──
    const deleteInput = substationCommitSchema.parse({
      fiberCores: { deletes: [{ id: fcId, baseVersion: null }] },
    });
    await commitSubstation(subId, deleteInput, userId);
    expect(await prisma.fiberCore.findUnique({ where: { id: fcId } })).toBeNull();
  });

  it('create 의 fiberPathId 가 같은 커밋의 fiberPath tempId 면 resolveFiber 로 실 id 로 해소된다', async () => {
    // (ofdAId, ofdBId) 는 unique — 시드 FiberPath 와 충돌 않도록 새 OFD 쌍을 만든다.
    const c = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: 'OFD-C' } });
    const d = await prisma.asset.create({ data: { substationId: subId, assetTypeId: ofdTypeId, name: 'OFD-D' } });
    const input = substationCommitSchema.parse({
      fiberPaths: {
        creates: [{ tempId: 'fpTmp', ofdAId: c.id, ofdBId: d.id, portCount: 12 }],
      },
      fiberCores: {
        creates: [{ tempId: 'fcTmp', fiberPathId: 'fpTmp', coreNumber: 1, purpose: '예비' }],
      },
    });
    const res = await commitSubstation(subId, input, userId);
    const newFpId = res.idMaps.fiberPaths['fpTmp'];
    const newFcId = res.idMaps.fiberCores['fcTmp'];
    expect(newFpId).toMatch(/^[0-9a-f-]{36}$/);

    const row = await prisma.fiberCore.findUniqueOrThrow({ where: { id: newFcId } });
    // tempId('fpTmp') 가 새 fiberPath 의 실 id 로 해소돼야(FK 위반 없음).
    expect(row.fiberPathId).toBe(newFpId);

    // cleanup (cascade 로 fiberCore 도 제거됨)
    await prisma.fiberPath.delete({ where: { id: newFpId } }).catch(() => {});
  });
});
