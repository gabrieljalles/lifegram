import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PRCelebration from '../../components/PRCelebration'
import { Button, Header } from '../../components/ui'
import { GoalBar } from '../../components/courage-ui'
import {
  addRejection,
  masterSteps,
  registerTrackAttempt,
  skipTrackStep,
} from '../../lib/courageActions'
import { isCalibrated, PACE_LABEL, pacesFromAnswers } from '../../lib/trackCalibration'
import {
  baseNeeds,
  CARISMA,
  creditOf,
  currentStepId,
  didToday,
  levelingOffer,
  levelingSkips,
  neededFor,
  needsWarmup,
  flatSteps,
  progressByStep,
  stepStatus,
  trackProgress,
  type Rating,
  type StepStatus,
  type TrackChapter,
  type TrackStep,
} from '../../lib/tracks'
import { useApp } from '../../lib/store'
import { vibrate } from '../../lib/timer'
import type { CourageTrackStep } from '../../lib/types'

/**
 * O mapa da trilha: um caminho que desce, um degrau de cada vez.
 *
 * O desenho vem de uma unica conta — cada no fica em
 * `x = centro + amplitude * sin(i * PI / 3)`, `y = i * GAP` — e a mesma conta
 * alimenta a curva de fundo em SVG e a posicao dos circulos. Ter uma fonte so
 * para as duas coisas e o que impede a linha de descolar dos nos.
 */

const GAP = 104
const AMPLITUDE = 78
const NODE = 60
/** Largura fixa do caminho: SVG e nos dividem o mesmo sistema de pixels. */
const WIDTH = 320
/** Respiro extra antes de cada capitulo, onde mora o titulo dele. */
const CHAPTER_GAP = 52
/** Espaco no topo para o titulo do primeiro capitulo. */
const TOP = 56

const nodeX = (index: number) => WIDTH / 2 + Math.sin((index * Math.PI) / 3) * AMPLITUDE

/**
 * Altura de cada no, ja contando o respiro dos capitulos. Calcular por indice
 * puro (i * GAP) fazia o titulo de um capitulo cair em cima do nome do degrau
 * anterior.
 */
function layoutY(chapterIds: string[]): number[] {
  const ys: number[] = []
  let cursor = TOP + NODE / 2
  chapterIds.forEach((chapter, i) => {
    if (i > 0) cursor += GAP
    if (i > 0 && chapterIds[i - 1] !== chapter) cursor += CHAPTER_GAP
    ys.push(cursor)
  })
  return ys
}

/** Curva em S entre nos vizinhos: o caminho serpenteia em vez de quebrar em quinas. */
function pathFor(ys: number[]): string {
  return ys
    .map((y, i) => {
      const x = nodeX(i)
      if (i === 0) return `M${x.toFixed(1)} ${y}`
      const px = nodeX(i - 1)
      const py = ys[i - 1]
      const mid = (y - py) / 2
      return `C${px.toFixed(1)} ${py + mid} ${x.toFixed(1)} ${y - mid} ${x.toFixed(1)} ${y}`
    })
    .join(' ')
}

export default function CourageTrack() {
  const navigate = useNavigate()
  const { courageTrackSteps, courageRejections, settings, reload } = useApp()
  const [aberto, setAberto] = useState<{
    step: TrackStep
    chapter: TrackChapter
    index: number
    /** Aberto como teste de nivelamento: o desafio final, fora da vez. */
    teste?: boolean
  } | null>(null)
  const openStep = aberto?.step ?? null
  const [celebration, setCelebration] = useState<{ label: string; detail: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const currentNode = useRef<HTMLButtonElement>(null)

  const steps = useMemo(() => flatSteps(CARISMA), [])
  const progress = useMemo(
    () => progressByStep(courageTrackSteps, CARISMA.id),
    [courageTrackSteps],
  )
  const atual = currentStepId(CARISMA, courageTrackSteps)
  const resumo = trackProgress(CARISMA, courageTrackSteps)
  const fezHoje = didToday(courageTrackSteps, CARISMA.id)
  const abrir = (index: number) => setAberto({ ...steps[index], index })

  // O ritmo de cada capitulo sai da calibracao; o resto da adaptacao vem das
  // avaliacoes guardadas em cada nivel.
  const paces = useMemo(() => pacesFromAnswers(settings.track_answers), [settings.track_answers])
  const calibrada = isCalibrated(settings.track_answers)
  const teste = levelingOffer(CARISMA, courageTrackSteps, paces)
  const baseOf = (step: TrackStep) => baseNeeds(CARISMA, courageTrackSteps, step.id, paces)

  // Abre no degrau da vez: quem chega no mapa quer ver o que fazer hoje, nao o
  // que ja fez. Sem isso a trilha longa abriria sempre no primeiro degrau.
  useEffect(() => {
    const node = currentNode.current
    const box = scroller.current
    if (!node || !box) return
    box.scrollTo({ top: Math.max(0, node.offsetTop - box.clientHeight / 2), behavior: 'auto' })
  }, [atual])

  const rowOf = (step: TrackStep): CourageTrackStep | undefined => progress.get(step.id)

  /**
   * Toda execucao conta. Nao existe "nao rolou": ter ido ja e a vitoria do
   * nivel. Quando a execucao terminou num nao, ela conta igual e ainda entra
   * no contador de nao — o nao vira faixa em vez de virar vergonha.
   */
  const registrar = async (
    step: TrackStep,
    chapter: TrackChapter,
    rating: Rating,
    ouviuNao: boolean,
    isTeste: boolean,
  ) => {
    if (busy) return
    setBusy(true)
    try {
      const { justCompleted } = await registerTrackAttempt(
        courageTrackSteps,
        CARISMA.id,
        step.id,
        rating,
        baseOf(step),
      )
      if (ouviuNao) {
        await addRejection(`Trilha · ${step.name}`)
      }

      // Teste de nivelamento: facil no desafio final fecha o capitulo inteiro
      // (menos os pontos fracos). Qualquer outra resposta tambem vale — o
      // capitulo so segue no ritmo rapido.
      if (isTeste) {
        const dominados =
          rating === 'facil'
            ? await masterSteps(
                courageTrackSteps,
                CARISMA.id,
                levelingSkips(chapter, courageTrackSteps, CARISMA.id),
              )
            : 0
        await reload()
        vibrate(80)
        setAberto(null)
        setCelebration(
          dominados > 0
            ? { label: 'Capítulo dominado!', detail: `${chapter.name} · ${dominados} níveis` }
            : { label: 'Teste feito!', detail: 'O capítulo segue no ritmo rápido' },
        )
        return
      }

      await reload()
      vibrate(60)

      if (justCompleted) {
        setAberto(null)
        setCelebration({
          label: 'Nível conquistado!',
          detail: step.name,
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const pular = async (step: TrackStep) => {
    if (busy) return
    setBusy(true)
    try {
      await skipTrackStep(courageTrackSteps, CARISMA.id, step.id)
      await reload()
      setAberto(null)
    } finally {
      setBusy(false)
    }
  }

  const ys = useMemo(() => layoutY(steps.map(({ chapter }) => chapter.id)), [steps])
  // Ultimo no + o nome dele embaixo.
  const alturaTotal = (ys[ys.length - 1] ?? 0) + NODE / 2 + 56

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      {celebration && (
        <PRCelebration
          label={celebration.label}
          detail={celebration.detail}
          onDone={() => setCelebration(null)}
        />
      )}

      <Header
        title={CARISMA.name}
        subtitle={`Nível ${Math.min(resumo.closed + 1, resumo.total)} de ${resumo.total}`}
        back="/coragem"
      />

      <div className="shrink-0 px-4 pb-3 pt-1">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px]">
          <span className="tnum text-ink-400">{resumo.closed} conquistados</span>
          {/* A meta e um passo por dia: o selo diz se o de hoje ja foi. */}
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              fezHoje ? 'bg-go-500/15 text-go-400' : 'bg-fire-500/15 text-fire-400'
            }`}
          >
            {fezHoje ? '✓ Hoje você já avançou' : 'Falta o passo de hoje'}
          </span>
        </div>
        <GoalBar value={resumo.closed} target={resumo.total} />
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
          {resumo.currentChapter
            ? `${resumo.currentChapter.icon} ${resumo.currentChapter.name} — ${resumo.currentChapter.note ?? CARISMA.blurb}`
            : 'Trilha inteira concluída. O carisma agora é rotina.'}
        </p>

        {!calibrada ? (
          <button
            type="button"
            onClick={() => navigate('/coragem/mapa/calibrar')}
            className="mt-2.5 w-full rounded-2xl border border-brand-500/50 bg-brand-600/15 px-3 py-2.5 text-left"
          >
            <span className="block text-sm font-bold text-brand-200">Calibrar a trilha para você</span>
            <span className="block text-[11px] text-ink-300">
              14 perguntas rápidas. O que já é fácil anda mais rápido, o que trava vai com calma.
            </span>
          </button>
        ) : (
          teste && (
            <button
              type="button"
              onClick={() => setAberto({ ...teste, teste: true })}
              className="mt-2.5 w-full rounded-2xl border border-go-500/50 bg-go-500/10 px-3 py-2.5 text-left"
            >
              <span className="block text-sm font-bold text-go-400">
                🎯 Teste de nivelamento: {teste.chapter.name}
              </span>
              <span className="block text-[11px] text-ink-300">
                Faça o desafio final ({teste.step.name}). Se for fácil, o capítulo inteiro fecha.
              </span>
            </button>
          )
        )}
      </div>

      <div ref={scroller} className="relative flex-1 overflow-y-auto px-4 pb-24">
        <div className="relative mx-auto" style={{ width: WIDTH, height: alturaTotal }}>
          {/* Curva de fundo ligando os nos, desenhada da mesma conta deles. */}
          <svg
            className="pointer-events-none absolute inset-0"
            width={WIDTH}
            height={alturaTotal}
            viewBox={`0 0 ${WIDTH} ${alturaTotal}`}
            aria-hidden="true"
          >
            <path
              d={pathFor(ys)}
              fill="none"
              stroke="#1f2b3d"
              strokeWidth="10"
              strokeLinecap="round"
            />
          </svg>

          {steps.map(({ step, chapter }, index) => {
            const row = rowOf(step)
            const status = stepStatus(step, row, atual)
            const abreCapitulo = index === 0 || steps[index - 1].chapter.id !== chapter.id

            return (
              <div key={step.id}>
                {abreCapitulo && (
                  <p
                    className="absolute left-0 right-0 text-center text-[10px] font-semibold uppercase tracking-widest text-ink-500"
                    style={{ top: ys[index] - NODE / 2 - 34 }}
                  >
                    {chapter.icon} {chapter.name}
                    {paces[chapter.id] && paces[chapter.id] !== 'completo' && (
                      <span className="ml-1.5 normal-case tracking-normal text-brand-300">
                        {PACE_LABEL[paces[chapter.id]]}
                      </span>
                    )}
                  </p>
                )}

                <StepNode
                  ref={status === 'atual' ? currentNode : undefined}
                  index={index}
                  y={ys[index]}
                  step={step}
                  status={status}
                  row={row}
                  needs={status === 'atual' ? neededFor(baseOf(step), row) : step.needs}
                  onOpen={() => abrir(index)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {aberto && openStep && (
        <StepSheet
          step={openStep}
          chapter={aberto.chapter}
          index={aberto.index}
          row={rowOf(openStep)}
          status={stepStatus(openStep, rowOf(openStep), atual)}
          needs={neededFor(baseOf(openStep), rowOf(openStep))}
          teste={Boolean(aberto.teste)}
          aquecimento={
            needsWarmup(rowOf(openStep)) && aberto.index > 0
              ? { index: aberto.index, name: steps[aberto.index - 1].step.name }
              : null
          }
          busy={busy}
          rejections={courageRejections.length}
          onClose={() => setAberto(null)}
          onDone={(rating, ouviuNao) =>
            void registrar(openStep, aberto.chapter, rating, ouviuNao, Boolean(aberto.teste))
          }
          onSkip={() => void pular(openStep)}
        />
      )}

      {!openStep && atual && (
        <div className="safe-b shrink-0 border-t border-ink-800 bg-ink-900 px-4 pb-3 pt-3">
          <Button
            className="w-full"
            size="lg"
            variant="go"
            onClick={() => {
              const index = steps.findIndex(({ step }) => step.id === atual)
              if (index >= 0) abrir(index)
            }}
          >
            {fezHoje ? 'Continuar' : 'Fazer o passo de hoje'}
          </Button>
        </div>
      )}

      {!atual && (
        <div className="safe-b shrink-0 border-t border-ink-800 bg-ink-900 px-4 pb-3 pt-3">
          <Button className="w-full" size="lg" variant="outline" onClick={() => navigate('/coragem')}>
            Voltar para os objetivos
          </Button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ no */

const StepNode = ({
  ref,
  index,
  y,
  step,
  status,
  row,
  needs,
  onOpen,
}: {
  ref?: React.Ref<HTMLButtonElement>
  index: number
  y: number
  step: TrackStep
  status: StepStatus
  row: CourageTrackStep | undefined
  /** Execucoes que o nivel pede agora, ja adaptadas. */
  needs: number
  onOpen: () => void
}) => {
  // Cinza = ainda nao chegou a vez; aceso = e agora; roxo cheio = conquistado.
  // Pulado entra roxo esmaecido, para nao mentir que foi treinado.
  const visual: Record<StepStatus, string> = {
    feito: 'border-brand-500 bg-brand-600 text-white',
    pulado: 'border-brand-500/40 bg-brand-600/30 text-brand-200',
    atual: 'border-brand-400 bg-ink-850 text-brand-200',
    bloqueado: 'border-ink-700 bg-ink-800 text-ink-500',
  }

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={`${step.name} — ${status}`}
      className="absolute flex flex-col items-center"
      style={{
        left: nodeX(index),
        top: y - NODE / 2,
        transform: 'translateX(-50%)',
        width: 132,
      }}
    >
      <span
        className={`relative flex items-center justify-center rounded-full border-4 font-extrabold transition ${visual[status]} ${
          status === 'atual' ? 'animate-glow' : ''
        } ${index + 1 >= 100 ? 'text-sm' : 'text-lg'}`}
        style={{ width: NODE, height: NODE }}
      >
        {status === 'feito' ? '✓' : status === 'pulado' ? '↷' : index + 1}

        {/* Anel em segmentos: um por execucao, aceso a cada uma feita. */}
        {status === 'atual' && <ProgressRing needs={needs} done={Math.min(creditOf(row), needs)} />}

        {(step.bold || step.esteem) && status !== 'feito' && (
          <span
            className={`absolute -right-1.5 -top-1.5 text-sm ${status === 'bloqueado' ? 'opacity-40' : ''}`}
            aria-hidden="true"
          >
            {step.bold ? '🔥' : '💜'}
          </span>
        )}
      </span>

      <span
        className={`mt-1 line-clamp-2 rounded bg-ink-900/85 px-1 text-center text-[10px] leading-tight ${
          status === 'bloqueado' ? 'text-ink-500' : 'text-ink-300'
        }`}
      >
        {step.name}
      </span>

    </button>
  )
}

/** Raio do anel: fora da borda do circulo, com folga para o brilho. */
const RING_R = NODE / 2 + 7
const RING_SIZE = RING_R * 2 + 8

function arc(startDeg: number, endDeg: number): string {
  const c = RING_SIZE / 2
  const toXY = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return `${(c + RING_R * Math.cos(rad)).toFixed(2)} ${(c + RING_R * Math.sin(rad)).toFixed(2)}`
  }
  const large = endDeg - startDeg > 180 ? 1 : 0
  return `M${toXY(startDeg)} A${RING_R} ${RING_R} 0 ${large} 1 ${toXY(endDeg)}`
}

/**
 * Progresso do nivel na borda do circulo, como no Duolingo: com 1 de 3 feito,
 * um terco do anel acende. Com uma execucao so, o anel e inteiro e acende de
 * uma vez.
 */
function ProgressRing({ needs, done }: { needs: number; done: number }) {
  const gap = needs > 1 ? 14 : 0
  const slice = 360 / needs
  const c = RING_SIZE / 2

  return (
    <svg
      className="pointer-events-none absolute"
      width={RING_SIZE}
      height={RING_SIZE}
      style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
      aria-hidden="true"
    >
      {needs === 1 ? (
        <circle
          cx={c}
          cy={c}
          r={RING_R}
          fill="none"
          strokeWidth="5"
          stroke={done >= 1 ? 'var(--color-brand-400)' : 'var(--color-ink-700)'}
        />
      ) : (
        Array.from({ length: needs }, (_, i) => (
          <path
            key={i}
            d={arc(i * slice + gap / 2, (i + 1) * slice - gap / 2)}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke={i < done ? 'var(--color-brand-400)' : 'var(--color-ink-700)'}
          />
        ))
      )}
    </svg>
  )
}

/* --------------------------------------------------------------- folha */

function StepSheet({
  step,
  chapter,
  index,
  row,
  status,
  needs,
  teste,
  aquecimento,
  busy,
  rejections,
  onClose,
  onDone,
  onSkip,
}: {
  step: TrackStep
  chapter: TrackChapter
  index: number
  row: CourageTrackStep | undefined
  status: StepStatus
  needs: number
  teste: boolean
  aquecimento: { index: number; name: string } | null
  busy: boolean
  rejections: number
  onClose: () => void
  onDone: (rating: Rating, ouviuNao: boolean) => void
  onSkip: () => void
}) {
  const feitas = Math.min(creditOf(row), needs)
  const fechado = status === 'feito' || status === 'pulado'
  const podeFazer = teste || status === 'atual'
  const [ouviuNao, setOuviuNao] = useState(false)
  // A marca de nao vale para uma execucao so: limpa depois de enviar.
  const enviar = (rating: Rating) => {
    onDone(rating, ouviuNao)
    setOuviuNao(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink-950/70 backdrop-blur-sm">
      <button type="button" aria-label="Fechar" className="flex-1" onClick={onClose} />

      <div className="safe-b animate-rise rounded-t-3xl border-t border-ink-700 bg-ink-900 px-5 pb-5 pt-4">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-700" aria-hidden="true" />

        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-500">
          Nível {index + 1} · {chapter.icon} {chapter.name}
          {step.bold && <span className="ml-1.5 text-fire-400">🔥 ousado</span>}
          {step.esteem && <span className="ml-1.5 text-brand-300">💜 autoestima</span>}
        </p>
        {teste && (
          <p className="mt-2 rounded-xl border border-go-500/40 bg-go-500/10 px-3 py-2 text-[11px] leading-relaxed text-go-400">
            🎯 Teste de nivelamento. Se for fácil, os níveis abertos do capítulo fecham como
            dominados. Se não for, tudo bem: a execução conta e o capítulo segue no ritmo rápido.
          </p>
        )}
        <h2 className="mt-1 text-lg font-bold leading-tight">{step.name}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-200">{step.what}</p>
        <p className="mt-2 text-xs leading-relaxed text-ink-400">{step.why ?? chapter.note}</p>

        <div className="mt-3 flex items-center gap-2">
          {Array.from({ length: needs }, (_, i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${i < feitas ? 'bg-go-500' : 'bg-ink-800'}`}
            />
          ))}
          <span className="tnum text-xs font-semibold text-ink-300">
            {feitas}/{needs}
          </span>
        </div>

        {aquecimento && podeFazer && (
          <p className="mt-3 rounded-xl border border-brand-500/40 bg-brand-600/10 px-3 py-2 text-[11px] leading-relaxed text-brand-200">
            Está pesado, e isso é normal. Antes da próxima, refaça como aquecimento o nível{' '}
            {aquecimento.index} ({aquecimento.name}). Ele não conta, só te prepara.
          </p>
        )}

        {step.rejectionLinked && (
          <p className="mt-3 rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-[11px] leading-relaxed text-ink-300">
            Aqui um não pode acontecer, e tudo bem: a execução vale igual. Ele também entra no
            seu contador ({rejections} até agora) — <strong>e a abordagem acaba ali</strong>.
          </p>
        )}

        {fechado ? (
          <div className="mt-4">
            <p className="mb-3 text-center text-sm font-semibold text-go-400">
              {status === 'feito' ? 'Nível conquistado 🎉' : 'Você marcou como já normal'}
            </p>
            <Button className="w-full" variant="ghost" onClick={onClose}>
              Fechar
            </Button>
          </div>
        ) : (
          <>
            {!podeFazer ? (
              <p className="mt-4 rounded-xl bg-ink-850 px-3 py-2.5 text-center text-xs text-ink-400">
                Este nível acende quando você chegar nele. Um passo de cada vez.
              </p>
            ) : (
              <div className="mt-4">
                {step.rejectionLinked && (
                  <label className="mb-3 flex items-center gap-2 text-xs text-ink-300">
                    <input
                      type="checkbox"
                      checked={ouviuNao}
                      onChange={(e) => setOuviuNao(e.target.checked)}
                      className="h-4 w-4 accent-brand-500"
                    />
                    Ouvi um não (vale igual e entra no contador)
                  </label>
                )}
                {/* Um toque so: a avaliacao ja e o registro da execucao. */}
                <p className="mb-2 text-center text-sm font-bold text-ink-100">Fiz! Como foi?</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="lg" variant="go" disabled={busy} onClick={() => enviar('facil')}>
                    Fácil
                  </Button>
                  <Button size="lg" disabled={busy} onClick={() => enviar('normal')}>
                    Normal
                  </Button>
                  <Button size="lg" variant="outline" disabled={busy} onClick={() => enviar('dificil')}>
                    Difícil
                  </Button>
                </div>
                <p className="mt-2 text-center text-[10px] leading-relaxed text-ink-500">
                  Fácil vale por duas execuções. Difícil acrescenta uma, no máximo 3. Toda execução conta.
                </p>
              </div>
            )}

            {status === 'atual' && !teste && (
              <button
                type="button"
                onClick={onSkip}
                disabled={busy}
                className="mt-3 w-full text-center text-[11px] font-semibold text-ink-400"
              >
                Isso já é normal para mim — pular
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
