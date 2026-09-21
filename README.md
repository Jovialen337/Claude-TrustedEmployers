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
   Tamigo og liknende), kan du lime hele fila rett inn. Både `2026-08-17` og `17.08.2026` går,
   og pause kan skrives som `30`, `30 min` eller `0:30`. Linjer som ikke kan leses, får du
   beskjed om — de forsvinner ikke i stillhet.
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

| Hva | Grunnlag |
| --- | --- |
| Får du timene stillingsprosenten din gir deg — per uke, måned og hele perioden? | Kontrakten din |
| Er overtid betalt med minst 40 % tillegg? | Arbeidsmiljøloven § 10-4 og § 10-6 |
| Er **merarbeid** skilt fra overtid, slik loven gjør? | Arbeidsmiljøloven § 14-4 a |
| Har du hatt 11 timer fri mellom vaktene, og 35 timer i uka? | Arbeidsmiljøloven § 10-8 |
| Er det registrert pause på de lange vaktene? | Arbeidsmiljøloven § 10-9 |
| Er hver time du jobbet betalt, i riktig kategori og med riktig sats? | Kontrakten din |
| Er kvelds-, natt-, helge- og helligdagstillegg med? | **Kontrakten eller tariffavtalen din** |
| Ser feriepengegrunnlaget riktig ut? | Ferieloven § 10 |
| Har du jobbet så mye at du kan ha rett til større stilling? | Arbeidsmiljøloven § 14-4 a |

Hvert funn får ett av tre nivåer:

- **Sannsynlig feil** — vi kan regne på det, og det ser ut som en feil.
- **Bør sjekkes** — noe stemmer ikke helt, men det kan finnes en god forklaring.
- **Til info** — verdt å vite, ikke et krav.

Alle terskler og satser ligger i én fil, [`rules/no_default.json`](rules/no_default.json), med
kilde og forklaring på hver regel. Du kan slå av regler under **Innstillinger**, og legge inn
dine egne grenser fra kontrakt eller tariffavtale.

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

Vær klar over grensene før du tar noe videre:

- **Vi kan bare sjekke det du har lagt inn.** Mangler en lønnsslipp, en vakt eller et tillegg,
  blir sjekken ufullstendig. Halve uker i kantene av dataene flagges aldri.
- **Betalte timer fordeles ikke på uker.** En månedsslipp sier ikke hvilke timer som hørte til
  hvilken uke, så sammenligningen mot lønn gjøres per lønnsperiode. Vi gjetter ikke.
- **Skatt, trekk, pensjon, sykepenger, feriedager, permisjon og oppsigelse** er ikke med.
- **Tillegg gjettes aldri.** Kvelds-, natt-, helge- og helligdagstillegg følger av kontrakt
  eller tariffavtale, ikke av loven. Har du ikke lagt dem inn, sjekkes de ikke.
- **Tariffavtaler forstås ikke automatisk.** Har du en tariffavtale med andre grenser enn
  loven, må du legge dem inn selv.
- **«Rett til større stilling» avgjøres ikke her.** Vi viser at du kan ha et krav etter § 14-4 a,
  og hvor mange uker vi faktisk har sett på. Ferie og sykefravær teller ikke med i beregningen,
  og tolvmånedersperioden regnes fra du fremmer kravet.
- **Regelteksten er kontrollert mot omtale av lovene, ikke mot lovdata.no**, fordi maskinen som
  bygget dette ikke hadde tilgang dit. Hver regel sier selv hvordan den er kontrollert. Se
  [DECISIONS.md](DECISIONS.md).
- **Overlappende tillegg legges sammen.** Har du både helgetillegg og helligdagstillegg, og en
  vakt faller på en helligdag som er en søndag, regner vi begge. Mange avtaler gir bare det
  høyeste.
- **Ingen juridisk vurdering.** Tallene er et utgangspunkt for en samtale — med arbeidsgiver,
  tillitsvalgt eller fagforening.

---

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
src/domain/rules/ én fil per regel, hver en ren funksjon fra data til funn
src/privacy/     maskering av fødselsnummer, kontonummer og kortnummer
src/extraction/  lesing av dokumenter: PDF-tekst, ledetekster, validering, Claude-kall
src/storage/     lokal JSON-lagring med atomisk skriving
src/report/      PDF-rapport og utkast til melding
src/demo/        den oppdiktede demobrukeren med innlagte feil
src/app/         Next.js-sider (norsk) og API-ruter
rules/           regelsettet med terskler, forklaringer og kilder
tests/           enhetstester, inkludert de vanskelige tilfellene og hele demoen
```

Regler under `src/domain/` gjør ingen nettverkskall, leser ingen klokke og bruker ingen
tilfeldighet. Derfor kan hvert funn i grensesnittet gjenskapes i en test — og demoen sjekkes
til øret i [`tests/demo.test.ts`](tests/demo.test.ts), med håndregning i
[DECISIONS.md](DECISIONS.md).

Se også [PLAN.md](PLAN.md) for arkitektur og datamodell, [DECISIONS.md](DECISIONS.md) for valg
som er tatt underveis, og [PROGRESS.md](PROGRESS.md) for hva som er gjort.
