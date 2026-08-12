import path from 'node:path';

const DATA = path.join(process.cwd(), '.data');

// API tương thích cho các store cũ: toàn bộ dữ liệu nay dùng chung một workspace.
export function activeBizId(): string {
  return 'global';
}

export function bizFile(name: string): string {
  return path.join(DATA, name);
}

export function globalFile(name: string): string {
  return path.join(DATA, name);
}

export function bizDir(): string {
  return DATA;
}
