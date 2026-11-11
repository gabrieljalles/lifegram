import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { addMinutes, differenceInMinutes, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import MotivationCard from '../components/MotivationCard'
import SellSignalCard from '../components/SellSignalCard'
import { agendaOf, dayKey, type Occurrence } from '../lib/activities'
import { toggleActivity } from '../lib/activityActions'
import {
  DREAM_ASK_UNTIL_HOUR,
  DREAM_FACTOR,
  checkinFor,
  checkinTimeOf,
  emptyCheckin,
  saveCheckin,
  closingDay,
  formatSleep,
  isClosed,
  previousDay,
} from '../lib/checkin'
import { itemTypeOf } from '../lib/items'
import { travelOf } from '../lib/reminders'
import { routinesForDay } from '../lib/stats'
import { useApp } from '../lib/store'
import { vibrate } from '../lib/timer'
import { useNow } from '../lib/useNow'
import { startWorkout } from '../lib/workout'
import { alertDialog } from '../lib/dialog'
import type { Routine, Session, Weekday } from '../lib/types'

/** Uma linha da pagina: item da agenda, o treino do dia ou o check-in. */
type Row =
  | { kind: 'item'; occ: Occurrence }
  | { kind: 'treino'; routine: Routine | null; session: Session | null; time: string | null }
  | { kind: 'checkin'; time: string; done: boolean }

const timeOf = (row: Row): string | null => (row.kind === 'item' ? row.occ.activity.time : row.time)

/**
 * Hoje: a pagina do dia de uma agenda de papel. Com hora na coluna da
 * esquerda, "a qualquer hora" embaixo. Feito e riscado, atrasado leva
 * sublinhado vermelho, a fita marca o que vem agora.
 */
export default function Today() {
  const navigate = useNavigate()
  const {
    activities,
    activityLogs,
    routines,
    sessions,
    checkins,
    settings,
    active,
    setActive,
    reload,
  } = useApp()
  const now = useNow()
  const today = dayKey(now)
  const [busy, setBusy] = useState(false)
  const [justDone, setJustDone] = useState<string | null>(null)

  const occurrences = useMemo(
    () => agendaOf(activities, activityLogs, now, now),
    [activities, activityLogs, now],
  )

  // O treino do dia vem das rotinas (dias marcados), nao da agenda.
  const workout = useMemo(() => {
    const session =
      sessions.find(
        (s) => s.finished_at && format(parseISO(s.started_at), 'yyyy-MM-dd') === today,
      ) ?? null
    const routine = routinesForDay(routines, now.getDay() as Weekday)[0] ?? null
    if (!session && !routine) return null
    return {
      kind: 'treino' as const,
      routine,
      session,
      time: session ? format(parseISO(session.started_at), 'HH:mm') : null,
    }
  }, [sessions, routines, today, now])

  const checkinTime = checkinTimeOf(settings)
  const closing = closingDay(now)
  const closedToday = isClosed(checkinFor(checkins, today))
  const yesterday = checkinFor(checkins, previousDay(today))
  const todayCheckin = checkinFor(checkins, today)
  const askDream =
    now.getHours() >= 4 &&
    now.getHours() < DREAM_ASK_UNTIL_HOUR &&
    todayCheckin?.factors[DREAM_FACTOR] === undefined

  const answerDream = async (dreamed: boolean) => {
    const base = todayCheckin ?? emptyCheckin(today)
    await saveCheckin({ ...base, factors: { ...base.factors, [DREAM_FACTOR]: dreamed } })
    vibrate(20)
    await reload()
  }

  const rows: Row[] = useMemo(() => {
    const list: Row[] = occurrences
      .filter((occ) => itemTypeOf(occ.activity) !== 'treino')
      .map((occ) => ({ kind: 'item', occ }))
    if (workout) list.push(workout)
    list.push({ kind: 'checkin', time: checkinTime, done: closedToday })
    return list
  }, [occurrences, workout, checkinTime, closedToday])

  const timed = rows
    .filter((r) => timeOf(r))
    .sort((a, b) => (timeOf(a) ?? '').localeCompare(timeOf(b) ?? ''))
  const anytime = rows.filter((r) => !timeOf(r))

  const isDone = (row: Row) =>
    row.kind === 'item' ? row.occ.done : row.kind === 'treino' ? row.session != null : row.done

  // Fita: no primeiro item com hora ainda aberto.
  const ribbonAt = timed.findIndex((r) => !isDone(r))

  const doneCount = rows.filter(isDone).length
  const night = now.getHours() >= 19 || now.getHours() < 4
  const anytimeLeft = anytime.filter((r) => !isDone(r)).length

  const toggle = async (occ: Occurrence) => {
    const done = await toggleActivity(occ.activity.id, occ.day)
    if (done) {
      vibrate(30)
      setJustDone(occ.activity.id)
    }
    await reload()
  }

  const begin = async (routine: Routine | null) => {
    if (active) return navigate('/treino')
    if (!routine) return navigate('/academia')
    if (busy) return
    setBusy(true)
    try {
      const started = await startWorkout(routine)
      await setActive(started)
      await reload()
      navigate('/treino')
    } catch (error) {
      await alertDialog(
        'Não foi possível iniciar o treino',
        error instanceof Error ? error.message : undefined,
      )
    } finally {
      setBusy(false)
    }
  }

  const renderRow = (row: Row, index: number, withHour: boolean) => {
    const done = isDone(row)
    const ribbon = withHour && index === ribbonAt
    let title: string
    let detail: string | null = null
    let late = false
    let action: ReactNode
    let onOpen: (() => void) | undefined

    if (row.kind === 'item') {
      const { occ } = row
      const a = occ.activity
      title = `${a.icon ? `${a.icon} ` : ''}${a.title}`
      late = occ.late
      const travel = travelOf(a)
      const parts: string[] = []
      if (a.dose) parts.push(a.dose)
      if (done) {
        const log = activityLogs.find((l) => l.activity_id === a.id && l.day === occ.day)
        if (log) parts.push(`feito ${format(parseISO(log.done_at), 'HH:mm')}`)
      } else if (late) {
        parts.push('Atrasado. Vai agora.')
      } else if (!occ.at && night) {
        parts.push('Ainda dá tempo. Vai.')
      } else if (occ.at && travel > 0) {
        const leave = addMinutes(occ.at, -travel)
        const left = differenceInMinutes(leave, now)
        parts.push(
          left <= 60
            ? `Sai às ${format(leave, 'HH:mm')} · faltam ${Math.max(0, left)} min`
            : `sai às ${format(leave, 'HH:mm')}`,
        )
      }
      detail = parts.join(' · ') || null
      onOpen = () => navigate(`/agenda/${a.id}`)
      action = (
        <Tick
          done={done}
          label={done ? `Desmarcar ${a.title}` : `Marcar ${a.title} como feito`}
          onClick={() => void toggle(occ)}
        />
      )
    } else if (row.kind === 'treino') {
      title = `🏋️ ${row.session?.routine_name || row.routine?.name || 'Treino'}`
      if (row.session) {
        detail = `${Math.round(row.session.duration_seconds / 60)} min`
        onOpen = () => navigate(`/resumo/${row.session!.id}`)
        action = (
          <Tick done label="Treino feito" onClick={() => navigate(`/resumo/${row.session!.id}`)} />
        )
      } else {
        detail = active ? 'Em andamento' : null
        action = (
          <Pill disabled={busy} onClick={() => void begin(row.routine)}>
            {active ? 'Voltar' : 'Iniciar'}
          </Pill>
        )
      }
    } else {
      title = 'Check-in do dia'
      detail = done
        ? 'Dia fechado'
        : night
          ? 'Fecha o dia. 15 segundos.'
          : 'Felicidade, sono e 3 palavras'
      onOpen = () => navigate(`/checkin/${today}`)
      action = done ? (
        <Tick done label="Check-in feito" onClick={() => navigate(`/checkin/${today}`)} />
      ) : (
        <Pill onClick={() => navigate(`/checkin/${today}`)}>Fechar</Pill>
      )
    }

    const key = row.kind === 'item' ? row.occ.activity.id : row.kind
    const animate = row.kind === 'item' && justDone === row.occ.activity.id && done

    return (
      <li key={key} className="relative flex min-h-[52px] items-center border-b border-ink-700">
        {ribbon && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 left-[61px] h-16 w-3 bg-margin"
            style={{ clipPath: 'polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)' }}
          />
        )}
        <span className="tnum w-[60px] shrink-0 pl-4 font-display text-lg font-semibold text-ink-400">
          {withHour ? timeOf(row) : ''}
        </span>
        <button
          type="button"
          onClick={onOpen}
          disabled={!onOpen}
          className="min-w-0 flex-1 py-2 pl-4 text-left"
        >
          <span
            className={`inline text-base font-medium ${
              done
                ? `strike text-ink-400 ${animate ? 'strike-anim' : ''}`
                : late
                  ? 'underline decoration-margin decoration-double underline-offset-4'
                  : ribbon
                    ? 'bg-[linear-gradient(transparent_45%,var(--color-highlight)_45%,var(--color-highlight)_92%,transparent_92%)] px-0.5 text-highlight-ink'
                    : !withHour
                      ? 'border-b-[1.5px] border-dashed border-ink-400'
                      : ''
            }`}
          >
            {title}
          </span>
          {detail && (
            <span
              className={`mt-0.5 block text-xs ${late && !done ? 'font-medium text-margin' : 'text-ink-400'}`}
            >
              {detail}
            </span>
          )}
        </button>
        <span className="flex w-[72px] shrink-0 justify-center">{action}</span>
      </li>
    )
  }

  return (
    <div className="pb-6">
      <header className="safe-t relative flex items-end justify-between border-b-2 border-ink-100 px-5 pb-2.5 pt-4">
        <button
          type="button"
          onClick={() => navigate('/config')}
          aria-label="Ajustes"
          className="absolute right-2 top-[max(env(safe-area-inset-top),0.5rem)] flex h-11 w-11 items-center justify-center rounded-full text-ink-400 active:bg-ink-800"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </button>
        <div className="font-display leading-[0.86]">
          <p className="text-xl font-bold uppercase tracking-wider text-margin">
            {format(now, 'EEEE', { locale: ptBR }).replace('-feira', '')}
          </p>
          <p className="tnum text-[64px] font-bold">{format(now, 'd')}</p>
          <p className="mt-1 text-base font-semibold uppercase tracking-widest text-ink-400">
            {format(now, 'MMMM', { locale: ptBR })}
            {night ? ` · ${format(now, 'HH:mm')}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`/checkin/${previousDay(today)}`)}
          className="text-right text-xs text-ink-400"
          aria-label="Check-in de ontem"
        >
          Felicidade ontem
          <b className="tnum block font-display text-3xl font-bold text-ink-100">
            {yesterday?.happiness != null ? `${yesterday.happiness} / 5` : '—'}
          </b>
          {yesterday?.sleep_minutes != null
            ? `sono ${formatSleep(yesterday.sleep_minutes)}`
            : 'sem check-in'}
        </button>
      </header>

      <div className="border-b border-ink-700 px-5 py-2 pl-[76px]">
        <MotivationCard />
      </div>

      {askDream && (
        <div className="flex items-center gap-3 border-b border-ink-700 py-2.5 pl-[76px] pr-4">
          <span className="min-w-0 flex-1">
            <span className="block text-base font-medium">Sonhou esta noite?</span>
            <span className="block text-xs text-ink-400">Responde agora, antes de esquecer.</span>
          </span>
          <div className="flex overflow-hidden rounded-xl border-[1.5px] border-ink-700">
            <button
              type="button"
              onClick={() => void answerDream(false)}
              className="h-11 w-14 text-sm font-bold text-ink-300 active:bg-ink-800"
            >
              Não
            </button>
            <button
              type="button"
              onClick={() => void answerDream(true)}
              className="h-11 w-14 border-l-[1.5px] border-ink-700 text-sm font-bold text-brand-400 active:bg-ink-800"
            >
              Sim
            </button>
          </div>
        </div>
      )}

      {active && (
        <button
          type="button"
          onClick={() => navigate('/treino')}
          className="flex w-full items-center gap-3 border-b border-ink-700 bg-highlight/30 px-5 py-3 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-bold uppercase tracking-widest text-margin">
              Treino em andamento
            </span>
            <span className="block truncate font-medium">{active.routine_name}</span>
          </span>
          <span className="text-sm font-bold text-brand-400">Voltar ›</span>
        </button>
      )}

      <ol className="relative">
        <span aria-hidden="true" className="absolute inset-y-0 left-[60px] w-px bg-margin/60" />
        {timed.map((row, i) => renderRow(row, i, true))}
        {anytime.length > 0 && (
          <li className="flex h-[30px] items-end border-b border-ink-700 pb-1 pl-[76px] font-display text-sm font-bold uppercase tracking-widest text-margin">
            A qualquer hora{anytimeLeft > 0 && night ? ` · faltam ${anytimeLeft}` : ''}
          </li>
        )}
        {anytime.map((row, i) => renderRow(row, i, false))}
      </ol>

      <p className="tnum px-5 pt-3 pl-[76px] text-[13px] text-ink-400">
        {doneCount} de {rows.length} feitos hoje
      </p>

      {night && !closedToday && closing === today && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-xl border-[1.5px] border-highlight px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-bold">Como foi seu dia?</p>
            <p className="text-[13px] text-ink-400">Felicidade, sono e o que pode pesar amanhã.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/checkin/${today}`)}
            className="rounded-full bg-highlight px-4 py-2.5 text-sm font-bold text-highlight-ink"
          >
            Fechar o dia
          </button>
        </div>
      )}

      <SellSignalCard />

      <button
        type="button"
        onClick={() => navigate('/agenda/nova')}
        aria-label="Novo item na agenda"
        className="fixed bottom-24 right-[max(1.25rem,calc(50%-15rem))] z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-3xl text-white active:bg-brand-500"
      >
        +
      </button>
    </div>
  )
}

function Tick({ done, label, onClick }: { done: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={done}
      aria-label={label}
      className="flex h-11 w-11 items-center justify-center rounded-full active:bg-ink-800"
    >
      <span
        className={`flex h-[30px] w-[30px] items-center justify-center rounded-full border-[1.5px] text-sm font-bold ${
          done ? 'border-brand-400 bg-brand-400 text-ink-900' : 'border-ink-400 text-transparent'
        }`}
      >
        ✓
      </span>
    </button>
  )
}

function Pill({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[36px] rounded-full bg-brand-600 px-3.5 text-sm font-bold text-white active:bg-brand-500 disabled:opacity-50"
    >
      {children}
    </button>
  )
}
