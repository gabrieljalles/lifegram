import { describe, expect, it } from 'vitest'
import { makeStars } from './stars'

describe('makeStars', () => {
  it('a mesma semente devolve o mesmo ceu', () => {
    expect(makeStars({ seed: 42 })).toEqual(makeStars({ seed: 42 }))
  })

  it('sementes diferentes dao ceus diferentes', () => {
    expect(makeStars({ seed: 1 })).not.toEqual(makeStars({ seed: 2 }))
  })

  it('nasce tudo dentro da tela e acima do horizonte', () => {
    const horizon = 0.72
    for (const star of makeStars({ count: 200, horizon })) {
      expect(star.x).toBeGreaterThanOrEqual(0)
      expect(star.x).toBeLessThanOrEqual(1)
      expect(star.y).toBeGreaterThanOrEqual(0)
      expect(star.y).toBeLessThanOrEqual(horizon)
      expect(star.opacity).toBeGreaterThan(0)
      expect(star.opacity).toBeLessThanOrEqual(1)
      expect(star.r).toBeGreaterThan(0)
    }
  })

  it('concentra o ceu em cima, como pedido', () => {
    const stars = makeStars({ count: 400, horizon: 1 })
    const metadeDeCima = stars.filter((star) => star.y < 0.5).length
    expect(metadeDeCima / stars.length).toBeGreaterThan(0.65)
  })

  it('as de baixo sao mais apagadas que as de cima', () => {
    const stars = makeStars({ count: 400, horizon: 1 })
    const media = (lista: typeof stars) =>
      lista.reduce((soma, star) => soma + star.opacity, 0) / lista.length
    const cima = stars.filter((star) => star.y < 0.25)
    const baixo = stars.filter((star) => star.y > 0.6)
    expect(media(cima)).toBeGreaterThan(media(baixo))
  })

  it('so uma minoria pisca — nada de pisca-pisca', () => {
    const stars = makeStars({ count: 400 })
    const piscando = stars.filter((star) => star.twinkle).length
    expect(piscando / stars.length).toBeLessThan(0.35)
    expect(piscando).toBeGreaterThan(0)
  })
})
