import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Button,
  ExercisePhoto,
  Header,
  MUSCLE_LABEL,
  NumberField,
  Section,
} from '../../components/ui'
import { putExercise } from '../../lib/db'
import { invalidatePhotoURL, savePhotoLocally, usePhotoURL } from '../../lib/photo'
import { formatClock, formatWeight } from '../../lib/stats'
import { useApp } from '../../lib/store'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_REP_FLOOR,
  DEFAULT_REST_SECONDS,
  DEFAULT_WEIGHT_INCREMENT,
  MUSCLE_GROUPS,
  newId,
  nowISO,
  segmentsDuration,
  type Exercise,
  type ExerciseMeasure,
  type ExerciseSegment,
  type MuscleGroup,
} from '../../lib/types'

const REST_PRESETS = [45, 60, 90, 120, 180]

export default function ExerciseEditor() {
  const { exerciseId } = useParams()
  const navigate = useNavigate()
  const { exerciseById, reload } = useApp()
  const fileInput = useRef<HTMLInputElement>(null)

  const isNew = exerciseId === 'novo'
  const existing = !isNew && exerciseId ? exerciseById.get(exerciseId) : undefined

  const [name, setName] = useState('')
  const [group, setGroup] = useState<MuscleGroup>('outro')
  const [rest, setRest] = useState(DEFAULT_REST_SECONDS)
  const [notes, setNotes] = useState('')
  const [floor, setFloor] = useState(DEFAULT_REP_FLOOR)
  const [ceiling, setCeiling] = useState(DEFAULT_REP_CEILING)
  const [increment, setIncrement] = useState(DEFAULT_WEIGHT_INCREMENT)
  const [measure, setMeasure] = useState<ExerciseMeasure>('reps')
  const [segments, setSegments] = useState<ExerciseSegment[]>([])
  const [draft, setDraft] = useState<Exercise | null>(null)
  const [saving, setSaving] = useState(false)
  const [pasteNote, setPasteNote] = useState<string | null>(null)

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setGroup(existing.muscle_group)
      setRest(existing.default_rest_seconds)
      setNotes(existing.notes ?? '')
      setFloor(existing.rep_floor ?? DEFAULT_REP_FLOOR)
      setCeiling(existing.rep_ceiling ?? DEFAULT_REP_CEILING)
      setIncrement(existing.weight_increment ?? DEFAULT_WEIGHT_INCREMENT)
      setMeasure(existing.measure ?? 'reps')
      setSegments(existing.segments ?? [])
      setDraft(existing)
    }
  }, [existing?.id, existing?.photo_local_key])

  const photo = usePhotoURL(draft)

  /**
   * Ctrl+V com um print na area de transferencia vira a foto do exercicio.
   * Evita o caminho chato de salvar o print em arquivo so para depois procurar
   * ele no seletor.
   *
   * O ouvinte fica no documento porque o alvo do paste e onde esta o foco, e
   * aqui o foco costuma estar no campo de nome — nao na area da foto.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue
        const file = item.getAsFile()
        if (!file) continue
        event.preventDefault()
        void pickPhoto(file).then(() => setPasteNote('Imagem colada.'))
        return
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // Sem lista de dependencias de proposito: `pickPhoto` le o estado atual do
    // formulario, entao o ouvinte precisa ser o da renderizacao corrente.
  })

  /** O aviso da colagem some sozinho — nao e erro, e so confirmacao. */
  useEffect(() => {
    if (!pasteNote) return
    const timer = setTimeout(() => setPasteNote(null), 4000)
    return () => clearTimeout(timer)
  }, [pasteNote])

  /** Mesmo efeito do Ctrl+V, para quem esta no celular e nao tem teclado. */
  const pasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'))
        if (!type) continue
        await pickPhoto(new File([await item.getType(type)], 'colado.png', { type }))
        setPasteNote('Imagem colada.')
        return
      }
      setPasteNote('Não há imagem na área de transferência.')
    } catch {
      // Safari e navegadores sem permissao caem aqui: o Ctrl+V continua valendo.
      setPasteNote('Este navegador não deixa colar por botão — use Ctrl+V.')
    }
  }

  const pickPhoto = async (file: File) => {
    const id = draft?.id ?? existing?.id ?? newId()
    const key = await savePhotoLocally(id, file)
    invalidatePhotoURL(key)
    // Foto nova invalida a copia da nuvem: o sync sobe a versao atualizada.
    setDraft((current) => ({
      ...(current ??
        ({
          id,
          user_id: null,
          name,
          muscle_group: group,
          photo_url: null,
          photo_local_key: null,
          default_rest_seconds: rest,
          measure,
          segments,
          rep_floor: floor,
          rep_ceiling: ceiling,
          weight_increment: increment,
          notes: null,
          archived: false,
          updated_at: nowISO(),
        } as Exercise)),
      id,
      photo_local_key: key,
      photo_url: null,
    }))
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      alert('Dê um nome ao exercício.')
      return
    }
    setSaving(true)
    const id = draft?.id ?? existing?.id ?? newId()
    await putExercise({
      id,
      user_id: existing?.user_id ?? null,
      name: trimmed,
      muscle_group: group,
      photo_url: draft?.photo_url ?? existing?.photo_url ?? null,
      photo_local_key: draft?.photo_local_key ?? existing?.photo_local_key ?? null,
      default_rest_seconds: rest,
      measure,
      // Bloco so existe em exercicio de tempo: trocar para reps limpa a lista
      // em vez de deixar dado fantasma esperando para reaparecer.
      segments: measure === 'tempo' ? segments : [],
      rep_floor: floor,
      rep_ceiling: ceiling,
      weight_increment: increment,
      notes: notes.trim() || null,
      archived: false,
      updated_at: nowISO(),
    })
    await reload()
    setSaving(false)
    navigate(-1)
  }

  const archive = async () => {
    if (!existing) return
    if (!confirm(`Arquivar "${existing.name}"? O histórico continua nas estatísticas.`)) return
    await putExercise({ ...existing, archived: true, updated_at: nowISO() })
    await reload()
    navigate('/exercicios')
  }

  return (
    <div>
      <Header
        title={isNew ? 'Novo exercício' : 'Editar exercício'}
        back
        action={
          <Button size="sm" variant="go" onClick={save} disabled={saving}>
            Salvar
          </Button>
        }
      />

      <Section title="Foto">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="block w-full overflow-hidden rounded-2xl border border-dashed border-ink-600"
        >
          <ExercisePhoto url={photo} group={group} className="aspect-4/3 w-full" rounded="" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void pickPhoto(file)
            event.target.value = ''
          }}
        />
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
            Escolher arquivo
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void pasteFromClipboard()}>
            Colar imagem
          </Button>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          Tire uma foto do aparelho da sua academia — ou dê <strong>Ctrl+V</strong> com um print na
          área de transferência, sem precisar salvar o arquivo antes. A imagem é comprimida e
          funciona offline.
        </p>
        {pasteNote && (
          <p className="mt-1 px-1 text-[11px] font-semibold text-go-400">{pasteNote}</p>
        )}
      </Section>

      <Section title="Nome">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ex.: Supino reto com barra"
          className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <Section title="Grupo muscular">
        <div className="flex flex-wrap gap-1.5">
          {MUSCLE_GROUPS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setGroup(option)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === option ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300'
              }`}
            >
              {MUSCLE_LABEL[option]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Descanso padrão entre séries">
        <div className="flex flex-wrap gap-1.5">
          {REST_PRESETS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => setRest(seconds)}
              className={`tnum rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                rest === seconds ? 'bg-brand-600 text-white' : 'bg-ink-800 text-ink-300'
              }`}
            >
              {formatClock(seconds)}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] text-ink-400">
          O padrão do app é 1:30. Cada treino pode sobrescrever esse valor por exercício.
        </p>
      </Section>

      <Section title="Como medir">
        <div className="flex gap-2">
          {(['reps', 'tempo'] as ExerciseMeasure[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMeasure(option)
                // 8 a 12 SEGUNDOS nao e faixa de prancha nenhuma. Ao trocar de
                // modo, os padroes viram os da nova unidade — mas so quando os
                // valores ainda sao os de fabrica, para nao apagar sua escolha.
                if (option === 'tempo' && floor === DEFAULT_REP_FLOOR && ceiling === DEFAULT_REP_CEILING) {
                  setFloor(30)
                  setCeiling(60)
                }
                if (option === 'reps' && floor === 30 && ceiling === 60) {
                  setFloor(DEFAULT_REP_FLOOR)
                  setCeiling(DEFAULT_REP_CEILING)
                }
              }}
              className={`flex-1 rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                measure === option
                  ? 'border-brand-500 bg-brand-600/20 text-brand-300'
                  : 'border-ink-700 bg-ink-850 text-ink-400'
              }`}
            >
              {option === 'reps' ? 'Repetições' : 'Tempo (s)'}
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          {measure === 'reps'
            ? 'Você conta as repetições de cada série, como em supino ou rosca.'
            : 'A série é cronometrada — prancha, isometria, bicicleta. Na tela do treino aparece um cronômetro no lugar do contador de repetições.'}
        </p>
      </Section>

      {measure === 'tempo' && (
        <Section title="Blocos (exercício composto)">
          <SegmentEditor segments={segments} onChange={setSegments} />
        </Section>
      )}

      <Section title="Progressão">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label={measure === 'tempo' ? 'Tempo mínimo (s)' : 'Reps mínimas'}
            value={floor}
            min={1}
            max={600}
            onChange={(next) => {
              setFloor(next)
              // A faixa precisa ter largura: o ajuste recai sobre o OUTRO campo,
              // nunca sobre o numero que voce acabou de digitar.
              setCeiling((current) => (current <= next ? next + 1 : current))
            }}
          />
          <NumberField
            label={measure === 'tempo' ? 'Tempo máximo (s)' : 'Reps máximas'}
            value={ceiling}
            min={2}
            max={600}
            onChange={(next) => {
              setCeiling(next)
              setFloor((current) => (current >= next ? Math.max(1, next - 1) : current))
            }}
          />
        </div>
        <div className="mt-2">
          <NumberField
            label="Salto de carga (kg)"
            value={increment}
            min={0.5}
            max={50}
            step={0.5}
            decimals
            format={formatWeight}
            onChange={setIncrement}
          />
        </div>
        <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-400">
          Treine entre <strong className="tnum text-ink-300">{floor}</strong> e{' '}
          <strong className="tnum text-ink-300">{ceiling}</strong>{' '}
          {measure === 'tempo' ? 'segundos' : 'repetições'}. Bater {ceiling} em{' '}
          <em>todas</em> as séries sugere subir{' '}
          <strong className="tnum text-ink-300">{formatWeight(increment)} kg</strong>; cair abaixo
          de {floor} em qualquer série sugere baixar. Se o 1RM estimado estagnar por várias sessões
          dentro da faixa, o app sugere um treino mais leve para destravar o platô.
          {group === 'cardio' && ' Exercícios de cardio não recebem essas sugestões.'}
        </p>
        <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-ink-400">
          Ajuste o aumento ao equipamento: barra costuma pular de 2,5 em 2,5 kg (anilha de 1,25 de
          cada lado), halteres de 2 em 2, e máquina de pino de 5 em 5.
        </p>
      </Section>

      <Section title="Observações">
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Ex.: pegada fechada, banco no 3º furo"
          className="w-full resize-none rounded-xl border border-ink-700 bg-ink-850 px-3.5 py-3 text-sm outline-none focus:border-brand-500"
        />
      </Section>

      <div className="flex flex-col gap-2 px-4 pb-8 pt-2">
        <Button size="lg" variant="go" onClick={save} disabled={saving}>
          Salvar exercício
        </Button>
        {existing && (
          <Button variant="danger" onClick={archive}>
            Arquivar exercício
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Montagem dos blocos de um exercicio composto.
 *
 * A soma aparece o tempo todo porque e o numero que voce realmente quer
 * controlar: "meu intervalado tem que caber em 10 minutos".
 */
function SegmentEditor({
  segments,
  onChange,
}: {
  segments: ExerciseSegment[]
  onChange: (segments: ExerciseSegment[]) => void
}) {
  const total = segmentsDuration(segments)

  const update = (index: number, patch: Partial<ExerciseSegment>) =>
    onChange(segments.map((segment, i) => (i === index ? { ...segment, ...patch } : segment)))

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= segments.length) return
    const next = [...segments]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div>
      {segments.length === 0 ? (
        <p className="px-1 text-[11px] leading-relaxed text-ink-400">
          Sem blocos, a série é uma contagem única (prancha de 40 s, por exemplo). Adicione blocos
          para montar um intervalado — o app percorre a sequência sozinho, avisando a cada troca.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {segments.map((segment, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850 p-2.5"
            >
              <span className="tnum w-5 shrink-0 text-center text-xs font-bold text-ink-400">
                {index + 1}
              </span>
              <input
                value={segment.label}
                onChange={(event) => update(index, { label: event.target.value })}
                placeholder="Tiro forte"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-2 text-sm outline-none focus:border-brand-500"
              />
              <input
                type="text"
                inputMode="numeric"
                value={String(segment.seconds)}
                onChange={(event) => {
                  const parsed = Number.parseInt(event.target.value.replace(/\D/g, ''), 10)
                  update(index, { seconds: Number.isFinite(parsed) ? parsed : 0 })
                }}
                aria-label={`Segundos do bloco ${index + 1}`}
                className="tnum w-16 shrink-0 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-center text-sm font-semibold outline-none focus:border-brand-500"
              />
              <span className="shrink-0 text-[11px] text-ink-400">s</span>
              <div className="flex shrink-0 flex-col">
                <button
                  type="button"
                  aria-label={`Subir bloco ${index + 1}`}
                  onClick={() => move(index, -1)}
                  className="px-1 text-xs text-ink-400 active:text-ink-100"
                >
                  ▲
                </button>
                <button
                  type="button"
                  aria-label={`Descer bloco ${index + 1}`}
                  onClick={() => move(index, 1)}
                  className="px-1 text-xs text-ink-400 active:text-ink-100"
                >
                  ▼
                </button>
              </div>
              <button
                type="button"
                aria-label={`Remover bloco ${index + 1}`}
                onClick={() => onChange(segments.filter((_, i) => i !== index))}
                className="shrink-0 px-1.5 text-sm text-fire-400"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...segments, { label: `Bloco ${segments.length + 1}`, seconds: 30 }])}
        >
          + Bloco
        </Button>
        {segments.length > 0 && (
          <span className="tnum text-xs text-ink-400">
            Série completa: {formatClock(total)}
          </span>
        )}
      </div>
    </div>
  )
}
