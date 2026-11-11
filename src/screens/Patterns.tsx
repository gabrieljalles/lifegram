import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDays, format } from 'date-fns'
import { dayKey, occursOn } from '../lib/activities'
import { useApp } from '../lib/store'

const WINDOW = 30
/** Com menos que isso, comparar dias com e sem um item e chute. */
const MIN_FOR_LINKS = 14

/**
 * Padroes, fase 1: a felicidade dos ultimos 30 dias e a constancia de cada
 * item. As ligacoes (o que faz o dia ser melhor) chegam com 14 check-ins.
 */
export default function Patterns() {
  const navigate = useNavigate()
  const { checkins, activities, activityLogs } = useApp()
  const today = new Date()

  const days = useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => dayKey(addDays(today, i - WINDOW + 1))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey(today)],
  )

  const series = useMemo(() => {
    const byDay = new Map(checkins.map((c) => [c.day, c.happiness]))
    return days.map((d) => byDay.get(d) ?? null)
  }, [checkins, days])

  const rated = series.filter((v): v is number => v != null)
  const avg = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null
  const totalRated = checkins.filter((c) => c.happiness != null).length

  const consistency = useMemo(() => {
    const done = new Set(activityLogs.map((l) => `${l.activity_id}|${l.day}`))
    return (
      activities
        // Tarefa de uma vez aparece todo dia ate fechar: nao e constancia.
        .filter((a) => !a.archived && !(a.item_type === 'tarefa' && a.kind === 'esporadica'))
        .map((a) => {
          let due = 0
          let hit = 0
          for (let i = 0; i < WINDOW; i++) {
            const date = addDays(today, -i)
            if (!occursOn(a, date)) continue
            due++
            if (done.has(`${a.id}|${dayKey(date)}`)) hit++
          }
          return { activity: a, due, hit }
        })
        .filter((r) => r.due > 0)
        .sort((a, b) => b.hit / b.due - a.hit / a.due)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activities, activityLogs, dayKey(today)])

  // Linha da felicidade: 1 embaixo, 5 em cima; dia sem check-in quebra a linha.
  const W = 350
  const H = 74
  const x = (i: number) => (i / (WINDOW - 1)) * W
  const y = (v: number) => 10 + ((5 - v) / 4) * (H - 20)
  const segments: string[] = []
  let current: string[] = []
  series.forEach((v, i) => {
    if (v == null) {
      if (current.length) segments.push(current.join(' '))
      current = []
    } else current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  })
  if (current.length) segments.push(current.join(' '))
  const worst = rated.length ? Math.min(...rated) : null
  const worstAt = worst != null ? series.lastIndexOf(worst) : -1

  return (
    <div className="pb-8">
      <header className="safe-t border-b-2 border-ink-100 px-5 pb-2.5 pt-4">
        <h1 className="font-display text-[40px] font-bold leading-none">Padrões</h1>
      </header>

      <H2>Felicidade · últimos 30 dias</H2>
      <div className="flex items-baseline gap-2.5 px-5">
        <b className="tnum font-display text-5xl font-bold">
          {avg != null ? avg.toFixed(1).replace('.', ',') : '—'}
        </b>
        <span className="text-[13px] text-ink-400">
          média · {rated.length} de {WINDOW} noites com check-in
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-5 mt-1 block h-[74px] w-[calc(100%-2.5rem)]"
        aria-hidden="true"
      >
        {[1, 3, 5].map((v) => (
          <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--color-ink-700)" />
        ))}
        {segments.map((points) =>
          points.includes(' ') ? (
            <polyline
              key={points}
              points={points}
              fill="none"
              stroke="var(--color-brand-400)"
              strokeWidth="2"
            />
          ) : (
            <circle
              key={points}
              cx={points.split(',')[0]}
              cy={points.split(',')[1]}
              r="2.5"
              fill="var(--color-brand-400)"
            />
          ),
        )}
        {worstAt >= 0 && <circle cx={x(worstAt)} cy={y(worst!)} r="4" fill="var(--color-margin)" />}
      </svg>
      {rated.length === 0 && (
        <p className="px-5 pt-1 text-sm text-ink-400">
          Faça o check-in hoje à noite. A linha começa amanhã.
        </p>
      )}

      <H2>O que mais se liga à sua felicidade</H2>
      <p className="mx-5 border-t border-dashed border-ink-400 py-2.5 text-[13px] text-ink-400">
        {totalRated >= MIN_FOR_LINKS
          ? 'As ligações entre itens, noite e felicidade chegam na próxima versão.'
          : `Faltam ${MIN_FOR_LINKS - totalRated} check-ins para comparar dias com e sem cada item. Diferença de média, não prova de causa.`}
      </p>

      <H2>Constância · 30 dias</H2>
      {consistency.length === 0 ? (
        <p className="px-5 text-sm text-ink-400">Nenhum item na agenda ainda.</p>
      ) : (
        <ul>
          {consistency.map(({ activity, due, hit }) => (
            <li
              key={activity.id}
              className="flex items-center justify-between border-b border-ink-700 px-5 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate">
                {activity.icon} {activity.title}
              </span>
              <span className="tnum shrink-0 font-display text-lg font-bold">
                {hit} de {due}
              </span>
            </li>
          ))}
        </ul>
      )}

      <H2>Mais números</H2>
      <ul>
        {[
          { to: '/desempenho', label: 'Treino e peso' },
          { to: '/stats', label: 'Estatísticas de treino' },
          { to: '/coragem/painel', label: 'Coragem em números' },
        ].map((link) => (
          <li key={link.to}>
            <button
              type="button"
              onClick={() => navigate(link.to)}
              className="flex min-h-[48px] w-full items-center justify-between border-b border-ink-700 px-5 text-left text-[15px] active:bg-ink-800"
            >
              {link.label}
              <span className="text-ink-400">›</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="px-5 pt-3 text-[11px] text-ink-400">Atualizado {format(today, 'HH:mm')}</p>
    </div>
  )
}

function H2({ children }: { children: string }) {
  return (
    <h2 className="px-5 pb-1.5 pt-4 font-display text-sm font-bold uppercase tracking-widest text-margin">
      {children}
    </h2>
  )
}
