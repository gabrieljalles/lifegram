import {
  Bar,
  BarChart,
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
import { formatVolume, formatWeight } from '../lib/stats'

/**
 * Paleta categorica validada para o fundo escuro do app (#161f2d):
 * separacao de daltonismo e contraste conferidos com o validador.
 */
export const SERIES = {
  primary: '#3987e5',
  secondary: '#d95926',
  tertiary: '#199e70',
} as const

const GRID = '#1f2b3d'
const AXIS_TEXT = '#64748b'

/** Assinatura que o Tooltip do Recharts espera para um content customizado. */
type TipProps = TooltipContentProps<TooltipValueType, string | number>

const axisTick = { fill: AXIS_TEXT, fontSize: 11 }

/* ------------------------------------------------------------- tooltip */

function TooltipBox({ title, rows }: { title: string; rows: Array<{ label: string; value: string; color?: string }> }) {
  return (
    <div className="rounded-xl border border-ink-600 bg-ink-950/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="mb-1 text-[11px] font-semibold text-ink-300">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="tnum flex items-center gap-1.5 text-xs text-ink-100">
          {row.color && (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: row.color }}
              aria-hidden="true"
            />
          )}
          <span className="text-ink-400">{row.label}</span>
          <span className="ml-auto font-semibold">{row.value}</span>
        </p>
      ))}
    </div>
  )
}

/* -------------------------------------------------------- volume (bar) */

export interface VolumePoint {
  label: string
  volume: number
  sessions: number
  prs: number
}

export function VolumeBars({ data, height = 168 }: { data: VolumePoint[]; height?: number }) {
  const renderTooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as VolumePoint
    return (
      <TooltipBox
        title={label as string}
        rows={[
          { label: 'Volume', value: formatVolume(point.volume), color: SERIES.primary },
          { label: 'Treinos', value: String(point.sessions) },
          ...(point.prs > 0 ? [{ label: 'Recordes', value: String(point.prs) }] : []),
        ]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(value: number) => formatVolume(value)}
        />
        <Tooltip cursor={{ fill: '#ffffff0d' }} content={renderTooltip} />
        {/* Cantos arredondados so no topo: a base fica ancorada no zero. */}
        <Bar dataKey="volume" fill={SERIES.primary} radius={[4, 4, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------------ frequencia (bar) */

export function SessionBars({ data, height = 140 }: { data: VolumePoint[]; height?: number }) {
  const renderTooltip = ({ active, payload, label }: TipProps) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as VolumePoint
    return (
      <TooltipBox
        title={label as string}
        rows={[{ label: 'Treinos', value: String(point.sessions), color: SERIES.tertiary }]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="22%">
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={34}
          allowDecimals={false}
          domain={[0, (max: number) => Math.max(1, max)]}
        />
        <Tooltip cursor={{ fill: '#ffffff0d' }} content={renderTooltip} />
        <Bar dataKey="sessions" fill={SERIES.tertiary} radius={[4, 4, 0, 0]} maxBarSize={38} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/* ------------------------------------------------ progressao (linhas) */

export interface ProgressPoint {
  label: string
  date: Date
  topWeight: number
  e1rm: number
}

/**
 * Carga de topo e 1RM estimado dividem o mesmo eixo porque ambos sao kg —
 * nunca dois eixos y no mesmo grafico.
 */
export function ProgressLines({ data, height = 200 }: { data: ProgressPoint[]; height?: number }) {
  const renderTooltip = ({ active, payload }: TipProps) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as ProgressPoint
    return (
      <TooltipBox
        title={format(point.date, "d 'de' MMM yyyy", { locale: ptBR })}
        rows={[
          { label: 'Carga de topo', value: `${formatWeight(point.topWeight)} kg`, color: SERIES.primary },
          { label: '1RM estimado', value: `${formatWeight(point.e1rm)} kg`, color: SERIES.secondary },
        ]}
      />
    )
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={['dataMin - 5', 'dataMax + 5']}
            tickFormatter={(value: number) => `${Math.round(value)}`}
          />
          <Tooltip cursor={{ stroke: GRID, strokeWidth: 1 }} content={renderTooltip} />
          <Line
            type="monotone"
            dataKey="topWeight"
            stroke={SERIES.primary}
            strokeWidth={2}
            dot={{ r: 3, fill: SERIES.primary, strokeWidth: 0 }}
            activeDot={{ r: 5, stroke: '#0b0f17', strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="e1rm"
            stroke={SERIES.secondary}
            strokeWidth={2}
            strokeDasharray="5 3"
            dot={false}
            activeDot={{ r: 5, stroke: '#0b0f17', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
      <Legend
        items={[
          { label: 'Carga de topo (kg)', color: SERIES.primary },
          { label: '1RM estimado (kg)', color: SERIES.secondary, dashed: true },
        ]}
      />
    </div>
  )
}

/* ------------------------------------------------- peso corporal (linha) */

export interface WeightPoint {
  label: string
  date: Date
  weight: number
}

export function WeightLine({ data, height = 180 }: { data: WeightPoint[]; height?: number }) {
  const renderTooltip = ({ active, payload }: TipProps) => {
    if (!active || !payload?.length) return null
    const point = payload[0].payload as WeightPoint
    return (
      <TooltipBox
        title={format(point.date, "d 'de' MMM yyyy", { locale: ptBR })}
        rows={[{ label: 'Peso', value: `${formatWeight(point.weight)} kg`, color: SERIES.tertiary }]}
      />
    )
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          width={44}
          domain={['dataMin - 2', 'dataMax + 2']}
          tickFormatter={(value: number) => `${Math.round(value)}`}
        />
        <Tooltip cursor={{ stroke: GRID, strokeWidth: 1 }} content={renderTooltip} />
        <Line
          type="monotone"
          dataKey="weight"
          stroke={SERIES.tertiary}
          strokeWidth={2}
          dot={{ r: 3, fill: SERIES.tertiary, strokeWidth: 0 }}
          activeDot={{ r: 5, stroke: '#0b0f17', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

export function Legend({
  items,
}: {
  items: Array<{ label: string; color: string; dashed?: boolean }>
}) {
  return (
    <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <svg width="16" height="8" aria-hidden="true">
            <line
              x1="0"
              y1="4"
              x2="16"
              y2="4"
              stroke={item.color}
              strokeWidth="2"
              strokeDasharray={item.dashed ? '5 3' : undefined}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  )
}
