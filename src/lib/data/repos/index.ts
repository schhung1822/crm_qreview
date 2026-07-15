// Bộ chọn driver kho dữ liệu. MẶC ĐỊNH 'file' (.data/*.json) - zero-setup.
// Để dùng Postgres: đặt STORAGE_DRIVER=prisma + DATABASE_URL, chạy prisma migrate.
// Prisma client chỉ được import ĐỘNG khi chọn driver prisma (file mode không tải nó).
import { fileRepositories } from './file';
import type { Repositories } from './types';

export type StorageDriver = 'file' | 'prisma';

export function storageDriver(): StorageDriver {
  return process.env.STORAGE_DRIVER === 'prisma' ? 'prisma' : 'file';
}

let cached: Repositories | null = null;

export async function getRepos(): Promise<Repositories> {
  if (cached) return cached;
  if (storageDriver() === 'prisma') {
    const { prismaRepositories } = await import('./prisma');
    cached = prismaRepositories;
  } else {
    cached = fileRepositories;
  }
  return cached;
}

export { fileRepositories };
export * from './types';
