import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  DAY_WORDS,
  DREAM_FACTOR,
  HAPPINESS_LABELS,
  MAX_WORDS,
  SLEEP_QUALITY_LABELS,
  activeFactors,
  autoFactors,
  checkinFor,
  emptyCheckin,
  formatSleep,
  saveCheckin,
  toggleWord,
} from '../lib/checkin'
import { useApp } from '../lib/store'
import { vibrate } from '../lib/timer'
import type { Checkin as CheckinRow, CheckinFactor, FactorValue } from '../lib/types'

const DEFAULT_SLEEP = 7 * 60

/**
 * Fechar o dia, em duas partes: como foi (felicidade, sono, palavras,
 * disposicao) e o que pode pesar amanha (alcool, sexo, tela...). Cada
 * resposta e um toque; a parte 1 ja fica salva ao avancar.
 */
export default function Checkin() {
  const navigate = useNavigate()
  const { day = format(new Date(), 'yyyy-MM-dd') } = useParams()
  const { checkins, sessions, settings, reload } = useApp()
  const factors = useMemo(() => activeFactors(settings), [settings])
  const [step, setStep] = useState<1 | 2>(1)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<CheckinRow>(() => {
    const base = checkinFor(checkins, day) ?? emptyCheckin(day)
    return { ...base, factors: { ...autoFactors(day, sessions), ...base.factors } }
  })

  // Abrindo outro dia pela URL: recomeca daquele dia.
  useEffect(() => {
    const base = checkinFor(checkins, day) ?? emptyCheckin(day)
    setDraft({ ...base, factors: { ...autoFactors(day, sessions), ...base.factors } })
    setStep(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day])

  const patch = (p: Partial<CheckinRow>) => setDraft((d) => ({ ...d, ...p }))
  const setFactor = (id: string, value: FactorValue | undefined) =>
    setDraft((d) => {
      const next = { ...d.factors }
      if (value === undefined) delete next[id]
      else next[id] = value
      return { ...d, factors: next }
    })

  const persist = async () => {
    setSaving(true)
    try {
      await saveCheckin(draft)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  const next = async () => {
    await persist()
    setStep(2)
    window.scrollTo(0, 0)
  }

  const finish = async () => {
    await persist()
    vibrate([40, 40, 80])
    navigate('/')
  }

  const date = parseISO(day)
  const weekday = format(date, 'EEEE', { locale: ptBR }).replace('-feira', '')
  const title = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${format(date, 'd')}`

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="safe-t flex-1 px-5 pb-32 pt-3">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-bold uppercase tracking-widest text-ink-400">
            {step} de 2 · {step === 1 ? 'Como foi o dia' : 'A noite de hoje'}
          </p>
          <button
            type="button"
            onClick={() => (step === 2 ? setStep(1) : navigate(-1))}
            className="min-h-[44px] px-2 text-sm font-medium text-ink-400"
          >
            {step === 2 ? '‹ Voltar' : 'Fechar'}
          </button>
        </div>

        {step === 1 ? (
          <>
            <h1 className="font-display text-3xl font-bold leading-none">{title} · fechar o dia</h1>
            <p className="mt-1 text-[13px] text-ink-400">
              Responde rápido. O que importa é não pular.
            </p>

            <Label>Felicidade</Label>
            <Scale
              value={draft.happiness}
              labels={HAPPINESS_LABELS}
              onPick={(v) => patch({ happiness: v })}
              name="Felicidade"
            />

            <Label>Sono de ontem para hoje</Label>
            <div className="flex items-center gap-2.5">
              <div className="flex h-[52px] items-center rounded-xl border-[1.5px] border-ink-700">
                <StepButton
                  label="Menos 15 minutos"
                  onClick={() =>
                    patch({
                      sleep_minutes: Math.max(0, (draft.sleep_minutes ?? DEFAULT_SLEEP) - 15),
                    })
                  }
                >
                  −
                </StepButton>
                <b className="tnum min-w-[64px] text-center font-display text-2xl">
                  {formatSleep(draft.sleep_minutes ?? DEFAULT_SLEEP)}
                </b>
                <StepButton
                  label="Mais 15 minutos"
                  onClick={() =>
                    patch({
                      sleep_minutes: Math.min(16 * 60, (draft.sleep_minutes ?? DEFAULT_SLEEP) + 15),
                    })
                  }
                >
                  +
                </StepButton>
              </div>
              <div className="flex flex-1 gap-1.5">
                {SLEEP_QUALITY_LABELS.map((label, i) => (
                  <Choice
                    key={label}
                    on={draft.sleep_quality === i + 1}
                    onClick={() =>
                      patch({
                        sleep_quality: i + 1,
                        sleep_minutes: draft.sleep_minutes ?? DEFAULT_SLEEP,
                      })
                    }
                  >
                    {label}
                  </Choice>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex-1 text-[15px] font-medium">Sonhou essa noite?</span>
              <div className="flex w-[180px] gap-1.5">
                {([false, true] as const).map((v) => (
                  <Choice
                    key={String(v)}
                    on={draft.factors[DREAM_FACTOR] === v}
                    onClick={() =>
                      setFactor(DREAM_FACTOR, draft.factors[DREAM_FACTOR] === v ? undefined : v)
                    }
                  >
                    {v ? 'Sim' : 'Não'}
                  </Choice>
                ))}
              </div>
            </div>

            <Label>Até {MAX_WORDS} palavras</Label>
            <div className="flex flex-wrap gap-2">
              {DAY_WORDS.map((word) => {
                const on = draft.words.includes(word)
                return (
                  <button
                    key={word}
                    type="button"
                    aria-pressed={on}
                    onClick={() => patch({ words: toggleWord(draft.words, word) })}
                    className={`min-h-[40px] rounded-full border-[1.5px] px-3.5 text-sm ${
                      on ? 'border-brand-400 bg-brand-400 font-bold text-ink-900' : 'border-ink-700'
                    }`}
                  >
                    {word}
                  </button>
                )
              })}
            </div>

            <Label>Disposição hoje</Label>
            <Scale value={draft.energy} onPick={(v) => patch({ energy: v })} name="Disposição" />

            <Label>Nota (opcional)</Label>
            <textarea
              value={draft.note ?? ''}
              onChange={(e) => patch({ note: e.target.value || null })}
              rows={2}
              placeholder="Uma linha sobre o dia"
              className="w-full resize-none border-b border-ink-700 bg-transparent py-2 text-sm outline-none placeholder:text-ink-400 focus:border-brand-400"
            />
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold leading-none">
              O que pode pesar amanhã
            </h1>
            <p className="mt-1 text-[13px] text-ink-400">
              Sem julgamento. Só registra; amanhã os números falam.
            </p>
            <ul className="mt-3">
              {factors.map((factor) => (
                <FactorRow
                  key={factor.id}
                  factor={factor}
                  value={draft.factors[factor.id]}
                  onChange={(v) => setFactor(factor.id, v)}
                />
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-400">
              🔒 Só você vê. As perguntas mudam em Vida › Ajustes.
            </p>
          </>
        )}
      </div>

      <div className="safe-b fixed inset-x-0 bottom-0 bg-gradient-to-t from-ink-900 via-ink-900 to-transparent px-5 pt-6">
        <button
          type="button"
          disabled={saving || (step === 1 && draft.happiness == null)}
          onClick={() => void (step === 1 ? next() : finish())}
          className="mx-auto mb-3 flex h-14 w-full max-w-lg items-center justify-center rounded-full bg-brand-400 text-base font-bold text-ink-900 disabled:opacity-40"
        >
          {step === 1
            ? draft.happiness == null
              ? 'Marque a felicidade'
              : 'Próximo ›'
            : 'Salvar e fechar o dia'}
        </button>
      </div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-2 mt-5 font-display text-[15px] font-bold uppercase tracking-widest text-margin">
      {children}
    </h2>
  )
}

function Scale({
  value,
  labels,
  onPick,
  name,
}: {
  value: number | null
  labels?: string[]
  onPick: (v: number) => void
  name: string
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(n)}
            className={`flex h-14 flex-1 flex-col items-center justify-center rounded-xl border-[1.5px] font-display text-2xl font-bold ${
              on ? 'border-highlight bg-highlight text-highlight-ink' : 'border-ink-700'
            }`}
          >
            {n}
            {labels && (
              <small className={`font-sans text-[10px] font-normal ${on ? '' : 'text-ink-400'}`}>
                {labels[n - 1]}
              </small>
            )}
          </button>
        )
      })}
    </div>
  )
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-[52px] flex-1 rounded-xl border-[1.5px] text-sm font-medium ${
        on ? 'border-brand-400 text-brand-400' : 'border-ink-700'
      }`}
    >
      {children}
    </button>
  )
}

function StepButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="h-full w-11 text-2xl text-brand-400 active:bg-ink-800"
    >
      {children}
    </button>
  )
}

function FactorRow({
  factor,
  value,
  onChange,
}: {
  factor: CheckinFactor
  value: FactorValue | undefined
  onChange: (v: FactorValue | undefined) => void
}) {
  let control: ReactNode
  if (factor.kind === 'count') {
    const n = typeof value === 'number' ? value : 0
    control = (
      <div className="flex h-10 items-center rounded-xl border-[1.5px] border-ink-700">
        <StepButton label="Menos" onClick={() => onChange(Math.max(0, n - 1))}>
          −
        </StepButton>
        <b className="tnum min-w-[64px] text-center font-display text-xl">
          {value === undefined ? '—' : `${n} ${factor.unit ?? ''}`.trim()}
        </b>
        <StepButton label="Mais" onClick={() => onChange(n + 1)}>
          +
        </StepButton>
      </div>
    )
  } else if (factor.kind === 'time') {
    control = (
      <input
        type="time"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="tnum h-10 rounded-xl border-[1.5px] border-ink-700 bg-transparent px-2 font-display text-xl font-bold"
      />
    )
  } else {
    const opt = (v: boolean, label: string) => {
      const on = value === v
      return (
        <button
          type="button"
          aria-pressed={on}
          onClick={() => onChange(on ? undefined : v)}
          className={`h-10 w-[52px] text-sm font-bold ${
            on ? (v ? 'bg-brand-400 text-ink-900' : 'bg-ink-700 text-ink-100') : 'text-ink-400'
          }`}
        >
          {label}
        </button>
      )
    }
    control = (
      <div className="flex overflow-hidden rounded-xl border-[1.5px] border-ink-700 [&>button+button]:border-l-[1.5px] [&>button+button]:border-ink-700">
        {opt(false, 'Não')}
        {opt(true, 'Sim')}
      </div>
    )
  }
  return (
    <li className="flex min-h-[52px] items-center gap-3 border-b border-ink-700 py-1">
      <span className="min-w-0 flex-1 text-[15px] font-medium">
        {factor.label}
        {factor.hint && (
          <small className="block text-xs font-normal text-ink-400">{factor.hint}</small>
        )}
      </span>
      {control}
    </li>
  )
}
