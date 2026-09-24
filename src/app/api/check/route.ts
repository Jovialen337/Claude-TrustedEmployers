import { NextResponse } from 'next/server';
import { runCheck } from '@/domain/engine';
import { readWorkspace } from '@/storage/workspaceStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(runCheck(await readWorkspace()));
}
