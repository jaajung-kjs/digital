import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { seedMaterialCategories } from './seed-material-categories';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 기본 관리자 계정 생성
  const adminPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
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

  await seedMaterialCategories();

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
