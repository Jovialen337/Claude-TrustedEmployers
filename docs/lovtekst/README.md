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

## Slik oppdaterer du tekstene

```bash
npm run hent-lovtekst      # henter på nytt og sier hva som har endret seg
```

Endrer et tall eller et ledd seg i loven, skal skriptet si det, og da må regelen rettes — ikke
teksten her tilpasses regelen.
