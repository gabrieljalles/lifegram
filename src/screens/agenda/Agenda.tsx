import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { QuestRow } from '../../components/agenda-ui'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { agendaOf, dayKey, describeWhen, streakOf, xpOf } from '../../lib/activities'
import { useNow } from '../../lib/useNow'
import { toggleActivity } from '../../lib/activityActions'
import {
  cachedGcalEvents,
  connectGcal,
  fetchGcalEvents,
  disconnectGcal,
  gcalClientIdFromApp,
  gcalLinked,
  gcalTokenValid,
  isGcalConfigured,
  isValidClientId,
  setGcalClientId,
  syncGcal,
  type GcalEvent,
} from '../../lib/gcal'
import { useApp } from '../../lib/store'
import { vibrate } from '../../lib/timer'
import type { Activity } from '../../lib/types'

/**
 * Agenda: o quadro de missoes da rotina. Uma faixa de 7 dias em cima, as
 * missoes do dia escolhido no meio e, embaixo, o catalogo do que existe.
 */
export default function Agenda() {
  const navigate = useNavigate()
  const { activities, activityLogs, reload } = useApp()
  const now = useNow()
  const [selected, setSelected] = useState(() => dayKey(new Date()))
  const [google, setGoogle] = useState<GcalEvent[]>([])

  // Compromissos do Google: mostra o ultimo lido na hora e atualiza em
  // seguida, se ainda houver sessao valida (sem abrir login sozinho).
  const loadGoogle = useCallback(async () => {
    setGoogle(await cachedGcalEvents())
    if (gcalTokenValid()) setGoogle((await fetchGcalEvents(new Date(), 7)).events)
  }, [])
  useEffect(() => {
    void loadGoogle()
  }, [loadGoogle])
  const googleDay = google.filter((event) => event.day === selected)

  const live = useMemo(() => activities.filter((a) => !a.archived), [activities])
  const todayKey = dayKey(now)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(now, i)), [now])

  const agenda = useMemo(
    () => agendaOf(live, activityLogs, parseISO(selected), now),
    [live, activityLogs, selected, now],
  )
  const streaks = useMemo(
    () => new Map(live.map((a) => [a.id, streakOf(a, activityLogs, now)])),
    [live, activityLogs, now],
  )

  const recurring = live.filter((a) => a.kind === 'recorrente')
  const sporadic = live
    .filter((a) => a.kind === 'esporadica' && (a.date ?? '') >= todayKey)
    .sort((a, b) => `${a.date}${a.time ?? ''}`.localeCompare(`${b.date}${b.time ?? ''}`))

  const doneCount = agenda.filter((o) => o.done).length
  const xpDay = agenda.reduce((sum, o) => sum + (o.done ? xpOf(o, streaks.get(o.activity.id) ?? 0) : 0), 0)
  const canCheck = selected <= todayKey

  const toggle = async (activity: Activity) => {
    const done = await toggleActivity(activity.id, selected)
    if (done) vibrate(40)
    await reload()
  }

  if (live.length === 0 && google.length === 0) {
    return (
      <div>
        <Header title="Agenda" subtitle="Rotina e compromissos" />
        <EmptyState
          icon="🗓️"
          title="Nenhuma atividade ainda"
          description="Crie hábitos que se repetem (ler uma página, seg a sex às 7h) ou compromissos de um dia só. Cada um vira uma missão com XP."
          action={<Button onClick={() => navigate('/agenda/nova')}>+ Nova atividade</Button>}
        />
        <GoogleCard activities={activities} onChange={reload} onSynced={loadGoogle} />
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Agenda"
        subtitle="Rotina e compromissos"
        action={
          <Button size="sm" onClick={() => navigate('/agenda/nova')}>
            + Nova
          </Button>
        }
      />

      {/* Faixa da semana: o ponto mostra se o dia tem missao e se fechou. */}
      <div className="flex gap-1.5 px-4 pt-3">
        {days.map((date) => {
          const key = dayKey(date)
          const list = agendaOf(live, activityLogs, date, now)
          const closed = list.length > 0 && list.every((o) => o.done)
          const hasGoogle = google.some((event) => event.day === key)
          const on = key === selected
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelected(key)}
              aria-pressed={on}
              className={`flex flex-1 flex-col items-center rounded-xl border py-2 transition-colors ${
                on ? 'border-brand-400 bg-brand-600/25' : 'border-ink-700 bg-ink-850'
              }`}
            >
              <span className="text-[10px] font-bold uppercase text-ink-400">
                {key === todayKey ? 'hoje' : format(date, 'EEEEEE', { locale: ptBR })}
              </span>
              <span className="tnum text-base font-black">{format(date, 'd')}</span>
              <span
                aria-hidden="true"
                className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                  closed
                    ? 'bg-go-400'
                    : list.length > 0
                      ? 'bg-pr-400'
                      : hasGoogle
                        ? 'bg-brand-400'
                        : 'bg-transparent'
                }`}
              />
            </button>
          )
        })}
      </div>

      <section className="px-4 pt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-black uppercase tracking-widest text-ink-300">
            {selected === todayKey
              ? 'Missões de hoje'
              : format(parseISO(selected), "EEEE, d 'de' MMM", { locale: ptBR })}
          </h2>
          <span className="tnum text-xs font-bold text-ink-400">
            {doneCount}/{agenda.length}
            {xpDay > 0 && <span className="ml-2 text-pr-400">+{xpDay} XP</span>}
          </span>
        </div>
        {agenda.length > 0 && (
          <div
            className="mb-3 h-2.5 overflow-hidden rounded-full bg-ink-950/70 ring-1 ring-ink-700"
            role="progressbar"
            aria-label="Missões feitas no dia"
            aria-valuemin={0}
            aria-valuemax={agenda.length}
            aria-valuenow={doneCount}
          >
            <div
              className="xp-fill h-full rounded-full transition-[width] duration-500"
              style={{ width: `${(doneCount / agenda.length) * 100}%` }}
            />
          </div>
        )}

        {agenda.length === 0 ? (
          googleDay.length === 0 && <p className="rounded-2xl border border-dashed border-ink-700 p-4 text-center text-sm text-ink-400">
            Dia livre. Nada marcado.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {agenda.map((occ) => (
              <QuestRow
                key={occ.activity.id}
                occ={occ}
                streak={streaks.get(occ.activity.id) ?? 0}
                canCheck={canCheck}
                onToggle={() => void toggle(occ.activity)}
                onOpen={() => navigate(`/agenda/${occ.activity.id}`)}
              />
            ))}
          </div>
        )}
        {agenda.length > 0 && doneCount === agenda.length && (
          <p className="animate-pop-in mt-3 text-center text-sm font-black text-go-400">
            🏆 Dia fechado! Todas as missões cumpridas.
          </p>
        )}

        {googleDay.length > 0 && <GoogleDay events={googleDay} />}
      </section>

      <Section title={`Recorrentes · ${recurring.length}`}>
        <CatalogList
          items={recurring}
          streaks={streaks}
          empty="Nenhum hábito ainda."
          onOpen={(a) => navigate(`/agenda/${a.id}`)}
        />
      </Section>

      <Section title={`Esporádicas · ${sporadic.length}`}>
        <CatalogList
          items={sporadic}
          streaks={streaks}
          empty="Nenhum compromisso pela frente."
          onOpen={(a) => navigate(`/agenda/${a.id}`)}
        />
      </Section>

      <GoogleCard activities={activities} onChange={reload} onSynced={loadGoogle} />
    </div>
  )
}

/** Compromissos do Google no dia: so para ver, nao valem XP. */
function GoogleDay({ events }: { events: GcalEvent[] }) {
  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-ink-400">
        📅 Do Google Agenda
      </h3>
      <Card className="divide-y divide-ink-700 overflow-hidden">
        {events.map((event) => (
          <a
            key={event.id}
            href={event.link ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-3.5 py-2.5 active:bg-ink-800"
          >
            <span className="tnum w-14 shrink-0 text-xs font-bold text-brand-300">
              {event.time ?? 'dia todo'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{event.title}</span>
              {event.time && event.end && (
                <span className="tnum block text-xs text-ink-400">
                  {event.time}–{event.end}
                </span>
              )}
            </span>
          </a>
        ))}
      </Card>
    </div>
  )
}

function CatalogList({
  items,
  streaks,
  empty,
  onOpen,
}: {
  items: Activity[]
  streaks: Map<string, number>
  empty: string
  onOpen: (activity: Activity) => void
}) {
  if (items.length === 0) return <p className="text-sm text-ink-400">{empty}</p>
  return (
    <Card className="divide-y divide-ink-700 overflow-hidden">
      {items.map((activity) => {
        const streak = streaks.get(activity.id) ?? 0
        return (
          <button
            key={activity.id}
            type="button"
            onClick={() => onOpen(activity)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-ink-800"
          >
            <span className="text-xl" aria-hidden="true">
              {activity.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{activity.title}</span>
              <span className="tnum block text-xs text-ink-400">{describeWhen(activity)}</span>
            </span>
            {streak > 0 && <span className="tnum text-xs font-black text-fire-400">🔥{streak}</span>}
            {activity.gcal_event_id && (
              <span className="text-xs" title="No Google Agenda" aria-label="No Google Agenda">
                📅
              </span>
            )}
            <span className="text-ink-400" aria-hidden="true">
              ›
            </span>
          </button>
        )
      })}
    </Card>
  )
}

function GoogleCard({
  activities,
  onChange,
  onSynced,
}: {
  activities: Activity[]
  onChange: () => Promise<void>
  /** Depois de enviar, le de volta os compromissos do Google. */
  onSynced: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [linked, setLinked] = useState(gcalLinked)
  const [configured, setConfigured] = useState(isGcalConfigured)

  if (!configured) {
    return (
      <Section title="Google Agenda">
        <ClientIdForm
          onSaved={() => {
            setConfigured(true)
            setLinked(false)
          }}
        />
      </Section>
    )
  }

  const run = async () => {
    setBusy(true)
    setMessage(null)
    try {
      if (!gcalTokenValid()) await connectGcal()
      setLinked(true)
      const result = await syncGcal(activities)
      if (result.needsLogin) setMessage('O Google pediu login de novo. Toque mais uma vez.')
      else if (result.error) setMessage(`Falhou: ${result.error}`)
      else {
        const total = result.created + result.updated + result.removed
        setMessage(total === 0 ? 'Tudo já estava na agenda.' : `${total} evento(s) atualizados no Google.`)
      }
      await onChange()
      await onSynced()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não deu para conectar.')
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    await disconnectGcal()
    setLinked(false)
    setMessage('Desconectado. Os eventos já criados continuam no Google.')
  }

  const forgetKey = async () => {
    await setGcalClientId(null)
    setLinked(false)
    setConfigured(isGcalConfigured())
    setMessage(null)
  }

  return (
    <Section title="Google Agenda">
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            📅
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{linked ? 'Conectado' : 'Não conectado'}</p>
            <p className="text-xs text-ink-400">
              Cada atividade vira um evento na sua agenda principal, com repetição e aviso do Google.
              Seus outros compromissos aparecem aqui na Agenda.
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button onClick={() => void run()} disabled={busy} className="flex-1">
            {busy ? 'Sincronizando…' : linked ? 'Sincronizar agora' : 'Conectar Google Agenda'}
          </Button>
          {linked && (
            <Button variant="outline" onClick={() => void unlink()} disabled={busy}>
              Sair
            </Button>
          )}
        </div>
        {message && <p className="mt-2 text-xs text-ink-300">{message}</p>}
        {gcalClientIdFromApp() && (
          <button
            type="button"
            onClick={() => void forgetKey()}
            disabled={busy}
            className="mt-3 text-xs font-semibold text-ink-400 underline underline-offset-2"
          >
            Trocar Client ID
          </button>
        )}
      </Card>
    </Section>
  )
}

/**
 * Sem Client ID ainda: o proprio usuario cola o dele. Cada um usa o seu
 * projeto do Google Cloud, e a chave fica so neste aparelho.
 */
function ClientIdForm({ onSaved }: { onSaved: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const id = value.trim()
    if (!isValidClientId(id)) {
      setError('Não parece um Client ID: ele termina em .apps.googleusercontent.com')
      return
    }
    try {
      await setGcalClientId(id)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para salvar.')
    }
  }

  return (
    <Card className="p-4 text-sm leading-relaxed text-ink-300">
      <p>
        Cole o <b>Client ID</b> do Google para cada atividade virar um evento na sua agenda, com
        repetição e aviso. Sem ele, abra uma atividade e toque em <b>Adicionar ao Google Agenda</b>.
      </p>
      <details className="mt-2 text-xs text-ink-400">
        <summary className="cursor-pointer font-semibold text-ink-300">Como conseguir</summary>
        <ol className="mt-1.5 list-decimal space-y-1 pl-4">
          <li>
            Em console.cloud.google.com, crie um projeto e ative a <b>Google Calendar API</b>.
          </li>
          <li>
            Credenciais › Criar credenciais › <b>ID do cliente OAuth</b> › Aplicativo da Web.
          </li>
          <li>
            Em “Origens JavaScript autorizadas”, coloque <code>{window.location.origin}</code>.
          </li>
          <li>Na tela de consentimento, adicione seu e-mail como usuário de teste.</li>
          <li>Copie o ID do cliente e cole aqui.</li>
        </ol>
      </details>
      <input
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setError(null)
        }}
        placeholder="123456-abc.apps.googleusercontent.com"
        autoComplete="off"
        spellCheck={false}
        className="mt-3 w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
      />
      {error && <p className="mt-1.5 text-xs text-fire-400">{error}</p>}
      <Button className="mt-3 w-full" onClick={() => void save()} disabled={!value.trim()}>
        Salvar e ativar
      </Button>
    </Card>
  )
}
