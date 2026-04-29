import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedCableCategories } from './seed/cableCategories.js';
import { seedRackModuleCategories } from './seed/rackModuleCategories.js';
import { seedBomMaterials } from './seed/bomMaterials.js';
import { seedRackPresets } from './seed/rackPresets.js';

const prisma = new PrismaClient();

// 한전 15개 본부 + 직할 + 전력지사
const headquartersData: { name: string; branches: string[] }[] = [
  { name: '서울본부', branches: ['직할', '강남전력지사', '강서전력지사', '동부전력지사', '북부전력지사', '서부전력지사'] },
  { name: '인천본부', branches: ['직할', '부평전력지사', '남동전력지사', '서인천전력지사'] },
  { name: '경기본부', branches: ['직할', '수원전력지사', '성남전력지사', '안양전력지사', '안산전력지사', '의정부전력지사', '고양전력지사', '용인전력지사', '평택전력지사'] },
  { name: '강원본부', branches: ['직할', '강릉전력지사', '동해전력지사', '원주전력지사', '태백전력지사'] },
  { name: '충북본부', branches: ['직할', '충주전력지사', '제천전력지사'] },
  { name: '대전세종충남본부', branches: ['직할', '천안전력지사', '아산전력지사', '서산전력지사', '논산전력지사', '공주전력지사'] },
  { name: '전북본부', branches: ['직할', '군산전력지사', '익산전력지사', '남원전력지사', '정읍전력지사'] },
  { name: '광주전남본부', branches: ['직할', '목포전력지사', '순천전력지사', '여수전력지사', '나주전력지사', '해남전력지사'] },
  { name: '대구본부', branches: ['직할', '경산전력지사', '칠곡전력지사', '서대구전력지사'] },
  { name: '경북본부', branches: ['직할', '포항전력지사', '경주전력지사', '안동전력지사', '구미전력지사', '영주전력지사', '김천전력지사'] },
  { name: '부산본부', branches: ['직할', '동래전력지사', '해운대전력지사', '사상전력지사', '남부산전력지사'] },
  { name: '울산본부', branches: ['직할', '남울산전력지사', '울주전력지사'] },
  { name: '경남본부', branches: ['직할', '창원전력지사', '김해전력지사', '진주전력지사', '통영전력지사', '양산전력지사', '거제전력지사'] },
  { name: '전남동부본부', branches: ['직할', '광양전력지사', '보성전력지사'] },
  { name: '제주본부', branches: ['직할', '서귀포전력지사'] },
];

async function main() {
  console.log('🌱 Seeding database...');

  // 기본 관리자 계정 생성
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash: adminPassword, loginAttempts: 0, lockedUntil: null },
    create: {
      username: 'admin',
      passwordHash: adminPassword,
      name: '시스템 관리자',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`✅ Admin user created: ${admin.username}`);

  // 테스트용 일반 사용자 (개발 환경에서만)
  if (process.env.NODE_ENV === 'development') {
    const viewerPassword = await bcrypt.hash('viewer1234', 10);

    const viewer = await prisma.user.upsert({
      where: { username: 'viewer' },
      update: {},
      create: {
        username: 'viewer',
        passwordHash: viewerPassword,
        name: '일반 사용자',
        role: UserRole.VIEWER,
        isActive: true,
      },
    });

    console.log(`✅ Viewer user created: ${viewer.username}`);
  }

  // 한전 15개 본부 + 전력지사 시드
  for (let i = 0; i < headquartersData.length; i++) {
    const hqData = headquartersData[i];

    const hq = await prisma.headquarters.upsert({
      where: { id: `hq-${i + 1}` },
      update: { name: hqData.name, sortOrder: i },
      create: {
        id: `hq-${i + 1}`,
        name: hqData.name,
        sortOrder: i,
        createdById: admin.id,
      },
    });

    for (let j = 0; j < hqData.branches.length; j++) {
      await prisma.branch.upsert({
        where: {
          headquartersId_name: {
            headquartersId: hq.id,
            name: hqData.branches[j],
          },
        },
        update: { sortOrder: j },
        create: {
          headquartersId: hq.id,
          name: hqData.branches[j],
          sortOrder: j,
          createdById: admin.id,
        },
      });
    }

    console.log(`✅ ${hqData.name}: ${hqData.branches.length}개 지사`);
  }

  // 신규 분리된 4개 도메인 시드 (P6)
  //   - CableCategory       (16종)
  //   - RackModuleCategory  (12종)
  //   - BomMaterial         (34종 = 9 parent + 25 leaf)
  //   - RackPreset          (1종)
  await seedCableCategories(prisma);
  await seedRackModuleCategories(prisma);
  await seedBomMaterials(prisma);
  await seedRackPresets(prisma);

  // 샘플 변전소 + 층 (개발 테스트용)
  if (process.env.NODE_ENV === 'development') {
    const substationFixtures = [
      { hqName: '강원본부', branchName: '직할', subName: '춘천변전소', floors: ['B1F', '1F'] },
      { hqName: '서울본부', branchName: '강남전력지사', subName: '강남변전소', floors: ['1F'] },
      { hqName: '경기본부', branchName: '수원전력지사', subName: '수원변전소', floors: ['1F'] },
    ];

    for (const fix of substationFixtures) {
      const hq = await prisma.headquarters.findFirst({ where: { name: fix.hqName } });
      if (!hq) continue;
      const branch = await prisma.branch.findFirst({
        where: { headquartersId: hq.id, name: fix.branchName },
      });
      if (!branch) continue;

      const sub = await prisma.substation.upsert({
        where: { id: `sub-${fix.subName}` },
        update: { name: fix.subName },
        create: {
          id: `sub-${fix.subName}`,
          branchId: branch.id,
          name: fix.subName,
          createdById: admin.id,
          updatedById: admin.id,
        },
      });

      for (let i = 0; i < fix.floors.length; i++) {
        const floorName = fix.floors[i];
        await prisma.floor.upsert({
          where: { substationId_name: { substationId: sub.id, name: floorName } },
          update: { sortOrder: i, floorNumber: floorName },
          create: {
            substationId: sub.id,
            name: floorName,
            floorNumber: floorName,
            sortOrder: i,
            createdById: admin.id,
            updatedById: admin.id,
          },
        });
      }

      console.log(`✅ ${fix.subName} (${fix.floors.length}개 층)`);
    }
  }

  console.log('🎉 Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
