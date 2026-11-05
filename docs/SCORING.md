# Poengsystemet

Hvordan Lønnssjekk vurderes, runde etter runde, og hvem som gjør hva.

Dette er ikke en kvalitetsplan. Det er en maskin for å finne feil i et verktøy der en feil
koster noe: sier appen at du har 6 000 kr utestående og det ikke er sant, har noen gått til
sjefen sin med et krav som ikke holder. Sier den ingenting når noe er galt, gikk de glipp av
penger de hadde rett på. Poengsummen er innrettet mot de to.

## Målet som vurderes

> Lønnssjekk skal sammenligne arbeidskontrakt, vaktplan og lønnsslipper, og for hvert avvik
> vise hva avviket er, hva det bygger på i dine egne papirer, og hvilken regel det måles mot —
> uten å påstå noe appen ikke kan vise.

Alt nedenfor måler avstanden til den setningen.

## De tre dommene

Tre, ikke fem. Et skala-tall uten handling er lett å nikke til; disse tre sier hva som skjer
videre.

| Dom | Betyr | Hva som skjer |
| --- | --- | --- |
| **GODKJENT** | Ingen kjente feil som påvirker et krav, og ingenting åpent av vekt. | Runden avsluttes. Arbeidet kan leveres. |
| **NESTEN — TENK OM** | Fungerer, men noe er svakt nok til at det bør gjøres om — ikke lappet på. | Ny runde. Funnene er arbeidslista, i rangert rekkefølge. |
| **IKKE GODKJENT** | Noe er galt på en måte som når brukeren. | Ny runde, og ingenting annet har forkjørsrett. |

**Grensene**

- **GODKJENT**: sum ≥ 90, *og* ingen dimensjon under 80, *og* ingen åpne funn av alvor
  `kritisk` eller `alvorlig`, *og* ingen veto.
- **NESTEN — TENK OM**: sum ≥ 75 uten veto — eller sum ≥ 90 der én dimensjon er under 80.
  En høy totalsum skal ikke kunne skjule at ett område er dårlig.
- **IKKE GODKJENT**: sum < 75, eller ett veto, eller en av de harde feilene under.

**Harde feil** (gir IKKE GODKJENT uansett sum): tester som feiler, typecheck som feiler, to
like kjøringer som gir ulikt svar, personopplysninger utenfor den godkjente listen, en
API-nøkkel i repoet.

**Veto** er forbeholdt det appen aldri skal gjøre, og settes bare av portvakten, på et funn
som er reprodusert:

1. et falskt krav merket `sannsynlig_feil` — altså et krav på penger som ikke finnes
2. personopplysninger som forlater maskinen umaskert
3. en regel som viser til lovtekst som ikke sier det regelen sier
4. et resultat som ikke er det samme to ganger på samme data

## Dimensjonene

| | Dimensjon | Vekt | Hvorfor den vekta |
| --- | --- | --- | --- |
| D1 | Juridisk treffsikkerhet | 0,30 | Leser appen loven feil, er alt det andre pynt. |
| D2 | Determinisme og bevis | 0,20 | Et krav du ikke kan etterprøve er ikke et krav. |
| D3 | Korrekthet og testdekning | 0,20 | Det som ikke er testet, er ikke sjekket. |
| D4 | Personvern og sikkerhet | 0,15 | Fødselsnummer og kontonummer forlater ikke maskinen. |
| D5 | Ytelse og robusthet | 0,10 | Sjekken kjører på hovedtråden, på en telefon. |
| D6 | Språk og forståelighet | 0,05 | Et funn ingen forstår, fører ikke til noe. |

`npm run score` regner ut delpoengene. Formlene står i `scripts/score.mjs`, ved den
dimensjonen de hører til — der de kan leses sammen med det de måler.

**Fradrag.** Et bekreftet funn trekker fra i sin egen dimensjon: `kritisk` −25, `alvorlig`
−12, `moderat` −5, `liten` −2. Det er portvakten som fester alvoret, og bare på funn som er
reprodusert.

## Hvorfor en full mekanisk poengsum ikke er en god nok dom

`npm run score` måler det en maskin kan telle: at testene er grønne, at hver regel har en
lovhenvisning med lenke, at to kjøringer gir samme svar, at ingen fil har et tall på
fødselsnummerets form. Alt det kan stå på 100 mens appen tar feil om loven.

Derfor er den mekaniske summen **gulvet, ikke dommen**. Den gjør ikke annet enn å fjerne alt
som kan telles, så agentene kan bruke tiden på resten: om regelen leser paragrafen riktig, om
beløpet er det brukeren kan kreve, om meldingen er til å forstå for den som får den.
Evalueringsagenten kan ikke gi GODKJENT i en runde der et bekreftet `alvorlig` funn står åpent
— uansett hva summen sier.

## Rollene

Fem agenter, og ingen av dem vurderer sitt eget arbeid.

**Tre forskere** leter etter forbedringer, hver på sitt felt, og leverer forslag med begrunnelse
— ikke rettelser:

- `lonnssjekk-lovforsker` — lov, forskrift og rettspraksis, mot flere uavhengige kilder.
  Leter etter regler som leser paragrafen feil, henvisninger som peker galt, og rettigheter
  appen ikke dekker.
- `lonnssjekk-kodeforsker` — korrekthet, ytelse, robusthet, kodekvalitet. Leter etter
  regnestykker som ryker på data virkelige folk har, og etter det som vil ryke senere.
- `lonnssjekk-brukerforsker` — personvern, språk, tilgjengelighet, det å faktisk komme i mål
  med appen. Leser som en arbeidstaker med dårlig norsk, en telefon og lite tid.

**Portvakten** `lonnssjekk-portvakt` reproduserer hvert forslag før det får bli et funn, og
svarer på fire spørsmål: *holder det* (viability), *er det godt nok* (quality), *koster det for
mye* (efficiency), *er det sant* (integrity). Et forslag som ikke kan reproduseres, blir
avvist. Portvakten retter ingenting og dømmer ingenting — den fester alvor og skriver
`.score/funn-<runde>.json`.

**Evaluatoren** `lonnssjekk-evaluator` er den eneste som setter dommen. Den leser
`.score/runde-<n>.json` og funnene, og leverer dom, begrunnelse og en rangert arbeidsliste
for neste runde.

Rekkefølgen er alltid: forskere → portvakt → poengsum → evaluator. Portvakten kommer før
scoringen med vilje: ellers ville summen bli regnet på påstander, og et verktøy som vurderer
seg selv på ubekreftede funn er verre enn ingen vurdering.

## Runden

1. De tre forskerne kjører parallelt, uten å se hverandres funn, og leverer forslag.
2. Portvakten reproduserer hvert forslag og skriver `.score/funn-<runde>.json`.
3. `npm run score -- --runde <n> --funn .score/funn-<n>.json`.
4. Evaluatoren leser begge filene og setter dommen.
5. Det som er akseptert, rettes — med test, og med kildehenvisning når det er juss.
6. Ny runde, fra punkt 1.

**Når det stopper.** En runde er framgang hvis summen stiger med minst 2,0, eller hvis minst
ett åpent `alvorlig`/`kritisk` funn lukkes. To runder på rad uten framgang betyr konvergert:
da er det som er lett å finne, funnet, og neste forbedring krever noe annet enn en runde til
— ekte data, en bruker å se over skulderen på, en jurist. Å kjøre videre da er churn, og
churn på juridisk kode er en risiko i seg selv.

## Historikken

`.score/runde-<n>.json` er regnskapet: fakta, delpoeng, funn, dom. Den er sjekket inn, slik at
en poengsum kan ettergås i ettertid — og slik at det synes hvis den stiger uten at noe ble
bedre.
