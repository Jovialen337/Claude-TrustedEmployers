import { runCheck } from '@/domain/engine';
import { buildReportPdf } from '@/report/pdf';
import { readWorkspace } from '@/storage/workspaceStore';

export const dynamic = 'force-dynamic';

/** The PDF is built on the server because pdfkit is a Node library; nothing leaves the machine. */
export async function GET() {
  const workspace = await readWorkspace();
  const result = runCheck(workspace);
  const pdf = await buildReportPdf(result, workspace);
  const date = result.generatedAt.slice(0, 10);

  return new Response(new Uint8Array(pdf), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="lonnssjekk-rapport-${date}.pdf"`,
      'cache-control': 'no-store',
    },
  });
}
