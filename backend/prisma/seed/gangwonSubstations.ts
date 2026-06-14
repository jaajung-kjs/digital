import { PrismaClient } from '@prisma/client';

/**
 * 강원본부 직할 변전소 시드 — `직할_OFD선번장_251218_최종본.xlsx` 기반.
 *
 * 13개 국소 + 변전소쌍 단위 광경로(FiberPath). 각 국소는 OFD 선번장 1개를 보유하므로
 * OFD 1 + RACK 1 + 송변전광단말장치 모듈 1 구조로 모델링하고, 연결된 변전소쌍마다
 * FiberPath 1개 + 양측 패치 케이블 2개를 둔다 (seed-edge-cases 와 동일 구조 → 토폴로지
 * 추적 가능).
 *
 * seed.ts 에서 호출 — 매 배포(`prisma db seed`)마다 실행. 모든 row 는 결정적 id +
 * create-only upsert (`update: {}`) 라 재실행해도 중복 생성 없고 운영자 수정분은 보존된다
 * (다만 운영자가 *삭제*한 row 는 다음 배포가 다시 생성함 — 의도된 동작).
 *
 * 경로는 선번장 각 시트의 상대국 블록 기준. 외부 상대국(홍천·청평·간성·가평 등 13개 밖)
 * 으로의 연결은 이번 범위에서 제외 — 소양강수력은 홍천(외부)에만 연결돼 단독 노드.
 */

interface GwSub {
  key: string;
  name: string;
}

// 선번장 13개 시트 = 강원본부 직할 13개 국소. 변전소=S/S, 수력발전=H/P, 개폐소=S/Y.
const SUBSTATIONS: GwSub[] = [
  { key: 'guchuncheon', name: '(구)춘천S/S' },
  { key: 'sinchuncheon', name: '(신)춘천S/S' },
  { key: 'bukchuncheon', name: '북춘천S/S' },
  { key: 'namchuncheon', name: '남춘천S/S' },
  { key: 'seohongcheon', name: '서홍천S/S' },
  { key: 'yeolbyeonghap', name: '열병합S/Y' },
  { key: 'inje', name: '인제S/S' },
  { key: 'yanggu', name: '양구S/S' },
  { key: 'cheorwon', name: '철원S/S' },
  { key: 'hwacheon', name: '화천S/S' },
  { key: 'hwacheonhp', name: '화천H/P' },
  { key: 'chuncheonhp', name: '춘천H/P' },
  { key: 'soyanghp', name: '소양강H/P' },
];

// 변전소쌍 광경로 — 선번장 상대국 블록에서 양 끝이 모두 13개 안인 연결.
const EDGES: [string, string][] = [
  ['guchuncheon', 'sinchuncheon'],
  ['guchuncheon', 'bukchuncheon'],
  ['bukchuncheon', 'chuncheonhp'],
  ['namchuncheon', 'yeolbyeonghap'],
  ['seohongcheon', 'yeolbyeonghap'],
  ['inje', 'yanggu'],
  ['yanggu', 'hwacheonhp'],
  ['cheorwon', 'hwacheon'],
  ['hwacheon', 'hwacheonhp'],
  ['hwacheonhp', 'chuncheonhp'],
];

// 모든 id 는 결정적 UUID 형식 — floor plan API 가 equipment.id 등을 z.string().uuid()
// 로 검증하므로 비-UUID 문자열은 저장 시 400. `9a0000TT-0000-4000-b000-IIIIIIIIIIII`
// (TT=종류, IIII=인덱스, 전부 hex). TYPE 은 종류별 고정 슬롯 — 충돌 방지.
const TYPE = { sub: 1, floor: 2, ofd: 3, rack: 4, module: 5, path: 6, cableA: 7, cableB: 8 } as const;
const gwUuid = (type: number, idx: number) =>
  `9a0000${String(type).padStart(2, '0')}-0000-4000-b000-${String(idx).padStart(12, '0')}`;

const subIndex = new Map(SUBSTATIONS.map((s, i) => [s.key, i + 1]));
const idxOf = (key: string): number => {
  const i = subIndex.get(key);
  if (i === undefined) throw new Error(`알 수 없는 변전소 key: ${key}`);
  return i;
};
const subId = (key: string) => gwUuid(TYPE.sub, idxOf(key));
const floorId = (key: string) => gwUuid(TYPE.floor, idxOf(key));
const ofdId = (key: string) => gwUuid(TYPE.ofd, idxOf(key));
const rackId = (key: string) => gwUuid(TYPE.rack, idxOf(key));
const moduleId = (key: string) => gwUuid(TYPE.module, idxOf(key));

export async function seedGangwonSubstations(prisma: PrismaClient, adminId: string) {
  console.log('🌱 Seeding 강원본부 직할 변전소...');

  const hq = await prisma.headquarters.findFirst({ where: { name: '강원본부' } });
  if (!hq) {
    console.warn('  ⚠️  강원본부 없음 — 강원 직할 시드 skip');
    return;
  }
  const branch = await prisma.branch.findFirst({
    where: { headquartersId: hq.id, name: '직할' },
  });
  if (!branch) {
    console.warn('  ⚠️  강원본부 직할 지사 없음 — 강원 직할 시드 skip');
    return;
  }

  // Asset 마이그레이션: 구 Equipment/RackModule → Asset, 구 RackModuleCategory → AssetType.
  // 배치 종류(OFD/RACK)와 모듈 타입(EQP-OPT-TERM)을 asset_types 에서 code 로 해석한다.
  const ofdType = await prisma.assetType.findUnique({ where: { code: 'OFD' } });
  const rackType = await prisma.assetType.findUnique({ where: { code: 'RACK' } });
  const optTerm = await prisma.assetType.findUnique({ where: { code: 'EQP-OPT-TERM' } });
  if (!ofdType || !rackType || !optTerm) {
    console.warn('  ⚠️  OFD/RACK/EQP-OPT-TERM AssetType 없음 — 강원 직할 시드 skip');
    return;
  }

  // ─── 국소별: 변전소 + 통신실 + OFD + RACK + 송변전광단말장치 모듈 ───
  for (let i = 0; i < SUBSTATIONS.length; i++) {
    const s = SUBSTATIONS[i];

    await prisma.substation.upsert({
      where: { id: subId(s.key) },
      update: {},
      create: {
        id: subId(s.key),
        branchId: branch.id,
        name: s.name,
        sortOrder: i,
        createdById: adminId,
        updatedById: adminId,
      },
    });

    await prisma.floor.upsert({
      where: { id: floorId(s.key) },
      update: {},
      create: {
        id: floorId(s.key),
        substationId: subId(s.key),
        name: '통신실',
        floorNumber: '1F',
        sortOrder: 0,
        createdById: adminId,
        updatedById: adminId,
      },
    });

    await prisma.asset.upsert({
      where: { id: ofdId(s.key) },
      update: {},
      create: {
        id: ofdId(s.key),
        substationId: subId(s.key),
        assetTypeId: ofdType.id,
        parentAssetId: null,
        floorId: floorId(s.key),
        name: 'OFD',
        positionX: 400,
        positionY: 300,
        width2d: 100,
        height2d: 60,
        sortOrder: 0,
      },
    });

    await prisma.asset.upsert({
      where: { id: rackId(s.key) },
      update: {},
      create: {
        id: rackId(s.key),
        substationId: subId(s.key),
        assetTypeId: rackType.id,
        parentAssetId: null,
        floorId: floorId(s.key),
        name: '통신랙',
        positionX: 700,
        positionY: 300,
        width2d: 120,
        height2d: 80,
        totalU: 12,
        sortOrder: 1,
      },
    });

    await prisma.asset.upsert({
      where: { id: moduleId(s.key) },
      update: {},
      create: {
        id: moduleId(s.key),
        substationId: subId(s.key),
        assetTypeId: optTerm.id,
        parentAssetId: rackId(s.key),
        name: '송변전광단말장치',
        slotIndex: 0,
        slotSpan: 1,
        sortOrder: 0,
      },
    });
  }

  console.log(`  ✅ 강원 직할 ${SUBSTATIONS.length}개 변전소 (광경로 시드는 P7에서 제거됨)`);
}
