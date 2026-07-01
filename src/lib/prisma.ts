// Prisma client singleton. Chỉ khởi tạo khi có DATABASE_URL.
// Pages/scaffold hiện chạy bằng seed data (src/lib/data) nên không bắt buộc DB.
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
