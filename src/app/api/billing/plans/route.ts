import { NextResponse } from 'next/server';
import { readPlans } from '@/lib/billing/plans-store';

export const dynamic = 'force-dynamic';

// GET /api/billing/plans → bảng gói cước HIỆN HÀNH (đã merge override admin). Công khai cho trang giá.
export async function GET() {
  return NextResponse.json({ plans: await readPlans() });
}
