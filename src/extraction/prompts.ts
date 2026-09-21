/**
 * Prompts for document reading.
 *
 * The model has exactly one job: turn the text of a document into fields. It is told not to
 * judge anything, not to compute anything, and to leave a field null rather than guess —
 * because a guessed number would look identical to a read one in the confirmation table.
 */
import type { ExtractionKind } from './schemas';

const SHARED = `Du leser et norsk arbeidsdokument og gjør det om til strukturerte data.

Regler:
- Hent BARE ut det som faktisk står i teksten. Er du usikker, sett feltet til null.
- Ikke regn ut noe. Ikke slå sammen tall. Ikke vurder om noe er riktig eller galt.
- Ikke gjett satser, tillegg eller stillingsprosent som ikke står der.
- Beløp oppgis som tall i kroner (for eksempel 198.5 for 198,50 kr), uten valutategn.
- Datoer på formen YYYY-MM-DD. Klokkeslett på formen HH:MM.
- Noen personopplysninger er fjernet fra teksten og erstattet med [fjernet ...]. Det er
  meningen — ikke prøv å rekonstruere dem, og ikke ta dem med.
- Skriv eventuell tvil som korte punkter i "notes", på norsk. Brukeren får se dem.

Svar med JSON som passer skjemaet du har fått, og ingenting annet.`;

const PER_KIND: Record<ExtractionKind, string> = {
  kontrakt: `Dokumentet er en arbeidsavtale (arbeidskontrakt).

Se etter: arbeidsgiver, arbeidstakerens navn, startdato, stillingsprosent, avtalt arbeidstid
per uke, hva full stilling er (ofte 37,5 eller 40 timer), timelønn eller månedslønn, om det
er nevnt en tariffavtale, og eventuelle avtalte tillegg (kveld, natt, helg, helligdag) med
tidsrom og sats.

For hvert tillegg: skriv i "source" hvor i dokumentet det står, for eksempel
"Arbeidskontrakt pkt. 6". Er satsen i kroner per time, bruk rateKroner. Er den i prosent av
timelønn, bruk ratePercent. Bruk bare én av dem.

Se også etter vilkår som avviker fra loven, og ta dem med BARE hvis de står i dokumentet:
- overtidstillegg i prosent (mange avtaler gir 50 % eller 100 %, loven krever minst 40 %)
- avtalt alminnelig arbeidstid per døgn og per uke
- om det er avtalt gjennomsnittsberegning av arbeidstiden
- avtalt arbeidsfri per døgn og per uke (loven: 11 og 35 timer)
- når det gis pause, hvor lang den er, og om pausen er betalt (regnes som arbeidstid)
- feriepengesats i prosent (10,2 % er lovens minimum, 12 % ved fem ukers ferie)

Står ingenting om et av disse punktene, skal feltet være null. Ikke fyll inn lovens verdi —
appen gjør det selv, og skiller mellom «dette står i kontrakten» og «dette følger av loven».`,

  lonnsslipp: `Dokumentet er en lønnsslipp.

Ta med én linje per linje på slippen, med teksten slik den står ("label"). Velg kategori:
- ordinaer: vanlige timer
- merarbeid: timer utover avtalt arbeidstid, men uten overtidstillegg
- overtid_40 / overtid_100: overtid med 40 % eller 100 % tillegg
- helligdag_arbeid: timer arbeidet på helligdag, ført som egne timer
- kveldstillegg / nattillegg / helgetillegg / helligdagstillegg: tillegg i kroner
- fastlonn: fast månedslønn uten timetall
- feriepenger: utbetalte eller avsatte feriepenger
- annet: alt annet, for eksempel utlegg eller trekk

Ta også med periode (fra og til), bruttolønn, feriepengegrunnlag og avsatte feriepenger hvis
det står på slippen.`,

  vaktplan: `Dokumentet er en vaktplan eller en timeliste, ofte eksportert fra et vaktsystem.

Ta med én vakt per rad: dato, starttid, sluttid og pause i minutter. Går en vakt over midnatt,
skriv sluttiden som den står (for eksempel 06:00) — ikke legg til en dag.

Står det tydelig om dette er planlagte vakter eller timer som faktisk er jobbet, sett "kind"
til "planlagt" eller "jobbet". Er det uklart, sett den til null.`,
};

export function buildPrompt(kind: ExtractionKind, maskedText: string): string {
  return `${SHARED}\n\n${PER_KIND[kind]}\n\n--- DOKUMENTETS TEKST ---\n${maskedText}\n--- SLUTT ---`;
}

export function schemaHint(kind: ExtractionKind): string {
  switch (kind) {
    case 'kontrakt':
      return `{"employer": string|null, "employeeName": string|null, "startDate": "YYYY-MM-DD"|null,
"stillingsprosent": number|null, "fullTimeHoursPerWeek": number|null, "contractedHoursPerWeek": number|null,
"wageKind": "hourly"|"monthly"|null, "wageKroner": number|null, "tariffavtale": string|null,
"averagingAgreement": boolean|null, "overtimeSupplementPercent": number|null,
"normalDailyLimitHours": number|null, "normalWeeklyLimitHours": number|null,
"agreedDailyRestHours": number|null, "agreedWeeklyRestHours": number|null,
"breakRequiredAfterHours": number|null, "minBreakMinutesLongDay": number|null,
"paidBreak": boolean|null, "feriepengerRatePercent": number|null,
"supplements": [{"label": string, "kind": "kveld"|"natt"|"helg"|"helligdag", "fromTime": "HH:MM"|null,
"toTime": "HH:MM"|null, "rateKroner": number|null, "ratePercent": number|null, "source": string|null}],
"notes": string[]}`;
    case 'lonnsslipp':
      return `{"periodStart": "YYYY-MM-DD"|null, "periodEnd": "YYYY-MM-DD"|null,
"lines": [{"label": string, "category": string, "hours": number|null, "rateKroner": number|null,
"amountKroner": number}], "grossKroner": number|null, "feriepengerBasisKroner": number|null,
"feriepengerAccruedKroner": number|null, "notes": string[]}`;
    case 'vaktplan':
      return `{"shifts": [{"date": "YYYY-MM-DD", "start": "HH:MM", "end": "HH:MM",
"breakMinutes": number|null}], "kind": "planlagt"|"jobbet"|null, "notes": string[]}`;
  }
}
