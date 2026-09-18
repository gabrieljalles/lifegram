import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SERIES, SessionBars, VolumeBars } from '../components/charts'
import {
  Card,
  Delta,
  EmptyState,
  MUSCLE_ICON,
  MUSCLE_LABEL,
  Section,
  StatTile,
} from '../components/ui'
import {
  bucketize,
  formatVolume,
  formatWeight,
  periodDelta,
  summarizeExercise,
  totalVolume,
  type Period,
} from '../lib/stats'
import { useApp } from '../lib/store'
import type { MuscleGroup } from '../lib/types'

const PERIODS: Array<{ id: Period; label: string; count: number; unit: string }> = [
  { id: 'week', label: 'Semana', count: 12, unit: 'semana' },
  { id: 'month', label: 'Mês', count: 12, unit: 'mês' },
  { id: 'year', label: 'Ano', count: 5, unit: 'ano' },
]

export default function Stats() {
  const { sessions, setLogs, exercises, exerciseById, logsByExercise } = useApp()
  const [period, setPeriod] = useState<Period>('week')

  const config = PERIODS.find((p) => p.id === period) as (typeof PERIODS)[number]

  const buckets = useMemo(
    () => bucketize(sessions, setLogs, period, config.count),
    [sessions, setLogs, period, config.count],
  )

  const chartData = useMemo(
    () =>
      buckets.map((bucket) => ({
        label: bucket.label,
        volume: bucket.volume,
        sessions: bucket.sessions,
        prs: bucket.prs,
      })),
    [buckets],
  )

  const current = buckets[buckets.length - 1]
  const volumeDelta = periodDelta(buckets, 'volume')

  /** Volume por grupo muscular: mostra o que anda sendo negligenciado. */
  const byMuscle = useMemo(() => {
    const totals = new Map<MuscleGroup, number>()
    for (const log of setLogs) {
      const group = exerciseById.get(log.exercise_id)?.muscle_group ?? 'outro'
      totals.set(group, (totals.get(group) ?? 0) + log.reps * log.weight)
    }
    const rows = [...totals.entries()].sort((a, b) => b[1] - a[1])
    const max = rows[0]?.[1] ?? 0
    return { rows, max }
  }, [setLogs, exerciseById])

  /**
   * Todo exercicio ja executado entra na lista e e clicavel — quem tem poucas
   * sessoes aparece sem tendencia, mas com o caminho aberto para o detalhe.
   * Os que ja tem tendencia sobem para o topo, do que mais progride ao que menos.
   */
  const progressRanking = useMemo(() => {
    return exercises
      .map((exercise) => ({
        exercise,
        summary: summarizeExercise(logsByExercise.get(exercise.id) ?? []),
      }))
      .filter((row) => row.summary.sessions > 0)
      .sort((a, b) => {
        const ra = a.summary.trendE1RM.reliable
        const rb = b.summary.trendE1RM.reliable
        if (ra !== rb) return ra ? -1 : 1
        if (ra && rb) return b.summary.trendE1RM.perMonth - a.summary.trendE1RM.perMonth
        return b.summary.sessions - a.summary.sessions
      })
  }, [exercises, logsByExercise])

  const allTimeVolume = useMemo(() => totalVolume(setLogs), [setLogs])
  const totalPRs = useMemo(
    () => setLogs.filter((log) => log.is_pr_weight || log.is_pr_volume).length,
    [setLogs],
  )
  const finishedSessions = useMemo(
    () => sessions.filter((s) => s.finished_at).length,
    [sessions],
  )

  if (setLogs.length === 0) {
    return (
      <div>
        <header className="safe-t px-4 pb-2 pt-4">
          <h1 className="text-2xl font-bold tracking-tight">Progresso</h1>
        </header>
        <EmptyState
          icon="📈"
          title="Sem dados ainda"
          description="Termine o primeiro treino e os gráficos de volume, frequência e evolução de carga aparecem aqui."
        />
      </div>
    )
  }

  return (
    <div>
      <header className="safe-t px-4 pb-3 pt-4">
        <h1 className="text-2xl font-bold tracking-tight">Progresso</h1>
        <div className="mt-3 flex rounded-xl bg-ink-850 p-1">
          {PERIODS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setPeriod(option.id)}
              className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors ${
                period === option.id ? 'bg-brand-600 text-white' : 'text-ink-400'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <Section title={`Este ${config.unit}`}>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Volume" value={formatVolume(current?.volume ?? 0)} />
          <StatTile label="Treinos" value={String(current?.sessions ?? 0)} />
          <StatTile
            label="Recordes"
            value={String(current?.prs ?? 0)}
            tone={(current?.prs ?? 0) > 0 ? 'good' : 'default'}
          />
        </div>
        <div className="mt-2 px-1">
          <Delta percent={volumeDelta} suffix={` de volume vs. ${config.unit} anterior`} />
        </div>
      </Section>

      <Section title="Volume levantado">
        <Card className="p-3 pr-4">
          <VolumeBars data={chartData} />
        </Card>
      </Section>

      <Section title="Frequência de treinos">
        <Card className="p-3 pr-4">
          <SessionBars data={chartData} />
        </Card>
      </Section>

      <Section title="Volume por grupo muscular">
        <Card className="flex flex-col gap-2.5 p-4">
          {byMuscle.rows.map(([group, value]) => (
            <div key={group}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-ink-300">
                  <span aria-hidden="true">{MUSCLE_ICON[group]}</span>
                  {MUSCLE_LABEL[group]}
                </span>
                <span className="tnum font-semibold text-ink-300">{formatVolume(value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${byMuscle.max > 0 ? (value / byMuscle.max) * 100 : 0}%`,
                    background: SERIES.primary,
                  }}
                />
              </div>
            </div>
          ))}
        </Card>
      </Section>

      {progressRanking.length > 0 && (
        <Section title="Evolução por exercício">
          <div className="flex flex-col gap-2">
            {progressRanking.map(({ exercise, summary }) => {
              const trend = summary.trendE1RM
              const positive = trend.perMonth >= 0
              const missing = Math.max(0, 3 - summary.sessions)
              return (
                <Link key={exercise.id} to={`/exercicio/${exercise.id}`}>
                  <Card className="flex items-center gap-3 p-3.5">
                    <span className="text-lg" aria-hidden="true">
                      {MUSCLE_ICON[exercise.muscle_group]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{exercise.name}</p>
                      <p className="tnum text-xs text-ink-400">
                        {summary.sessions} {summary.sessions === 1 ? 'sessão' : 'sessões'} · recorde{' '}
                        {formatWeight(summary.prWeight)} kg
                      </p>
                    </div>
                    {trend.reliable ? (
                      <span
                        className={`tnum shrink-0 text-sm font-bold ${
                          positive ? 'text-go-400' : 'text-fire-400'
                        }`}
                      >
                        {positive ? '+' : ''}
                        {formatWeight(trend.perMonth)} kg/mês
                      </span>
                    ) : (
                      <span className="shrink-0 text-right text-[11px] leading-tight text-ink-400">
                        faltam {missing}
                        <br />
                        {missing === 1 ? 'sessão' : 'sessões'}
                      </span>
                    )}
                  </Card>
                </Link>
              )
            })}
          </div>
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
            Tendência calculada por regressão linear sobre o 1RM estimado de cada sessão. São
            necessárias ao menos 3 sessões para a média fazer sentido — toque em qualquer exercício
            para ver o histórico completo.
          </p>
        </Section>
      )}

      <Section title="Desde o começo">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Volume total" value={formatVolume(allTimeVolume)} />
          <StatTile label="Treinos" value={String(finishedSessions)} />
          <StatTile label="Recordes" value={String(totalPRs)} tone="good" />
        </div>
      </Section>
    </div>
  )
}
