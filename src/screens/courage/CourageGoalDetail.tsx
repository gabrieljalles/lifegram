import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Legend, PredictionLines, ScoreSteps, SERIES } from '../../components/charts'
import { Button, Card, EmptyState, Header, Section, StatTile } from '../../components/ui'
import {
  DataWarning,
  ScoreBadge,
  ScorePicker,
  StatusChip,
  scoreTone,
} from '../../components/courage-ui'
import {
  attemptSeries,
  attemptsOfGoal,
  evaluateGoal,
  goalStats,
  scoreTimeline,
} from '../../lib/courage'
import { changeScore } from '../../lib/courageActions'
import { useApp } from '../../lib/store'
import type { CourageAttempt } from '../../lib/types'

export default function CourageGoalDetail() {
  const { goalId } = useParams()
  const navigate = useNavigate()
  const { courageGoals, courageAttempts, courageScoreChanges, reload } = useApp()

  const goal = courageGoals.find((g) => g.id === goalId) ?? null
  const children = useMemo(
    () => courageGoals.filter((g) => g.parent_id === goalId),
    [courageGoals, goalId],
  )
  const attempts = useMemo(
    () => (goal ? attemptsOfGoal(courageAttempts, goal.id) : []),
    [courageAttempts, goal],
  )

  const [reevaluating, setReevaluating] = useState(false)
  const [newScore, setNewScore] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  /** Quanto a nota acabou de cair — some ao sair da tela. */
  const [justDropped, setJustDropped] = useState<{ from: number; to: number } | null>(null)

  if (!goal) {
    return (
      <div>
        <Header title="Objetivo" back="/coragem" />
        <EmptyState icon="🔍" title="Objetivo não encontrado" />
      </div>
    )
  }

  const stats = goalStats(attempts)
  const evaluation = evaluateGoal(goal, attempts, children.length > 0)
  const series = attemptSeries(attempts)
  const timeline = scoreTimeline(goal, courageScoreChanges)
  const changes = courageScoreChanges
    .filter((c) => c.goal_id === goal.id)
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  const parent = courageGoals.find((g) => g.id === goal.parent_id) ?? null
  const tone = scoreTone(goal.score)

  const confirmScore = async () => {
    const score = newScore ?? evaluation.suggestedScore
    if (score === null || busy) return
    setBusy(true)
    try {
      const from = goal.score
      await changeScore(goal, score, 'reavaliação após os dados')
      await reload()
      setReevaluating(false)
      setNewScore(null)
      if (score < from) setJustDropped({ from, to: score })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Header
        title={goal.name}
        subtitle={parent ? `degrau de "${parent.name}"` : undefined}
        back="/coragem"
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate(`/coragem/${goal.id}/editar`)}>
            Editar
          </Button>
        }
      />

      <Section title="Nota atual">
        <Card className={`p-4 ${tone.ring}`}>
          <div className="flex items-center gap-4">
            <ScoreBadge score={goal.score} size="lg" />
            <div className="min-w-0 flex-1">
              <StatusChip status={evaluation.status} />
              <p className="mt-1.5 text-sm leading-relaxed text-ink-300">{evaluation.message}</p>
            </div>
          </div>

          {goal.description && (
            <p className="mt-3 border-t border-ink-800 pt-3 text-xs leading-relaxed text-ink-400">
              {goal.description}
            </p>
          )}

          {/* A nota nunca cai sozinha: aqui e onde voce confirma. */}
          {evaluation.readyToReevaluate && (
            <div className="mt-3 rounded-xl border border-pr-500/40 bg-pr-500/10 p-3.5">
              <p className="text-sm font-semibold text-pr-400">Hora de reavaliar este degrau</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-300">
                Previsto {stats.avgPredicted} na média, real {stats.avgActual}. A sugestão é baixar
                de <span className="tnum font-semibold">{goal.score}</span> para{' '}
                <span className="tnum font-semibold text-go-400">{evaluation.suggestedScore}</span>.
              </p>

              {reevaluating ? (
                <div className="mt-3">
                  <ScorePicker
                    value={newScore ?? evaluation.suggestedScore}
                    onChange={setNewScore}
                    label="Nova nota"
                  />
                  <div className="mt-2 flex gap-2">
                    <Button
                      className="flex-1"
                      variant="go"
                      onClick={() => void confirmScore()}
                      disabled={busy}
                    >
                      Confirmar nota
                    </Button>
                    <Button variant="ghost" onClick={() => setReevaluating(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  className="mt-3 w-full"
                  variant="primary"
                  onClick={() => setReevaluating(true)}
                >
                  Reavaliar agora
                </Button>
              )}
            </div>
          )}

          {evaluation.shouldSplit && (
            <div className="mt-3 rounded-xl border border-ink-600 bg-ink-850 p-3.5">
              <p className="text-sm font-semibold text-ink-200">Este degrau está grande demais</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-400">
                Várias tentativas e a nota real não cede. Em vez de insistir, quebre em passos
                menores — cada pedaço vira um degrau com nota própria.
              </p>
              <Button
                className="mt-3 w-full"
                variant="outline"
                onClick={() => navigate(`/coragem/novo?pai=${goal.id}`)}
              >
                Criar sub-objetivo
              </Button>
            </div>
          )}

          {goal.normalized_at && (
            <p className="mt-3 rounded-xl bg-go-500/10 px-3 py-2 text-xs font-semibold text-go-400">
              🎉 Normalizado em{' '}
              {format(parseISO(goal.normalized_at), "d 'de' MMMM", { locale: ptBR })} — virou
              rotina.
            </p>
          )}
        </Card>
      </Section>

      {justDropped && (
        <div className="px-4 pt-2">
          <Card className="animate-rise border-go-500/40 bg-go-600/10 p-4">
            <p className="text-sm font-bold text-go-400">
              🎉 Degrau mais fácil: {justDropped.from} → {justDropped.to}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-300">
              A nota caiu porque os dados justificaram, não por vontade de ver progresso. Vale
              reavaliar os objetivos parecidos — se este era exagero, os vizinhos provavelmente
              também são.
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate('/coragem')}>
                Ver os outros degraus
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setJustDropped(null)}>
                Fechar
              </Button>
            </div>
          </Card>
        </div>
      )}

      <div className="px-4 pt-1">
        <Button
          className="w-full"
          size="lg"
          variant="go"
          onClick={() => navigate(`/coragem/${goal.id}/tentativa`)}
        >
          Registrar tentativa
        </Button>
      </div>

      {children.length > 0 && (
        <Section title="Sub-objetivos">
          <div className="flex flex-col gap-2">
            {children
              .sort((a, b) => a.score - b.score)
              .map((child) => (
                <Card
                  key={child.id}
                  className="flex items-center gap-3 p-3.5"
                  onClick={() => navigate(`/coragem/${child.id}`)}
                >
                  <ScoreBadge score={child.score} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{child.name}</p>
                  <span className="text-ink-400" aria-hidden="true">
                    ›
                  </span>
                </Card>
              ))}
          </div>
        </Section>
      )}

      <Section title="Números deste degrau">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Tentativas"
            value={String(stats.completed)}
            hint={stats.pending > 0 ? `${stats.pending} em aberto` : undefined}
          />
          <StatTile
            label="Medo exagerou"
            value={`${stats.bias > 0 ? '+' : ''}${stats.bias}`}
            hint="previsto − real"
            tone={stats.bias >= 2 ? 'good' : 'default'}
          />
          <StatTile
            label="Resultados ok"
            value={stats.okRate === null ? '—' : `${Math.round(stats.okRate * 100)}%`}
          />
          <StatTile
            label="Oscilação"
            value={String(stats.consistency)}
            hint="desvio das notas reais"
          />
        </div>
        {stats.confidence.level !== 'tendencia' && (
          <DataWarning>{stats.confidence.note}</DataWarning>
        )}
      </Section>

      {series.length > 0 && (
        <Section title="Previsto x real">
          <Card className="p-3.5">
            <PredictionLines data={series} />
            <Legend
              items={[
                { label: 'Nota prevista', color: SERIES.secondary },
                { label: 'Nota real', color: SERIES.primary },
                { label: 'Média das últimas 3', color: SERIES.tertiary, dashed: true },
              ]}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              A distância entre as duas linhas é o tamanho do exagero do medo. Quando a linha real
              fica constantemente abaixo da prevista, o degrau ficou mais fácil do que parecia.
            </p>
          </Card>
        </Section>
      )}

      {timeline.length > 1 && (
        <Section title="Nota oficial ao longo do tempo">
          <Card className="p-3.5">
            <ScoreSteps data={timeline} />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Degraus, não uma curva: a nota só muda quando você confirma uma reavaliação.
            </p>
          </Card>
        </Section>
      )}

      {attempts.length > 0 && (
        <Section title="Histórico de tentativas">
          <div className="flex flex-col gap-2">
            {[...attempts].reverse().map((attempt) => (
              <AttemptRow
                key={attempt.id}
                attempt={attempt}
                // Concluida tambem abre: errar a marcacao acontece, e o
                // registro precisa poder ser corrigido depois.
                onOpen={() => navigate(`/coragem/tentativa/${attempt.id}`)}
              />
            ))}
          </div>
        </Section>
      )}

      {changes.length > 0 && (
        <Section title="Histórico de notas">
          <div className="flex flex-col gap-2">
            {changes.map((entry) => (
              <Card key={entry.id} className="flex items-center gap-3 p-3">
                <span className="tnum text-sm font-semibold text-ink-400">
                  {entry.from_score} → <span className="text-go-400">{entry.to_score}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-ink-300">{entry.reason}</p>
                  <p className="text-[11px] text-ink-400">
                    {format(parseISO(entry.changed_at), "d 'de' MMM 'de' yyyy", { locale: ptBR })}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <div className="h-6" />
    </div>
  )
}

function AttemptRow({ attempt, onOpen }: { attempt: CourageAttempt; onOpen?: () => void }) {
  const pending = attempt.actual === null
  return (
    <Card className={`p-3.5 ${pending ? 'border-pr-500/40' : ''}`} onClick={onOpen}>
      <div className="flex items-center gap-2.5">
        <ScoreBadge score={attempt.predicted} size="sm" />
        <span className="text-ink-500" aria-hidden="true">
          →
        </span>
        {pending ? (
          <span className="text-xs font-semibold text-pr-400">aguardando a nota real</span>
        ) : (
          <ScoreBadge score={attempt.actual as number} size="sm" />
        )}
        <span className="tnum ml-auto text-[11px] text-ink-400">
          {format(parseISO(attempt.completed_at ?? attempt.planned_at), "d/MM 'às' HH:mm")}
        </span>
      </div>

      {(attempt.feared || attempt.happened) && (
        <div className="mt-2 space-y-1 border-t border-ink-800 pt-2 text-xs leading-relaxed">
          {attempt.feared && (
            <p className="text-ink-400">
              <span className="font-semibold text-ink-300">Temia:</span> {attempt.feared}
            </p>
          )}
          {attempt.happened && (
            <p className="text-ink-400">
              <span className="font-semibold text-ink-300">Aconteceu:</span> {attempt.happened}
            </p>
          )}
        </div>
      )}

      {attempt.outcome_ok !== null && (
        <p
          className={`mt-1.5 text-[11px] font-semibold ${
            attempt.outcome_ok ? 'text-go-400' : 'text-fire-400'
          }`}
        >
          {attempt.outcome_ok ? 'Resultado ok' : 'Resultado não ok'}
        </p>
      )}
    </Card>
  )
}
