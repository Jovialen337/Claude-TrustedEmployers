/**
 * Poengsummen for Lønnssjekk — målingene, ikke dommen.
 *
 *   npm run score                            # ny runde, nummeret settes automatisk
 *   npm run score -- --runde 3               # overskriv en bestemt runde
 *   npm run score -- --funn .score/funn-3.json
 *   npm run score -- --rask                  # hopp over tester og typecheck (feilsøking)
 *
 * Skriptet samler fakta og regner ut en poengsum etter formlene i `docs/SCORING.md`. Det
 * avgjør ingenting selv: dommen — Godkjent, Nesten (tenk om) eller Ikke godkjent — settes av
 * evalueringsagenten, som leser filen dette skriver. Grunnen er den samme som ellers i dette
 * prosjektet: tallene skal være etterprøvbare, og ingen skal kunne vurdere seg selv til
 * bestått. Kjør skriptet, og du får samme poengsum som agenten så.
 *
 * `--funn` tar inn bekreftede funn fra portvaktagenten og trekker fra for dem:
 *
 *   [{ "id": "F3", "dimensjon": "D1", "alvor": "alvorlig", "veto": false, "hva": "…" }]
 *
 * Alvor: kritisk −25, alvorlig −12, moderat −5, liten −2, innenfor dimensjonen. `veto: true`
 * tvinger Ikke godkjent uansett poengsum, og er forbeholdt det verktøyet aldri skal gjøre:
 * et falskt krav på høyeste alvorsgrad, personopplysninger på vei ut av maskinen, en regel
 * som viser til lovtekst som ikke finnes, eller et resultat som ikke er det samme to ganger.
 *
 * En full mekanisk poengsum er gulvet, ikke dommen. Alt her er ting en maskin kan telle; det
 * den ikke kan telle — om en regel leser loven riktig, om en melding er til å forstå for den
 * som får den — er nettopp det agentene er satt til å finne.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scoreDir = path.join(root, '.score');
const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : (args[at + 1] ?? null);
};
const quick = args.includes('--rask');

/* ------------------------------------------------------------------ verktøy */

function run(command, commandArgs, options = {}) {
  try {
    const stdout = execFileSync(command, commandArgs, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
      timeout: options.timeout ?? 600_000,
    });
    return { ok: true, stdout, stderr: '' };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? String(error.message ?? error),
    };
  }
}

/** Filene prosjektet selv eier — ikke node_modules, ikke bygde filer. */
function trackedFiles() {
  return run('git', ['ls-files']).stdout.split('\n').filter((line) => line !== '');
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

const share = (part, whole) => (whole === 0 ? 1 : part / whole);
const points = (value, max) => Math.round(value * max * 10) / 10;

/* -------------------------------------------------------------------- fakta */

const facts = {};

/* 1. Regelsettet */
const ruleSet = JSON.parse(readFileSync(path.join(root, 'rules', 'no_default.json'), 'utf8'));
const rules = ruleSet.rules;
const testSource = readdirSync(path.join(root, 'tests'))
  .filter((file) => file.endsWith('.ts'))
  .map((file) => readFileSync(path.join(root, 'tests', file), 'utf8'))
  .join('\n');

facts.regler = {
  antall: rules.length,
  verifisert: rules.filter((rule) => rule.verified === 'lovtekst').length,
  verifisertFordeling: rules.reduce((into, rule) => {
    into[rule.verified ?? 'mangler'] = (into[rule.verified ?? 'mangler'] ?? 0) + 1;
    return into;
  }, {}),
  /*
   * En kilde skal ha lov, paragraf og lenke — men bare når den *er* en lov. Noen av reglene
   * henter terskelen fra arbeidsavtalen eller tariffavtalen, og din egen avtale har ingen
   * lenke på lovdata. Å kreve en her ville straffet nettopp det prosjektet er bygget på:
   * kontrakten først, loven som nedre grense.
   */
  medFullKilde: rules.filter((rule) => {
    const sources = rule.sources ?? [];
    const isStatute = (source) => !/^(arbeidsavtalen|tariffavtale)/i.test(source.law ?? '');
    return (
      sources.length > 0 &&
      sources.every((source) => source.law && source.paragraph && (!isStatute(source) || source.url))
    );
  }).length,
  medForklaring: rules.filter((rule) => (rule.explanation ?? '').length >= 120).length,
  utenTest: rules.filter((rule) => !testSource.includes(`'${rule.id}'`)).map((rule) => rule.id),
};

/* 2. Lovtekstkorpuset — bare den lokale kontrollen, så målingen ikke avhenger av nettet */
const lovtekst = run('node', ['scripts/hent-lovtekst.mjs', '--lokalt']);
const corpusDir = path.join(root, 'docs', 'lovtekst');
facts.lovtekst = {
  ok: lovtekst.ok,
  avvik: (lovtekst.stdout.match(/AVVIK/g) ?? []).length,
  filer: existsSync(corpusDir)
    ? readdirSync(corpusDir)
        .filter((file) => file.endsWith('.txt'))
        .map((file) => ({ fil: file, tegn: statSync(path.join(corpusDir, file)).size }))
    : [],
};

/* 3. Typecheck og tester */
facts.typecheck = quick ? { hoppet: true, ok: null } : { ok: run('npx', ['tsc', '--noEmit']).ok };

if (quick) {
  facts.tester = { hoppet: true, ok: null, bestatt: null, feilet: null };
} else {
  const tests = run('npx', ['vitest', 'run']);
  const line = /Tests\s+(?:(\d+) failed \| )?(\d+) passed/.exec(tests.stdout);
  facts.tester = {
    ok: tests.ok,
    feilet: line ? Number(line[1] ?? 0) : null,
    bestatt: line ? Number(line[2]) : null,
    filer: /Test Files\s+.*\((\d+)\)/.exec(tests.stdout)?.[1] ?? null,
  };
}

/* 4. Renhet: reglene skal være rene funksjoner av det de får inn */
const impureTokens = ['Date.now(', 'new Date()', 'Math.random(', 'fetch(', 'process.env', 'localStorage'];
/**
 * `new Date(verdi)` regner om et tall eller en tekst og er like ren som aritmetikk — det er
 * `new Date()` uten argument som leser systemklokka, og bare den står på listen.
 *
 * Klokka kommer inn i appen på to steder med vilje: `runCheck` tar imot `now`, og
 * `emptyWorkspace` setter et tidspunkt når en ny mappe lages. Begge faller tilbake på
 * systemklokka hvis ingen sier noe annet, og det er riktig der. Alt annet — reglene og
 * regnestykkene de bygger på — skal være rene funksjoner av det de får inn, ellers kan ikke
 * et funn etterprøves i morgen. Det er de filene denne målingen gjelder.
 */
const pureModules = (file) =>
  file.startsWith('src/domain/rules/') ||
  [
    'src/domain/aggregate.ts',
    'src/domain/money.ts',
    'src/domain/time.ts',
    'src/domain/holidays.ts',
    'src/domain/thresholds.ts',
    'src/domain/derive.ts',
  ].includes(file);
const domainFiles = trackedFiles().filter((file) => pureModules(file) && file.endsWith('.ts'));
facts.renhet = {
  filer: domainFiles.length,
  brudd: domainFiles.flatMap((file) => {
    const text = readFileSync(path.join(root, file), 'utf8');
    return impureTokens.filter((token) => text.includes(token)).map((token) => `${file}: ${token}`);
  }),
  klokkensInnganger: trackedFiles()
    .filter((file) => file.startsWith('src/domain/') && file.endsWith('.ts') && !pureModules(file))
    .flatMap((file) => {
      const text = readFileSync(path.join(root, file), 'utf8');
      return [...text.matchAll(/.*new Date\(\).*/g)].map((match) => `${file}: ${match[0].trim()}`);
    }),
};

/* 5. Personvern: ingen ekte personopplysninger, og maskering før alt som går ut */
const PERSONNUMMER = /(?<![\d.])\d{11}(?![\d.])/;
const KONTONUMMER = /\b\d{4}[ .]\d{2}[ .]\d{5}\b/;
const API_KEY = /sk-ant-[A-Za-z0-9_-]{10}/;
const allowed = JSON.parse(
  readFileSync(path.join(root, 'scripts', 'personvern-tillatt.json'), 'utf8'),
).tillatt;
const privacyScope = (file) =>
  !file.startsWith('docs/lovtekst/') &&
  !file.startsWith('dist/') &&
  file !== 'package-lock.json' &&
  /\.(ts|tsx|mjs|js|json|md|txt|csv)$/.test(file);

facts.personvern = { utenforListen: [], foreldedeUnntak: [], nokkelIRepoet: [], funnetI: [] };
for (const file of trackedFiles().filter(privacyScope)) {
  const text = readIfExists(path.join(root, file));
  if (text === null) continue;
  if (API_KEY.test(text)) facts.personvern.nokkelIRepoet.push(file);
  const hits = [];
  if (PERSONNUMMER.test(text)) hits.push('11 siffer');
  if (KONTONUMMER.test(text)) hits.push('kontonummer');
  if (hits.length === 0) continue;
  facts.personvern.funnetI.push(file);
  if (allowed[file] === undefined) facts.personvern.utenforListen.push(`${file}: ${hits.join(', ')}`);
}
facts.personvern.foreldedeUnntak = Object.keys(allowed).filter(
  (file) => !facts.personvern.funnetI.includes(file),
);
facts.personvern.envSporet = trackedFiles().some((file) => file === '.env' || file === '.env.local');
facts.personvern.testerUtenNokkel = /uten (api-)?n(ø|o)kkel|without a key|no api key/i.test(testSource);

/*
 * Maskeringen er ikke et hjelpemiddel man kan huske å bruke — den må ligge i veien. Teksten
 * går til Claude gjennom én funksjon, `buildPrompt`, og den skal bare kunne nås fra
 * `extract.ts`, der `maskPersonalData` kjøres først. Målingen er den strukturen, ikke et søk
 * etter ordet «mask» i nærheten av et API-kall.
 */
facts.maskering = (() => {
  const extract = readIfExists(path.join(root, 'src/extraction/extract.ts')) ?? '';
  const detours = trackedFiles().filter(
    (file) =>
      file.startsWith('src/') &&
      file !== 'src/extraction/prompts.ts' &&
      file !== 'src/extraction/extract.ts' &&
      /\.tsx?$/.test(file) &&
      readFileSync(path.join(root, file), 'utf8').includes('buildPrompt('),
  );
  const maskedFirst =
    extract.includes('maskPersonalData(') &&
    extract.indexOf('maskPersonalData(') < extract.indexOf('buildPrompt(') &&
    /buildPrompt\(\s*[\s\S]{0,200}masked\.text/.test(extract);
  return { maskedFirst, omveier: detours };
})();

/* 6. Offline-utgaven */
const offline = path.join(root, 'dist', 'Lonnssjekk.html');
facts.offline = {
  finnes: existsSync(offline),
  kib: existsSync(offline) ? Math.round(statSync(offline).size / 1024) : null,
  smoke: quick
    ? { hoppet: true }
    : (() => {
        const out = run('node', ['scripts/smoke-offline.mjs']);
        const line = /(\d+) checks passed, (\d+) failed/.exec(out.stdout);
        return { ok: out.ok, bestatt: line ? Number(line[1]) : null, feilet: line ? Number(line[2]) : null };
      })(),
};

/* 7. Smoke mot den kjørende appen — bare hvis serveren faktisk svarer */
facts.smoke = await (async () => {
  if (quick) return { hoppet: true };
  const reachable = await fetch('http://127.0.0.1:3000/', { signal: AbortSignal.timeout(2000) })
    .then(() => true)
    .catch(() => false);
  if (!reachable) return { serverNede: true };
  const out = run('node', ['scripts/smoke.mjs']);
  const line = /(\d+) checks passed, (\d+) failed/.exec(out.stdout);
  return { ok: out.ok, bestatt: line ? Number(line[1]) : null, feilet: line ? Number(line[2]) : null };
})();

/* 8. Determinisme, ytelse og hva demoen faktisk produserer */
const probe = run('npx', ['tsx', 'scripts/score-probe.ts']);
facts.probe = probe.ok ? JSON.parse(probe.stdout) : { feil: probe.stderr.slice(0, 2000) };

/* --------------------------------------------------------------- poengsummen */

const findingsFile = flag('--funn');
const findings = findingsFile
  ? JSON.parse(readFileSync(path.resolve(root, findingsFile), 'utf8'))
  : [];
const ALVOR = { kritisk: 25, alvorlig: 12, moderat: 5, liten: 2 };

const p = facts.probe;
const ytelse = p.ytelse ?? [];
const smallest = ytelse[0];
const largest = ytelse[ytelse.length - 1];
const msPerShift = (entry) => (entry ? entry.ms / entry.shifts : null);
const scaling =
  smallest && largest && msPerShift(smallest) > 0 ? msPerShift(largest) / msPerShift(smallest) : null;

const dimensions = [
  {
    id: 'D1',
    navn: 'Juridisk treffsikkerhet',
    vekt: 0.3,
    deler: [
      ['Regler kontrollert mot lovteksten', points(share(facts.regler.verifisert, facts.regler.antall), 40), 40],
      ['Hver regel har lov, paragraf og lenke', points(share(facts.regler.medFullKilde, facts.regler.antall), 20), 20],
      ['Lovtekstkorpuset stemmer med reglene', facts.lovtekst.avvik === 0 && facts.lovtekst.ok ? 20 : 0, 20],
      [
        'Hver regel er dekket av en test',
        points(share(facts.regler.antall - facts.regler.utenTest.length, facts.regler.antall), 20),
        20,
      ],
    ],
  },
  {
    id: 'D2',
    navn: 'Determinisme og bevis',
    vekt: 0.2,
    deler: [
      ['Samme data gir samme svar', p.determinisme?.likeKjoringer ? 40 : 0, 40],
      ['Ingen funn uten bevis', (p.demo?.utenBevis ?? ['?']).length === 0 ? 20 : 0, 20],
      ['Ingen funn uten lovhenvisning', (p.demo?.utenKilde ?? ['?']).length === 0 ? 20 : 0, 20],
      ['Reglene er rene funksjoner', facts.renhet.brudd.length === 0 ? 20 : 0, 20],
    ],
  },
  {
    id: 'D3',
    navn: 'Korrekthet og testdekning',
    vekt: 0.2,
    deler: [
      ['Alle tester grønne', facts.tester.ok ? 50 : 0, 50],
      ['Typecheck rent', facts.typecheck.ok ? 20 : 0, 20],
      ['Smoke mot appen', facts.smoke.ok ? 15 : 0, 15],
      ['Smoke mot offline-fila', facts.offline.smoke?.ok ? 15 : 0, 15],
    ],
  },
  {
    id: 'D4',
    navn: 'Personvern og sikkerhet',
    vekt: 0.15,
    deler: [
      ['Ingen personopplysninger utenfor den godkjente listen', facts.personvern.utenforListen.length === 0 ? 20 : 0, 20],
      ['Ingen foreldede unntak på listen', facts.personvern.foreldedeUnntak.length === 0 ? 5 : 0, 5],
      ['Ingen API-nøkkel i repoet', facts.personvern.nokkelIRepoet.length === 0 ? 15 : 0, 15],
      ['Teksten kan ikke nå Claude umaskert', facts.maskering.maskedFirst && facts.maskering.omveier.length === 0 ? 20 : 0, 20],
      ['Virker uten API-nøkkel, og det er testet', facts.personvern.testerUtenNokkel ? 20 : 0, 20],
      ['Ingen .env sporet i git', facts.personvern.envSporet ? 0 : 20, 20],
    ],
  },
  {
    id: 'D5',
    navn: 'Ytelse og robusthet',
    vekt: 0.1,
    deler: [
      ['Fem år med vakter under 400 ms', largest && largest.ms < 400 ? 40 : 0, 40],
      ['Skalerer nær lineært', scaling !== null && scaling < 2 ? 30 : 0, 30],
      ['Offline-fila under 4 MiB', facts.offline.kib !== null && facts.offline.kib < 4096 ? 30 : 0, 30],
    ],
  },
  {
    id: 'D6',
    navn: 'Språk og forståelighet',
    vekt: 0.05,
    deler: [
      ['Hver regel forklart i klartekst', points(share(facts.regler.medForklaring, facts.regler.antall), 50), 50],
      ['Ingen funn med en melding som ikke forklarer noe', (p.demo?.korteMeldinger ?? ['?']).length === 0 ? 50 : 0, 50],
    ],
  },
];

for (const dimension of dimensions) {
  const raw = dimension.deler.reduce((sum, [, got]) => sum + got, 0);
  const deductions = findings
    .filter((finding) => finding.dimensjon === dimension.id)
    .reduce((sum, finding) => sum + (ALVOR[finding.alvor] ?? 0), 0);
  dimension.rå = Math.round(raw * 10) / 10;
  dimension.fradrag = deductions;
  dimension.poeng = Math.max(0, Math.round((raw - deductions) * 10) / 10);
}

const total = Math.round(dimensions.reduce((sum, d) => sum + d.poeng * d.vekt, 0) * 10) / 10;
const lowest = Math.min(...dimensions.map((d) => d.poeng));
const vetoes = findings.filter((finding) => finding.veto === true);
const hardFail =
  facts.tester.ok === false ||
  facts.typecheck.ok === false ||
  p.determinisme?.likeKjoringer === false ||
  facts.personvern.utenforListen.length > 0 ||
  facts.personvern.nokkelIRepoet.length > 0;

const verdict =
  vetoes.length > 0 || hardFail || total < 75
    ? 'IKKE GODKJENT'
    : total >= 90 && lowest >= 80 && !findings.some((f) => ['kritisk', 'alvorlig'].includes(f.alvor))
      ? 'GODKJENT'
      : 'NESTEN — TENK OM';

/* ------------------------------------------------------------------ lagring */

mkdirSync(scoreDir, { recursive: true });
const previous = readdirSync(scoreDir)
  .filter((file) => /^runde-\d+\.json$/.test(file))
  .map((file) => Number(/\d+/.exec(file)[0]))
  .sort((a, b) => a - b);
const roundNumber = Number(flag('--runde') ?? (previous.at(-1) ?? 0) + 1);
const before =
  previous
    .filter((number) => number < roundNumber)
    .map((number) => JSON.parse(readFileSync(path.join(scoreDir, `runde-${number}.json`), 'utf8')))
    .at(-1) ?? null;

const improvement = before === null ? null : Math.round((total - before.total) * 10) / 10;
const closed =
  before === null
    ? []
    : (before.funn ?? [])
        .filter((old) => ['kritisk', 'alvorlig'].includes(old.alvor))
        .filter((old) => !findings.some((now) => now.id === old.id))
        .map((old) => old.id);
const convergence =
  before === null
    ? 'første runde'
    : improvement >= 2 || closed.length > 0
      ? 'framgang'
      : 'ingen målbar framgang';

const record = {
  runde: roundNumber,
  tidspunkt: new Date().toISOString(),
  commit: run('git', ['rev-parse', '--short', 'HEAD']).stdout.trim(),
  dom: verdict,
  total,
  lavesteDimensjon: lowest,
  framgang: improvement,
  lukketSidenForrige: closed,
  konvergens: convergence,
  dimensjoner: dimensions,
  veto: vetoes,
  funn: findings,
  fakta: facts,
};
writeFileSync(path.join(scoreDir, `runde-${roundNumber}.json`), `${JSON.stringify(record, null, 2)}\n`);

/* ----------------------------------------------------------------- utskrift */

const bar = (value) => '█'.repeat(Math.round(value / 5)).padEnd(20, '·');
console.log(`\nLønnssjekk — runde ${roundNumber}  (${record.commit})\n`);
for (const dimension of dimensions) {
  console.log(
    `  ${dimension.id}  ${dimension.navn.padEnd(30)} ${String(dimension.poeng).padStart(5)} ` +
      `${bar(dimension.poeng)}  vekt ${dimension.vekt}` +
      (dimension.fradrag > 0 ? `  (−${dimension.fradrag} for bekreftede funn)` : ''),
  );
  for (const [label, got, max] of dimension.deler) {
    if (got < max) console.log(`        mangler ${Math.round((max - got) * 10) / 10} p: ${label}`);
  }
}
console.log(`\n  Sum (vektet): ${total} / 100     laveste dimensjon: ${lowest}`);
if (improvement !== null) {
  console.log(
    `  Endring siden runde ${before.runde}: ${improvement >= 0 ? '+' : ''}${improvement}  (${convergence})`,
  );
}
if (closed.length > 0) console.log(`  Lukket siden forrige runde: ${closed.join(', ')}`);
if (vetoes.length > 0) console.log(`  VETO: ${vetoes.map((v) => v.id).join(', ')}`);
console.log(`\n  Måling: ${verdict}`);
console.log(`  Dommen settes av evalueringsagenten, som leser .score/runde-${roundNumber}.json\n`);
