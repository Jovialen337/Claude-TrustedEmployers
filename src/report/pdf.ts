/**
 * The PDF report: sober and factual, meant to be handed to a manager, a tillitsvalgt or a
 * fagforening. Every flag carries its evidence, its calculation and its source.
 */
import PDFDocument from 'pdfkit';
import type { CheckResult } from '../domain/engine';
import { formatHours, formatKr } from '../domain/money';
import { SEVERITY_LABELS, type Contract, type Flag, type Severity, type Workspace } from '../domain/schemas';
import { formatSource, formatSources } from '../domain/sources';
import { formatDateShort } from '../domain/time';
import { DISCLAIMER, METHOD_NOTE } from './disclaimer';
import { draftMessage } from './draftMessage';

/**
 * pdfkit's built-in fonts use WinAnsi, which covers æøåÆØÅ and § but not every typographic
 * character the UI uses. Replace those rather than let them render as noise.
 */
export function toWinAnsi(text: string): string {
  return text
    .replace(/−/g, '-') // minus sign
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/•/g, '-')
    .replace(/[   ]/g, ' ')
    .replace(/✓/g, 'OK')
    .replace(/[^\u0000-ÿ–—«»×§]/g, '?');
}

const SEVERITY_ORDER: Severity[] = ['sannsynlig_feil', 'bor_sjekkes', 'til_info'];

export interface ReportOptions {
  /** Fixed date string, so the same input produces the same PDF in tests. */
  generatedLabel?: string;
  includeDraftMessage?: boolean;
}

export function buildReportPdf(
  result: CheckResult,
  workspace: Workspace,
  options: ReportOptions = {},
): Promise<Buffer> {
  const contract: Contract | null = workspace.contract;
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: 'Lønnssjekk — rapport',
      Author: contract?.employeeName ?? 'Lønnssjekk',
      Subject: 'Sammenligning av arbeidsavtale, vakter og lønnsslipper',
    },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
  });

  const write = (text: string, size = 10, font = 'Helvetica') =>
    doc.font(font).fontSize(size).text(toWinAnsi(text), { align: 'left' });

  const gap = (size = 8) => doc.moveDown(size / 10);

  /* ------------------------------------------------------------------ forside */
  write('Lønnssjekk', 22, 'Helvetica-Bold');
  write('Sammenligning av arbeidsavtale, vakter og lønnsslipper', 11);
  gap();

  if (contract) {
    write(`Arbeidstaker: ${contract.employeeName || '(ikke oppgitt)'}`, 10);
    write(`Arbeidsgiver: ${contract.employer || '(ikke oppgitt)'}`, 10);
    write(
      `Stilling: ${contract.stillingsprosent} % av ${formatHours(contract.fullTimeHoursPerWeek)} full stilling ` +
        `= ${formatHours(result.totals.contractedWeeklyHours)} i uka`,
      10,
    );
    write(
      `Lønn: ${formatKr(contract.wage.amountOre)} ${contract.wage.kind === 'hourly' ? 'per time' : 'per måned'}` +
        (contract.wage.kind === 'monthly' ? ` (tilsvarer ${formatKr(result.hourlyRateOre)} per time)` : ''),
      10,
    );
    if (contract.tariffavtale) write(`Tariffavtale oppgitt i kontrakten: ${contract.tariffavtale}`, 10);
  }

  if (result.dataRange) {
    write(
      `Periode: ${formatDateShort(result.dataRange.start)} – ${formatDateShort(result.dataRange.end)} ` +
        `(${result.totals.weeksObserved} hele uker)`,
      10,
    );
  }
  write(`Rapport laget: ${options.generatedLabel ?? result.generatedAt.slice(0, 10)}`, 10);
  write(`Regelsett: ${result.ruleSet.name} (${result.ruleSet.id} ${result.ruleSet.version})`, 10);
  gap(12);

  /* ----------------------------------------------------------------- sammendrag */
  write('Sammendrag', 14, 'Helvetica-Bold');
  write(`Anslag, arbeid som ikke er betalt: ${formatKr(result.totals.estimatedOwedOre)}`, 11, 'Helvetica-Bold');
  write(
    `Timer under avtalt arbeidstid: ${formatHours(result.totals.hoursShortVsContract)} ` +
      `(anslått verdi ${formatKr(result.totals.underScheduledOre)}, holdt utenfor summen over)`,
  );
  if (result.totals.feriepengerToCheckOre > 0) {
    write(`Feriepenger som bør sjekkes: ${formatKr(result.totals.feriepengerToCheckOre)}`);
  }
  write(
    `Funn: ${result.totals.bySeverity.sannsynlig_feil} sannsynlige feil, ` +
      `${result.totals.bySeverity.bor_sjekkes} som bør sjekkes, ${result.totals.bySeverity.til_info} til informasjon.`,
  );
  gap(12);
  write(METHOD_NOTE, 9);
  gap(6);
  write(DISCLAIMER, 9, 'Helvetica-Bold');

  /* --------------------------------------------------------------------- funnene */
  for (const severity of SEVERITY_ORDER) {
    const flags = result.flags.filter((flag) => flag.severity === severity);
    if (flags.length === 0) continue;

    doc.addPage();
    write(`${SEVERITY_LABELS[severity]} (${flags.length})`, 14, 'Helvetica-Bold');
    gap(6);

    for (const flag of flags) {
      writeFlag(doc, flag);
    }
  }

  /* ------------------------------------------------------------------- tidslinje */
  if (result.timeline.length > 0) {
    doc.addPage();
    write('Uke for uke', 14, 'Helvetica-Bold');
    write(
      'Avtalt arbeidstid, planlagte timer, timer som gjelder og betalte timer. Betalte timer står bare ' +
        'på uker der en lønnsslipp dekker akkurat den uka.',
      9,
    );
    gap(8);

    const columns = [
      { label: 'Uke', width: 95 },
      { label: 'Avtalt', width: 60 },
      { label: 'Planlagt', width: 65 },
      { label: 'Jobbet', width: 60 },
      { label: 'Betalt', width: 60 },
      { label: 'Funn', width: 130 },
    ];

    const header = () => {
      let x = doc.page.margins.left;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9);
      for (const column of columns) {
        doc.text(toWinAnsi(column.label), x, y, { width: column.width });
        x += column.width;
      }
      doc.moveDown(0.6);
    };

    header();
    doc.font('Helvetica').fontSize(9);

    for (const week of result.timeline) {
      if (doc.y > doc.page.height - 80) {
        doc.addPage();
        header();
        doc.font('Helvetica').fontSize(9);
      }
      const values = [
        week.label + (week.complete ? '' : ' (delvis)'),
        formatHours(week.contractedHours),
        week.plannedHours > 0 ? formatHours(week.plannedHours) : '-',
        formatHours(week.workedHours),
        week.paidHours === null ? '-' : formatHours(week.paidHours),
        week.worstSeverity ? `${week.flagIds.length} ${SEVERITY_LABELS[week.worstSeverity].toLowerCase()}` : '-',
      ];
      let x = doc.page.margins.left;
      const y = doc.y;
      values.forEach((value, index) => {
        const column = columns[index]!;
        doc.text(toWinAnsi(value), x, y, { width: column.width });
        x += column.width;
      });
      doc.moveDown(0.5);
    }
  }

  /* -------------------------------------------------------- utkast til melding */
  if (options.includeDraftMessage !== false) {
    doc.addPage();
    write('Utkast til melding til arbeidsgiver', 14, 'Helvetica-Bold');
    write('Les gjennom og endre teksten før du sender den. Verktøyet sender ingenting selv.', 9);
    gap(8);
    write(draftMessage(result, contract), 10);
  }

  /* --------------------------------------------------------------- kilder til slutt */
  doc.addPage();
  write('Reglene som er brukt', 14, 'Helvetica-Bold');
  gap(6);
  const seen = new Set<string>();
  for (const flag of result.flags) {
    for (const source of flag.sources) {
      const key = formatSource(source);
      if (seen.has(key)) continue;
      seen.add(key);
      write(key, 10, 'Helvetica-Bold');
      if (source.note) write(source.note, 9);
      if (source.url) write(source.url, 9);
      gap(6);
    }
  }
  gap(10);
  write(DISCLAIMER, 10, 'Helvetica-Bold');

  doc.end();
  return finished;
}

function writeFlag(doc: PDFKit.PDFDocument, flag: Flag): void {
  if (doc.y > doc.page.height - 200) doc.addPage();

  doc.font('Helvetica-Bold').fontSize(11).text(toWinAnsi(flag.title));
  doc
    .font('Helvetica')
    .fontSize(9)
    .text(
      toWinAnsi(
        `${flag.periodLabel}${flag.amountOre !== null ? ` · Anslag: ${formatKr(flag.amountOre)}` : ''}`,
      ),
    );
  doc.moveDown(0.3);
  doc.fontSize(10).text(toWinAnsi(flag.message));

  if (flag.calculation) {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).text(toWinAnsi(`Regnestykke: ${flag.calculation.expression}`));
  }

  if (flag.evidence.length > 0) {
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    for (const item of flag.evidence) {
      doc.text(toWinAnsi(`${item.label}: ${item.value}`), { indent: 12 });
    }
  }

  if (flag.documentRefs.length > 0) {
    doc.moveDown(0.2);
    doc.fontSize(9).text(
      toWinAnsi(
        `Hentet fra: ${flag.documentRefs
          .map((ref) => `${ref.docName}${ref.page !== null ? `, side ${ref.page}` : ''}`)
          .join('; ')}`,
      ),
      { indent: 12 },
    );
  }

  if (flag.sources.length > 0) {
    doc.fontSize(9).text(
      toWinAnsi(`Grunnlag: ${formatSources(flag.sources)}`),
      { indent: 12 },
    );
  }

  doc.moveDown(0.8);
}
