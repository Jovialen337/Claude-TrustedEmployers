/**
 * Henter lovteksten på nytt og sier hva som har endret seg.
 *
 *   npm run hent-lovtekst
 *
 * Reglene i `rules/no_default.json` er kontrollert ord for ord mot tekstene i
 * `docs/lovtekst/`. Endrer loven seg, skal det bli synlig her — og da er det regelen som skal
 * rettes, ikke teksten som skal tilpasses regelen.
 *
 * Skriptet rører ikke filene med vilje: det skriver `<fil>.ny` ved siden av, viser forskjellen
 * og lar deg bestemme. `--skriv` bytter dem ut.
 *
 * Om Lovdata: lovdata.no svarer «405 Request stopped by Varnish IPS» på forespørsler fra
 * datasenter-IP-er — deres egen sperre mot maskinell høsting. Den skal respekteres, så
 * ferieloven hentes ikke herfra. Teksten i `docs/lovtekst/ferieloven.txt` er hentet ordrett
 * derfra manuelt, og skriptet sier hvilke paragrafer du må se over selv.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs', 'lovtekst');
const write = process.argv.includes('--skriv');

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Hentes maskinelt. */
const HENTBARE = [
  {
    fil: 'arbeidsmiljoloven.txt',
    navn: 'Arbeidsmiljøloven',
    url: 'https://www.arbeidstilsynet.no/regelverk/lover/arbeidsmiljoloven--aml/',
    // Tall og ledd reglene bygger på. Forsvinner et av dem, har loven endret seg.
    forventet: [
      'ni timer i løpet av 24 timer og 40 timer i løpet av sju dager',
      'Tillegget skal være minst 40 prosent',
      'minst 11 timer sammenhengende arbeidsfri',
      'arbeidsfri periode på 35 timer i løpet av sju dager',
      'ikke avtales kortere arbeidsfri periode enn 8 timer',
      'overstige ti timer i løpet av sju dager, 25 timer i fire sammenhengende uker og 200 timer',
      'overstiger fem og en halv time',
      'minst en halv time hvis den daglige arbeidstid er minst åtte timer',
      'arbeidsfri fra kl. 1800 dagen før en søn- eller helgedag og til kl. 2200',
      'Arbeid mellom kl. 2100 og kl. 0600 er nattarbeid',
      'jevnlig arbeider mer enn tre timer om natten',
      'sammenhengende midlertidig ansatt i mer enn tre år',
      'Trekk i lønn og feriepenger kan ikke gjøres unntatt',
      'arbeidstaker i ledende stilling',
      'arbeidstakere i særlig uavhengig stilling',
    ],
  },
  {
    fil: 'allmenngjoringsloven.txt',
    navn: 'Allmenngjøringsloven',
    url: 'https://www.arbeidstilsynet.no/regelverk/lover/allmenngjoringsloven/',
    forventet: ['Tariffnemnda', 'allmenngjort'],
  },
  {
    fil: 'hr-2021-2532-a.txt',
    navn: 'HR-2021-2532-A',
    url: 'https://www.domstol.no/no/hoyesterett/avgjorelser/2021/hoyesterett-sivil/hr-2021-2532-a/',
    forventet: ['14-15 andre ledd', 'lønnstrekk'],
  },
];

/** Må ses over av et menneske. */
const MANUELLE = [
  {
    fil: 'ferieloven.txt',
    navn: 'Ferieloven',
    url: 'https://lovdata.no/dokument/NL/lov/1988-04-29-21',
    sePa: ['§ 5 nr. 1 (25 virkedager)', '§ 7 nr. 1 (18 virkedager)', '§ 10 nr. 2 (10,2 prosent)', '§ 10 nr. 3 (2,3 prosentpoeng)'],
    forventet: [
      'feriefritid på 25 virkedager hvert ferieår',
      'hovedferie som omfatter 18 virkedager',
      '10,2 prosent av feriepengegrunnlaget',
      'forhøyes prosentsatsen med 2,3 prosentpoeng',
    ],
  },
];

/**
 * Lovteksten er linjebrutt i filene for å være lesbar, så et sitat kan ha et linjeskift midt
 * i. Sammenligningen må derfor skje med alt mellomrom slått sammen til ett — ellers melder
 * skriptet avvik på tekst som står der.
 */
function flat(tekst) {
  return tekst.replace(/\s+/g, ' ');
}

function harAlle(tekst, forventet) {
  const flatTekst = flat(tekst);
  return forventet.filter((bit) => !flatTekst.includes(flat(bit)));
}

function tilTekst(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n');
}

let avvik = 0;
let endret = 0;

console.log('Henter lovtekst\n');

for (const kilde of HENTBARE) {
  const målfil = path.join(dir, kilde.fil);
  const gammel = await readFile(målfil, 'utf8').catch(() => null);

  let svar;
  try {
    svar = await fetch(kilde.url, { headers: { 'user-agent': UA } });
  } catch (feil) {
    console.log(`  FEIL  ${kilde.navn}: ${feil.message}`);
    avvik += 1;
    continue;
  }
  if (!svar.ok) {
    console.log(`  FEIL  ${kilde.navn}: HTTP ${svar.status} fra ${kilde.url}`);
    avvik += 1;
    continue;
  }

  const ny = tilTekst(await svar.text());
  const mangler = harAlle(ny, kilde.forventet);

  if (mangler.length > 0) {
    console.log(`  AVVIK ${kilde.navn}: ${mangler.length} av ${kilde.forventet.length} forventede formuleringer finnes ikke i den nye teksten:`);
    for (const bit of mangler) console.log(`          mangler: «${bit}»`);
    console.log('          Loven kan ha endret seg — sjekk regelen, ikke bare teksten.');
    avvik += 1;
  } else {
    console.log(`  ok    ${kilde.navn}: alle ${kilde.forventet.length} formuleringene står der fortsatt`);
  }

  if (gammel === ny) {
    console.log(`        teksten er uendret (${ny.length} tegn)`);
  } else {
    endret += 1;
    const diff = gammel === null ? ny.length : ny.length - gammel.length;
    console.log(`        teksten har endret seg (${diff >= 0 ? '+' : ''}${diff} tegn)`);
    if (write) {
      await writeFile(målfil, ny, 'utf8');
      console.log(`        skrevet til ${path.relative(root, målfil)}`);
    } else {
      const nyfil = `${målfil}.ny`;
      await writeFile(nyfil, ny, 'utf8');
      console.log(`        lagt ved siden av: ${path.relative(root, nyfil)} (kjør med --skriv for å bytte)`);
    }
  }
}

console.log('\nMå ses over manuelt');
for (const kilde of MANUELLE) {
  const tekst = await readFile(path.join(dir, kilde.fil), 'utf8').catch(() => '');
  const mangler = harAlle(tekst, kilde.forventet);
  if (mangler.length > 0) {
    console.log(`  AVVIK ${kilde.navn}: den lagrede teksten mangler ${mangler.length} formulering(er) reglene bygger på`);
    for (const bit of mangler) console.log(`          mangler: «${bit}»`);
    avvik += 1;
  } else {
    console.log(`  ok    ${kilde.navn}: den lagrede teksten har alle ${kilde.forventet.length} formuleringene reglene bygger på`);
  }
  console.log(`        lovdata.no sperrer maskinell henting (405 Varnish IPS). Åpne ${kilde.url}`);
  console.log(`        og se over: ${kilde.sePa.join(', ')}`);
}

console.log(`\n${avvik === 0 ? 'Ingen avvik.' : `${avvik} avvik.`} ${endret} tekst(er) endret siden sist.`);
process.exit(avvik === 0 ? 0 : 1);
