import { describe, expect, it } from 'vitest'
import {
  SPIN_DEFAULTS,
  activeIndex,
  angleForIndex,
  nearestDetent,
  stepSpin,
  type SpinConfig,
  type SpinState,
} from './spinner'

const config = (over: Partial<SpinConfig> = {}): SpinConfig => ({
  step: 72,
  ...SPIN_DEFAULTS,
  ...over,
})

const solto = (velocity: number, angle = 0): SpinState => ({
  angle,
  velocity,
  snapping: false,
  settled: false,
})

/** Roda a simulacao a 60fps ate parar (ou estourar o tempo limite). */
function simulate(start: SpinState, cfg: SpinConfig, maxSeconds = 12) {
  const frames: SpinState[] = []
  let state = start
  const dt = 1 / 60
  for (let t = 0; t < maxSeconds; t += dt) {
    state = stepSpin(state, dt, cfg)
    frames.push(state)
    if (state.settled) break
  }
  return { state, frames, seconds: frames.length / 60 }
}

describe('nearestDetent', () => {
  it('arredonda para o encaixe mais proximo', () => {
    expect(nearestDetent(10, 72)).toBe(0)
    expect(nearestDetent(40, 72)).toBe(72)
    expect(nearestDetent(-100, 72)).toBe(-72)
    expect(nearestDetent(0, 72)).toBe(0)
  })
})

describe('stepSpin', () => {
  it('um empurrao forte gira solto e para exatamente num encaixe', () => {
    const cfg = config()
    const { state, seconds } = simulate(solto(1800), cfg)
    expect(state.settled).toBe(true)
    expect(state.angle % cfg.step).toBeCloseTo(0, 6)
    // Giro longo, mas nao eterno: fidget spinner, nao roda de hamster.
    expect(seconds).toBeGreaterThan(1)
    expect(seconds).toBeLessThan(8)
  })

  it('o ima passa do ponto e volta antes de encaixar', () => {
    const cfg = config()
    // Solto parado 20° antes do encaixe em 0: a mola puxa, passa e volta.
    const { frames } = simulate({ angle: -20, velocity: 0, snapping: true, settled: false }, cfg)
    const maximo = Math.max(...frames.map((f) => f.angle))
    expect(maximo).toBeGreaterThan(0.5)
    // Passar do ponto e um carinho, nao um tranco: nunca chega no vizinho.
    expect(maximo).toBeLessThan(cfg.step / 2)
  })

  it('soltar devagar encaixa no vizinho mais proximo, sem pular', () => {
    const cfg = config()
    const { state } = simulate(solto(12, 66), cfg)
    expect(state.angle).toBeCloseTo(72, 6)
  })

  it('nao perde o encaixe quando o app volta do segundo plano', () => {
    const cfg = config()
    let state = solto(900)
    // Um quadro de 2 segundos (aba escondida) seguido do giro normal.
    state = stepSpin(state, 2, cfg)
    expect(Number.isFinite(state.angle)).toBe(true)
    const { state: final } = simulate(state, cfg)
    expect(final.settled).toBe(true)
    expect(final.angle % cfg.step).toBeCloseTo(0, 6)
  })

  it('ja parado no encaixe nao se mexe sozinho', () => {
    const cfg = config()
    const parado: SpinState = { angle: 144, velocity: 0, snapping: true, settled: true }
    expect(stepSpin(parado, 1 / 60, cfg)).toBe(parado)
  })

  it('gira para os dois lados', () => {
    const cfg = config()
    const { state } = simulate(solto(-1500), cfg)
    expect(state.settled).toBe(true)
    expect(state.angle).toBeLessThan(0)
    expect(state.angle % cfg.step).toBeCloseTo(0, 6)
  })
})

describe('stepSpin com destino escolhido', () => {
  it('vai para o item pedido, nao para o encaixe mais proximo', () => {
    const cfg = config()
    // Está em 0 (item 0 no topo) e pede o vizinho, a 72° de distancia: sem
    // destino explicito o ima puxaria de volta para 0.
    const { state } = simulate(
      { angle: 0, velocity: 0, snapping: true, settled: false, target: 72 },
      cfg,
    )
    expect(state.settled).toBe(true)
    expect(state.angle).toBeCloseTo(72, 6)
  })

  it('o encaixe escolhido nao muda no meio do caminho', () => {
    const cfg = config()
    const { frames } = simulate(solto(60, 30), cfg)
    const alvos = new Set(frames.filter((f) => f.target !== null).map((f) => f.target))
    expect(alvos.size).toBe(1)
  })
})

describe('activeIndex', () => {
  it('diz qual item esta no topo', () => {
    expect(activeIndex(0, 72, 5)).toBe(0)
    // Girar -72° traz o item 1 para o topo.
    expect(activeIndex(-72, 72, 5)).toBe(1)
    expect(activeIndex(-288, 72, 5)).toBe(4)
    // Uma volta inteira volta ao primeiro.
    expect(activeIndex(-360, 72, 5)).toBe(0)
    expect(activeIndex(360, 72, 5)).toBe(0)
  })

  it('funciona com rotacao positiva e com fracoes', () => {
    expect(activeIndex(72, 72, 5)).toBe(4)
    expect(activeIndex(-70, 72, 5)).toBe(1)
  })
})

describe('angleForIndex', () => {
  it('leva o item escolhido ao topo pelo caminho mais curto', () => {
    const alvo = angleForIndex(0, 4, 72, 5)
    // Item 4 esta a -288°, mas subir 72° e bem mais curto.
    expect(alvo).toBe(72)
    expect(activeIndex(alvo, 72, 5)).toBe(4)
  })

  it('mantem o numero de voltas ja dadas', () => {
    const alvo = angleForIndex(720, 1, 72, 5)
    expect(activeIndex(alvo, 72, 5)).toBe(1)
    expect(Math.abs(alvo - 720)).toBeLessThanOrEqual(360 / 2)
  })
})
