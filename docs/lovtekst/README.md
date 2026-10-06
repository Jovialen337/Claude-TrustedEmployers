# Lovtekst — kildene reglene er sjekket mot

Dette er lovteksten de 16 reglene i [`rules/no_default.json`](../../rules/no_default.json) er
kontrollert mot, ord for ord. Den ligger i repoet så kontrollen kan etterprøves: du skal kunne
lese en paragrafhenvisning i et funn og finne den igjen her.

Norsk lovtekst er ikke opphavsrettsbeskyttet (åndsverkloven § 14), så den kan ligge her fritt.

| Fil | Hva | Kilde | Hentet |
| --- | --- | --- | --- |
| `arbeidsmiljoloven.txt` | Hele loven, alle 20 kapitler, ordrett | [Arbeidstilsynet](https://www.arbeidstilsynet.no/regelverk/lover/arbeidsmiljoloven--aml/) — etaten som håndhever loven | 2026-10-06 |
| `ferieloven.txt` | § 5, § 6, § 7 og § 10 ordrett | [Lovdata](https://lovdata.no/dokument/NL/lov/1988-04-29-21) | 2026-10-06 |
| `allmenngjoringsloven.txt` | Loven og Arbeidstilsynets framstilling | [Arbeidstilsynet](https://www.arbeidstilsynet.no/regelverk/lover/allmenngjoringsloven/) | 2026-10-06 |
| `hr-2021-2532-a.txt` | Høyesteretts sammendrag | [Domstol.no](https://www.domstol.no/no/hoyesterett/avgjorelser/2021/hoyesterett-sivil/hr-2021-2532-a/) | 2026-10-06 |

## Hva kontrollen fant

Tre paragrafhenvisninger var forskjøvet med ett ledd, fordi
arbeidsmiljøloven § 14-15 har fått et ledd om utbetaling via bank etter at
sekundærkildene ble skrevet:

| Sto før | Skal være | Hva leddet handler om |
| --- | --- | --- |
| § 14-15 andre ledd | **§ 14-15 tredje ledd** | Forbudet mot trekk i lønn |
| § 14-15 tredje ledd | **§ 14-15 fjerde ledd** | Begrensningen av trekkets størrelse |
| § 14-15 femte ledd | **§ 14-15 sjette ledd** | Retten til skriftlig lønnsoppgave |

Høyesterett i HR-2021-2532-A viser til «§ 14-15 andre ledd», som var riktig i 2021. Det står
nå i noten til den kilden, slik at dommen og dagens lovtekst ikke ser ut som en motsigelse.

I tillegg ble to regler rettet i koden:

- **Søndagsarbeid** regnet før bare på kalenderdatoen. § 10-10 første ledd definerer søn- og
  helgedagsarbeid som tiden **fra kl. 18.00 dagen før til kl. 22.00 dagen før neste virkedag**
  (kl. 15.00 før jul-, påske- og pinseaften). En lørdagskveld fra 18.00 er altså
  søndagsarbeid, og det ble ikke fanget opp.
- **Unntaket i § 10-12** slår av kapittel 10. Kravet om arbeidsplan (§ 10-3) og oversikt over
  arbeidstiden (§ 10-7) står i samme kapittel, og ble likevel sjekket for stillinger som er
  unntatt.

## Kryssjekk mot en annen kilde

Hver bestemmelse er kontrollert mot **to uavhengige utgivere**, og begge er sitert ordrett.
Der de er uenige, står det her. De var enige overalt.

| Bestemmelse | Kilde 1 | Kilde 2 | Resultat |
| --- | --- | --- | --- |
| § 10-4 første ledd — 9 t / 40 t | Arbeidstilsynet | Lovdata | Likt |
| § 10-6 fjerde, femte, åttende, ellevte, tolvte ledd | Arbeidstilsynet | Lovdata | Likt |
| § 10-8 første–fjerde ledd — 11 t, 35 t, 8 t, 28 t, annenhver søndag / 26 uker | Arbeidstilsynet | Lovdata | Likt |
| § 10-9 første ledd — 5½ t, ½ t, betalt pause | Arbeidstilsynet | Lovdata | Likt |
| § 10-10 første ledd — kl. 18/15 → kl. 22 | Arbeidstilsynet | Lovdata | **Tegn for tegn likt** |
| § 10-11 første og sjette ledd — 21–06, tre timer, 8 t over fire uker | Arbeidstilsynet | Lovdata | Likt |
| § 10-12 første og andre ledd — ledende og særlig uavhengig stilling | Arbeidstilsynet | Lovdata | Likt |
| § 10-3, § 10-7 — arbeidsplan, timeoversikt | Arbeidstilsynet | Lovdata | Likt |
| § 14-4 a første ledd — 12 måneder | Arbeidstilsynet | Lovdata | Likt |
| § 14-5 andre ledd, § 14-6 første ledd bokstav j og k | Arbeidstilsynet | Lovdata | Likt |
| § 14-9 andre og sjuende ledd — «mer enn tre år» | Arbeidstilsynet | Lovdata | Likt |
| § 14-15, leddrekkefølgen (2)(3)(4)(5)(6) | Arbeidstilsynet | Lovdata | Likt — og bekreftet at (3) er trekkforbudet |
| Ferieloven § 5, § 7 — 25 og 18 virkedager, 7 virkedager restferie | Lovdata | Arbeidstilsynet | Likt |
| Ferieloven § 10 — 10,2 % og 2,3 prosentpoeng | Lovdata | Arbeidstilsynet | Likt |
| Allmenngjøringsloven § 1, § 5, § 6 | Arbeidstilsynet | Lovdata | Likt — og begge viser at **§ 5**, ikke § 6, gir Tariffnemnda hjemmelen |
| HR-2021-2532-A | Domstol.no | — | Én kilde; det er domstolens egen |

Kryssjekken fant to feil kontrollen mot én kilde ikke tok:

- **Allmenngjøringsloven**: regelen viste til «§ 1 og § 6» for Tariffnemndas hjemmel. Den står i
  **§ 5**. § 6 handler om hva et vedtak kan omfatte — som er en god kilde, men til noe annet.
  Nå er alle tre skilt fra hverandre med hver sin note.
- **Feriepenger**: noten til ferieloven § 10 andre ledd tok med både 12 % for fem ferieuker og
  12,5 % for arbeidstakere over 60. Arbeidstilsynet er tydelig på at **12 % kommer fra
  lønnsoppgjøret, ikke fra ferieloven**, og 12,5 % står i § 10 **tredje** ledd. Leddet oppgir
  bare 10,2 %. Nå har hver sats sin egen kilde, og tariffsatsen er merket som tariff.

## Slik oppdaterer du tekstene

```bash
npm run hent-lovtekst      # henter på nytt og sier hva som har endret seg
```

Endrer et tall eller et ledd seg i loven, skal skriptet si det, og da må regelen rettes — ikke
teksten her tilpasses regelen.
