// Phục vụ ảnh AI tự sinh (public/generated/<file>) qua ROUTE ĐỘNG - đọc đĩa mỗi request.
// Lý do: ở chế độ production (next start), thư mục public chỉ được "chụp" lúc build → ảnh sinh
// SAU khi server chạy sẽ 404 nếu dựa vào static. Route động đọc file lúc request nên chạy đúng
// cả dev lẫn production. URL giữ nguyên "/generated/<file>" (không phá reference đã lưu trong bài).
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const DIR = path.join(process.cwd(), 'public', 'generated');
const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

export async function GET(_req: Request, { params }: { params: { file: string } }) {
  const raw = params.file;
  const name = path.basename(raw); // chặn path traversal (../, đường dẫn tuyệt đối)
  // Chỉ nhận tên file 1 đoạn, ký tự an toàn, có phần mở rộng ảnh hợp lệ.
  if (!name || name !== raw || !/^[A-Za-z0-9._-]+$/.test(name)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const type = TYPES[path.extname(name).toLowerCase()];
  if (!type) return new NextResponse('Not found', { status: 404 });

  try {
    const buf = await fs.readFile(path.join(DIR, name));
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
