import type { ReactNode } from 'react'
import type { Mission } from '../lib/missions'
import { FUNNEL_CONTEXTS } from '../lib/rejections'
import type { XPState } from '../lib/xp'
import type { FunnelContext } from '../lib/types'

/**
 * Pecas visuais da camada de jogo: nivel, missoes, selos. Ficam juntas para
 * todas as telas falarem a mesma lingua visual.
 */

/* ---------------------------------------------------------------- nivel */

export function LevelCard({ xp, children }: { xp: XPState; children?: ReactNode }) {
  return (
    <div className="game-card relative overflow-hidden rounded-3xl border border-brand-500/40 p-4">
      <div className="flex items-center gap-3.5">
        {/* Escudo do nivel: o numero que mais importa, maior que tudo. */}
        <div className="level-shield flex h-16 w-14 shrink-0 flex-col items-center justify-center text-ink-950">
          <span className="text-[9px] font-black uppercase leading-none tracking-wider">nível</span>
          <span className="tnum text-2xl font-black leading-none">{xp.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-black tracking-tight">{xp.title}</p>
          <div
            className="mt-1.5 h-3 overflow-hidden rounded-full bg-ink-950/70 ring-1 ring-ink-600"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={xp.span}
            aria-valuenow={xp.into}
            aria-label="XP no nível atual"
          >
            <div
              className="xp-fill h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.max(3, xp.ratio * 100)}%` }}
            />
          </div>
          <p className="tnum mt-1 flex justify-between text-[11px] text-ink-300">
            <span>
              {xp.into} / {xp.span} XP
            </span>
            {xp.today > 0 && <span className="font-bold text-pr-400">+{xp.today} hoje</span>}
          </p>
        </div>
      </div>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------- missao */

export function MissionCard({
  mission,
  onClick,
  action,
}: {
  mission: Mission
  onClick?: () => void
  action?: ReactNode
}) {
  const { done } = mission
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-2 p-3.5 transition-colors ${
        done
          ? 'border-go-500/50 bg-go-500/10'
          : mission.optional
            ? 'border-dashed border-ink-600 bg-ink-850'
            : 'border-brand-500/50 bg-brand-600/10'
      }`}
    >
      <button type="button" onClick={onClick} className="flex w-full items-start gap-3 text-left">
        <span
          aria-hidden="true"
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
            done ? 'bg-go-500/20' : 'bg-ink-950/50'
          }`}
        >
          {done ? '✅' : mission.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">
              {mission.optional ? 'Bônus' : 'Missão'}
            </span>
            {mission.xp > 0 && (
              <span
                className={`tnum rounded-full px-1.5 py-px text-[10px] font-black ${
                  done ? 'bg-go-500/20 text-go-400' : 'bg-pr-500/20 text-pr-400'
                }`}
              >
                +{mission.xp} XP
              </span>
            )}
          </span>
          <span
            className={`mt-0.5 block truncate text-base font-bold ${done ? 'text-ink-300 line-through decoration-go-500/70' : ''}`}
          >
            {mission.title}
          </span>
          <span className="mt-0.5 block text-xs leading-snug text-ink-400">{mission.detail}</span>
          {mission.progress && (
            <span className="mt-2 flex gap-1" aria-label={`${mission.progress.value} de ${mission.progress.target}`}>
              {Array.from({ length: mission.progress.target }, (_, i) => (
                <span
                  key={i}
                  className={`h-2 flex-1 rounded-full ${
                    i < mission.progress!.value ? 'bg-go-500' : 'bg-ink-700'
                  }`}
                />
              ))}
            </span>
          )}
        </span>
      </button>
      {mission.next && (
        <div className="mt-3 border-t border-go-500/30 pt-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink-950/50 text-2xl"
            >
              {mission.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-ink-400">
                  Próximo · opcional
                </span>
                <span className="tnum rounded-full bg-pr-500/20 px-1.5 py-px text-[10px] font-black text-pr-400">
                  +{mission.next.xp} XP
                </span>
              </span>
              <span className="mt-0.5 block truncate text-base font-bold">{mission.next.title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-400">
                {mission.next.detail}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={onClick}
            className="mt-2.5 w-full rounded-xl border border-brand-400/60 bg-brand-600/25 py-2.5 text-sm font-black uppercase tracking-wide text-brand-400 active:bg-brand-600/40"
          >
            Fazer agora ›
          </button>
        </div>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

/* --------------------------------------------------------------- selos */

export function StatPill({
  icon,
  value,
  label,
  tone = 'default',
}: {
  icon: string
  value: string | number
  label: string
  tone?: 'default' | 'fire' | 'gold' | 'go'
}) {
  const tones = {
    default: 'border-ink-700 bg-ink-850 text-ink-100',
    fire: 'border-fire-500/40 bg-fire-500/10 text-fire-400',
    gold: 'border-pr-500/40 bg-pr-500/10 text-pr-400',
    go: 'border-go-500/40 bg-go-500/10 text-go-400',
  }
  return (
    <div className={`flex flex-1 flex-col items-center rounded-2xl border px-2 py-2.5 ${tones[tone]}`}>
      <span className="text-lg leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="tnum mt-1 text-xl font-black leading-none">{value}</span>
      <span className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-400">
        {label}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------ contexto */

/** "Onde foi?" — chips de um toque, depois do registro. */
export function ContextPicker({
  value,
  onPick,
}: {
  value: FunnelContext | null | undefined
  onPick: (context: FunnelContext) => void
}) {
  return (
    <div className="animate-rise">
      <p className="mb-1.5 text-center text-[11px] font-semibold text-ink-300">Onde foi?</p>
      <div className="flex flex-wrap justify-center gap-1.5">
        {FUNNEL_CONTEXTS.map((ctx) => (
          <button
            key={ctx.id}
            type="button"
            onClick={() => onPick(ctx.id)}
            aria-pressed={value === ctx.id}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
              value === ctx.id
                ? 'border-brand-400 bg-brand-500/25 text-ink-50'
                : 'border-ink-600 bg-ink-850 text-ink-300 active:bg-ink-800'
            }`}
          >
            <span aria-hidden="true">{ctx.icon}</span> {ctx.label}
          </button>
        ))}
      </div>
    </div>
  )
}
