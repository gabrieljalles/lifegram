import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Button, Card, Delta, Section, StatTile } from '../components/ui'
import {
  formatClock,
  formatDuration,
  formatVolume,
  setLabel,
  timeBreakdown,
  totalVolume,
} from '../lib/stats'
import { useApp } from '../lib/store'
import { DEFAULT_REST_SECONDS } from '../lib/types'

export default function WorkoutSummary() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { sessions, setLogs, exerciseById, routineExercises } = useApp()

  const session = sessions.find((s) => s.id === sessionId)
  const logs = useMemo(
    () => setLogs.filter((log) => log.session_id === sessionId),
    [setLogs, sessionId],
  )

  /** Mesma rotina, sessao anterior: a comparacao que diz se voce evoluiu. */
  const previous = useMemo(() => {
    if (!session) return null
    const candidates = sessions
      .filter(
        (s) =>
          s.id !== session.id &&
          s.finished_at &&
          s.routine_id === session.routine_id &&
          s.started_at < session.started_at,
      )
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
    return candidates[0] ?? null
  }, [sessions, session])

  /** Descanso planejado dos exercicios feitos, para comparar com o real. */
  const plannedRests = useMemo(() => {
    const done = new Set(logs.map((log) => log.exercise_id))
    return routineExercises
      .filter((entry) => entry.routine_id === session?.routine_id && done.has(entry.exercise_id))
      .map(
        (entry) =>
          entry.rest_seconds ??
          exerciseById.get(entry.exercise_id)?.default_rest_seconds ??
          DEFAULT_REST_SECONDS,
      )
  }, [routineExercises, exerciseById, logs, session?.routine_id])

  const byExercise = useMemo(() => {
    const map = new Map<string, typeof logs>()
    for (const log of logs) {
      const list = map.get(log.exercise_id)
      if (list) list.push(log)
      else map.set(log.exercise_id, [log])
    }
    return [...map.entries()]
  }, [logs])

  if (!session) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-ink-300">Treino não encontrado.</p>
        <Button variant="outline" onClick={() => navigate('/academia')}>
          Voltar para o início
        </Button>
      </div>
    )
  }

  const volume = totalVolume(logs)
  const prs = logs.filter((log) => log.is_pr_weight || log.is_pr_volume)
  const time = timeBreakdown(session, logs, plannedRests)
  const volumeDelta = previous?.total_volume
    ? ((volume - previous.total_volume) / previous.total_volume) * 100
    : 0

  return (
    <div className="min-h-dvh">
      <header className="safe-t px-5 pb-2 pt-8 text-center">
        <div className="animate-pop-in text-5xl" aria-hidden="true">
          {prs.length > 0 ? '🏆' : '💪'}
        </div>
        <h1 className="animate-rise mt-3 text-2xl font-extrabold tracking-tight">
          {prs.length > 0 ? 'Treino com recorde!' : 'Treino concluído!'}
        </h1>
        <p className="mt-1 text-sm text-ink-400">
          {session.routine_name} ·{' '}
          {format(parseISO(session.started_at), "d 'de' MMMM', às' HH:mm", { locale: ptBR })}
        </p>
      </header>

      <Section title="Resumo">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Volume levantado"
            value={formatVolume(volume)}
            hint={
              previous
                ? `antes: ${formatVolume(previous.total_volume)}`
                : 'primeira vez neste treino'
            }
          />
          <StatTile label="Duração" value={formatDuration(session.duration_seconds)} />
          <StatTile label="Séries" value={String(logs.length)} />
          <StatTile
            label="Recordes"
            value={String(prs.length)}
            tone={prs.length > 0 ? 'good' : 'default'}
          />
        </div>
        {previous && (
          <div className="mt-2 px-1">
            <Delta percent={volumeDelta} suffix=" vs. a última vez que fez este treino" />
          </div>
        )}
      </Section>

      <Section title="Tempo">
        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-ink-200">
              {formatDuration(time.activeSeconds)} treinando
            </span>
            <span className="tnum text-sm text-ink-400">
              {formatDuration(time.restSeconds)} descansando
            </span>
          </div>

          {/* Barra proporcional: a leitura e imediata, sem precisar da conta. */}
          <div className="mt-2 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-800">
            <div
              className="rounded-l-full bg-brand-500"
              style={{ width: `${Math.round((1 - time.restShare) * 100)}%` }}
            />
            <div className="flex-1 rounded-r-full bg-ink-600" aria-hidden="true" />
          </div>

          <p className="tnum mt-2 text-[11px] leading-relaxed text-ink-400">
            {Math.round(time.restShare * 100)}% do treino foi descanso.
            {time.measuredIntervals > 0 && (
              <>
                {' '}
                Você descansou em média {formatClock(time.avgRestSeconds)} entre as séries
                {time.avgPlannedSeconds > 0 && (
                  <> — o planejado era {formatClock(time.avgPlannedSeconds)}</>
                )}
                .
              </>
            )}
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
            "Treinando" é o tempo fora dos descansos cronometrados: executar as séries, trocar de
            aparelho e ajustar a carga.
          </p>
        </Card>
      </Section>

      {prs.length > 0 && (
        <Section title="Recordes batidos hoje">
          <div className="flex flex-col gap-2">
            {prs.map((log) => (
              <Card key={log.id} className="flex items-center gap-3 border-pr-500/40 p-3.5">
                <span className="text-xl" aria-hidden="true">
                  🏆
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {exerciseById.get(log.exercise_id)?.name ?? 'Exercício'}
                  </p>
                  <p className="tnum text-xs text-ink-400">
                    {setLabel(log, { withUnit: true })} ·{' '}
                    {log.is_pr_weight ? 'recorde de carga' : 'recorde de volume'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="Exercícios">
        <div className="flex flex-col gap-2">
          {byExercise.map(([exerciseId, exerciseLogs]) => {
            const exercise = exerciseById.get(exerciseId)
            return (
              <Link key={exerciseId} to={`/exercicio/${exerciseId}`}>
                <Card className="p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{exercise?.name ?? 'Exercício'}</p>
                    <span className="tnum shrink-0 text-xs text-ink-400">
                      {formatVolume(totalVolume(exerciseLogs))}
                    </span>
                  </div>
                  <div className="tnum mt-1.5 flex flex-wrap gap-1.5">
                    {exerciseLogs.map((log) => (
                      <span
                        key={log.id}
                        className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                          log.is_pr_weight || log.is_pr_volume
                            ? 'bg-pr-500/15 text-pr-400'
                            : 'bg-ink-800 text-ink-300'
                        }`}
                      >
                        {setLabel(log)}
                      </span>
                    ))}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </Section>

      <div className="safe-b flex flex-col gap-2 px-4 pb-6 pt-2">
        <Button size="lg" variant="go" onClick={() => navigate('/academia', { replace: true })}>
          Voltar para o início
        </Button>
        <Button variant="outline" onClick={() => navigate('/stats')}>
          Ver meu progresso
        </Button>
      </div>
    </div>
  )
}
