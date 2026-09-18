import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { HeatmapDay } from '../lib/stats'
import { formatVolume } from '../lib/stats'

/* ------------------------------------------------------------- heatmap */

/**
 * Calendario de frequencia. Escala sequencial de um unico tom: quanto mais
 * volume, mais claro o azul — o dia sem treino recua para o fundo.
 */
export default function Heatmap({ days }: { days: HeatmapDay[] }) {
  const [hover, setHover] = useState<HeatmapDay | null>(null)

  const steps = useMemo(() => {
    const volumes = days.filter((d) => d.volume > 0).map((d) => d.volume).sort((a, b) => a - b)
    if (volumes.length === 0) return [] as number[]
    const at = (q: number) => volumes[Math.min(volumes.length - 1, Math.floor(volumes.length * q))]
    return [at(0.25), at(0.5), at(0.75)]
  }, [days])

  const colorFor = (day: HeatmapDay): string => {
    if (day.volume <= 0) return '#1a2434'
    if (steps.length === 0) return '#3987e5'
    if (day.volume <= steps[0]) return '#184f95'
    if (day.volume <= steps[1]) return '#256abf'
    if (day.volume <= steps[2]) return '#3987e5'
    return '#6da7ec'
  }

  // Colunas por semana (segunda no topo), como um calendario de contribuicoes.
  const weeks: HeatmapDay[][] = []
  let current: HeatmapDay[] = []
  for (const day of days) {
    const weekday = (day.date.getDay() + 6) % 7
    if (weekday === 0 && current.length > 0) {
      weeks.push(current)
      current = []
    }
    current.push(day)
  }
  if (current.length > 0) weeks.push(current)

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, index) => (
          <div key={index} className="flex flex-col gap-[3px]">
            {week.map((day) => (
              <button
                key={day.key}
                type="button"
                onClick={() => setHover(day)}
                onMouseEnter={() => setHover(day)}
                onMouseLeave={() => setHover(null)}
                title={`${format(day.date, "d 'de' MMM", { locale: ptBR })}: ${
                  day.volume > 0 ? formatVolume(day.volume) : 'sem treino'
                }`}
                aria-label={`${format(day.date, "d 'de' MMMM", { locale: ptBR })}, ${
                  day.volume > 0 ? formatVolume(day.volume) : 'sem treino'
                }`}
                className="h-3.5 w-3.5 shrink-0 rounded-[3px]"
                style={{ background: colorFor(day) }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
        <span className="tnum">
          {hover
            ? `${format(hover.date, "d 'de' MMM", { locale: ptBR })} · ${
                hover.volume > 0 ? formatVolume(hover.volume) : 'descanso'
              }`
            : `${days.filter((d) => d.sessions > 0).length} treinos nos últimos ${days.length} dias`}
        </span>
        <span className="flex items-center gap-1">
          menos
          {['#1a2434', '#184f95', '#256abf', '#3987e5', '#6da7ec'].map((color) => (
            <span
              key={color}
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: color }}
              aria-hidden="true"
            />
          ))}
          mais
        </span>
      </div>
    </div>
  )
}
