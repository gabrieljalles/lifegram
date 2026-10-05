import { describe, expect, it } from 'vitest'
import {
  CARISMA,
  baseNeeds,
  currentStepId,
  didToday,
  levelingOffer,
  levelingSkips,
  neededFor,
  needsWarmup,
  emptyRow,
  flatSteps,
  progressByStep,
  registerAttempt,
  skipStep,
  stepStatus,
  trackProgress,
} from './tracks'
import { CALIBRATION, isCalibrated, pacesFromAnswers } from './trackCalibration'
import type { CourageTrackStep } from './types'

const row = (step_id: string, patch: Partial<CourageTrackStep> = {}): CourageTrackStep => ({
  ...emptyRow(step_id, null, 'carisma', step_id),
  ...patch,
})

const primeiros = flatSteps(CARISMA).map(({ step }) => step.id)

describe('catálogo da trilha', () => {
  it('tem 500 níveis em 20 capítulos de 25', () => {
    expect(primeiros).toHaveLength(500)
    expect(CARISMA.chapters).toHaveLength(20)
    for (const chapter of CARISMA.chapters) expect(chapter.steps).toHaveLength(25)
  })

  it('ids únicos, título e descrição escritos, de 1 a 3 execuções', () => {
    expect(new Set(primeiros).size).toBe(primeiros.length)
    for (const { step, chapter } of flatSteps(CARISMA)) {
      expect(step.name.length).toBeGreaterThan(2)
      expect(step.what.length).toBeGreaterThan(15)
      expect([1, 2, 3]).toContain(step.needs)
      // Sem motivo próprio, a folha mostra a nota do capítulo.
      expect((step.why ?? chapter.note ?? '').length).toBeGreaterThan(10)
    }
  })

  it('começa no olhar e termina no convite', () => {
    expect(CARISMA.chapters[0].id).toBe('olhar')
    expect(primeiros[0]).toBe('olhar-01')
    expect(primeiros[primeiros.length - 1]).toBe('convite-25')
  })

  it('o começo é tranquilo: nada ousado nem com risco de não nos 20 primeiros', () => {
    for (const { step } of flatSteps(CARISMA).slice(0, 20)) {
      expect(step.bold).toBe(false)
      expect(step.rejectionLinked).toBe(false)
    }
  })
})

describe('registerAttempt', () => {
  it('fecha o degrau exatamente ao atingir as tentativas certas', () => {
    let atual = row('olhar-sorriso')
    atual = registerAttempt(atual, 'normal', 3)
    atual = registerAttempt(atual, 'normal', 3)
    expect(atual.completed_at).toBeNull()
    atual = registerAttempt(atual, 'normal', 3)
    expect(atual.completed_at).not.toBeNull()
    expect(atual.done).toBe(3)
  })

  it('fácil vale por duas execuções', () => {
    const atual = registerAttempt(row('olhar-02'), 'facil', 2)
    expect(atual.done).toBe(1)
    expect(atual.easy).toBe(1)
    expect(atual.completed_at).not.toBeNull()
  })

  it('a primeira difícil pede uma a mais, nunca passando de 3', () => {
    let atual = registerAttempt(row('x'), 'dificil', 1)
    expect(atual.completed_at).toBeNull()
    expect(neededFor(1, atual)).toBe(2)
    atual = registerAttempt(atual, 'dificil', 1)
    expect(neededFor(1, atual)).toBe(2)
    expect(atual.completed_at).not.toBeNull()
    expect(neededFor(3, { ...atual, hard: 5 })).toBe(3)
  })

  it('marco de uma tentativa fecha na primeira que dá certo', () => {
    expect(registerAttempt(row('receber-nao'), 'normal', 1).completed_at).not.toBeNull()
  })

  it('degrau fechado não reabre nem conta mais nada', () => {
    const fechado = registerAttempt(row('olhar-sorriso'), 'normal', 1)
    const depois = registerAttempt(fechado, 'normal', 1)
    expect(depois).toBe(fechado)
  })

  it('conseguir depois de ter pulado transforma pulado em feito', () => {
    const pulado = skipStep(row('voz'))
    expect(pulado.skipped_at).not.toBeNull()
    const feito = registerAttempt(pulado, 'normal', 1)
    expect(feito.completed_at).not.toBeNull()
    expect(feito.skipped_at).toBeNull()
  })
})

describe('caminho linear', () => {
  it('o atual é o primeiro degrau ainda aberto', () => {
    expect(currentStepId(CARISMA, [])).toBe(primeiros[0])
  })

  it('concluir um degrau acende o seguinte', () => {
    const feito = registerAttempt(row(primeiros[0]), 'normal', 1)
    expect(currentStepId(CARISMA, [feito])).toBe(primeiros[1])
  })

  it('pular também avança o caminho', () => {
    expect(currentStepId(CARISMA, [skipStep(row(primeiros[0]))])).toBe(primeiros[1])
  })

  it('degrau em andamento continua sendo o atual', () => {
    const emProgresso = registerAttempt(row(primeiros[0]), 'normal', 3)
    expect(currentStepId(CARISMA, [emProgresso])).toBe(primeiros[0])
  })

  it('status separa feito, pulado, atual e bloqueado', () => {
    const rows = [registerAttempt(row(primeiros[0]), 'normal', 1), skipStep(row(primeiros[1]))]
    const mapa = progressByStep(rows, 'carisma')
    const atual = currentStepId(CARISMA, rows)
    const steps = flatSteps(CARISMA).map(({ step }) => step)

    expect(stepStatus(steps[0], mapa.get(steps[0].id), atual)).toBe('feito')
    expect(stepStatus(steps[1], mapa.get(steps[1].id), atual)).toBe('pulado')
    expect(stepStatus(steps[2], mapa.get(steps[2].id), atual)).toBe('atual')
    expect(stepStatus(steps[3], mapa.get(steps[3].id), atual)).toBe('bloqueado')
  })
})

describe('trackProgress', () => {
  it('conta concluídos e pulados separados, mas ambos fecham o degrau', () => {
    const rows = [registerAttempt(row(primeiros[0]), 'normal', 1), skipStep(row(primeiros[1]))]
    const p = trackProgress(CARISMA, rows)
    expect(p.completed).toBe(1)
    expect(p.skipped).toBe(1)
    expect(p.closed).toBe(2)
    expect(p.total).toBe(primeiros.length)
    expect(p.currentId).toBe(primeiros[2])
    expect(p.currentChapter?.id).toBe('olhar')
  })

  it('trilha vazia começa em 0%', () => {
    expect(trackProgress(CARISMA, []).percent).toBe(0)
  })

  it('ignora progresso de outra trilha', () => {
    const outra = { ...row(primeiros[0]), track_id: 'outra' }
    expect(trackProgress(CARISMA, [outra]).closed).toBe(0)
  })
})

describe('didToday', () => {
  const hoje = new Date(2026, 9, 5, 15)

  it('execução de hoje conta', () => {
    const feita = { ...row(primeiros[0]), done: 1, updated_at: new Date(2026, 9, 5, 9).toISOString() }
    expect(didToday([feita], 'carisma', hoje)).toBe(true)
  })

  it('execução de ontem não conta', () => {
    const ontem = { ...row(primeiros[0]), done: 1, updated_at: new Date(2026, 9, 4, 22).toISOString() }
    expect(didToday([ontem], 'carisma', hoje)).toBe(false)
  })

  it('pular hoje não conta como passo do dia', () => {
    const pulado = { ...skipStep(row(primeiros[0])), updated_at: new Date(2026, 9, 5, 9).toISOString() }
    expect(didToday([pulado], 'carisma', hoje)).toBe(false)
  })
})

/* ------------------------------------------------------------ adaptação */

const capitulo = (id: string) => CARISMA.chapters.find((c) => c.id === id)!
const fechado = (step_id: string, rating: 'facil' | 'normal' | 'dificil') =>
  registerAttempt(row(step_id), rating, 1)

describe('baseNeeds', () => {
  const ids = capitulo('olhar').steps.map((s) => s.id)

  it('sem calibração, o nível pede o que está escrito', () => {
    expect(baseNeeds(CARISMA, [], ids[0], {})).toBe(capitulo('olhar').steps[0].needs)
  })

  it('ritmo rápido corta pela metade, arredondando para cima', () => {
    const tres = capitulo('olhar').steps.findIndex((s) => s.needs === 3)
    expect(baseNeeds(CARISMA, [], ids[tres], { olhar: 'rapido' })).toBe(2)
  })

  it('dois níveis anteriores fáceis: o próximo pede 1', () => {
    const rows = [fechado(ids[0], 'facil'), fechado(ids[1], 'facil')]
    expect(baseNeeds(CARISMA, rows, ids[2], {})).toBe(1)
  })

  it('um fácil só não muda nada', () => {
    const rows = [fechado(ids[0], 'normal'), fechado(ids[1], 'facil')]
    expect(baseNeeds(CARISMA, rows, ids[2], {})).toBe(capitulo('olhar').steps[2].needs)
  })

  it('o embalo não atravessa capítulos', () => {
    const rows = ids.slice(0, 25).map((id) => fechado(id, 'facil'))
    const primeiroDoProximo = capitulo('cumprimentos').steps[0]
    expect(baseNeeds(CARISMA, rows, primeiroDoProximo.id, {})).toBe(primeiroDoProximo.needs)
  })
})

describe('needsWarmup', () => {
  it('difícil duas vezes sugere aquecimento', () => {
    const r = registerAttempt(registerAttempt(row('x'), 'dificil', 3), 'dificil', 3)
    expect(needsWarmup(r)).toBe(true)
    expect(needsWarmup(registerAttempt(row('x'), 'dificil', 3))).toBe(false)
  })
})

describe('teste de nivelamento', () => {
  const ateElas = flatSteps(CARISMA)
    .filter(({ chapter }) => CARISMA.chapters.indexOf(chapter) < CARISMA.chapters.indexOf(capitulo('elas')))
    .map(({ step }) => fechado(step.id, 'normal'))

  it('é oferecido no começo de um capítulo marcado para teste', () => {
    const oferta = levelingOffer(CARISMA, ateElas, { elas: 'nivelamento' })
    expect(oferta?.chapter.id).toBe('elas')
    expect(oferta?.step.id).toBe('elas-25')
  })

  it('não aparece em capítulo sem teste', () => {
    expect(levelingOffer(CARISMA, ateElas, { elas: 'rapido' })).toBeNull()
  })

  it('some depois de tentado', () => {
    const tentado = [...ateElas, fechado('elas-25', 'normal')]
    expect(levelingOffer(CARISMA, tentado, { elas: 'nivelamento' })).toBeNull()
  })

  it('passar fecha o capítulo, menos os pontos fracos e o próprio desafio', () => {
    const skips = levelingSkips(capitulo('elas'), ateElas, 'carisma')
    expect(skips).not.toContain('elas-25')
    for (const step of capitulo('elas').steps.filter((s) => s.keep)) {
      expect(skips).not.toContain(step.id)
    }
    expect(skips.length).toBe(24 - capitulo('elas').steps.filter((s) => s.keep).length)
  })
})

describe('calibração', () => {
  // As respostas da entrevista de ponto de partida.
  const respostas: Record<string, number> = {
    olhar: 0, cumprimento: 2, pedidos: 2, voz: 0, balcao: 2, elogios: 2, assunto: 0,
    ousadia: 0, duracao: 1, historias: 1, grupos: 2, neutro: 2, atracao: 0, historico: 0,
  }

  it('gera o ritmo combinado para cada capítulo', () => {
    const paces = pacesFromAnswers(respostas)
    expect(paces.olhar).toBe('completo')
    expect(paces.cumprimentos).toBe('rapido')
    expect(paces.pedidos).toBe('nivelamento')
    expect(paces.grupos).toBe('nivelamento')
    expect(paces.elas).toBe('nivelamento')
    expect(paces.flerte).toBe('completo')
    expect(paces.convite).toBe('completo')
  })

  it('só conta como calibrada com todas as respostas', () => {
    expect(isCalibrated(undefined)).toBe(false)
    expect(isCalibrated({ olhar: 0 })).toBe(false)
    expect(isCalibrated(respostas)).toBe(true)
  })

  it('toda pergunta aponta para capítulos que existem', () => {
    const ids = new Set(CARISMA.chapters.map((c) => c.id))
    for (const q of CALIBRATION) for (const c of Object.keys(q.chapters)) expect(ids.has(c)).toBe(true)
  })
})

describe('autoestima', () => {
  it('40 níveis espalhados, dois por capítulo', () => {
    for (const c of CARISMA.chapters) expect(c.steps.filter((s) => s.esteem)).toHaveLength(2)
  })
})
