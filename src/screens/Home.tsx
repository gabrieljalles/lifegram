import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import Heatmap from '../components/Heatmap'
import { Button, Card, Delta, EmptyState, Section, StatTile } from '../components/ui'
import { bucketize, computeStreak, formatVolume, heatmapDays, periodDelta } from '../lib/stats'
import { useApp } from '../lib/store'
import { unlockAudio } from '../lib/timer'
import { seedStarterData, startWorkout } from '../lib/workout'
import type { Routine } from '../lib/types'

export default function Home() {
  const navigate = useNavigate()
  const { routines, routineExercises, sessions, setLogs, active, reload, setActive, syncStatus } =
    useApp()
  const [busy, setBusy] = useState(false)

  const streak = useMemo(() => computeStreak(sessions), [sessions])
  const heat = useMemo(() => heatmapDays(sessions, setLogs), [sessions, setLogs])
  const weeks = useMemo(() => bucketize(sessions, setLogs, 'week', 2), [sessions, setLogs])

  const thisWeek = weeks[weeks.length - 1]
  const volumeDelta = periodDelta(weeks, 'volume')

  /** Ultima vez que cada treino foi feito — base para sugerir o proximo. */
  const lastDoneByRoutine = useMemo(() => {
    const map = new Map<string, string>()
    for (const session of sessions) {
      if (!session.finished_at || !session.routine_id) continue
      const current = map.get(session.routine_id)
      if (!current || current < session.started_at) map.set(session.routine_id, session.started_at)
    }
    return map
  }, [sessions])

  /** Sugere o treino parado ha mais tempo — evita repetir sempre o mesmo. */
  const suggested = useMemo(() => {
    if (routines.length === 0) return null
    return [...routines].sort((a, b) => {
      const la = lastDoneByRoutine.get(a.id) ?? ''
      const lb = lastDoneByRoutine.get(b.id) ?? ''
      if (la === lb) return a.position - b.position
      return la.localeCompare(lb)
    })[0]
  }, [routines, lastDoneByRoutine])

  const countOf = (routine: Routine) =>
    routineExercises.filter((re) => re.routine_id === routine.id).length

  const begin = async (routine: Routine) => {
    if (busy) return
    setBusy(true)
    try {
      // O toque aqui e o que libera o audio do timer no celular.
      unlockAudio()
      const workout = await startWorkout(routine)
      await setActive(workout)
      await reload()
      navigate('/treino')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Não foi possível iniciar o treino.')
    } finally {
      setBusy(false)
    }
  }

  const seed = async () => {
    setBusy(true)
    await seedStarterData()
    await reload()
    setBusy(false)
  }

  const hoje = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div>
      <header className="safe-t px-4 pb-2 pt-4">
        <p className="text-xs capitalize text-ink-400">{hoje}</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {streak.current > 0 ? 'Bora manter a corrente' : 'Bora treinar'}
          </h1>
          {streak.current > 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-fire-500/15 px-2.5 py-1 text-fire-400">
              <span aria-hidden="true">🔥</span>
              <span className="tnum text-sm font-bold">{streak.current}</span>
              <span className="text-[11px] font-medium">
                {streak.current === 1 ? 'treino' : 'treinos'}
              </span>
            </div>
          )}
        </div>
        {syncStatus === 'pending' && (
          <p className="mt-1 text-[11px] text-ink-400">Alterações aguardando sincronização.</p>
        )}
      </header>

      {active && (
        <div className="px-4 pb-1 pt-2">
          <Card className="animate-rise border-brand-500/40 bg-brand-600/10 p-4">
            <p className="text-xs font-medium text-brand-400">Treino em andamento</p>
            <p className="mt-0.5 font-semibold">{active.routine_name}</p>
            <p className="mt-0.5 text-xs text-ink-400">
              Exercício {active.cursor + 1} de {active.items.length} · série {active.set_number} ·
              iniciado {format(parseISO(active.started_at), 'HH:mm')}
            </p>
            <Button className="mt-3 w-full" size="lg" variant="go" onClick={() => navigate('/treino')}>
              Continuar treino
            </Button>
          </Card>
        </div>
      )}

      {routines.length === 0 ? (
        <EmptyState
          title="Nenhum treino montado ainda"
          description="Comece com um ABC pronto (peito/tríceps, costas/bíceps, pernas/ombros) e ajuste as cargas do seu jeito, ou monte o seu do zero."
          action={
            <div className="mt-2 flex flex-col gap-2">
              <Button size="lg" variant="go" onClick={seed} disabled={busy}>
                Criar treino ABC de exemplo
              </Button>
              <Button variant="outline" onClick={() => navigate('/treinos')}>
                Montar do zero
              </Button>
            </div>
          }
        />
      ) : (
        <>
          {!active && suggested && (
            <Section title="Sugestão de hoje">
              <Card className="overflow-hidden p-4">
                <p className="text-lg font-bold">{suggested.name}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {countOf(suggested)} exercícios ·{' '}
                  {lastDoneByRoutine.has(suggested.id)
                    ? `última vez em ${format(
                        parseISO(lastDoneByRoutine.get(suggested.id) as string),
                        "d 'de' MMM",
                        { locale: ptBR },
                      )}`
                    : 'você ainda não fez este'}
                </p>
                <Button
                  className="mt-3 w-full"
                  size="lg"
                  variant="go"
                  disabled={busy || countOf(suggested) === 0}
                  onClick={() => void begin(suggested)}
                >
                  Iniciar treino
                </Button>
              </Card>
            </Section>
          )}

          <Section
            title="Seus treinos"
            action={
              <button
                type="button"
                onClick={() => navigate('/treinos')}
                className="text-xs font-semibold text-brand-400"
              >
                Editar
              </button>
            }
          >
            <div className="flex flex-col gap-2">
              {routines.map((routine) => {
                const count = countOf(routine)
                const last = lastDoneByRoutine.get(routine.id)
                return (
                  <Card key={routine.id} className="flex items-center gap-3 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{routine.name}</p>
                      <p className="text-xs text-ink-400">
                        {count} {count === 1 ? 'exercício' : 'exercícios'}
                        {last && ` · ${format(parseISO(last), "d/MM", { locale: ptBR })}`}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={active ? 'ghost' : 'primary'}
                      disabled={busy || count === 0 || Boolean(active)}
                      onClick={() => void begin(routine)}
                    >
                      Iniciar
                    </Button>
                  </Card>
                )
              })}
            </div>
          </Section>
        </>
      )}

      <Section title="Sua semana">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Volume" value={formatVolume(thisWeek?.volume ?? 0)} />
          <StatTile label="Treinos" value={String(thisWeek?.sessions ?? 0)} />
          <StatTile
            label="Recordes"
            value={String(thisWeek?.prs ?? 0)}
            tone={(thisWeek?.prs ?? 0) > 0 ? 'good' : 'default'}
          />
        </div>
        <div className="mt-2 px-1">
          <Delta percent={volumeDelta} suffix=" de volume vs. semana passada" />
        </div>
      </Section>

      <Section title="Frequência">
        <Card className="p-3.5">
          <Heatmap days={heat} />
          {streak.longest > 0 && (
            <p className="mt-2 text-[11px] text-ink-400">
              Maior sequência:{' '}
              <span className="tnum font-semibold text-ink-300">{streak.longest}</span>{' '}
              {streak.longest === 1 ? 'treino' : 'treinos seguidos'}
            </p>
          )}
        </Card>
      </Section>
    </div>
  )
}
