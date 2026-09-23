import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import PRCelebration from '../../components/PRCelebration'
import { Button, Card, EmptyState, Header, Section } from '../../components/ui'
import { DataWarning, GoalBar, ScoreBadge, StatusChip } from '../../components/courage-ui'
import {
  attemptsOfGoal,
  attemptsPerWeek,
  evaluateGoal,
  overallStats,
  pendingOf,
  weeklyStreak,
} from '../../lib/courage'
import { addRejection, undoLastRejection } from '../../lib/courageActions'
import {
  REJECTION_BADGES,
  praiseFor,
  rejectionProgress,
  rejectionStreak,
  rejectionsThisWeek,
} from '../../lib/rejections'
import { useApp } from '../../lib/store'
import { vibrate } from '../../lib/timer'
import { COURAGE_STATUS_LABEL, type CourageGoal, type CourageStatus } from '../../lib/types'

type Filter = 'todos' | CourageStatus

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'andamento', label: COURAGE_STATUS_LABEL.andamento },
  { id: 'reavaliar', label: COURAGE_STATUS_LABEL.reavaliar },
  { id: 'normalizado', label: COURAGE_STATUS_LABEL.normalizado },
]

export default function CourageHome() {
  const navigate = useNavigate()
  const { courageGoals, courageAttempts, courageRejections, settings, reload } = useApp()
  const [filter, setFilter] = useState<Filter>('todos')
  const [celebration, setCelebration] = useState<{
    icon: string
    label: string
    detail: string
  } | null>(null)
  const [savingNo, setSavingNo] = useState(false)
  /** Janela curta de arrependimento: toque errado nao pode sujar a contagem. */
  const [undoable, setUndoable] = useState(false)
  // Guardado para poder cancelar: sem isso, o timer de um registro antigo
  // fecha a janela de desfazer de um registro novo feito logo em seguida.
  const undoTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    }
  }, [])

  const naos = useMemo(() => rejectionProgress(courageRejections.length), [courageRejections])
  const naosSemana = useMemo(() => rejectionsThisWeek(courageRejections), [courageRejections])
  const naosSeguidos = useMemo(() => rejectionStreak(courageRejections), [courageRejections])

  const registrarNao = async () => {
    if (savingNo) return
    setSavingNo(true)
    try {
      const total = courageRejections.length + 1
      await addRejection()
      await reload()

      const faixaNova = REJECTION_BADGES.find((badge) => badge.at === total) ?? null
      vibrate(faixaNova ? [120, 60, 120, 60, 220] : 60)
      setCelebration(
        faixaNova
          ? {
              icon: faixaNova.icon,
              label: faixaNova.name,
              detail: `${total}º não — faixa nova desbloqueada`,
            }
          : { icon: '🏆', label: `Não nº ${total}`, detail: praiseFor(Math.random()) },
      )
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
      setUndoable(true)
      undoTimer.current = window.setTimeout(() => setUndoable(false), 12000)
    } finally {
      setSavingNo(false)
    }
  }

  const desfazerNao = async () => {
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current)
    setUndoable(false)
    await undoLastRejection()
    await reload()
  }

  const target = settings.courage_weekly_goal

  /** Avaliacao de cada objetivo, calculada uma vez e reaproveitada na lista. */
  const evaluated = useMemo(
    () =>
      courageGoals.map((goal) => {
        const attempts = attemptsOfGoal(courageAttempts, goal.id)
        const hasChildren = courageGoals.some((g) => g.parent_id === goal.id)
        return { goal, attempts, evaluation: evaluateGoal(goal, attempts, hasChildren) }
      }),
    [courageGoals, courageAttempts],
  )

  const week = useMemo(() => {
    const weeks = attemptsPerWeek(courageAttempts, 1)
    return weeks[weeks.length - 1]?.tentativas ?? 0
  }, [courageAttempts])

  const streak = useMemo(() => weeklyStreak(courageAttempts, target), [courageAttempts, target])

  const overall = useMemo(
    () => overallStats(courageGoals, courageAttempts),
    [courageGoals, courageAttempts],
  )

  /** Previsoes salvas e ainda sem nota real: o fluxo de duas etapas em aberto. */
  const pending = useMemo(() => pendingOf(courageAttempts), [courageAttempts])

  const visible = useMemo(
    () =>
      evaluated
        .filter((entry) => filter === 'todos' || entry.evaluation.status === filter)
        // Do mais facil para o mais dificil: o proximo degrau fica no topo.
        .sort((a, b) => a.goal.score - b.goal.score || a.goal.name.localeCompare(b.goal.name)),
    [evaluated, filter],
  )

  const goalName = (id: string) => courageGoals.find((g) => g.id === id)?.name ?? 'Objetivo'

  return (
    <div>
      <Header
        title="Coragem"
        subtitle={
          courageGoals.length === 0
            ? 'Sua escada do medo, um degrau por vez'
            : `${overall.goals} ${overall.goals === 1 ? 'objetivo' : 'objetivos'} · ${overall.normalized} ${overall.normalized === 1 ? 'normalizado' : 'normalizados'}`
        }
        back="/"
        action={
          <Button size="sm" onClick={() => navigate('/coragem/novo')}>
            + Objetivo
          </Button>
        }
      />


      {/* Colecao de naos: fica fora do bloco de objetivos de proposito —
          contar "nao" nao depende de ter escada montada, e e o primeiro
          passo de quem ainda nao criou nenhum degrau. */}
      <Section title="Coleção de nãos">
        <Card className="border-fire-500/40 bg-fire-600/10 p-4">
          <div className="flex items-center gap-4">
            <div className="shrink-0 text-center">
              <p className="tnum text-4xl font-black leading-none text-fire-400">{naos.total}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                {naos.total === 1 ? 'não' : 'nãos'}
              </p>
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">
                {naos.badge ? (
                  <>
                    <span aria-hidden="true">{naos.badge.icon}</span> {naos.badge.name}
                  </>
                ) : (
                  <span className="text-ink-300">O primeiro não é o mais caro</span>
                )}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-fire-500 transition-[width] duration-500"
                  style={{ width: `${naos.ratio * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] leading-tight text-ink-400">
                {naos.next
                  ? `faltam ${naos.missing} para ${naos.next.name}`
                  : 'todas as faixas conquistadas'}
              </p>
            </div>
          </div>

          <Button
            className="mt-3.5 w-full"
            size="lg"
            variant="go"
            onClick={() => void registrarNao()}
            disabled={savingNo}
          >
            + Tomei um não
          </Button>

          <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-ink-400">
            <span className="tnum">
              {naosSemana} esta semana
              {naosSeguidos > 1 && ` · ${naosSeguidos} dias seguidos`}
            </span>
            {undoable && (
              <button
                type="button"
                onClick={() => void desfazerNao()}
                className="font-semibold text-ink-300 underline underline-offset-2"
              >
                desfazer
              </button>
            )}
          </div>
        </Card>
      </Section>

      {courageGoals.length === 0 ? (
        <EmptyState
          icon="🦁"
          title="Cadastre seu primeiro objetivo pequeno"
          description="Comece pelos de nota 1 ou 2 — algo que dá um friozinho, não algo que aterroriza. A escada sobe sozinha depois."
          action={
            <Button size="lg" variant="go" onClick={() => navigate('/coragem/novo')}>
              Criar objetivo
            </Button>
          }
        />
      ) : (
        <>
          <Section title="Sua semana">
            <Card className="p-4">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="tnum text-3xl font-extrabold">
                    {week}
                    <span className="text-base font-semibold text-ink-400"> / {target}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {week >= target
                      ? 'Meta da semana batida 🎉'
                      : `Faltam ${target - week} para bater a meta`}
                  </p>
                </div>
                {streak > 0 && (
                  <div className="flex shrink-0 items-center gap-1 rounded-full bg-fire-500/15 px-2.5 py-1 text-fire-400">
                    <span aria-hidden="true">🔥</span>
                    <span className="tnum text-sm font-bold">{streak}</span>
                    <span className="text-[11px] font-medium">
                      {streak === 1 ? 'semana' : 'semanas'}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-3">
                <GoalBar value={week} target={target} />
              </div>

              {overall.confidence.level === 'insuficiente' ? (
                <DataWarning>{overall.confidence.note}</DataWarning>
              ) : (
                overall.bias > 0 && (
                  <p className="mt-3 text-sm leading-relaxed text-ink-300">
                    {overall.confidence.phrase}:{' '}
                    <span className="font-semibold text-go-400">
                      seu medo superestima a dificuldade em {overall.bias}{' '}
                      {overall.bias === 1 ? 'ponto' : 'pontos'}
                    </span>
                    , na média de tudo que você já encarou.
                  </p>
                )
              )}
            </Card>
          </Section>

          {pending.length > 0 && (
            <Section title="Previsões em aberto">
              <div className="flex flex-col gap-2">
                {pending.map((attempt) => (
                  <Card
                    key={attempt.id}
                    className="flex items-center gap-3 border-pr-500/40 bg-pr-500/10 p-3.5"
                    onClick={() => navigate(`/coragem/tentativa/${attempt.id}`)}
                  >
                    <ScoreBadge score={attempt.predicted} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{goalName(attempt.goal_id)}</p>
                      <p className="text-[11px] text-ink-400">
                        previsto em{' '}
                        {format(parseISO(attempt.planned_at), "d 'de' MMM', às' HH:mm", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-pr-400">completar</span>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Seus degraus"
            action={
              <button
                type="button"
                onClick={() => navigate('/coragem/painel')}
                className="text-xs font-semibold text-brand-400"
              >
                Ver painel
              </button>
            }
          >
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5">
              {FILTERS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFilter(option.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    filter === option.id ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-400'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <Card className="p-4 text-sm text-ink-400">
                Nenhum objetivo com este status por enquanto.
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {visible.map(({ goal, attempts, evaluation }) => (
                  <GoalRow
                    key={goal.id}
                    goal={goal}
                    attempts={attempts.length}
                    completed={attempts.filter((a) => a.actual !== null).length}
                    status={evaluation.status}
                    child={goal.parent_id !== null}
                    onOpen={() => navigate(`/coragem/${goal.id}`)}
                  />
                ))}
              </div>
            )}
          </Section>
        </>
      )}

      {celebration && (
        <PRCelebration
          icon={celebration.icon}
          label={celebration.label}
          detail={celebration.detail}
          onDone={() => setCelebration(null)}
        />
      )}
    </div>
  )
}

function GoalRow({
  goal,
  attempts,
  completed,
  status,
  child,
  onOpen,
}: {
  goal: CourageGoal
  attempts: number
  completed: number
  status: CourageStatus
  child: boolean
  onOpen: () => void
}) {
  return (
    <Card className={`flex items-center gap-3 p-3.5 ${child ? 'ml-4' : ''}`} onClick={onOpen}>
      <ScoreBadge score={goal.score} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-semibold">{goal.name}</p>
          {status !== 'andamento' && <StatusChip status={status} />}
        </div>
        <p className="tnum mt-0.5 text-xs text-ink-400">
          {completed === 0
            ? 'nenhuma tentativa ainda'
            : `${completed} ${completed === 1 ? 'tentativa' : 'tentativas'}`}
          {attempts > completed && ` · ${attempts - completed} em aberto`}
        </p>
      </div>
      <span className="text-ink-400" aria-hidden="true">
        ›
      </span>
    </Card>
  )
}
