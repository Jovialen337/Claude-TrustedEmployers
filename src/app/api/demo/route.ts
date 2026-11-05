import { NextResponse } from 'next/server';
import { demoWorkspace } from '@/demo/workspace';
import { writeWorkspace } from '@/storage/workspaceStore';

export const dynamic = 'force-dynamic';

/** Load the fake demo worker over whatever is stored, so the tool can be tried out empty-handed. */
export async function POST() {
  return NextResponse.json(await writeWorkspace(demoWorkspace()));
}
