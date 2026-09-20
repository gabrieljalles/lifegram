import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ProgressLines } from '../components/charts'
import {
  Button,
  Card,
  EmptyState,
  ExercisePhoto,
  Header,
  MuscleChip,
  ProgressionCard,
  Section,
  StatTile,
} from '../components/ui'
import { usePhotoURL } from '../lib/photo'
import { formatVolume, formatWeight, suggestProgression, summarizeExercise } from '../lib/stats'
import { useApp } from '../lib/store'
import { DEFAULT_REP_CEILING, DEFAULT_REP_FLOOR, DEFAULT_WEIGHT_INCREMENT } from '../lib/types'

export default function ExerciseDetail() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { exerciseById, logsByExercise } = useApp()

  const exercise = exerciseId ? exerciseById.get(exerciseId) : undefined
  const logs = useMemo(
    () => (exerciseId ? (logsByExercise.get(exerciseId) ?? []) : []),
    [exerciseId, logsByExercise],
  )
  const summary = useMemo(() => summarizeExercise(logs), [logs])
  const photo = usePhotoURL(exercise)

  const suggestion = useMemo(() => {
    if (!exercise || logs.length === 0) return null
    return suggestProgression(logs, {
      rep_floor: exercise.rep_floor ?? DEFAULT_REP_FLOOR,
      rep_ceiling: exercise.rep_ceiling ?? DEFAULT_REP_CEILING,
      weight_increment: exercise.weight_increment ?? DEFAULT_WEIGHT_INCREMENT,
      muscle_group: exercise.muscle_group,
    })
  }, [exercise, logs])

  const chartData = useMemo(
    () =>
      summary.points.map((point) => ({
        label: format(point.date, 'dd/MM'),
        date: point.date,
        topWeight: point.topWeight,
        e1rm: Math.round(point.bestE1RM * 10) / 10,
      })),
    [summary.points],
  )

  if (!exercise) {
    return (
      <div>
        <Header title="Exercício" back />
        <EmptyState icon="🔍" title="Exercício não encontrado" />
      </div>
    )
  }

  const trend = summary.trendE1RM
  const weightTrend = summary.trendTopWeight

  return (
    <div>
      <Header title={exercise.name} back />

      <div className="px-4 pt-4">
        <div className="flex items-center gap-3">
          <ExercisePhoto
            url={photo}
            group={exercise.muscle_group}
            className="h-20 w-20 shrink-0 text-base"
            rounded="rounded-xl"
          />
          <div className="min-w-0 flex-1">
            <MuscleChip group={exercise.muscle_group} />
            <p className="tnum mt-1.5 text-xs text-ink-400">
              {summary.sessions} {summary.sessions === 1 ? 'sessão' : 'sessões'} ·{' '}
              {summary.totalSets} séries · {summary.totalReps} repetições
            </p>
            {summary.daysSinceLast !== null && (
              <p className="text-xs text-ink-400">
                {summary.daysSinceLast === 0
                  ? 'Feito hoje'
                  : `Há ${summary.daysSinceLast} ${summary.daysSinceLast === 1 ? 'dia' : 'dias'}`}
              </p>
            )}
          </div>
        </div>
      </div>

      {logs.length === 0 ? (
        <EmptyState
          icon="📊"
          title="Sem histórico ainda"
          description="Execute este exercício em um treino para começar a acompanhar a evolução da carga."
        />
      ) : (
        <>
          {suggestion && (
            <Section title="Recomendação">
              <ProgressionCard suggestion={suggestion} />
            </Section>
          )}

          {/* ------------------------------------- o numero que o usuario quer */}
          <Section title="Progresso mensal">
            <Card className={`p-4 ${trend.reliable ? 'border-brand-500/40 bg-brand-600/10' : ''}`}>
              {trend.reliable ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`tnum text-4xl font-extrabold leading-none ${
                        weightTrend.perMonth >= 0 ? 'text-go-400' : 'text-fire-400'
                      }`}
                    >
                      {weightTrend.perMonth >= 0 ? '+' : ''}
                      {formatWeight(weightTrend.perMonth)}
                    </span>
                    <span className="text-sm font-semibold text-ink-300">kg por mês</span>
                  </div>
                  <p className="tnum mt-1.5 text-sm text-ink-300">
                    {trend.percentPerMonth >= 0 ? '+' : ''}
                    {trend.percentPerMonth.toFixed(1).replace('.', ',')}% ao mês em força estimada
                  </p>
                  <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
                    Média calculada por regressão linear sobre {trend.points} sessões.{' '}
                    {trend.r2 >= 0.7
                      ? 'Progressão bem consistente.'
                      : trend.r2 >= 0.4
                        ? 'Progressão com alguma oscilação.'
                        : 'Resultados oscilando bastante entre as sessões.'}
                  </p>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-ink-300">
                  Faltam sessões para calcular a tendência. A partir da 3ª vez que você fizer este
                  exercício, a média de progresso mensal aparece aqui.
                </p>
              )}
            </Card>
          </Section>

          <Section title="Marcas">
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                label="Recorde de carga"
                value={formatWeight(summary.prWeight)}
                unit="kg"
                tone="good"
              />
              <StatTile
                label="1RM estimado"
                value={formatWeight(summary.bestE1RM)}
                unit="kg"
                hint="melhor série pela fórmula de Epley"
              />
              <StatTile label="Volume acumulado" value={formatVolume(summary.totalVolume)} />
              <StatTile
                label="Frequência"
                value={summary.sessionsPerWeek.toFixed(1)}
                unit="x/sem"
              />
            </div>
          </Section>

          <Section title="Evolução da carga">
            <Card className="p-3 pr-4">
              <ProgressLines data={chartData} />
            </Card>
          </Section>

          <Section title="Histórico">
            <div className="flex flex-col gap-2">
              {[...summary.points].reverse().map((point) => {
                const sessionLogs = logs.filter((log) => log.session_id === point.session_id)
                return (
                  <Card key={point.session_id} className="p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">
                        {format(point.date, "d 'de' MMM yyyy", { locale: ptBR })}
                      </p>
                      <span className="tnum text-xs text-ink-400">
                        {formatVolume(point.volume)}
                      </span>
                    </div>
                    <div className="tnum mt-1.5 flex flex-wrap gap-1.5">
                      {sessionLogs.map((log) => (
                        <span
                          key={log.id}
                          className={`rounded-lg px-2 py-0.5 text-xs font-medium ${
                            log.is_pr_weight || log.is_pr_volume
                              ? 'bg-pr-500/15 text-pr-400'
                              : 'bg-ink-800 text-ink-300'
                          }`}
                        >
                          {formatWeight(log.weight)}×{log.reps}
                        </span>
                      ))}
                    </div>
                  </Card>
                )
              })}
            </div>
          </Section>
        </>
      )}

      <div className="px-4 pb-6 pt-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => navigate(`/exercicios/${exercise.id}`)}
        >
          Editar exercício
        </Button>
      </div>
    </div>
  )
}
