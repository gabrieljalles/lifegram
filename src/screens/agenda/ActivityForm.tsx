import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, EmptyState, Header, Section, WeekdayPicker } from '../../components/ui'
import { ACTIVITY_ICONS, ACTIVITY_XP, COMBO_AT, dayKey, describeDays } from '../../lib/activities'
import { archiveActivity, saveActivity } from '../../lib/activityActions'
import { templateUrl } from '../../lib/gcal'
import { useApp } from '../../lib/store'
import type { Activity, ActivityKind, Weekday } from '../../lib/types'

const PRESETS: Array<{ label: string; days: Weekday[] }> = [
  { label: 'Todo dia', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Seg a sex', days: [1, 2, 3, 4, 5] },
  { label: 'Fim de semana', days: [0, 6] },
]

const DURATIONS = [15, 30, 45, 60, 90, 120]

const input =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500'

/** Criar e editar atividade: /agenda/nova e /agenda/:activityId. */
export default function ActivityForm() {
  const { activityId } = useParams()
  const navigate = useNavigate()
  const { activities, reload } = useApp()
  const existing = activityId ? activities.find((a) => a.id === activityId) : undefined

  const [kind, setKind] = useState<ActivityKind>(existing?.kind ?? 'recorrente')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? ACTIVITY_ICONS[0])
  const [days, setDays] = useState<Weekday[]>(existing?.days.length ? existing.days : [1, 2, 3, 4, 5])
  const [date, setDate] = useState(existing?.date ?? dayKey(new Date()))
  const [timed, setTimed] = useState(Boolean(existing?.time))
  const [time, setTime] = useState(existing?.time ?? '07:00')
  const [duration, setDuration] = useState(existing?.duration_minutes ?? 30)
  const [saving, setSaving] = useState(false)

  if (activityId && !existing) {
    return (
      <div>
        <Header title="Atividade" back="/agenda" />
        <EmptyState icon="🔍" title="Atividade não encontrada" />
      </div>
    )
  }

  const valid = title.trim().length > 0 && (kind === 'esporadica' ? Boolean(date) : days.length > 0)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await saveActivity(
        {
          title: title.trim(),
          icon,
          kind,
          days: kind === 'recorrente' ? days : [],
          date: kind === 'esporadica' ? date : null,
          time: timed ? time : null,
          duration_minutes: duration,
        },
        existing,
      )
      await reload()
      navigate('/agenda')
    } finally {
      setSaving(false)
    }
  }

  const archive = async (activity: Activity) => {
    if (!confirm(`Remover "${activity.title}"? O XP que você já ganhou com ela continua.`)) return
    await archiveActivity(activity)
    await reload()
    navigate('/agenda')
  }

  const gcalLink = existing ? templateUrl(existing) : null
  const xp = ACTIVITY_XP[kind]

  return (
    <div>
      <Header
        title={existing ? 'Editar atividade' : 'Nova atividade'}
        back="/agenda"
        action={
          <Button size="sm" onClick={() => void save()} disabled={!valid || saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Tipo">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'recorrente', icon: '🔁', label: 'Recorrente', hint: 'Repete na semana' },
              { id: 'esporadica', icon: '📌', label: 'Esporádica', hint: 'Um dia só' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              aria-pressed={kind === option.id}
              className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                kind === option.id ? 'border-brand-400 bg-brand-600/20' : 'border-ink-700 bg-ink-850'
              }`}
            >
              <span className="text-2xl" aria-hidden="true">
                {option.icon}
              </span>
              <span className="mt-1 block text-sm font-black">{option.label}</span>
              <span className="block text-xs text-ink-400">{option.hint}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="O que">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={kind === 'recorrente' ? 'Ler uma página do livro' : 'Dentista'}
          className={input}
          autoFocus={!existing}
        />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {ACTIVITY_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => setIcon(emoji)}
              aria-pressed={icon === emoji}
              aria-label={`Ícone ${emoji}`}
              className={`h-10 w-10 rounded-xl border text-xl transition-colors ${
                icon === emoji ? 'border-brand-400 bg-brand-600/25' : 'border-ink-700 bg-ink-850'
              }`}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Section>

      {kind === 'recorrente' ? (
        <Section title="Quando">
          <Card className="p-4">
            <WeekdayPicker value={days} onChange={setDays} />
            <div className="mt-2.5 flex gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setDays(preset.days)}
                  className="rounded-full border border-ink-600 px-2.5 py-1 text-xs font-semibold text-ink-300 active:bg-ink-800"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-400">
              {days.length > 0 ? describeDays(days) : 'Escolha pelo menos um dia.'}
            </p>
          </Card>
        </Section>
      ) : (
        <Section title="Data">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={`${input} [color-scheme:dark]`}
          />
        </Section>
      )}

      <Section title="Horário">
        <Card className="p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Hora marcada</span>
            <input
              type="checkbox"
              checked={timed}
              onChange={(event) => setTimed(event.target.checked)}
              className="h-5 w-5 accent-brand-500"
            />
          </label>
          {timed ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                aria-label="Horário"
                className={`${input} tnum [color-scheme:dark]`}
              />
              <select
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
                aria-label="Duração"
                className={input}
              >
                {DURATIONS.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60 ? `${minutes} min` : `${minutes / 60} h`.replace('.5', ',5')}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <p className="mt-1.5 text-[11px] text-ink-400">Sem hora: vale a qualquer momento do dia.</p>
          )}
        </Card>
      </Section>

      <Section title="Recompensa">
        <Card className="flex items-center gap-3 p-4">
          <span className="text-2xl" aria-hidden="true">
            💰
          </span>
          <p className="text-sm text-ink-300">
            <b className="text-pr-400">+{xp} XP</b> cada vez que cumprir.
            {kind === 'recorrente' && (
              <>
                {' '}
                Com <b className="text-fire-400">🔥 {COMBO_AT} seguidas</b> vira combo e o XP dobra.
              </>
            )}
          </p>
        </Card>
      </Section>

      <div className="flex flex-col gap-2 px-4 pb-6 pt-2">
        <Button size="lg" onClick={() => void save()} disabled={!valid || saving}>
          {existing ? 'Salvar mudanças' : 'Criar missão'}
        </Button>
        {gcalLink && (
          <a
            href={gcalLink}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-ink-600 px-4 py-3 text-center text-sm font-semibold text-ink-100 active:bg-ink-800"
          >
            📅 Adicionar ao Google Agenda
          </a>
        )}
        {existing && (
          <Button variant="danger" onClick={() => void archive(existing)}>
            Remover atividade
          </Button>
        )}
      </div>
    </div>
  )
}
