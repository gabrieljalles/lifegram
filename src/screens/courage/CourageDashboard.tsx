import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AverageScoreLine, CountBars, SERIES } from '../../components/charts'
import { Button, Card, EmptyState, Header, Section, StatTile } from '../../components/ui'
import { DataWarning, GoalBar } from '../../components/courage-ui'
import {
  PATTERN_MIN_ATTEMPTS,
  attemptsPerWeek,
  completedOf,
  overallScoreSeries,
  overallStats,
  patternBreakdown,
  scoreDistribution,
  weeklyStreak,
  type PatternGroup,
} from '../../lib/courage'
import { useApp } from '../../lib/store'
import {
  COURAGE_PEOPLE_LABEL,
  COURAGE_PERIOD_LABEL,
  COURAGE_PLACE_LABEL,
  type CourageAttempt,
} from '../../lib/types'

/** Painel geral da coragem: a visao que cruza todos os degraus. */
export default function CourageDashboard() {
  const navigate = useNavigate()
  const { courageGoals, courageAttempts, courageScoreChanges, settings, saveSettings } = useApp()

  const target = settings.courage_weekly_goal
  const overall = useMemo(
    () => overallStats(courageGoals, courageAttempts),
    [courageGoals, courageAttempts],
  )
  const weeks = useMemo(() => attemptsPerWeek(courageAttempts, 12), [courageAttempts])
  const thisWeek = weeks[weeks.length - 1]?.tentativas ?? 0
  const streak = useMemo(() => weeklyStreak(courageAttempts, target), [courageAttempts, target])
  const average = useMemo(
    () => overallScoreSeries(courageGoals, courageScoreChanges),
    [courageGoals, courageScoreChanges],
  )
  const distribution = useMemo(() => scoreDistribution(courageGoals), [courageGoals])
  const patterns = useMemo(
    () =>
      patternBreakdown(courageAttempts, {
        period: COURAGE_PERIOD_LABEL,
        place: COURAGE_PLACE_LABEL,
        people: COURAGE_PEOPLE_LABEL,
      }),
    [courageAttempts],
  )

  if (courageGoals.length === 0) {
    return (
      <div>
        <Header title="Painel da coragem" back="/coragem" />
        <EmptyState
          icon="📊"
          title="Sem dados ainda"
          description="Cadastre um objetivo e registre tentativas — os gráficos aparecem sozinhos conforme o histórico cresce."
          action={
            <Button variant="go" onClick={() => navigate('/coragem/novo')}>
              Criar objetivo
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div>
      <Header
        title="Painel da coragem"
        subtitle={`${overall.completed} ${overall.completed === 1 ? 'tentativa completa' : 'tentativas completas'}`}
        back="/coragem"
      />

      <Section title="Resumo">
        <div className="grid grid-cols-2 gap-2">
          <StatTile
            label="Normalizados"
            value={String(overall.normalized)}
            hint={`de ${overall.goals} ${overall.goals === 1 ? 'objetivo' : 'objetivos'}`}
            tone={overall.normalized > 0 ? 'good' : 'default'}
          />
          <StatTile
            label="Semanas na meta"
            value={String(streak)}
            tone={streak > 0 ? 'good' : 'default'}
          />
          <StatTile
            label="Erro de previsão"
            value={`${overall.bias > 0 ? '+' : ''}${overall.bias}`}
            hint="previsto − real"
          />
          <StatTile
            label="Resultados ok"
            value={overall.okRate === null ? '—' : `${Math.round(overall.okRate * 100)}%`}
          />
        </div>

        {overall.confidence.level === 'insuficiente' ? (
          <DataWarning>{overall.confidence.note}</DataWarning>
        ) : (
          overall.bias > 0 && (
            <Card className="mt-2 border-go-500/40 bg-go-600/10 p-4">
              <p className="text-sm leading-relaxed text-ink-200">
                {overall.confidence.phrase} que{' '}
                <span className="font-bold text-go-400">
                  seu medo superestima a dificuldade em {overall.bias}{' '}
                  {overall.bias === 1 ? 'ponto' : 'pontos'}
                </span>
                . Na prática, quase tudo é mais fácil do que a sua cabeça prevê.
              </p>
            </Card>
          )
        )}
      </Section>

      <Section title="Meta semanal">
        <Card className="p-4">
          <div className="flex items-end justify-between gap-3">
            <p className="tnum text-2xl font-extrabold">
              {thisWeek}
              <span className="text-sm font-semibold text-ink-400"> / {target}</span>
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void saveSettings({ courage_weekly_goal: Math.max(1, target - 1) })}
              >
                −
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void saveSettings({ courage_weekly_goal: Math.min(21, target + 1) })}
              >
                +
              </Button>
            </div>
          </div>
          <div className="mt-2">
            <GoalBar value={thisWeek} target={target} />
          </div>
          <div className="mt-3">
            <CountBars
              data={weeks.map((week) => ({ label: week.label, valor: week.tentativas }))}
              target={target}
              targetLabel="meta"
              color={SERIES.tertiary}
              unit="Tentativas"
            />
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            Tentativas completas por semana nas últimas 12 semanas. A linha tracejada é a sua meta.
          </p>
        </Card>
      </Section>

      {average.length > 1 && (
        <Section title="Média das notas">
          <Card className="p-3.5">
            <AverageScoreLine data={average} />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Média da nota de todos os objetivos ativos. Descer aqui é a escada inteira ficando
              mais fácil — e só desce quando você confirma uma reavaliação.
            </p>
          </Card>
        </Section>
      )}

      <Section title="Objetivos por nota">
        <Card className="p-3.5">
          <CountBars
            data={distribution.map((point) => ({ label: point.label, valor: point.objetivos }))}
            color={SERIES.primary}
            unit="Objetivos"
            height={150}
          />
          <p className="mt-1 text-[11px] leading-relaxed text-ink-400">
            A foto da sua escada. O trabalho é empurrar tudo para a esquerda, até a coluna do 0.
          </p>
        </Card>
      </Section>

      <Section title="Onde você vai melhor">
        {patterns.available ? (
          <div className="flex flex-col gap-2">
            <PatternCard title="Por horário" groups={patterns.byPeriod} />
            <PatternCard title="Por ambiente" groups={patterns.byPlace} />
            <PatternCard title="Por tipo de pessoa" groups={patterns.byPeople} />
            <PatternCard title="Por nível de energia" groups={patterns.byEnergy} />
          </div>
        ) : (
          <Card className="p-4">
            <p className="text-sm leading-relaxed text-ink-300">
              A análise de padrões abre com {PATTERN_MIN_ATTEMPTS} tentativas completas — faltam{' '}
              <span className="tnum font-semibold text-ink-200">
                {Math.max(0, PATTERN_MIN_ATTEMPTS - overall.completed)}
              </span>
              .
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
              Com menos que isso, comparar horário e ambiente seria ler sorte como padrão.
            </p>
          </Card>
        )}
      </Section>

      <Section title="Exportar">
        <Card className="p-4">
          <p className="text-sm leading-relaxed text-ink-300">
            Leve seus registros para onde quiser — planilha, backup ou análise própria.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportCsv(courageAttempts, courageGoals)}
            >
              Exportar CSV
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => exportJson(courageAttempts, courageGoals)}
            >
              Exportar JSON
            </Button>
          </div>
        </Card>
      </Section>

      <div className="h-6" />
    </div>
  )
}

function PatternCard({ title, groups }: { title: string; groups: PatternGroup[] }) {
  if (groups.length < 2) return null
  const best = groups[0]
  const worst = groups[groups.length - 1]
  const max = Math.max(...groups.map((g) => g.avgActual), 1)

  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
      <div className="mt-2 flex flex-col gap-1.5">
        {groups.map((group) => (
          <div key={group.key} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-xs text-ink-300">{group.label}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((group.avgActual / max) * 100)}%`,
                  background: group === best ? SERIES.tertiary : SERIES.primary,
                }}
              />
            </div>
            <span className="tnum w-14 shrink-0 text-right text-xs text-ink-400">
              {group.avgActual} · {group.count}×
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        Mais fácil em <span className="font-semibold text-go-400">{best.label}</span> (
        {best.avgActual}) do que em{' '}
        <span className="font-semibold text-ink-300">{worst.label}</span> ({worst.avgActual}).
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------ exportar */

const download = (content: string, type: string, extension: string) => {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `coragem-${new Date().toISOString().slice(0, 10)}.${extension}`
  link.click()
  URL.revokeObjectURL(url)
}

/** Aspas duplicadas e campo entre aspas: o basico para o CSV nao quebrar. */
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return `"${String(value).replace(/"/g, '""')}"`
}

function exportCsv(attempts: CourageAttempt[], goals: Array<{ id: string; name: string }>) {
  const nameOf = (id: string) => goals.find((g) => g.id === id)?.name ?? ''
  const header = [
    'objetivo',
    'nota_prevista',
    'nota_real',
    'temia',
    'aconteceu',
    'resultado_ok',
    'ambiente',
    'pessoa',
    'energia',
    'observacao',
    'previsto_em',
    'concluido_em',
  ]
  // Completas primeiro, em ordem; depois as previsoes ainda em aberto.
  const ordered: CourageAttempt[] = [
    ...completedOf(attempts),
    ...attempts.filter((a) => a.actual === null),
  ]
  const rows = ordered.map((attempt) =>
    [
      nameOf(attempt.goal_id),
      attempt.predicted,
      attempt.actual,
      attempt.feared,
      attempt.happened,
      attempt.outcome_ok === null ? '' : attempt.outcome_ok ? 'sim' : 'nao',
      attempt.place,
      attempt.people,
      attempt.energy,
      attempt.note,
      attempt.planned_at,
      attempt.completed_at,
    ]
      .map(cell)
      .join(','),
  )
  download([header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8', 'csv')
}

function exportJson(attempts: CourageAttempt[], goals: unknown[]) {
  download(
    JSON.stringify({ exported_at: new Date().toISOString(), goals, attempts }, null, 2),
    'application/json',
    'json',
  )
}
