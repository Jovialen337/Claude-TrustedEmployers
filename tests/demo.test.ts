/**
 * The end-to-end demo check.
 *
 * Every amount asserted here is recalculated by hand in DECISIONS.md ("Demo — hand
 * calculations"), so this test is a check of the rules, not a recording of their output.
 */
import { describe, expect, it } from 'vitest';
import { runCheck } from '@/domain/engine';
import { formatHours, formatKr } from '@/domain/money';
import { demoWorkspace } from '@/demo/workspace';
import type { Flag } from '@/domain/schemas';

const result = runCheck(demoWorkspace(), { now: '2026-09-21T12:00:00.000Z' });
const byId = new Map<string, Flag>(result.flags.map((flag) => [flag.id, flag]));

describe('demoen', () => {
  it('har nok data til å kjøre en sjekk', () => {
    expect(result.blockers).toEqual([]);
    expect(result.dataRange).toEqual({ start: '2026-05-01', end: '2026-07-31' });
    expect(result.totals.weeksObserved).toBe(12);
    expect(formatHours(result.totals.contractedWeeklyHours)).toBe('22,5 t');
    expect(formatKr(result.hourlyRateOre)).toBe('198,50 kr');
  });

  it('inneholder ingen personopplysninger', () => {
    const serialized = JSON.stringify(demoWorkspace());
    // Ingen 11-sifrede tall (personnummer) og ingen kontonummer på formen 1234.56.78901.
    expect(serialized).not.toMatch(/\b\d{11}\b/);
    expect(serialized).not.toMatch(/\b\d{4}[ .]\d{2}[ .]\d{5}\b/);
  });

  it('finner alle de plantede feilene, og ingenting mer', () => {
    expect([...byId.keys()].sort()).toEqual(
      [
        // De plantede feilene
        'overtime:demo-slipp-2026-06',
        'overtime:demo-slipp-2026-07',
        'scheduled_vs_paid:sats:demo-slipp-2026-05:demo-linje-1',
        'scheduled_vs_paid:timer:demo-slipp-2026-07',
        'supplements:demo-slipp-2026-05:helligdagstillegg',
        'supplements:demo-slipp-2026-06:kveldstillegg',
        'hours_vs_stillingsprosent:2026-W28',
        'feriepenger:avsetning:demo-slipp-2026-07',
        'rest_periods:daglig:demo-vakt-2026-06-19-1500:demo-vakt-2026-06-20-0700',
        'breaks:2026-07-15:29735040',
        'breaks:2026-07-20:29742780',
        // Følger av dataene, ikke plantet
        'actual_hours_vs_contract:stilling',
        'overtime:merarbeid',
        'feriepenger:grunnlag',
        'hours_vs_stillingsprosent:2026-07',
        'rest_periods:ukentlig:2026-W29',
        // De nye lovsjekkene
        'night_work:nattarbeid',
        'sunday_work:sondagsarbeid',
        'holiday:hovedferie',
        'contract_contents:mangler-opplysninger',
        'contract_contents:arbeidsplan',
        'minimum_wage:minstelonn-ikke-lagt-inn',
      ].sort(),
    );
    expect(result.totals.bySeverity).toEqual({ sannsynlig_feil: 6, bor_sjekkes: 6, til_info: 10 });
  });

  it('teller nattarbeid etter kl. 21, uten å rope om det', () => {
    // Kveldsvaktene slutter 22:00, så hver av dem har én time nattarbeid etter loven.
    // 48 slike vakter = 48 timer. Hun er ikke nattarbeidstaker, så det er til info.
    const flag = byId.get('night_work:nattarbeid')!;
    expect(flag.title).toBe('48,0 t nattarbeid i perioden');
    expect(flag.severity).toBe('til_info');
    expect(flag.evidence.find((e) => e.label === 'Regnes som nattarbeidstaker')!.value).toBe('Nei');
    expect(flag.amountOre).toBeNull();
  });

  it('skiller helligdager fra søndager i søndagssjekken', () => {
    // De to dagene er Kristi himmelfartsdag (torsdag) og 2. pinsedag (mandag) — helligdager,
    // ikke søndager, og ikke to på rad.
    const flag = byId.get('sunday_work:sondagsarbeid')!;
    expect(flag.severity).toBe('til_info');
    expect(flag.evidence.find((e) => e.label === 'Jobbet')!.value).toBe('2');
  });

  it('sier fra om manglende hovedferie uten å påstå noe', () => {
    const flag = byId.get('holiday:hovedferie')!;
    expect(flag.severity).toBe('til_info');
    expect(flag.message).toContain('ikke bevis');
    expect(flag.amountOre).toBeNull();
  });

  it('lister opplysningene arbeidsavtalen mangler', () => {
    const flag = byId.get('contract_contents:mangler-opplysninger')!;
    expect(flag.title).toBe('2 av 13 lovpålagte opplysninger mangler hos oss');
    expect(flag.evidence.map((e) => e.label)).toContain('Oppsigelsesfrister');
    expect(flag.evidence.map((e) => e.label)).toContain('Eventuell prøvetid');
  });

  it('peker på minstelønn i bransjen uten å finne opp en sats', () => {
    const flag = byId.get('minimum_wage:minstelonn-ikke-lagt-inn')!;
    expect(flag.severity).toBe('til_info');
    expect(flag.amountOre).toBeNull();
    expect(flag.evidence.find((e) => e.label === 'Minstelønn lagt inn')!.value).toBe('Nei');
    expect(flag.message).toContain('arbeidstilsynet.no');
  });

  it('krever manglende helligdagstillegg for mai: 10,0 t × 198,50 kr × 100 % = 1 985,00 kr', () => {
    const flag = byId.get('supplements:demo-slipp-2026-05:helligdagstillegg')!;
    expect(flag.amountOre).toBe(198_500);
    expect(flag.evidence[0]!.value).toContain('10,0 t × 100 % av timelønn');
    expect(flag.severity).toBe('sannsynlig_feil');
  });

  it('krever manglende kveldstillegg for juni: 73,0 t × 25,00 kr = 1 825,00 kr', () => {
    const flag = byId.get('supplements:demo-slipp-2026-06:kveldstillegg')!;
    expect(flag.amountOre).toBe(182_500);
    expect(flag.evidence[0]!.value).toContain('73,0 t × 25,00 kr per time');
    expect(flag.evidence.find((e) => e.label === 'Kilde til satsen')!.value).toBe('Arbeidskontrakt pkt. 6');
  });

  it('krever differansen på feil timesats i mai: 110,0 t × 13,50 kr = 1 485,00 kr', () => {
    const flag = byId.get('scheduled_vs_paid:sats:demo-slipp-2026-05:demo-linje-1')!;
    expect(flag.amountOre).toBe(148_500);
    expect(flag.calculation!.expression).toBe('110,0 t × (198,50 kr − 185,00 kr) = 1 485,00 kr');
  });

  it('krever ubetalte timer i juli: 2,5 t × 198,50 kr = 496,25 kr', () => {
    const flag = byId.get('scheduled_vs_paid:timer:demo-slipp-2026-07')!;
    expect(flag.amountOre).toBe(49_625);
    expect(flag.calculation!.expression).toBe('2,5 t × 198,50 kr = 496,25 kr');
    expect(flag.evidence.find((e) => e.label === 'Jobbet i perioden')!.value).toBe('94,5 t');
    expect(flag.evidence.find((e) => e.label === 'Betalt i perioden')!.value).toBe('92,0 t');
  });

  it('krever overtidstillegg for den 11 timer lange onsdagen: 2,0 t × 198,50 kr × 50 % = 198,50 kr', () => {
    // Kontrakten i demoen har tariffavtalt 50 % overtidstillegg, ikke lovens minimum på 40 %,
    // og regelen skal bruke kontraktens sats og si hvor den kom fra.
    const flag = byId.get('overtime:demo-slipp-2026-07')!;
    expect(flag.amountOre).toBe(19_850);
    expect(flag.calculation!.expression).toBe('2,0 t × 198,50 kr × 50 % = 198,50 kr');
    expect(flag.evidence.some((e) => e.value.includes('11,0 t jobbet'))).toBe(true);
    expect(flag.evidence.find((e) => e.label === 'Tillegg')!.value).toBe('50 % (fra kontrakten din)');
    expect(flag.message).toContain('fra kontrakten din');
  });

  it('krever overtidstillegg for stenge- og åpnevakta i juni: 4,5 t × 198,50 kr × 50 % = 446,63 kr', () => {
    // Fredag 19. juni 15:00–23:00 (8 t) og lørdag 20. juni 07:00–13:00 (5,5 t) med bare
    // 8 timer fri mellom: 13,5 t i samme arbeidsdøgn, altså 4,5 t over grensen på 9 t.
    const flag = byId.get('overtime:demo-slipp-2026-06')!;
    expect(flag.amountOre).toBe(44_663);
    expect(flag.calculation!.expression).toBe('4,5 t × 198,50 kr × 50 % = 446,63 kr');
    expect(flag.evidence.find((e) => e.label === 'Grense per arbeidsdøgn')!.value).toBe(
      '9,0 t (arbeidsmiljøloven § 10-4)',
    );
  });

  it('flagger uke 28 under stillingsprosenten: 7,5 t × 198,50 kr = 1 488,75 kr', () => {
    const flag = byId.get('hours_vs_stillingsprosent:2026-W28')!;
    expect(flag.amountOre).toBe(148_875);
    expect(flag.calculation!.expression).toBe('7,5 t × 198,50 kr = 1 488,75 kr');
    expect(flag.evidence.find((e) => e.label === 'Timer som gjelder')!.value).toBe('15,0 t');
  });

  it('flagger feriepengeavsetningen: 65 000,00 kr × 10,2 % = 6 630,00 kr, avsatt 6 000,00 kr', () => {
    const flag = byId.get('feriepenger:avsetning:demo-slipp-2026-07')!;
    expect(flag.calculation!.expression).toBe(
      '65 000,00 kr × 10,2 % = 6 630,00 kr − 6 000,00 kr avsatt = 630,00 kr',
    );
    expect(flag.amountOre).toBe(63_000);
    expect(flag.severity).toBe('bor_sjekkes');
  });

  it('flagger 8 timers hvile mellom fredag og lørdag', () => {
    const flag = byId.get('rest_periods:daglig:demo-vakt-2026-06-19-1500:demo-vakt-2026-06-20-0700')!;
    expect(flag.title).toContain('8,0 t');
    expect(flag.amountOre).toBeNull();
    expect(flag.periodLabel).toBe('lørdag 20. juni 2026');
  });

  it('forklarer merarbeid uten å kreve penger for det', () => {
    const flag = byId.get('overtime:merarbeid')!;
    expect(flag.title).toBe('63,0 t merarbeid — ikke det samme som overtid');
    expect(flag.amountOre).toBeNull();
    expect(flag.severity).toBe('til_info');
  });

  it('peker på retten til større stilling: snitt 27,13 t = 72,3 % mot avtalt 60 %', () => {
    const flag = byId.get('actual_hours_vs_contract:stilling')!;
    expect(flag.title).toBe('Du har jobbet som 72,3 % — kontrakten sier 60 %');
    expect(flag.evidence.find((e) => e.label === 'Hele uker vi har sett på')!.value).toBe('12');
    expect(flag.amountOre).toBeNull();
  });

  it('summerer kravene riktig, og holder de tre summene atskilt', () => {
    // 1 985,00 + 1 825,00 + 1 485,00 + 496,25 + 446,63 + 198,50 = 6 436,38 kr
    expect(formatKr(result.totals.estimatedOwedOre)).toBe('6 436,38 kr');
    expect(formatKr(result.totals.underScheduledOre)).toBe('1 488,75 kr');
    expect(formatKr(result.totals.feriepengerToCheckOre)).toBe('630,00 kr');
    expect(formatHours(result.totals.hoursShortVsContract)).toBe('7,5 t');
  });

  it('gir hvert krav et regnestykke, en kilde og et dokument å slå opp i', () => {
    for (const flag of result.flags) {
      expect(flag.evidence.length, `${flag.id} mangler bevis`).toBeGreaterThan(0);
      expect(flag.sources.length, `${flag.id} mangler kilde`).toBeGreaterThan(0);
      if (flag.amountOre !== null) {
        expect(flag.calculation, `${flag.id} mangler regnestykke`).not.toBeNull();
        expect(flag.calculation!.resultOre).toBe(flag.amountOre);
        expect(flag.documentRefs.length, `${flag.id} mangler dokumenthenvisning`).toBeGreaterThan(0);
      }
    }
  });

  it('gjentar ikke perioden i tittelen, siden den alltid vises ved siden av', () => {
    // Tittelen sier HVA, periodeteksten sier NÅR. Uten dette blir meldingen til
    // arbeidsgiver stående med «... (lønn for mai 2026) (Lønn for mai 2026)».
    for (const flag of result.flags) {
      expect(
        flag.title.toLowerCase(),
        `${flag.id} gjentar perioden i tittelen`,
      ).not.toContain(flag.periodLabel.toLowerCase());
    }
  });

  it('bygger en tidslinje over alle de tolv ukene', () => {
    const complete = result.timeline.filter((week) => week.complete);
    expect(complete).toHaveLength(12);
    const week28 = result.timeline.find((week) => week.key === '2026-W28')!;
    expect(week28.workedHours).toBe(15);
    expect(week28.contractedHours).toBe(22.5);
    expect(week28.worstSeverity).toBe('bor_sjekkes');
    const week30 = result.timeline.find((week) => week.key === '2026-W30')!;
    // Mandag 20. juli: planlagt til 22:00, jobbet til 23:00.
    expect(week30.plannedHours).toBe(5);
    expect(week30.workedHours).toBe(28.5);
  });
});
