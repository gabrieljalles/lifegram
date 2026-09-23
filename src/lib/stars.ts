/**
 * Ceu estrelado do hub.
 *
 * As estrelas saem de um sorteio com semente fixa, nao de Math.random no
 * render: a roda re-renderiza a cada item que passa, e com sorteio solto o ceu
 * inteiro mudaria de lugar no meio do giro. Semente fixa = sempre o mesmo ceu.
 */

export interface Star {
  /** Posicao em fracao da tela (0 = topo/esquerda, 1 = base/direita). */
  x: number
  y: number
  /** Raio em pixels — pontinho, nada de estrela desenhada. */
  r: number
  opacity: number
  /** Só algumas piscam; todas piscando viraria pisca-pisca de natal. */
  twinkle: boolean
  /** Atraso do piscar, para nao piscarem juntas. */
  delay: number
  /** Um punhado puxa para o lilas do icone, o resto fica branco-azulado. */
  violet: boolean
}

/** PRNG determinístico (mulberry32): mesma semente, mesmo ceu, sempre. */
function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface SkyOptions {
  count?: number
  seed?: number
  /** Fracao da tela onde o ceu acaba — abaixo disso e area da roda. */
  horizon?: number
}

export function makeStars({ count = 44, seed = 20260923, horizon = 0.72 }: SkyOptions = {}): Star[] {
  const rand = mulberry32(seed)
  const stars: Star[] = []

  for (let i = 0; i < count; i++) {
    // Elevar ao quadrado empurra o sorteio para perto de 0: muita estrela em
    // cima, poucas descendo, e o ceu rareia sozinho antes de achar a roda.
    const queda = rand() ** 2
    const y = queda * horizon
    const brilho = rand()
    // Quanto mais baixo, mais apagada: some suave em vez de cortar no meio.
    const fade = 0.3 + 0.7 * (1 - queda)

    stars.push({
      x: rand(),
      y,
      r: 0.6 + brilho * 1.2,
      opacity: Number(((0.22 + brilho * 0.55) * fade).toFixed(3)),
      twinkle: rand() < 0.22,
      delay: Number((rand() * 5).toFixed(2)),
      violet: rand() < 0.18,
    })
  }

  return stars
}
