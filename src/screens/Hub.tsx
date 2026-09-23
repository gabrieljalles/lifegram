import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { computeScheduleStreak, scheduleOf } from '../lib/stats'
import { useApp } from '../lib/store'
import { SKILL_AREAS } from '../lib/skills'
import { makeStars } from '../lib/stars'
import {
  SPIN_DEFAULTS,
  activeIndex,
  angleForIndex,
  stepSpin,
  type SpinState,
} from '../lib/spinner'

interface WheelItem {
  id: string
  label: string
  icon: string
  blurb: string
  to: string
}

/**
 * A roda nasce das areas da vida (skills.ts) e ganha duas entradas que nao sao
 * area: desempenho, que cruza todas, e ajustes. Area nova em SKILL_AREAS ja
 * entra aqui sozinha — a roda se reespaca com qualquer quantidade de itens.
 */
const ITEMS: WheelItem[] = [
  ...SKILL_AREAS.filter((area) => area.to !== null).map((area) => ({
    id: area.id,
    label: area.name,
    icon: area.icon,
    blurb: area.blurb,
    to: area.to as string,
  })),
  {
    id: 'desempenho',
    label: 'Desempenho',
    icon: '📈',
    blurb: 'Gráficos e números de todas as áreas num lugar só',
    to: '/desempenho',
  },
  {
    id: 'ajustes',
    label: 'Ajustes',
    icon: '⚙️',
    blurb: 'Conta, backup, avisos e dias de descanso',
    to: '/config',
  },
]

/** Giro do dedo abaixo disto e toque, nao arrasto. */
const TAP_SLOP = 5

export default function Hub() {
  const navigate = useNavigate()
  const { routines, sessions, settings, active } = useApp()

  const rootRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const badgeRefs = useRef<Array<HTMLSpanElement | null>>([])

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [index, setIndex] = useState(0)

  const step = 360 / ITEMS.length
  const config = useMemo(() => ({ step, ...SPIN_DEFAULTS }), [step])
  // Posicoes em fracao da tela: o ceu nao precisa ser refeito ao redimensionar.
  const stars = useMemo(() => makeStars(), [])

  const spin = useRef<SpinState>({ angle: 0, velocity: 0, snapping: true, settled: true })
  const frame = useRef<number | null>(null)
  const lastTime = useRef(0)
  const indexRef = useRef(0)
  const movedRef = useRef(0)
  const drag = useRef<{
    id: number
    last: number
    moved: number
    captured: boolean
    samples: Array<{ t: number; angle: number }>
  } | null>(null)

  // A roda fica deitada na base: o centro cai um pouco abaixo do fim da tela,
  // entao so o arco de cima aparece — o resto dos itens vem girando de fora.
  // O eixo fica logo abaixo da borda de baixo: a roda encosta no "chao" da
  // tela e so o arco de cima aparece. O raio cresce junto para o arco nao
  // encolher com o eixo descendo — e e ele que faz o aro vazar pelas laterais.
  const radius = Math.max(190, Math.min(size.w * 0.68, 320))
  const centerY = size.h * 1.04
  const diameter = radius * 2
  /** Folga acima do aro para caber o cracha em foco e a seta indicadora. */
  const headroom = 46
  /** Onde comeca a area que responde ao dedo (o resto da tela fica livre). */
  const wheelTop = Math.max(0, centerY - radius - headroom)
  /** Topo do aro dentro dessa area. */
  const ringTop = centerY - radius - wheelTop

  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  /** Escreve a rotacao direto no DOM: 60fps sem re-render do React. */
  const draw = useCallback(() => {
    const { angle } = spin.current
    if (ringRef.current) ringRef.current.style.transform = `rotate(${angle}deg)`

    badgeRefs.current.forEach((badge, i) => {
      if (!badge) return
      const own = angle + i * step
      // Contra-gira o cracha para o icone nunca aparecer de cabeca para baixo.
      const focus = (Math.cos((own * Math.PI) / 180) + 1) / 2
      badge.style.transform = `rotate(${-own}deg) scale(${(0.62 + 0.46 * focus).toFixed(3)})`
      badge.style.opacity = (0.3 + 0.7 * focus).toFixed(3)
    })

    const next = activeIndex(angle, step, ITEMS.length)
    if (next !== indexRef.current) {
      indexRef.current = next
      setIndex(next)
      navigator.vibrate?.(6)
    }
  }, [step])

  const tick = useCallback(
    // Expressao nomeada: o proprio quadro agenda o proximo sem depender da
    // variavel externa ainda estar inicializada.
    function step(time: number) {
      const dt = (time - lastTime.current) / 1000
      lastTime.current = time
      spin.current = stepSpin(spin.current, dt, config)
      draw()
      frame.current = spin.current.settled ? null : requestAnimationFrame(step)
    },
    [config, draw],
  )

  const ensureLoop = useCallback(() => {
    if (frame.current !== null) return
    lastTime.current = performance.now()
    frame.current = requestAnimationFrame(tick)
  }, [tick])

  useEffect(() => {
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [])

  // Primeiro desenho assim que a tela tem tamanho (e a cada remedida).
  useLayoutEffect(() => {
    if (size.w > 0) draw()
  }, [size.w, size.h, draw])

  const centerOfWheel = () => {
    const rect = ringRef.current?.getBoundingClientRect()
    if (!rect) return null
    // O aro gira em torno do proprio centro, entao a caixa continua centrada.
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }

  const angleAt = (clientX: number, clientY: number) => {
    const center = centerOfWheel()
    if (!center) return 0
    return (Math.atan2(clientX - center.x, center.y - clientY) * 180) / Math.PI
  }

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    // Sem capturar o ponteiro ainda: capturar aqui faria o `click` nascer neste
    // contêiner em vez do cracha, e o toque no icone nunca abriria a aba.
    drag.current = {
      id: event.pointerId,
      last: angleAt(event.clientX, event.clientY),
      moved: 0,
      captured: false,
      samples: [{ t: performance.now(), angle: spin.current.angle }],
    }
    movedRef.current = 0
    spin.current = { ...spin.current, velocity: 0, snapping: false, settled: false, target: null }
  }

  const onPointerMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return

    const now = angleAt(event.clientX, event.clientY)
    let delta = now - state.last
    // Cruzar a costura (±180°) nao pode virar meia volta de tranco.
    if (delta > 180) delta -= 360
    if (delta < -180) delta += 360
    state.last = now
    state.moved += Math.abs(delta)
    movedRef.current = state.moved

    // Virou arrasto de verdade: agora sim segura o ponteiro, para o giro
    // continuar mesmo se o dedo sair da roda.
    if (!state.captured && state.moved > TAP_SLOP) {
      event.currentTarget.setPointerCapture(event.pointerId)
      state.captured = true
    }

    spin.current = { ...spin.current, angle: spin.current.angle + delta }
    state.samples.push({ t: performance.now(), angle: spin.current.angle })
    if (state.samples.length > 8) state.samples.shift()
    draw()
  }

  const onPointerUp = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state || state.id !== event.pointerId) return
    drag.current = null

    // Velocidade do arremesso pelos ultimos ~120ms, nao pelo arrasto inteiro.
    const now = performance.now()
    const first = state.samples.find((sample) => now - sample.t < 120) ?? state.samples[0]
    const elapsed = (now - first.t) / 1000
    const raw = elapsed > 0.008 ? (spin.current.angle - first.angle) / elapsed : 0
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    spin.current = {
      ...spin.current,
      velocity: reduced ? 0 : Math.max(-2600, Math.min(2600, raw)),
      snapping: false,
      settled: false,
      target: null,
    }
    ensureLoop()
  }

  const open = (item: WheelItem) => {
    if (movedRef.current > TAP_SLOP) return
    navigate(item.to)
  }

  /** Leva um item ao topo pelo caminho mais curto, com o mesmo encaixe do ima. */
  const rotateTo = (target: number) => {
    spin.current = {
      angle: spin.current.angle,
      velocity: 0,
      snapping: true,
      settled: false,
      target: angleForIndex(spin.current.angle, target, step, ITEMS.length),
    }
    ensureLoop()
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      const direcao = event.key === 'ArrowRight' ? 1 : -1
      rotateTo((indexRef.current + direcao + ITEMS.length) % ITEMS.length)
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigate(ITEMS[indexRef.current].to)
    }
  }

  const streak = useMemo(
    () => computeScheduleStreak(sessions, scheduleOf(routines, settings)),
    [sessions, routines, settings],
  )

  const item = ITEMS[index]
  const hoje = format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })

  return (
    <div ref={rootRef} className="relative flex h-dvh flex-col overflow-hidden bg-ink-950">
      {/* Ceu: pontinhos parados, adensados em cima. Fica atras do brilho roxo
          de proposito — a luz da roda lava as estrelas mais baixas. */}
      {size.w > 0 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
        >
          {stars.map((star, i) => (
            <circle
              key={i}
              cx={star.x * size.w}
              cy={star.y * size.h}
              r={star.r}
              fill={star.violet ? '#c7d2fe' : '#e2e8f0'}
              className={star.twinkle ? 'animate-star' : undefined}
              style={
                star.twinkle
                  ? ({
                      '--star-o': star.opacity,
                      animationDelay: `${star.delay}s`,
                    } as React.CSSProperties)
                  : { opacity: star.opacity }
              }
            />
          ))}
        </svg>
      )}

      {/* Brilho roxo parado atras da roda: o aro gira, a luz do palco nao. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(80% 42% at 50% ${centerY}px, rgba(99,102,241,0.30), rgba(79,70,229,0.10) 45%, transparent 72%)`,
        }}
      />

      <header className="safe-t relative z-10 shrink-0 px-5 pt-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] capitalize tracking-wide text-ink-400">{hoje}</p>
          {streak.current > 0 && (
            <div className="flex shrink-0 items-center gap-1 rounded-full bg-fire-500/15 px-2.5 py-1 text-fire-400">
              <span aria-hidden="true">🔥</span>
              <span className="tnum text-sm font-bold">{streak.current}</span>
            </div>
          )}
        </div>

        {active && (
          <button
            type="button"
            onClick={() => navigate('/treino')}
            className="animate-rise mt-3 flex w-full items-center gap-2.5 rounded-2xl border border-brand-500/40 bg-brand-600/15 px-3.5 py-2.5 text-left backdrop-blur"
          >
            <span className="h-2 w-2 shrink-0 animate-pulse-ring rounded-full bg-go-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{active.routine_name}</span>
              <span className="block text-[11px] text-ink-400">
                em andamento · iniciado {format(parseISO(active.started_at), 'HH:mm')}
              </span>
            </span>
            <span className="text-brand-400" aria-hidden="true">
              ›
            </span>
          </button>
        )}
      </header>

      {/* Nome da area em foco: muda junto com a roda e fica ancorado logo
          acima do arco, para o texto e a roda lerem como uma coisa so. */}
      <div
        className="relative z-10 flex flex-1 flex-col items-start justify-center px-5"
        style={{ paddingBottom: size.h > 0 ? size.h - wheelTop + 14 : 0 }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-brand-400/80">
          {index + 1} / {ITEMS.length}
        </p>
        <h1 key={item.id} className="animate-rise mt-1.5 text-[2.5rem] font-black leading-none tracking-tight">
          {item.label}
        </h1>
        <p className="mt-2 max-w-[17rem] text-sm leading-relaxed text-ink-400">{item.blurb}</p>
        <button
          type="button"
          onClick={() => navigate(item.to)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand-500/50 bg-brand-600/20 px-4 py-2 text-sm font-bold text-brand-400 backdrop-blur active:bg-brand-600/35"
        >
          Abrir <span aria-hidden="true">›</span>
        </button>
      </div>

      {/* ------------------------------------------------------------ roda */}
      {size.w > 0 && (
        <div
          role="group"
          aria-label="Roda de áreas — arraste para girar"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-x-0 bottom-0 z-10 touch-none outline-none"
          style={{ top: wheelTop }}
        >
          {/* Seta fixa marcando onde o item entra em foco. */}
          <div
            aria-hidden="true"
            className="absolute left-1/2 -translate-x-1/2 text-brand-400/70"
            style={{ top: Math.max(0, ringTop - headroom) }}
          >
            <svg viewBox="0 0 16 10" className="h-2.5 w-4">
              <path d="M8 10 L0 0 L16 0 Z" fill="currentColor" />
            </svg>
          </div>

          <div
            ref={ringRef}
            className="absolute left-1/2 will-change-transform"
            style={{ width: diameter, height: diameter, marginLeft: -radius, top: ringTop }}
          >
            <svg
              viewBox={`0 0 ${diameter} ${diameter}`}
              width={diameter}
              height={diameter}
              className="absolute inset-0"
              style={{ filter: 'drop-shadow(0 0 10px rgba(129,140,248,0.45))' }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="aro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c7d2fe" />
                  <stop offset="55%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#3730a3" />
                </linearGradient>
              </defs>

              <circle
                cx={radius}
                cy={radius}
                r={radius - 2}
                fill="none"
                stroke="url(#aro)"
                strokeWidth="2.5"
              />
              <circle
                cx={radius}
                cy={radius}
                r={radius - 13}
                fill="none"
                stroke="#818cf8"
                strokeWidth="1"
                opacity="0.3"
                strokeDasharray="2 9"
              />
              <circle
                cx={radius}
                cy={radius}
                r={radius - 34}
                fill="none"
                stroke="#6366f1"
                strokeWidth="1"
                opacity="0.18"
              />

              {ITEMS.map((wheelItem, i) => (
                <g key={wheelItem.id} transform={`rotate(${i * step} ${radius} ${radius})`}>
                  {/* Raio: os raios convergem para fora da tela e e isso que
                      faz a coisa toda parecer uma roda, nao um carrossel. */}
                  <line
                    x1={radius}
                    y1={radius}
                    x2={radius}
                    y2={36}
                    stroke="#6366f1"
                    strokeWidth="1"
                    opacity="0.2"
                  />
                  <line
                    x1={radius}
                    y1={5}
                    x2={radius}
                    y2={21}
                    stroke="#c7d2fe"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    opacity="0.75"
                  />
                </g>
              ))}

              <circle
                cx={radius}
                cy={radius}
                r={22}
                fill="none"
                stroke="#818cf8"
                strokeWidth="1.5"
                opacity="0.45"
              />
            </svg>

            {ITEMS.map((wheelItem, i) => (
              <button
                key={wheelItem.id}
                type="button"
                onClick={() => open(wheelItem)}
                aria-label={wheelItem.label}
                className="absolute left-1/2 top-1/2 outline-none"
                style={{
                  transformOrigin: '0 0',
                  transform: `rotate(${i * step}deg) translate(0, ${-radius}px) translate(-50%, -50%)`,
                }}
              >
                <span
                  ref={(el) => {
                    badgeRefs.current[i] = el
                  }}
                  // Sem backdrop-blur de proposito: sobre um fundo 90% opaco
                  // ele e invisivel, e backdrop-filter em elemento que gira
                  // obriga o navegador a reamostrar o fundo a cada quadro.
                  className={`flex h-16 w-16 items-center justify-center rounded-full border bg-ink-950/90 text-[1.75rem] transition-[border-color,box-shadow] duration-300 ${
                    i === index
                      ? 'border-brand-400/90 shadow-[0_0_26px_rgba(129,140,248,0.75)]'
                      : 'border-brand-500/35 shadow-[0_0_12px_rgba(99,102,241,0.30)]'
                  }`}
                  style={{ willChange: 'transform, opacity' }}
                >
                  <span aria-hidden="true">{wheelItem.icon}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
