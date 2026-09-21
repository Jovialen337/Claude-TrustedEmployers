'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { describeInvalidTerms, parseAgreedTerms } from '@/domain/agreedTerms';
import { contractedHoursPerWeek, effectiveHourlyRateOre } from '@/domain/derive';
import { formatHours, formatKr, parseHoursInput, parseKrInput } from '@/domain/money';
import { Contract, type Supplement, type SupplementKind, type Workspace } from '@/domain/schemas';
import { Field, Notice, Spinner } from '../_components/bits';
import { fetchWorkspace, newId, saveWorkspace } from '../_lib/client';

const SUPPLEMENT_LABELS: Record<SupplementKind, string> = {
  kveld: 'Kveldstillegg',
  natt: 'Nattillegg',
  helg: 'Helgetillegg',
  helligdag: 'Helligdagstillegg',
};

interface FormState {
  employer: string;
  employeeName: string;
  startDate: string;
  stillingsprosent: string;
  fullTimeHoursPerWeek: string;
  contractedHoursPerWeek: string;
  wageKind: 'hourly' | 'monthly';
  wage: string;
  tariffavtale: string;
  feriepenger: string;
  averagingAgreement: boolean;
  supplements: Supplement[];

  /* Avtalte vilkår. Tom streng = «står ikke i kontrakten» = loven gjelder. */
  overtimeSupplementPercent: string;
  normalDailyLimitHours: string;
  normalWeeklyLimitHours: string;
  maxOvertimeHoursPer7Days: string;
  agreedDailyRestHours: string;
  agreedWeeklyRestHours: string;
  breakRequiredAfterHours: string;
  minBreakMinutesLongDay: string;
  paidBreak: boolean;
  largerPositionLookbackMonths: string;
}

function emptyForm(): FormState {
  return {
    employer: '',
    employeeName: '',
    startDate: '',
    stillingsprosent: '',
    fullTimeHoursPerWeek: '37,5',
    contractedHoursPerWeek: '',
    wageKind: 'hourly',
    wage: '',
    tariffavtale: '',
    feriepenger: '',
    averagingAgreement: false,
    supplements: [],
    overtimeSupplementPercent: '',
    normalDailyLimitHours: '',
    normalWeeklyLimitHours: '',
    maxOvertimeHoursPer7Days: '',
    agreedDailyRestHours: '',
    agreedWeeklyRestHours: '',
    breakRequiredAfterHours: '',
    minBreakMinutesLongDay: '',
    paidBreak: false,
    largerPositionLookbackMonths: '',
  };
}

/** A number the contract may or may not state: empty string means it does not. */
function optionalNumber(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function toForm(contract: Contract): FormState {
  return {
    employer: contract.employer,
    employeeName: contract.employeeName,
    startDate: contract.startDate,
    stillingsprosent: String(contract.stillingsprosent).replace('.', ','),
    fullTimeHoursPerWeek: String(contract.fullTimeHoursPerWeek).replace('.', ','),
    contractedHoursPerWeek:
      contract.contractedHoursPerWeek === null ? '' : String(contract.contractedHoursPerWeek).replace('.', ','),
    wageKind: contract.wage.kind,
    wage: (contract.wage.amountOre / 100).toFixed(2).replace('.', ','),
    tariffavtale: contract.tariffavtale ?? '',
    feriepenger: contract.feriepengerRatePercent === null ? '' : String(contract.feriepengerRatePercent).replace('.', ','),
    averagingAgreement: contract.averagingAgreement,
    supplements: contract.supplements,
    overtimeSupplementPercent: optionalNumber(contract.overtimeSupplementPercent),
    normalDailyLimitHours: optionalNumber(contract.normalDailyLimitHours),
    normalWeeklyLimitHours: optionalNumber(contract.normalWeeklyLimitHours),
    maxOvertimeHoursPer7Days: optionalNumber(contract.maxOvertimeHoursPer7Days),
    agreedDailyRestHours: optionalNumber(contract.agreedDailyRestHours),
    agreedWeeklyRestHours: optionalNumber(contract.agreedWeeklyRestHours),
    breakRequiredAfterHours: optionalNumber(contract.breakRequiredAfterHours),
    minBreakMinutesLongDay: optionalNumber(contract.minBreakMinutesLongDay),
    paidBreak: contract.paidBreak,
    largerPositionLookbackMonths: optionalNumber(contract.largerPositionLookbackMonths),
  };
}

export default function KontraktPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWorkspace()
      .then((loaded) => {
        setWorkspace(loaded);
        if (loaded.contract) setForm(toForm(loaded.contract));
        else setForm((current) => ({ ...current, fullTimeHoursPerWeek: String(loaded.settings.fullTimeHoursPerWeek).replace('.', ',') }));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function addSupplement(kind: SupplementKind) {
    set('supplements', [
      ...form.supplements,
      {
        id: newId('tillegg'),
        label: SUPPLEMENT_LABELS[kind],
        kind,
        fromTime: kind === 'kveld' ? '18:00' : kind === 'natt' ? '21:00' : null,
        toTime: kind === 'kveld' ? '00:00' : kind === 'natt' ? '06:00' : null,
        weekdays: kind === 'helg' ? [6, 7] : null,
        rate: { kind: 'per_hour_ore', value: 0 },
        source: '',
      },
    ]);
  }

  function updateSupplement(id: string, patch: Partial<Supplement>) {
    set(
      'supplements',
      form.supplements.map((supplement) =>
        supplement.id === id ? ({ ...supplement, ...patch } as Supplement) : supplement,
      ),
    );
  }

  async function onSave() {
    if (!workspace) return;
    setError(null);

    const stillingsprosent = parseHoursInput(form.stillingsprosent);
    const fullTime = parseHoursInput(form.fullTimeHoursPerWeek);
    const wageOre = parseKrInput(form.wage);
    const contracted = form.contractedHoursPerWeek.trim() === '' ? null : parseHoursInput(form.contractedHoursPerWeek);

    if (stillingsprosent === null || fullTime === null || wageOre === null) {
      setError('Sjekk tallene: bruk komma for desimaler, for eksempel 37,5 eller 198,50.');
      return;
    }

    const { values: agreedValues, invalid } = parseAgreedTerms({
      feriepengerRatePercent: form.feriepenger,
      overtimeSupplementPercent: form.overtimeSupplementPercent,
      normalDailyLimitHours: form.normalDailyLimitHours,
      normalWeeklyLimitHours: form.normalWeeklyLimitHours,
      maxOvertimeHoursPer7Days: form.maxOvertimeHoursPer7Days,
      agreedDailyRestHours: form.agreedDailyRestHours,
      agreedWeeklyRestHours: form.agreedWeeklyRestHours,
      breakRequiredAfterHours: form.breakRequiredAfterHours,
      minBreakMinutesLongDay: form.minBreakMinutesLongDay,
      largerPositionLookbackMonths: form.largerPositionLookbackMonths,
    });

    if (invalid.length > 0) {
      setError(describeInvalidTerms(invalid));
      return;
    }

    const candidate = {
      id: workspace.contract?.id ?? newId('kontrakt'),
      employer: form.employer.trim(),
      employeeName: form.employeeName.trim(),
      startDate: form.startDate,
      endDate: workspace.contract?.endDate ?? null,
      stillingsprosent,
      fullTimeHoursPerWeek: fullTime,
      contractedHoursPerWeek: contracted,
      wage: { kind: form.wageKind, amountOre: wageOre },
      tariffavtale: form.tariffavtale.trim() === '' ? null : form.tariffavtale.trim(),
      averagingAgreement: form.averagingAgreement,
      ...agreedValues,
      maxOvertimeHoursPer4Weeks: workspace.contract?.maxOvertimeHoursPer4Weeks ?? null,
      maxOvertimeHoursPer52Weeks: workspace.contract?.maxOvertimeHoursPer52Weeks ?? null,
      longDayHours: workspace.contract?.longDayHours ?? null,
      paidBreak: form.paidBreak,
      supplements: form.supplements,
      documentRef: workspace.contract?.documentRef ?? null,
    };

    const parsed = Contract.safeParse(candidate);
    if (!parsed.success) {
      setError(`Kontrakten mangler noe: ${parsed.error.issues.map((issue) => issue.message).join(', ')}`);
      return;
    }

    try {
      const next = await saveWorkspace({
        ...workspace,
        contract: parsed.data,
        settings: { ...workspace.settings, fullTimeHoursPerWeek: fullTime },
      });
      setWorkspace(next);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (workspace === null) return <Spinner />;

  const preview = (() => {
    const stillingsprosent = parseHoursInput(form.stillingsprosent);
    const fullTime = parseHoursInput(form.fullTimeHoursPerWeek);
    const contracted = form.contractedHoursPerWeek.trim() === '' ? null : parseHoursInput(form.contractedHoursPerWeek);
    const wageOre = parseKrInput(form.wage);
    if (stillingsprosent === null || fullTime === null || wageOre === null) return null;
    const asContract = {
      ...(workspace.contract ?? {}),
      stillingsprosent,
      fullTimeHoursPerWeek: fullTime,
      contractedHoursPerWeek: contracted,
      wage: { kind: form.wageKind, amountOre: wageOre },
    } as Contract;
    return {
      hours: contractedHoursPerWeek(asContract),
      rate: effectiveHourlyRateOre(asContract),
    };
  })();

  return (
    <>
      <h1>1. Arbeidskontrakten</h1>
      <p className="lead">
        Hent fram arbeidsavtalen din og skriv inn det som står der. Er du usikker på et felt, la det stå
        tomt — du kan alltid fylle det inn senere.
      </p>

      {error ? <Notice kind="warn" title="Sjekk dette">{error}</Notice> : null}
      {saved ? (
        <Notice kind="ok" title="Lagret">
          Kontrakten er lagret lokalt. <Link href="/vakter">Neste steg: legg inn vaktene dine →</Link>
        </Notice>
      ) : null}

      <div className="card">
        <div className="grid2">
          <Field label="Arbeidsgiver">
            <input type="text" value={form.employer} onChange={(e) => set('employer', e.target.value)} placeholder="For eksempel Kafé Nordlys AS" />
          </Field>
          <Field label="Navnet ditt" help="Blir med i rapporten. Ingenting sendes noe sted.">
            <input type="text" value={form.employeeName} onChange={(e) => set('employeeName', e.target.value)} />
          </Field>
        </div>

        <div className="grid2">
          <Field label="Startdato i jobben">
            <input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Tariffavtale (hvis kontrakten nevner en)">
            <input type="text" value={form.tariffavtale} onChange={(e) => set('tariffavtale', e.target.value)} placeholder="La stå tomt hvis du ikke vet" />
          </Field>
        </div>

        <div className="grid3">
          <Field label="Stillingsprosent" help="Står ofte som «60 %» eller «60 % stilling».">
            <input type="text" inputMode="decimal" value={form.stillingsprosent} onChange={(e) => set('stillingsprosent', e.target.value)} placeholder="60" />
          </Field>
          <Field label="Full stilling er (timer i uka)" help="Vanligvis 37,5 t. Noen steder 40 t.">
            <input type="text" inputMode="decimal" value={form.fullTimeHoursPerWeek} onChange={(e) => set('fullTimeHoursPerWeek', e.target.value)} />
          </Field>
          <Field label="Avtalt arbeidstid (valgfritt)" help="Bare hvis kontrakten sier et timetall direkte.">
            <input type="text" inputMode="decimal" value={form.contractedHoursPerWeek} onChange={(e) => set('contractedHoursPerWeek', e.target.value)} placeholder="Regnes ut fra prosenten" />
          </Field>
        </div>

        <Field label="Lønn">
          <div className="inline-choice" style={{ marginBottom: '0.5rem' }}>
            <label>
              <input type="radio" name="wageKind" checked={form.wageKind === 'hourly'} onChange={() => set('wageKind', 'hourly')} />
              Timelønn
            </label>
            <label>
              <input type="radio" name="wageKind" checked={form.wageKind === 'monthly'} onChange={() => set('wageKind', 'monthly')} />
              Månedslønn
            </label>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={form.wage}
            onChange={(e) => set('wage', e.target.value)}
            placeholder={form.wageKind === 'hourly' ? '198,50' : '32 000'}
            aria-label={form.wageKind === 'hourly' ? 'Timelønn i kroner' : 'Månedslønn i kroner'}
          />
        </Field>

        <div className="grid2">
          <Field label="Feriepenger" help="10,2 % er lovens minimum. 12 % med avtale om fem uker ferie.">
            <select value={form.feriepenger} onChange={(e) => set('feriepenger', e.target.value)}>
              <option value="">Står ikke i kontrakten (bruk lovens 10,2 %)</option>
              <option value="10,2">10,2 % (fire uker og én dag)</option>
              <option value="12">12 % (fem uker ferie)</option>
              <option value="12,5">12,5 % (over 60 år)</option>
            </select>
          </Field>
          <Field label="Gjennomsnittsberegning av arbeidstid" help="Står det i kontrakten at arbeidstiden gjennomsnittsberegnes?">
            <div className="inline-choice">
              <label>
                <input type="checkbox" checked={form.averagingAgreement} onChange={(e) => set('averagingAgreement', e.target.checked)} />
                Ja, det står i kontrakten
              </label>
            </div>
          </Field>
        </div>

        {preview ? (
          <Notice kind="info">
            Da er avtalt arbeidstid <strong>{formatHours(preview.hours)} i uka</strong>, og timelønnen vi
            regner med er <strong>{formatKr(preview.rate)}</strong>.
          </Notice>
        ) : null}
      </div>

      <h2>Avtalte vilkår som avviker fra loven</h2>
      <p className="lead">
        Reglene tar utgangspunkt i kontrakten din. Står det andre grenser i arbeidsavtalen eller
        tariffavtalen enn i loven, legg dem inn her — da regner vi med dine vilkår, og hvert funn viser at
        tallet kom fra kontrakten. <strong>La feltet stå tomt hvis kontrakten ikke sier noe</strong>, så
        bruker vi loven. Vilkår som er dårligere enn loven tillater, sier vi fra om.
      </p>

      <details className="card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
          Åpne avtalte vilkår (overtid, hviletid, pauser, feriepenger)
        </summary>

        <h3>Overtid</h3>
        <div className="grid3">
          <Field label="Overtidstillegg (%)" help="Loven krever minst 40 %. Mange tariffavtaler gir 50 % eller 100 %.">
            <input
              type="text"
              inputMode="decimal"
              value={form.overtimeSupplementPercent}
              onChange={(e) => set('overtimeSupplementPercent', e.target.value)}
              placeholder="Tomt = lovens 40 %"
            />
          </Field>
          <Field label="Alminnelig arbeidstid per døgn (t)" help="Lovens hovedregel er 9 t.">
            <input
              type="text"
              inputMode="decimal"
              value={form.normalDailyLimitHours}
              onChange={(e) => set('normalDailyLimitHours', e.target.value)}
              placeholder="Tomt = 9 t"
            />
          </Field>
          <Field label="Alminnelig arbeidstid per uke (t)" help="Lovens hovedregel er 40 t.">
            <input
              type="text"
              inputMode="decimal"
              value={form.normalWeeklyLimitHours}
              onChange={(e) => set('normalWeeklyLimitHours', e.target.value)}
              placeholder="Tomt = 40 t"
            />
          </Field>
        </div>
        <Field label="Maks overtid per sju dager (t)" help="Lovens hovedregel er 10 t. Avtale med tillitsvalgte kan gi mer.">
          <input
            type="text"
            inputMode="decimal"
            value={form.maxOvertimeHoursPer7Days}
            onChange={(e) => set('maxOvertimeHoursPer7Days', e.target.value)}
            placeholder="Tomt = 10 t"
          />
        </Field>

        <h3>Arbeidsfri</h3>
        <div className="grid2">
          <Field label="Fri per døgn (t)" help="Loven: 11 t. Avtale kan gå ned til 8 t, ikke lavere.">
            <input
              type="text"
              inputMode="decimal"
              value={form.agreedDailyRestHours}
              onChange={(e) => set('agreedDailyRestHours', e.target.value)}
              placeholder="Tomt = 11 t"
            />
          </Field>
          <Field label="Fri per uke (t)" help="Loven: 35 t. Avtale kan gå ned til 28 t, ikke lavere.">
            <input
              type="text"
              inputMode="decimal"
              value={form.agreedWeeklyRestHours}
              onChange={(e) => set('agreedWeeklyRestHours', e.target.value)}
              placeholder="Tomt = 35 t"
            />
          </Field>
        </div>

        <h3>Pauser</h3>
        <div className="grid2">
          <Field label="Pause etter (t)" help="Loven: pause når dagen er over 5,5 t. Kontrakten kan kreve pause tidligere.">
            <input
              type="text"
              inputMode="decimal"
              value={form.breakRequiredAfterHours}
              onChange={(e) => set('breakRequiredAfterHours', e.target.value)}
              placeholder="Tomt = 5,5 t"
            />
          </Field>
          <Field label="Minst pause på lang vakt (minutter)" help="Loven: 30 minutter når dagen er minst 8 t.">
            <input
              type="text"
              inputMode="numeric"
              value={form.minBreakMinutesLongDay}
              onChange={(e) => set('minBreakMinutesLongDay', e.target.value)}
              placeholder="Tomt = 30 min"
            />
          </Field>
        </div>
        <Field label="Er pausen betalt?" help="Regnes pausen som arbeidstid, skal du ha lønn for den — og da teller den som timer.">
          <div className="inline-choice">
            <label>
              <input type="checkbox" checked={form.paidBreak} onChange={(e) => set('paidBreak', e.target.checked)} />
              Ja, pausen er betalt arbeidstid
            </label>
          </div>
        </Field>

        <h3>Rett til større stilling</h3>
        <Field label="Perioden som teller (måneder)" help="Loven: tolv måneder. Tariffavtalen din kan gi retten tidligere.">
          <input
            type="text"
            inputMode="decimal"
            value={form.largerPositionLookbackMonths}
            onChange={(e) => set('largerPositionLookbackMonths', e.target.value)}
            placeholder="Tomt = 12 måneder"
          />
        </Field>
      </details>

      <h2>Tillegg fra kontrakt eller tariffavtale</h2>
      <p className="lead">
        Kvelds-, natt-, helge- og helligdagstillegg står <em>ikke</em> i arbeidsmiljøloven — de følger av
        kontrakten eller tariffavtalen din. Legg inn de du har, så regner vi ut hva du skulle hatt. Har du
        ingen, hopper vi over den sjekken.
      </p>

      <div className="card">
        {form.supplements.length === 0 ? <p className="muted">Ingen tillegg lagt inn ennå.</p> : null}

        {form.supplements.map((supplement) => (
          <div key={supplement.id} className="card" style={{ background: 'var(--surface-2)' }}>
            <div className="grid2">
              <Field label="Hva heter tillegget?">
                <input type="text" value={supplement.label} onChange={(e) => updateSupplement(supplement.id, { label: e.target.value })} />
              </Field>
              <Field label="Type">
                <select
                  value={supplement.kind}
                  onChange={(e) => updateSupplement(supplement.id, { kind: e.target.value as SupplementKind })}
                >
                  {Object.entries(SUPPLEMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid2">
              <Field label="Gjelder fra klokka" help="La stå tomt hvis tillegget gjelder hele dagen.">
                <input
                  type="time"
                  value={supplement.fromTime ?? ''}
                  onChange={(e) => updateSupplement(supplement.id, { fromTime: e.target.value === '' ? null : e.target.value })}
                />
              </Field>
              <Field label="Til klokka">
                <input
                  type="time"
                  value={supplement.toTime ?? ''}
                  onChange={(e) => updateSupplement(supplement.id, { toTime: e.target.value === '' ? null : e.target.value })}
                />
              </Field>
            </div>

            <div className="grid2">
              <Field label="Sats">
                <div className="inline-choice" style={{ marginBottom: '0.5rem' }}>
                  <label>
                    <input
                      type="radio"
                      name={`rate-${supplement.id}`}
                      checked={supplement.rate.kind === 'per_hour_ore'}
                      onChange={() => updateSupplement(supplement.id, { rate: { kind: 'per_hour_ore', value: 0 } })}
                    />
                    Kroner per time
                  </label>
                  <label>
                    <input
                      type="radio"
                      name={`rate-${supplement.id}`}
                      checked={supplement.rate.kind === 'percent'}
                      onChange={() => updateSupplement(supplement.id, { rate: { kind: 'percent', value: 0 } })}
                    />
                    Prosent av timelønn
                  </label>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={
                    supplement.rate.kind === 'per_hour_ore'
                      ? (supplement.rate.value / 100).toFixed(2).replace('.', ',')
                      : String(supplement.rate.value).replace('.', ',')
                  }
                  onChange={(e) => {
                    if (supplement.rate.kind === 'per_hour_ore') {
                      const ore = parseKrInput(e.target.value);
                      updateSupplement(supplement.id, { rate: { kind: 'per_hour_ore', value: ore ?? 0 } });
                    } else {
                      const percent = parseHoursInput(e.target.value);
                      updateSupplement(supplement.id, { rate: { kind: 'percent', value: percent ?? 0 } });
                    }
                  }}
                  aria-label="Sats for tillegget"
                />
              </Field>
              <Field label="Hvor står det?" help="For eksempel «Arbeidskontrakt pkt. 6» eller «Tariffavtale § 4». Blir med i rapporten.">
                <input type="text" value={supplement.source} onChange={(e) => updateSupplement(supplement.id, { source: e.target.value })} />
              </Field>
            </div>

            <button
              type="button"
              className="danger"
              onClick={() => set('supplements', form.supplements.filter((other) => other.id !== supplement.id))}
            >
              Fjern dette tillegget
            </button>
          </div>
        ))}

        <div className="actions">
          {(Object.keys(SUPPLEMENT_LABELS) as SupplementKind[]).map((kind) => (
            <button key={kind} type="button" onClick={() => addSupplement(kind)}>
              + {SUPPLEMENT_LABELS[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="actions">
        <button type="button" className="primary" onClick={onSave}>
          Lagre kontrakten
        </button>
        <Link className="button" href="/vakter">
          Videre til vakter
        </Link>
      </div>
    </>
  );
}
