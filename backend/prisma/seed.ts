import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedCableCategories } from './seed/cableCategories.js';
import { seedRackPresets } from './seed/rackPresets.js';
import { seedJikhalAssets } from './seed/jikhalAssets.js';
import { seedAssetTypes } from './seed/assetTypes.js';

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

  // 기본 관리자 계정 — 신규 설치 시에만 'admin123' 으로 생성.
  // 기존 admin 이 이미 있으면 passwordHash 는 손대지 않는다. 운영 환경에서
  // 비밀번호를 바꾼 뒤 재배포할 때마다 초기화되는 일이 없게.
  // 다만 계정 잠금(loginAttempts/lockedUntil) 은 재배포 시 풀어주는 게
  // 운영상 안전망으로 유효 — 운영자가 로컬에서 잠긴 채 떠 있어도 다음 배포로
  // 복구 가능.
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: { loginAttempts: 0, lockedUntil: null },
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

  // ── 참조 데이터: 매 배포 시드 (신규 추가분 반영, 운영 데이터 비파괴) ──
  //   - CableCategory (16종) / AssetType / RackPreset (1종)
  // assetTypes 는 rackPresets 보다 먼저 — 프리셋 모듈이 assetType id 를 참조.
  await seedCableCategories(prisma);
  const typeKeyToId = await seedAssetTypes(prisma);
  await seedRackPresets(prisma, typeKeyToId);

  // ── 초기 조직/변전소: 첫 배포(빈 DB)에만 시드 ───────────────────────────────
  // 요구사항: 첫 배포만 기본 데이터를 시드하고, 이후 재배포는 운영 데이터(이름변경·
  // 삭제·신규 추가)를 보존한다. seed 는 컨테이너 시작마다 실행되므로(Dockerfile CMD:
  // `migrate deploy && db seed`), 이 가드가 없으면 매 재시작에 기본 본부/변전소가
  // 재생성·이름 원복돼 운영 데이터가 사라진다(= "기본으로 덮어씌워짐" 버그).
  const isFirstDeploy = (await prisma.headquarters.count()) === 0;
  if (!isFirstDeploy) {
    console.log('↩︎  기존 조직 데이터 감지 — 초기 본부/변전소 시드 건너뜀(운영 데이터 보존)');
  } else {
    // 한전 15개 본부 + 전력지사
    for (let i = 0; i < headquartersData.length; i++) {
      const hqData = headquartersData[i];

      const hq = await prisma.headquarters.create({
        data: { id: `hq-${i + 1}`, name: hqData.name, sortOrder: i, createdById: admin.id },
      });

      for (let j = 0; j < hqData.branches.length; j++) {
        await prisma.branch.create({
          data: { headquartersId: hq.id, name: hqData.branches[j], sortOrder: j, createdById: admin.id },
        });
      }

      console.log(`✅ ${hqData.name}: ${hqData.branches.length}개 지사`);
    }

    // 강원본부 직할 13개 국소 + OFD/슬롯/선번장/OPGW (검수 JSON 기반, jikhalAssets)
    const gwHq = await prisma.headquarters.findFirst({ where: { name: '강원본부' } });
    const jikhal = gwHq ? await prisma.branch.findFirst({ where: { headquartersId: gwHq.id, name: '직할' } }) : null;
    if (jikhal) await seedJikhalAssets(prisma, admin.id, jikhal.id, typeKeyToId);
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
