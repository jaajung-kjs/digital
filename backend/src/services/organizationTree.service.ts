import prisma from '../config/prisma.js';

/**
 * 조직트리 전체(평면) 로드 — 프론트 워킹카피 eager-load 용.
 * 조직 메타데이터만 반환(자산 제외). 정렬 적용.
 */
export async function getOrgTree() {
  const [headquarters, branches, substations, floors] = await Promise.all([
    prisma.headquarters.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, sortOrder: true, updatedAt: true },
    }),
    prisma.branch.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, headquartersId: true, sortOrder: true, updatedAt: true },
    }),
    prisma.substation.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, branchId: true, address: true, sortOrder: true, updatedAt: true },
    }),
    prisma.floor.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, substationId: true, floorNumber: true, sortOrder: true, updatedAt: true },
    }),
  ]);

  return { headquarters, branches, substations, floors };
}
