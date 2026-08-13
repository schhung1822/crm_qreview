// Phục vụ ảnh AI tự sinh (public/generated/<file>) qua ROUTE ĐỘNG - đọc đĩa mỗi request.
// Lý do: ở chế độ production (next start), thư mục public chỉ được "chụp" lúc build → ảnh sinh
// SAU khi server chạy sẽ 404 nếu dựa vào static. Route động đọc file lúc request nên chạy đúng
// cả dev lẫn production. URL giữ nguyên "/generated/<file>" (không phá reference đã lưu trong bài).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { bundledGeneratedImageDir, generatedImageDir } from '@/lib/generated-dir';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(_req: Request, props: { params: Promise<{ file: string }> }) {
  const params = await props.params;
  const raw = params.file;
  const name = path.basename(raw); // chặn path traversal (../, đường dẫn tuyệt đối)
  // Chỉ nhận tên file 1 đoạn, ký tự an toàn, có phần mở rộng ảnh hợp lệ.
  if (!name || name !== raw || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return new NextResponse('Not found', { status: 404 });

  try {
    const primary = path.join(generatedImageDir(), name);
    const bundled = path.join(bundledGeneratedImageDir(), name);
    const buf = await fs.readFile(primary).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' && primary !== bundled) return fs.readFile(bundled);
      throw error;
    });
    return new NextResponse(buf, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
