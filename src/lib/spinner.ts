/**
 * Fisica da roda do hub — um fidget spinner.
 *
 * Voce empurra, ela gira solta perdendo velocidade, e quando fica lenta um
 * "ima" assume: puxa o item mais proximo para o topo, passa um pouco do ponto
 * e volta, como um detente de verdade.
 *
 * E uma funcao pura por quadro justamente para poder ser testada sem
 * navegador — a tela so mede o dedo e desenha.
 */

export interface SpinState {
  /** Rotacao acumulada da roda, em graus (positivo = horario). */
  angle: number
  /** Velocidade angular, em graus por segundo. */
  velocity: number
  /** true quando o ima ja assumiu: dai em diante ele nao solta mais. */
  snapping: boolean
  /** true quando parou exatamente no detente — a animacao pode desligar. */
  settled: boolean
  /**
   * Detente que o ima esta puxando. Fica travado assim que ele assume, entao
   * passar do ponto nunca troca de item no meio do encaixe. Tambem aceita um
   * destino escolhido a dedo (teclado, "ir para o item X"). null = ainda solto.
   */
  target?: number | null
}

export interface SpinConfig {
  /** Graus entre um item e o vizinho (360 / numero de itens). */
  step: number
  /** Quanto a roda solta perde por segundo (1/s). Maior = para mais rapido. */
  friction: number
  /** Forca do ima: graus/s² de aceleracao por grau de distancia do detente. */
  stiffness: number
  /**
   * Atrito do ima (1/s). Abaixo de 2*sqrt(stiffness) ele passa do ponto e
   * volta — e esse "passou e voltou" que da a sensacao de encaixe magnetico.
   */
  damping: number
  /** Abaixo desta velocidade (graus/s) o ima assume. */
  magnetVelocity: number
}

export const SPIN_DEFAULTS: Omit<SpinConfig, 'step'> = {
  friction: 1.1,
  stiffness: 90,
  damping: 9,
  magnetVelocity: 70,
}

/** Quadro muito longo (app em segundo plano) nao pode explodir a simulacao. */
const MAX_DT = 1 / 30

/** Parado o bastante para encerrar: nem distancia nem velocidade perceptiveis. */
const REST_ANGLE = 0.12
const REST_VELOCITY = 4

export const nearestDetent = (angle: number, step: number): number =>
  Math.round(angle / step) * step

/** Avanca a simulacao em `dt` segundos. */
export function stepSpin(state: SpinState, dt: number, config: SpinConfig): SpinState {
  const d = Math.min(Math.max(dt, 0), MAX_DT)
  if (d === 0 || state.settled) return state

  // O ima e "pegajoso": uma vez que assumiu, nao solta mesmo que a mola
  // acelere a roda acima do limiar no caminho de volta.
  const snapping = state.snapping || Math.abs(state.velocity) < config.magnetVelocity
  const target = snapping ? (state.target ?? nearestDetent(state.angle, config.step)) : null

  let velocity = state.velocity
  if (target !== null) {
    velocity += (target - state.angle) * config.stiffness * d
    velocity *= Math.exp(-config.damping * d)
  } else {
    velocity *= Math.exp(-config.friction * d)
  }

  const angle = state.angle + velocity * d

  if (
    target !== null &&
    Math.abs(target - angle) < REST_ANGLE &&
    Math.abs(velocity) < REST_VELOCITY
  ) {
    return { angle: target, velocity: 0, snapping: true, settled: true, target: null }
  }
  return { angle, velocity, snapping, settled: false, target }
}

/**
 * Qual item esta no topo para uma dada rotacao. O item `i` nasce em `i * step`,
 * entao ele chega ao topo quando a roda girou `-i * step`.
 */
export function activeIndex(angle: number, step: number, count: number): number {
  if (count <= 0) return 0
  const slot = Math.round(-angle / step) % count
  return (slot + count) % count
}

/** Rotacao que coloca o item `index` no topo, pelo caminho mais curto. */
export function angleForIndex(current: number, index: number, step: number, count: number): number {
  const turns = Math.round(current / (step * count))
  const base = -index * step + turns * step * count
  const options = [base - step * count, base, base + step * count]
  return options.reduce((best, option) =>
    Math.abs(option - current) < Math.abs(best - current) ? option : best,
  )
}
