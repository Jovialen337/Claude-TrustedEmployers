# Lønnssjekk

**Får du det arbeidskontrakten din sier?**

Lønnssjekk legger arbeidskontrakten, vaktplanen og lønnsslippene dine ved siden av hverandre,
og viser hvert sted der de ikke stemmer — med regnestykket, det som står i dokumentene, og
hvilken paragraf eller hvilket punkt i kontrakten det bygger på.

Verktøyet er laget for deg som jobber deltid eller på timer: i butikk, på kafé, i restaurant
eller i omsorg. Du trenger ikke kunne noe om arbeidsmiljøloven for å bruke det.

> **Dette er ikke juridisk rådgivning. Kontakt fagforeningen din eller Arbeidstilsynet for hjelp.**

---

## Kjøre appen

Du trenger [Node.js](https://nodejs.org/) versjon 20 eller nyere. Alt kjører på din egen
maskin.

```bash
npm install          # første gang
npm run build        # bygger appen
npm start            # starter den på http://localhost:3000
```

Åpne <http://localhost:3000> i nettleseren.

Vil du prøve verktøyet uten å legge inn dine egne papirer, trykk **«Vis meg et eksempel
først»** på startsiden. Da fylles appen med en oppdiktet person med tre måneder med data og
flere innlagte feil. Du kan slette alt igjen under **Innstillinger → Slett alt**.

### Under utvikling

```bash
npm run dev          # utviklingsserver med automatisk oppdatering
npm test             # kjører alle testene
npm run typecheck    # sjekker typene
npm run smoke        # kjører hele kjeden mot en app som alt kjører
```

`npm run smoke` går gjennom alt en bruker gjør — tomt arbeidsrom, lagre kontrakt, laste opp
vaktplan, kjøre sjekken, hente PDF-en, skru av en regel, laste demodata og slette alt — mot en
app som kjører. Den trenger ingen pakker og ingen nettleser. Start appen i et annet vindu først,
og pek den mot en egen datamappe om du har data du vil beholde:

```bash
LONNSSJEKK_DATA_DIR=.data-smoke npm start
npm run smoke
```

Merk: utviklingsserveren bruker en WebSocket-forbindelse til automatisk oppdatering. I noen
containere og sandkasser klarer ikke nettleseren å sette opp den forbindelsen, og da kan sidene
bli stående på «Laster …». Bruk `npm run build && npm start` hvis det skjer — det påvirker bare
utviklingsmodus.

---

## Slik bruker du det

Appen tar deg gjennom fire steg, og du kan stoppe og fortsette når du vil.

1. **Kontrakt** — arbeidsgiver, stillingsprosent, timelønn eller månedslønn, og eventuelle
   avtalte tillegg (kveld, natt, helg, helligdag).
2. **Vakter** — dato, fra, til og pause. Har du en eksport fra vaktsystemet (Planday, Quinyx,
   Tamigo og liknende), kan du **laste opp fila** (CSV, TXT eller PDF) eller lime radene rett
   inn. Opplasting leses lokalt på din egen maskin og krever ingen API-nøkkel; du får se
   vaktene og godkjenne dem før de lagres. Både `2026-08-17` og `17.08.2026` går, og pause kan
   skrives som `30`, `30 min` eller `0:30`. Linjer som ikke kan leses, får du beskjed om — de
   forsvinner ikke i stillhet. Er vaktplanen et bilde eller skjermbilde, bruk **Les dokument**.
3. **Lønnsslipper** — linjene slik de står på slippen, med timer, sats og beløp.
4. **Sjekk** — oversikt, funn med bevis, og uke for uke.

Til slutt kan du laste ned en **rapport i PDF** og få et **utkast til melding** til
arbeidsgiver. Utkastet er ditt å endre, og appen sender aldri noe selv.

### Automatisk lesing av dokumenter (valgfritt)

Appen kan lese en PDF eller et bilde for deg og fylle ut feltene. Det krever en API-nøkkel:

```bash
cp .env.example .env     # lim inn nøkkelen din i .env
```

Dette er helt frivillig. **Uten nøkkel fungerer alt annet som normalt** — du legger inn
opplysningene selv, og resultatet blir like riktig, fordi det er vanlig kode som regner.

---

## Hva sjekkes?

**Kontrakten din er utgangspunktet for alle reglene.** Står det andre grenser i arbeidsavtalen
eller tariffavtalen enn i loven, er det dine vilkår vi måler mot — og hvert funn viser om tallet
kom fra kontrakten eller fra loven. Loven brukes der kontrakten ikke sier noe, og som gulv der
den ikke kan fravikes.

| Hva | Hentes fra kontrakten | Loven hvis kontrakten er taus |
| --- | --- | --- |
| Timene stillingsprosenten din gir deg — per uke, måned og hele perioden | stillingsprosent, timetall, timelønn | — |
| Overtidstillegg | avtalt sats (ofte 50 % eller 100 %) | minst 40 % (AML § 10-6) |
| Når overtid begynner | avtalt arbeidstid per døgn og uke | 9 t og 40 t (AML § 10-4) |
| Hvor mye overtid som er lov | avtalt maksgrense | 10 t / 25 t / 200 t (AML § 10-6) |
| Overtid tatt ut som fri — tillegget skal likevel betales | — | AML § 10-6 |
| **Merarbeid** skilt fra overtid | avtalt arbeidstid | AML § 14-4 a |
| Arbeidsfri mellom vaktene | avtalt fri per døgn og uke | 11 t og 35 t (AML § 10-8) |
| Pauser, og om pausen er betalt | avtalt pausetid og betalt pause | 5,5 t / 30 min (AML § 10-9) |
| Søndags- og helgedagsarbeid — fri annenhver | skriftlig søndagsavtale | AML § 10-10, § 10-8 |
| Nattarbeid mellom 21 og 06, og grensen for nattarbeidstakere | avtale om nattarbeid | AML § 10-11 |
| Hver time betalt, riktig kategori og sats | avtalt timelønn | — |
| Trekk i lønn | skriftlig avtale om det konkrete trekket | AML § 14-15, HR-2021-2532-A |
| Minstelønn i allmenngjort bransje | satsen du legger inn | allmenngjøringsloven |
| Kvelds-, natt-, helge- og helligdagstillegg | **bare kontrakten eller tariffavtalen** | loven gir ingen slike tillegg |
| Feriepenger | avtalt sats | minst 10,2 % (ferieloven § 10) |
| Ferien selv — fikk du den? | — | 25 virkedager, 3 uker sammenhengende (ferieloven § 5, § 7) |
| Midlertidig ansettelse: grunnlag og treårsregelen | ansettelsesform og grunnlag | AML § 14-9 |
| Rett til større stilling | avtalt periode | tolv måneder (AML § 14-4 a) |
| Hva avtalen skal inneholde, og fristene for den | — | AML § 14-6, § 14-5 |
| Oversikt over arbeidstiden, og arbeidsplan to uker før | — | AML § 10-7, § 10-3 |
| Unntak for ledende eller særlig uavhengig stilling | du svarer selv | AML § 10-12 |

Legg inn dine egne vilkår under **Kontrakt → «Avtalte vilkår som avviker fra loven»**. Feltene
du lar stå tomme, betyr «kontrakten sier ingenting», og da gjelder loven.

Er et vilkår i kontrakten dårligere enn loven tillater — for eksempel 25 % overtidstillegg, 6
timers arbeidsfri eller feriepenger under 10,2 % — regner vi med lovens krav og sier fra om det
som et eget funn. Et slikt vilkår i en arbeidsavtale er ikke gyldig.

Har du oppgitt at stillingen er **ledende eller særlig uavhengig**, slår vi av sjekkene for
overtid, hviletid, pauser, søndagsarbeid og nattarbeid, og sier tydelig at vi har gjort det.
Unntaket er smalere enn mange tror, så vi ber deg bekrefte det selv i stedet for å gjette.

### Hvordan tallene blir til

- **Maskinen leser, koden regner.** Kunstig intelligens brukes bare til å gjøre dokumenter om
  til felt. Hver sammenligning, hver sum og hver regel er vanlig kode med enhetstester. En
  språkmodell avgjør aldri om noe er en feil.
- **Du bekrefter.** Det som blir lest ut av et dokument, får du se i en tabell og rette før
  noe sjekkes.
- **Alt kan etterprøves.** Hvert funn viser regnestykket, tallene vi brukte, hvilket dokument
  og hvilken side de kom fra, og hvilken regel som gjelder.

---

## Hva sjekkes *ikke*

Vær klar over grensene før du tar noe videre.

**Lover og regler vi ikke kan sjekke med disse dataene.** En arbeidsavtale, en vaktplan og noen
lønnsslipper sier ingenting om dette, så vi later ikke som om vi vurderer det:

- **Oppsigelse, avskjed og stillingsvern** (AML kapittel 15) — krever saksgang og dokumenter vi
  ikke har. Vi sjekker bare at oppsigelsesfristen står i avtalen.
- **Sykepenger, egenmelding og sykefravær** (folketrygdloven) — vi vet ikke hvorfor en vakt ikke
  ble jobbet.
- **Permittering, foreldrepermisjon og annen permisjon** (AML kapittel 12) — samme grunn.
- **Pensjon og OTP** — står ikke på lønnsslippen i en form vi kan regne på.
- **Skattetrekk og skattekort** — vi sjekker ikke om skatten er riktig beregnet.
- **HMS, verneutstyr, arbeidsmiljø og varsling** (AML kapittel 2–7 og 2 A) — ikke målbart i timer
  og kroner.
- **Diskriminering og likelønn** (likestillings- og diskrimineringsloven) — krever sammenligning
  med andre ansatte.
- **Innleie fra bemanningsforetak og likebehandling** (AML § 14-12 a) — krever lønnsdata fra
  innleiebedriften.
- **Fortrinnsrett ved nedbemanning og ved nyansettelser** (AML § 14-2, § 14-3) — avhenger av hva
  som skjer i virksomheten.
- **Aldersgrenser for unge arbeidstakere** (AML kapittel 11) — vi spør ikke om alderen din.
- **Om nattarbeid eller søndagsarbeid faktisk var «nødvendig»** — det er en vurdering av
  virksomheten, ikke av tallene. Vi viser mønsteret og sier hva loven krever.

**Grenser i det vi faktisk sjekker:**

- **Vi kan bare sjekke det du har lagt inn.** Mangler en lønnsslipp, en vakt eller et tillegg,
  blir sjekken ufullstendig. Halve uker i kantene av dataene flagges aldri.
- **Betalte timer fordeles ikke på uker.** En månedsslipp sier ikke hvilke timer som hørte til
  hvilken uke, så sammenligningen mot lønn gjøres per lønnsperiode. Vi gjetter ikke.
- **Tillegg gjettes aldri.** Kvelds-, natt-, helge- og helligdagstillegg følger av kontrakt eller
  tariffavtale, ikke av loven. Har du ikke lagt dem inn, sjekkes de ikke.
- **Minstelønnssatser leveres ikke.** Satsene i allmenngjorte bransjer endres jevnlig og avhenger
  av alder, fagbrev og erfaring. Du legger inn din sats fra arbeidstilsynet.no.
- **Tariffavtaler forstås ikke automatisk.** Har du en tariffavtale med andre grenser enn loven,
  må du legge dem inn selv.
- **Ferie kan vi bare gjette på.** En luke i vaktplanen er ikke bevis på at du hadde ferie, og
  mangel på luke er ikke bevis på at du ikke hadde det. Derfor er ferie alltid «til info».
- **«Rett til større stilling» avgjøres ikke her.** Vi viser at du kan ha et krav etter § 14-4 a,
  og hvor mange uker vi faktisk har sett på. Ferie og sykefravær teller ikke med i beregningen.
- **Om ansettelsen har vært sammenhengende** vet vi ikke, så treårsregelen i § 14-9 er et signal
  om å undersøke, ikke en konklusjon.
- **Regelteksten er kontrollert mot omtale av lovene, ikke mot lovdata.no**, fordi maskinen som
  bygget dette ikke hadde tilgang dit. Hver regel sier selv hvordan den er kontrollert. Se
  [DECISIONS.md](DECISIONS.md).
- **Overlappende tillegg legges sammen.** Har du både helgetillegg og helligdagstillegg, og en
  vakt faller på en helligdag som er en søndag, regner vi begge. Mange avtaler gir bare det
  høyeste.
- **Ingen juridisk vurdering.** Tallene er et utgangspunkt for en samtale — med arbeidsgiver,
  tillitsvalgt eller fagforening.

## Personvern

Dokumentene dine er blant de mest sensitive du har: fødselsnummer, kontonummer og lønn.

- **Alt kjører lokalt.** Ingen konto, ingen innlogging, ingen skydatabase. Dataene ligger i én
  fil på din maskin: `.data/workspace.json`. Mappa er utelatt fra git.
- **Fødselsnummer og kontonummer fjernes før noe sendes.** Bruker du automatisk lesing, blir
  teksten maskert først — inne i selve uthentingsfunksjonen, slik at ingen kodevei kan hoppe
  over det. Dette er testet.
- **Bilder kan ikke maskeres.** Et foto eller skjermbilde kan vise fødselsnummeret ditt, og det
  kan ingen kode fjerne fra et bilde. Derfor må du krysse av selv før et bilde sendes, og du
  får beskjed om det igjen på bekreftelsesskjermen. PDF-tekst forsøkes alltid først, nettopp
  fordi den *kan* maskeres.
- **Uten API-nøkkel går ingenting ut av maskinen.** Da er det bare din egen nettleser og din
  egen disk.
- **Opplasting av vaktplan går aldri ut av maskinen.** CSV, tekst og PDF leses lokalt, uten
  API-nøkkel og uten nettverk.
- **«Slett alt»** under Innstillinger sletter kontrakt, vakter, lønnsslipper og dokumenter. Det
  finnes ingen kopi noe annet sted.

---

## Hvor kan du få hjelp?

- **Tillitsvalgt** på jobben er ofte det enkleste stedet å starte.
- **Fagforeningen din** kan ta saken videre for deg hvis du er medlem.
- **Arbeidstilsynet** svarer på spørsmål om arbeidstid, pauser og hviletid: telefon 73 19 97 00.
- **Tvisteløsningsnemnda** behandler tvister om rett til større stilling.

---

## For utviklere

```
src/domain/      ren forretningslogikk uten I/O: skjemaer, øre-aritmetikk, tid, regler, motor
src/domain/thresholds.ts  hvor hver terskel kommer fra: kontrakten først, loven som gulv
src/domain/rules/ én fil per regel, hver en ren funksjon fra data til funn
src/privacy/     maskering av fødselsnummer, kontonummer og kortnummer
src/extraction/  lesing av dokumenter: PDF-tekst, ledetekster, validering, Claude-kall
src/storage/     lokal JSON-lagring med atomisk skriving
src/report/      PDF-rapport og utkast til melding
src/demo/        den oppdiktede demobrukeren med innlagte feil
src/app/         Next.js-sider (norsk) og API-ruter
rules/           regelsettet med terskler, forklaringer og kilder
tests/           enhetstester, inkludert de vanskelige tilfellene og hele demoen
scripts/smoke.mjs  ende-til-ende-sjekk mot en app som kjører, uten pakker og uten nettleser
.claude/skills/run-app/  oppskriften for å starte og styre appen lokalt (for Claude Code)
```

Regler under `src/domain/` gjør ingen nettverkskall, leser ingen klokke og bruker ingen
tilfeldighet. Derfor kan hvert funn i grensesnittet gjenskapes i en test — og demoen sjekkes
til øret i [`tests/demo.test.ts`](tests/demo.test.ts), med håndregning i
[DECISIONS.md](DECISIONS.md).

Se også [PLAN.md](PLAN.md) for arkitektur og datamodell, [DECISIONS.md](DECISIONS.md) for valg
som er tatt underveis, og [PROGRESS.md](PROGRESS.md) for hva som er gjort.
