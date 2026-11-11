import { useState } from 'react'
import { addDays, format } from 'date-fns'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, EmptyState, Header, Section, WeekdayPicker } from '../../components/ui'
import { ACTIVITY_ICONS, dayKey, describeDays } from '../../lib/activities'
import { archiveActivity, saveActivity, setTaskCompleted } from '../../lib/activityActions'
import { canComplete, deadlineLabel, daysToDeadline } from '../../lib/tasks'
import { templateUrl } from '../../lib/gcal'
import { TRAVEL_OPTIONS, formatTravel, reminderPlan } from '../../lib/reminders'
import { requestNotificationPermission } from '../../lib/timer'
import { reminderChannel, type ReminderChannel } from '../../lib/useActivityReminders'
import { useApp } from '../../lib/store'
import { ITEM_TYPES, itemTypeOf } from '../../lib/items'
import {
  newId,
  type Activity,
  type ActivityKind,
  type ItemType,
  type Subtask,
  type Weekday,
} from '../../lib/types'
import { confirmDialog } from '../../lib/dialog'

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

  const [itemType, setItemType] = useState<ItemType>(existing ? itemTypeOf(existing) : 'habito')
  const [dose, setDose] = useState(existing?.dose ?? '')
  const [kind, setKind] = useState<ActivityKind>(existing?.kind ?? 'recorrente')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [icon, setIcon] = useState(existing?.icon ?? ACTIVITY_ICONS[0])
  const [days, setDays] = useState<Weekday[]>(
    existing?.days.length ? existing.days : [1, 2, 3, 4, 5],
  )
  const [date, setDate] = useState(existing?.date ?? dayKey(new Date()))
  const [timed, setTimed] = useState(Boolean(existing?.time))
  const [time, setTime] = useState(existing?.time ?? '07:00')
  const [duration, setDuration] = useState(existing?.duration_minutes ?? 30)
  const [travel, setTravel] = useState(existing?.travel_minutes ?? 0)
  const [channel, setChannel] = useState<ReminderChannel>(reminderChannel)
  const [saving, setSaving] = useState(false)
  const [startsOn, setStartsOn] = useState(existing?.starts_on ?? dayKey(new Date()))
  const [hasDeadline, setHasDeadline] = useState(Boolean(existing?.deadline))
  const [deadline, setDeadline] = useState(
    () => existing?.deadline ?? dayKey(addDays(new Date(), 7)),
  )
  const [steps, setSteps] = useState<Subtask[]>(existing?.subtasks ?? [])
  const [newStep, setNewStep] = useState('')
  const isTarefa = itemType === 'tarefa'

  const addStep = () => {
    const text = newStep.trim()
    if (!text) return
    setSteps((list) => [...list, { id: newId(), title: text, done: false }])
    setNewStep('')
  }

  if (activityId && !existing) {
    return (
      <div>
        <Header title="Atividade" back="/agenda" />
        <EmptyState icon="🔍" title="Atividade não encontrada" />
      </div>
    )
  }

  const valid =
    title.trim().length > 0 &&
    (kind === 'esporadica' ? isTarefa || Boolean(date) : days.length > 0) &&
    (!isTarefa || !hasDeadline || deadline >= startsOn)

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      await saveActivity(
        {
          title: title.trim(),
          icon,
          item_type: itemType,
          dose: itemType === 'remedio' && dose.trim() ? dose.trim() : null,
          kind,
          days: kind === 'recorrente' ? days : [],
          date: kind === 'esporadica' && !isTarefa ? date : null,
          ...(isTarefa
            ? {
                starts_on: startsOn,
                deadline: hasDeadline ? deadline : null,
                subtasks: steps,
                // Subtarefa nova numa tarefa fechada reabre a tarefa.
                ...(existing?.completed_at && !canComplete({ subtasks: steps })
                  ? { completed_at: null }
                  : {}),
              }
            : {}),
          time: timed ? time : null,
          duration_minutes: duration,
          travel_minutes: timed ? travel : 0,
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
    if (
      !(await confirmDialog({
        title: `Remover "${activity.title}"?`,
        message: 'O histórico do que você já fez continua guardado.',
        confirmLabel: 'Remover',
        danger: true,
      }))
    )
      return
    await archiveActivity(activity)
    await reload()
    navigate('/agenda')
  }

  const gcalLink = existing ? templateUrl(existing) : null

  return (
    <div>
      <Header
        title={existing ? 'Editar item' : 'Novo item'}
        back="/agenda"
        action={
          <Button size="sm" onClick={() => void save()} disabled={!valid || saving}>
            Salvar
          </Button>
        }
      />

      <Section title="O que é">
        <div className="flex flex-wrap gap-1.5">
          {ITEM_TYPES.filter((t) => t.id !== 'treino').map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={itemType === t.id}
              onClick={() => {
                setItemType(t.id)
                // Icone ainda no padrao acompanha o tipo; escolhido a mao fica.
                if (
                  !existing &&
                  (icon === ACTIVITY_ICONS[0] || ITEM_TYPES.some((x) => x.icon === icon))
                ) {
                  setIcon(t.icon)
                }
                if (t.id === 'compromisso') setKind('esporadica')
              }}
              className={`min-h-[44px] rounded-full border-[1.5px] px-3.5 text-sm font-medium ${
                itemType === t.id ? 'border-brand-400 bg-brand-400 text-ink-900' : 'border-ink-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        {itemType === 'remedio' && (
          <input
            value={dose}
            onChange={(event) => setDose(event.target.value)}
            placeholder="Dose: 2.000 UI, 5 g, 1 comprimido"
            className={`${input} mt-2.5`}
          />
        )}
      </Section>

      <Section title="Repete?">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'recorrente', icon: '🔁', label: 'Recorrente', hint: 'Repete na semana' },
              isTarefa
                ? { id: 'esporadica', icon: '🎯', label: 'Uma vez', hint: 'Aparece até concluir' }
                : { id: 'esporadica', icon: '📌', label: 'Esporádica', hint: 'Um dia só' },
            ] as Array<{ id: ActivityKind; icon: string; label: string; hint: string }>
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setKind(option.id)}
              aria-pressed={kind === option.id}
              className={`rounded-2xl border-2 p-3 text-left transition-colors ${
                kind === option.id
                  ? 'border-brand-400 bg-brand-600/20'
                  : 'border-ink-700 bg-ink-850'
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
          placeholder={
            isTarefa
              ? 'Lançar o portfólio'
              : kind === 'recorrente'
                ? 'Ler uma página do livro'
                : 'Dentista'
          }
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
      ) : isTarefa ? null : (
        <Section title="Data">
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={`${input} [color-scheme:dark]`}
          />
        </Section>
      )}

      {isTarefa && (
        <>
          <Section title="Subtarefas">
            <Card className="divide-y divide-ink-700">
              {steps.map((s, index) => (
                <div key={s.id} className="flex min-h-[48px] items-center gap-2 px-3">
                  <button
                    type="button"
                    aria-pressed={s.done}
                    aria-label={s.done ? `Desmarcar ${s.title}` : `Marcar ${s.title}`}
                    onClick={() =>
                      setSteps((list) =>
                        list.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)),
                      )
                    }
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border-[1.5px] text-xs font-bold ${
                      s.done
                        ? 'border-brand-400 bg-brand-400 text-ink-900'
                        : 'border-ink-400 text-transparent'
                    }`}
                  >
                    ✓
                  </button>
                  <input
                    value={s.title}
                    onChange={(e) =>
                      setSteps((list) =>
                        list.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)),
                      )
                    }
                    aria-label={`Subtarefa ${index + 1}`}
                    className={`min-w-0 flex-1 bg-transparent py-2 text-sm outline-none ${
                      s.done ? 'text-ink-400 line-through' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSteps((list) => list.filter((x) => x.id !== s.id))}
                    aria-label={`Tirar ${s.title}`}
                    className="flex h-9 w-9 items-center justify-center rounded-full text-ink-400 active:bg-ink-800"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <form
                className="flex items-center gap-2 px-3 py-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  addStep()
                }}
              >
                <input
                  value={newStep}
                  onChange={(e) => setNewStep(e.target.value)}
                  placeholder={steps.length ? 'Próximo passo' : 'Primeiro passo'}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-ink-400"
                />
                <button
                  type="submit"
                  disabled={!newStep.trim()}
                  className="min-h-[36px] rounded-full bg-brand-600 px-3 text-xs font-bold text-white disabled:opacity-40"
                >
                  Adicionar
                </button>
              </form>
            </Card>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
              A tarefa só se conclui quando todas as subtarefas estiverem feitas. No Hoje elas ficam
              recolhidas embaixo do título.
            </p>
          </Section>

          <Section title="Datas">
            <Card className="p-4">
              <label className="flex items-center justify-between gap-3 text-sm font-semibold">
                Começa em
                <input
                  type="date"
                  value={startsOn}
                  onChange={(e) => e.target.value && setStartsOn(e.target.value)}
                  className="tnum rounded-lg border border-ink-700 bg-ink-850 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">Prazo</span>
                <input
                  type="checkbox"
                  checked={hasDeadline}
                  onChange={(e) => setHasDeadline(e.target.checked)}
                  className="h-5 w-5 accent-brand-500"
                />
              </label>
              {hasDeadline && (
                <input
                  type="date"
                  value={deadline}
                  min={startsOn}
                  onChange={(e) => e.target.value && setDeadline(e.target.value)}
                  aria-label="Data do prazo"
                  className={`${input} tnum mt-2`}
                />
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                {!hasDeadline
                  ? kind === 'esporadica'
                    ? 'Sem prazo: aparece todo dia no Hoje até você concluir.'
                    : 'Sem prazo: aparece nos dias marcados até você concluir.'
                  : deadline < startsOn
                    ? 'O prazo precisa ser depois do começo.'
                    : `${
                        kind === 'esporadica'
                          ? 'Aparece todo dia até concluir'
                          : 'Aparece nos dias marcados até o prazo'
                      }. Passou do prazo sem concluir, aparece todo dia cobrando. Hoje: ${deadlineLabel(daysToDeadline({ deadline }, new Date()))}.`}
              </p>
            </Card>
          </Section>
        </>
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
            <p className="mt-1.5 text-[11px] text-ink-400">
              Sem hora: vale a qualquer momento do dia.
            </p>
          )}
        </Card>
      </Section>

      {timed && (
        <Section title="Aviso">
          <Card className="p-4">
            <p className="text-sm font-semibold">Quanto tempo leva para chegar lá?</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {TRAVEL_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setTravel(minutes)}
                  aria-pressed={travel === minutes}
                  className={`tnum rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                    travel === minutes
                      ? 'border-brand-400 bg-brand-600/25 text-ink-50'
                      : 'border-ink-600 text-ink-300 active:bg-ink-800'
                  }`}
                >
                  {minutes === 0 ? '🏠 Já estou lá' : `🚶 ${formatTravel(minutes)}`}
                </button>
              ))}
            </div>
            <ReminderTimeline time={time} travel={travel} />
            <ReminderDelivery
              channel={channel}
              onAsk={async () => {
                await requestNotificationPermission()
                setChannel(reminderChannel())
              }}
            />
          </Card>
        </Section>
      )}

      <div className="flex flex-col gap-2 px-4 pb-6 pt-2">
        <Button size="lg" onClick={() => void save()} disabled={!valid || saving}>
          {existing ? 'Salvar mudanças' : isTarefa ? 'Criar tarefa' : 'Criar item'}
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
        {existing && isTarefa && existing.kind === 'recorrente' && (
          <Button
            variant="outline"
            disabled={!existing.completed_at && !canComplete({ subtasks: steps })}
            onClick={async () => {
              await setTaskCompleted(existing, !existing.completed_at)
              await reload()
              navigate('/agenda')
            }}
          >
            {existing.completed_at
              ? 'Reabrir tarefa'
              : canComplete({ subtasks: steps })
                ? 'Concluir tarefa'
                : 'Conclua as subtarefas para fechar'}
          </Button>
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

/**
 * Linha do tempo do aviso: mostra na hora, com os horarios reais, quando o
 * celular vai tocar, quando sair e quando chegar — sem precisar fazer conta.
 */
function ReminderTimeline({ time, travel }: { time: string; travel: number }) {
  const plan = reminderPlan(
    {
      kind: 'esporadica',
      date: dayKey(new Date()),
      time,
      travel_minutes: travel,
    } as Activity,
    new Date(),
  )
  if (!plan) return null
  const steps = [
    { icon: '🔔', at: plan.notifyAt, label: 'Aviso' },
    ...(plan.leaveAt ? [{ icon: '🚶', at: plan.leaveAt, label: 'Sair' }] : []),
    { icon: '📍', at: plan.startAt, label: plan.leaveAt ? 'Chegar' : 'Começa' },
  ]
  return (
    <ol className="mt-4 flex items-start" aria-label="Linha do tempo do aviso">
      {steps.map((step, index) => (
        <li key={step.label} className="relative flex flex-1 flex-col items-center text-center">
          {index > 0 && (
            <span
              className="absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2 bg-ink-700"
              aria-hidden="true"
            />
          )}
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-ink-600 bg-ink-850 text-base">
            {step.icon}
          </span>
          <span className="tnum mt-1 text-sm font-black">{format(step.at, 'HH:mm')}</span>
          <span className="text-[11px] text-ink-400">{step.label}</span>
        </li>
      ))}
    </ol>
  )
}

/** Diz quem vai entregar o aviso, e o que falta para ele chegar. */
function ReminderDelivery({ channel, onAsk }: { channel: ReminderChannel; onAsk: () => void }) {
  if (channel === 'ask') {
    return (
      <Button className="mt-4 w-full" variant="primary" onClick={onAsk}>
        🔔 Ativar avisos
      </Button>
    )
  }
  const text = {
    google: '✅ O Google Agenda avisa no celular, mesmo com o app fechado.',
    app: '🔔 O app avisa. Com ele fechado, o celular pode segurar o aviso — conecte o Google Agenda na Agenda para não depender disso.',
    blocked:
      '🔕 As notificações estão bloqueadas neste navegador. Libere nas permissões do site, ou conecte o Google Agenda.',
  }[channel]
  return (
    <p
      className={`mt-4 text-[11px] leading-relaxed ${
        channel === 'google'
          ? 'text-go-400'
          : channel === 'blocked'
            ? 'text-fire-400'
            : 'text-ink-400'
      }`}
    >
      {text}
    </p>
  )
}
