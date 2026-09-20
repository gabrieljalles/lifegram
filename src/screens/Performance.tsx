import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { SERIES, VolumeBars } from '../components/charts'
import { Button, Card, Delta, Header, Section, StatTile } from '../components/ui'
import {
  bucketize,
  computeScheduleStreak,
  formatVolume,
  scheduleOf,
  totalVolume,
} from '../lib/stats'
import { useApp } from '../lib/store'
import { overallStats } from '../lib/courage'
import { ACCENT_TEXT, SKILL_AREAS, type SkillSnapshot } from '../lib/skills'

/**
 * Desempenho: a visao que cruza todas as skills. Hoje so exercicios tem dados
 * reais — as demais aparecem apagadas dizendo isso, em vez de mostrar zero como
 * se fosse resultado.
 */
export default function Performance() {
  const navigate = useNavigate()
  const { sessions, setLogs, routines, settings, courageGoals, courageAttempts } = useApp()

  const streak = useMemo(
    () => computeScheduleStreak(sessions, scheduleOf(routines, settings)),
    [sessions, routines, settings],
  )

  const weeks = useMemo(() => bucketize(sessions, setLogs, 'week', 12), [sessions, setLogs])

  /** Ultimos 30 dias contra os 30 anteriores: a janela que mostra tendencia. */
  const last30 = useMemo(() => {
    const today = new Date()
    const done = sessions.filter((s) => s.finished_at)
    const inWindow = (from: number, to: number) =>
      done.filter((s) => {
        const age = differenceInCalendarDays(today, parseISO(s.started_at))
        return age >= from && age < to
      })

    const recent = inWindow(0, 30)
    const previous = inWindow(30, 60)
    const idsOf = (list: typeof done) => new Set(list.map((s) => s.id))
    const logsOf = (list: typeof done) => {
      const ids = idsOf(list)
      return setLogs.filter((log) => ids.has(log.session_id))
    }

    const recentLogs = logsOf(recent)
    const previousVolume = totalVolume(logsOf(previous))
    const recentVolume = totalVolume(recentLogs)

    return {
      sessions: recent.length,
      volume: recentVolume,
      prs: recentLogs.filter((log) => log.is_pr_weight || log.is_pr_volume).length,
      trend: previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : null,
    }
  }, [sessions, setLogs])

  const courage = useMemo(
    () => overallStats(courageGoals, courageAttempts),
    [courageGoals, courageAttempts],
  )

  const snapshots: SkillSnapshot[] = useMemo(() => {
    return SKILL_AREAS.map((area) => {
      if (area.id === 'exercicios') {
        const active = sessions.some((s) => s.finished_at)
        return {
          area,
          active,
          headline: active
            ? `${last30.sessions} ${last30.sessions === 1 ? 'treino' : 'treinos'} nos últimos 30 dias`
            : 'Nenhum treino concluído ainda',
          // Sem treino concluido nao ha o que exibir: zero em tudo parece
          // resultado ruim quando na verdade e ausencia de dado.
          stats: active
            ? [
                {
                  label: 'Corrente',
                  value: String(streak.current),
                  hint: streak.mode === 'agenda' ? 'dias da agenda' : 'treinos seguidos',
                },
                { label: 'Volume 30d', value: formatVolume(last30.volume) },
                { label: 'Recordes 30d', value: String(last30.prs) },
              ]
            : [],
          trend: last30.trend,
          trendLabel: ' de volume vs. os 30 dias anteriores',
        }
      }

      if (area.id === 'coragem') {
        const active = courage.completed > 0
        return {
          area,
          active,
          headline: active
            ? `${courage.completed} ${courage.completed === 1 ? 'tentativa completa' : 'tentativas completas'} em ${courage.goals} ${courage.goals === 1 ? 'degrau' : 'degraus'}`
            : 'Nenhuma tentativa registrada ainda',
          stats: active
            ? [
                { label: 'Normalizados', value: String(courage.normalized) },
                {
                  label: 'Medo exagera',
                  value: `${courage.bias > 0 ? '+' : ''}${courage.bias}`,
                  hint: 'previsto − real',
                },
                {
                  label: 'Resultados ok',
                  value: courage.okRate === null ? '—' : `${Math.round(courage.okRate * 100)}%`,
                },
              ]
            : [],
          trend: null,
          trendLabel: '',
        }
      }

      return {
        area,
        active: false,
        headline: 'Ainda não há nada para medir aqui',
        stats: [],
        trend: null,
        trendLabel: '',
      }
    })
  }, [courage, last30, sessions, streak])

  const medidas = snapshots.filter((s) => s.active).length

  return (
    <div>
      <Header
        title="Desempenho"
        subtitle={`${medidas} de ${snapshots.length} ${
          snapshots.length === 1 ? 'área medida' : 'áreas com dados'
        }`}
        back="/"
      />

      {snapshots.map((snapshot) => (
        <Section key={snapshot.area.id} title={snapshot.area.name}>
          <Card className={`p-4 ${snapshot.active ? '' : 'opacity-70'}`}>
            <div className="flex items-start gap-3">
              <span className="text-2xl" aria-hidden="true">
                {snapshot.area.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-semibold ${
                    snapshot.active ? ACCENT_TEXT[snapshot.area.accent] : 'text-ink-400'
                  }`}
                >
                  {snapshot.headline}
                </p>
                {!snapshot.active && (
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">
                    {snapshot.area.to
                      ? 'Registre por lá e os números aparecem aqui.'
                      : 'Quando esta área começar a registrar, os números aparecem aqui junto das outras.'}
                  </p>
                )}
              </div>
            </div>

            {snapshot.stats.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {snapshot.stats.map((stat) => (
                  <StatTile
                    key={stat.label}
                    label={stat.label}
                    value={stat.value}
                    hint={stat.hint}
                  />
                ))}
              </div>
            )}

            {snapshot.trend !== null && (
              <div className="mt-2 px-1">
                <Delta percent={snapshot.trend} suffix={snapshot.trendLabel} />
              </div>
            )}

            {snapshot.area.to && (
              <Button
                className="mt-3 w-full"
                variant="outline"
                size="sm"
                onClick={() => navigate(snapshot.area.to as string)}
              >
                Abrir {snapshot.area.name}
              </Button>
            )}
          </Card>
        </Section>
      ))}

      {medidas > 0 && (
        <Section title="Volume por semana">
          <Card className="p-3.5">
            <VolumeBars
              data={weeks.map((bucket) => ({
                label: bucket.label,
                volume: bucket.volume,
                sessions: bucket.sessions,
                prs: bucket.prs,
              }))}
            />
            <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
              Volume levantado nas últimas 12 semanas —{' '}
              <span className="font-semibold" style={{ color: SERIES.primary }}>
                área de exercícios
              </span>
              .
            </p>
            <Button
              className="mt-3 w-full"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/stats')}
            >
              Ver o progresso detalhado
            </Button>
          </Card>
        </Section>
      )}
    </div>
  )
}
