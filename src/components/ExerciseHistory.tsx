import { useMemo } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
  type TooltipValueType,
} from 'recharts'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { SERIES } from './charts'
import { exerciseSessionPoints, formatVolume, formatWeight } from '../lib/stats'
import type { SetLog } from '../lib/types'

/**
 * Historico do exercicio, dentro da propria tela do treino.
 *
 * Fica abaixo da dobra de proposito: entre uma serie e outra voce rola e ve se
 * esta progredindo, sem sair do treino para procurar grafico em outra tela.
 *
 * Carrega sob demanda (lazy) porque o Recharts pesa mais que o resto do app
 * somado — o inicio do treino nao pode esperar por biblioteca de grafico.
 */

type TipProps = TooltipContentProps<TooltipValueType, string | number>

const GRID = '#1f2b3d'
const AXIS = '#64748b'
const axisTick = { fill: AXIS, fontSize: 10 }

interface Point {
  label: string
  date: Date
  valor: number
}

export default function ExerciseHistory({ logs }: { logs: SetLog[] }) {
  const points = useMemo(() => exerciseSessionPoints(logs), [logs])

  const carga: Point[] = points.map((p) => ({
    label: format(p.date, 'dd/MM'),
    date: p.date,
    valor: p.topWeight,
  }))

  const volume: Point[] = points.map((p) => ({
    label: format(p.date, 'dd/MM'),
    date: p.date,
    valor: p.bestSetVolume,
  }))

  if (points.length < 2) {
    return (
      <div className="mt-4 w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-850 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Histórico</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-400">
          {points.length === 0
            ? 'Nenhuma sessão registrada ainda neste exercício.'
            : 'Só uma sessão até agora — com a segunda, a linha de progresso aparece aqui.'}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4 flex w-full max-w-sm flex-col gap-3">
      <HistoryChart
        title="Carga"
        subtitle="maior peso de cada treino"
        data={carga}
        color={SERIES.primary}
        format={(value) => `${formatWeight(value)} kg`}
      />
      <HistoryChart
        title="Melhor série"
        subtitle="kg × reps da melhor série do dia"
        data={volume}
        color={SERIES.tertiary}
        format={(value) => formatVolume(value)}
      />
    </div>
  )
}

function HistoryChart({
  title,
  subtitle,
  data,
  color,
  format: formatValue,
}: {
  title: string
  subtitle: string
  data: Point[]
  color: string
  format: (value: number) => string
}) {
  const first = data[0].valor
  const last = data[data.length - 1].valor
  const delta = last - first

  const renderTooltip = ({ active, payload }: TipProps) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as Point
    return (
      <div className="rounded-xl border border-ink-600 bg-ink-950/95 px-3 py-2 shadow-xl">
        <p className="mb-0.5 text-[11px] font-semibold text-ink-300">
          {format(point.date, "d 'de' MMM", { locale: ptBR })}
        </p>
        <p className="tnum text-xs font-semibold text-ink-100">{formatValue(point.valor)}</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-ink-700 bg-ink-850 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">{title}</p>
          <p className="text-[10px] text-ink-400">{subtitle}</p>
        </div>
        <p className="tnum shrink-0 text-right">
          <span className="text-sm font-bold text-ink-100">{formatValue(last)}</span>
          {/* Sinal e cor juntos: a direcao nao depende so da cor. */}
          <span
            className={`ml-1.5 text-[11px] font-semibold ${
              delta > 0 ? 'text-go-400' : delta < 0 ? 'text-fire-400' : 'text-ink-400'
            }`}
          >
            {delta > 0 ? '▲' : delta < 0 ? '▼' : '='} {formatValue(Math.abs(delta))}
          </span>
        </p>
      </div>

      <div className="mt-1.5">
        <ResponsiveContainer width="100%" height={110}>
          <LineChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -22 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={44}
              domain={['dataMin', 'dataMax']}
              tickFormatter={(value: number) => formatValue(value)}
            />
            <Tooltip content={renderTooltip} />
            <Line
              type="monotone"
              dataKey="valor"
              stroke={color}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 5, stroke: '#0b0f17', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-1 text-[10px] text-ink-400">
        {data.length} {data.length === 1 ? 'sessão' : 'sessões'} · desde{' '}
        {format(data[0].date, "d 'de' MMM", { locale: ptBR })}
      </p>
    </div>
  )
}
