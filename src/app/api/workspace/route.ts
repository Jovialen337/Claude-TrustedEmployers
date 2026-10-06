import { NextResponse } from 'next/server';
import { Workspace } from '@/domain/schemas';
import { deleteEverything, readWorkspace, writeWorkspace } from '@/storage/workspaceStore';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await readWorkspace());
}

export async function PUT(request: Request) {
  const body = await request.json();
  const parsed = Workspace.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Dataene kunne ikke lagres.', details: parsed.error.issues },
      { status: 400 },
    );
  }
  return NextResponse.json(await writeWorkspace(parsed.data));
}

/** "Slett alt" — wipes the local data directory. */
export async function DELETE() {
  await deleteEverything();
  return NextResponse.json({ deleted: true });
}
