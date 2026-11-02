/**
 * Exportar e importar por categoria. O backup completo continua existindo
 * (todas as categorias de uma vez); aqui da para mandar so o plano de treino
 * para uma IA reescrever e trazer de volta sem encostar no historico.
 *
 * Regras do plano de treino (o caso que motivou isto):
 * - O arquivo vence: o que vier nele sobrescreve, mesmo que a IA tenha
 *   mantido o updated_at antigo (por data, o import nao aplicaria nada).
 * - Exercicio com o mesmo nome de um que voce ja tem vira o seu: o historico,
 *   os PRs e a progressao continuam no mesmo exercicio.
 * - Ids inventados pela IA ("ex-supino") viram UUID novo, com as referencias
 *   ajustadas, para a nuvem aceitar.
 * - Modo "trocar": treinos atuais fora do arquivo sao arquivados (o historico
 *   das sessoes fica); modo "somar": so entra o que veio.
 */

import { db, enqueue, getSettings, putSettings, type Backup } from './db'
import {
  DEFAULT_REP_CEILING,
  DEFAULT_REP_FLOOR,
  DEFAULT_REST_SECONDS,
  DEFAULT_SETTINGS,
  DEFAULT_WEIGHT_INCREMENT,
  MUSCLE_GROUPS,
  newId,
  nowISO,
  type Exercise,
  type ID,
  type Routine,
  type RoutineExercise,
  type SyncTable,
  type Weekday,
} from './types'

export type CategoryId =
  'plano' | 'historico' | 'peso' | 'coragem' | 'agenda' | 'financeiro' | 'ajustes'

export interface Category {
  id: CategoryId
  label: string
  hint: string
  tables: SyncTable[]
}

export const CATEGORIES: Category[] = [
  {
    id: 'plano',
    label: 'Plano de treino',
    hint: 'Treinos da semana, exercícios e metas de séries',
    tables: ['exercises', 'routines', 'routine_exercises'],
  },
  {
    id: 'historico',
    label: 'Histórico de treinos',
    hint: 'Sessões feitas e séries registradas',
    tables: ['sessions', 'set_logs'],
  },
  { id: 'peso', label: 'Peso corporal', hint: 'Pesagens do dia', tables: ['body_weight_logs'] },
  {
    id: 'coragem',
    label: 'Coragem',
    hint: 'Metas, tentativas, nãos e trilha',
    tables: [
      'courage_goals',
      'courage_attempts',
      'courage_score_changes',
      'courage_rejections',
      'courage_track_steps',
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda',
    hint: 'Atividades e o que foi feito',
    tables: ['activities', 'activity_logs'],
  },
  {
    id: 'financeiro',
    label: 'Financeiro',
    hint: 'Compras, vendas e cotações',
    tables: ['investment_buys', 'investment_quotes', 'investment_sales'],
  },
  { id: 'ajustes', label: 'Preferências', hint: 'Descanso, impostos e afins', tables: [] },
]

export const ALL_CATEGORIES: CategoryId[] = CATEGORIES.map((c) => c.id)

export type TransferFile = Omit<Partial<Backup>, 'version'> & {
  version?: number
  exported_at?: string
  /** Categorias que o arquivo traz (versao 3). Ausente = backup antigo, completo. */
  categories?: CategoryId[]
  /** Explicacao do formato, para a IA que for editar o arquivo. */
  leia_me?: string
}

const PLAN_README =
  'Plano de treino do app Lifegram. Para criar ou mudar o plano: edite "routines" ' +
  '(treinos; scheduled_days usa 0=domingo ... 6=sábado), "routine_exercises" (cada ' +
  'exercício dentro de um treino: routine_id, exercise_id, position, target_sets, ' +
  'target_reps, target_weight em kg, rest_seconds ou null) e "exercises" (name, ' +
  `muscle_group entre ${MUSCLE_GROUPS.join(', ')}; measure "reps" ou "tempo"). ` +
  'Mantenha o mesmo nome dos exercícios que já existem para não perder o progresso. ' +
  'Ids novos podem ser qualquer texto único (ex.: "ex-supino"), o app troca por UUID. ' +
  'Campos ausentes recebem o padrão do app.'

/** Categorias que um arquivo traz de fato (com algum dado). */
export function categoriesIn(file: TransferFile): CategoryId[] {
  return CATEGORIES.filter((category) => {
    if (category.id === 'ajustes') return Boolean(file.settings)
    return category.tables.some((table) => (file[table]?.length ?? 0) > 0)
  }).map((category) => category.id)
}

export function fileName(categories: CategoryId[], date = new Date()): string {
  const day = date.toISOString().slice(0, 10)
  const all = ALL_CATEGORIES.every((id) => categories.includes(id))
  const slug = all ? 'backup' : categories.join('-')
  return `lifegram-${slug}-${day}.json`
}

export async function exportCategories(categories: CategoryId[]): Promise<TransferFile> {
  const database = await db()
  const out: TransferFile = { version: 3, exported_at: nowISO(), categories }
  for (const category of CATEGORIES) {
    if (!categories.includes(category.id)) continue
    if (category.id === 'ajustes') out.settings = await getSettings()
    for (const table of category.tables) {
      ;(out as Record<string, unknown>)[table] = await database.getAll(table)
    }
  }
  if (categories.includes('plano')) {
    out.leia_me = PLAN_README
    // So o que esta em uso: arquivados poluem o arquivo que vai para a IA.
    const routines = (out.routines ?? []).filter((r) => !r.archived)
    const live = new Set(routines.map((r) => r.id))
    out.routines = routines
    out.routine_exercises = (out.routine_exercises ?? []).filter((re) => live.has(re.routine_id))
    // Exercicios: os usados nos treinos ativos + os nao arquivados.
    const used = new Set(out.routine_exercises.map((re) => re.exercise_id))
    out.exercises = (out.exercises ?? []).filter((e) => !e.archived || used.has(e.id))
  }
  return out
}

export type PlanMode = 'somar' | 'trocar'

export interface ImportResult {
  applied: number
  /** Exercicios do arquivo que viraram um exercicio que voce ja tinha. */
  matchedByName: number
  /** Treinos arquivados no modo "trocar". */
  archivedRoutines: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * Prepara o plano do arquivo para entrar no banco: completa campos, troca ids
 * que nao sao UUID, casa exercicios pelo nome e carimba updated_at agora (o
 * arquivo vence). Pura, para dar para testar sem IndexedDB.
 */
export function preparePlan(
  file: TransferFile,
  localExercises: Exercise[],
  stamp: string = nowISO(),
): {
  exercises: Exercise[]
  routines: Routine[]
  routine_exercises: RoutineExercise[]
  matchedByName: number
} {
  const exerciseIds = new Map<ID, ID>()
  const routineIds = new Map<ID, ID>()
  const byName = new Map(localExercises.map((e) => [normalizeName(e.name), e]))
  const byId = new Map(localExercises.map((e) => [e.id, e]))
  const fresh = (id: unknown) => (typeof id === 'string' && UUID.test(id) ? id : newId())

  let matchedByName = 0
  const exercises: Exercise[] = []
  for (const raw of (file.exercises ?? []) as Array<Partial<Exercise>>) {
    const name = String(raw.name ?? '').trim()
    if (!name) continue
    const sourceId = String(raw.id ?? name)
    const sameId = typeof raw.id === 'string' ? byId.get(raw.id) : undefined
    const sameName = byName.get(normalizeName(name))
    if (!sameId && sameName) {
      // Ja existe com outro id: usa o seu (historico intacto) e so desarquiva.
      exerciseIds.set(sourceId, sameName.id)
      matchedByName++
      if (sameName.archived) exercises.push({ ...sameName, archived: false, updated_at: stamp })
      continue
    }
    const base = sameId
    const id = base ? base.id : fresh(raw.id)
    exerciseIds.set(sourceId, id)
    const measure = raw.measure === 'tempo' ? 'tempo' : 'reps'
    const group = MUSCLE_GROUPS.includes(raw.muscle_group as never)
      ? (raw.muscle_group as Exercise['muscle_group'])
      : (base?.muscle_group ?? 'outro')
    exercises.push({
      id,
      user_id: base?.user_id ?? null,
      name,
      muscle_group: group,
      // Foto mora no aparelho/Storage: o arquivo nunca apaga a sua.
      photo_url: base?.photo_url ?? null,
      photo_local_key: base?.photo_local_key ?? null,
      default_rest_seconds: num(
        raw.default_rest_seconds,
        base?.default_rest_seconds ?? DEFAULT_REST_SECONDS,
      ),
      measure,
      segments: Array.isArray(raw.segments) ? raw.segments : (base?.segments ?? []),
      rep_floor: num(raw.rep_floor, base?.rep_floor ?? DEFAULT_REP_FLOOR),
      rep_ceiling: num(raw.rep_ceiling, base?.rep_ceiling ?? DEFAULT_REP_CEILING),
      weight_increment: num(
        raw.weight_increment,
        base?.weight_increment ?? DEFAULT_WEIGHT_INCREMENT,
      ),
      notes: typeof raw.notes === 'string' ? raw.notes : (base?.notes ?? null),
      archived: raw.archived === true,
      updated_at: stamp,
    })
  }

  const routines: Routine[] = []
  ;((file.routines ?? []) as Array<Partial<Routine>>).forEach((raw, index) => {
    const name = String(raw.name ?? '').trim()
    if (!name) return
    const id = fresh(raw.id)
    routineIds.set(String(raw.id ?? name), id)
    routines.push({
      id,
      user_id: null,
      name,
      position: num(raw.position, index),
      scheduled_days: (Array.isArray(raw.scheduled_days) ? raw.scheduled_days : []).filter(
        (d): d is Weekday => Number.isInteger(d) && d >= 0 && d <= 6,
      ),
      archived: raw.archived === true,
      updated_at: stamp,
    })
  })

  // Exercicio citado pelo id local (sem estar no "exercises" do arquivo) vale.
  const exerciseOf = (ref: unknown): ID | undefined => {
    const key = String(ref ?? '')
    return exerciseIds.get(key) ?? (byId.has(key) ? key : undefined)
  }
  const routine_exercises: RoutineExercise[] = []
  for (const raw of (file.routine_exercises ?? []) as Array<Partial<RoutineExercise>>) {
    const routine_id = routineIds.get(String(raw.routine_id ?? ''))
    const exercise_id = exerciseOf(raw.exercise_id)
    if (!routine_id || !exercise_id) continue
    routine_exercises.push({
      id: fresh(raw.id),
      routine_id,
      exercise_id,
      position: num(raw.position, routine_exercises.length),
      target_sets: num(raw.target_sets, 3),
      target_reps: num(raw.target_reps, DEFAULT_REP_FLOOR),
      target_weight: num(raw.target_weight, 0),
      rest_seconds: typeof raw.rest_seconds === 'number' ? raw.rest_seconds : null,
      updated_at: stamp,
    })
  }
  return { exercises, routines, routine_exercises, matchedByName }
}

/** Importa so as categorias escolhidas. */
export async function importCategories(
  file: TransferFile,
  categories: CategoryId[],
  planMode: PlanMode = 'somar',
): Promise<ImportResult> {
  const database = await db()
  const result: ImportResult = { applied: 0, matchedByName: 0, archivedRoutines: 0 }

  if (categories.includes('ajustes') && file.settings) {
    const local = await getSettings()
    if (local.updated_at < file.settings.updated_at) {
      await putSettings({ ...DEFAULT_SETTINGS, ...file.settings })
      result.applied++
    }
  }

  if (categories.includes('plano')) {
    const stamp = nowISO()
    const plan = preparePlan(file, await database.getAll('exercises'), stamp)
    result.matchedByName = plan.matchedByName
    const incoming = new Set(plan.routines.map((r) => r.id))

    // Treino que veio no arquivo fica exatamente com a lista do arquivo.
    for (const re of await database.getAll('routine_exercises')) {
      if (incoming.has(re.routine_id)) {
        await database.delete('routine_exercises', re.id)
        await enqueue('routine_exercises', re.id, 'delete')
      }
    }
    if (planMode === 'trocar') {
      for (const routine of await database.getAll('routines')) {
        if (!incoming.has(routine.id) && !routine.archived) {
          await database.put('routines', { ...routine, archived: true, updated_at: stamp })
          await enqueue('routines', routine.id)
          result.archivedRoutines++
        }
      }
    }
    for (const [table, rows] of [
      ['exercises', plan.exercises],
      ['routines', plan.routines],
      ['routine_exercises', plan.routine_exercises],
    ] as const) {
      for (const row of rows) {
        await database.put(table, row as never)
        await enqueue(table, row.id)
        result.applied++
      }
    }
  }

  // Demais categorias: mescla por updated_at, o mais recente vence (historico
  // nunca e apagado nem rebaixado por um arquivo velho).
  for (const category of CATEGORIES) {
    if (category.id === 'plano' || !categories.includes(category.id)) continue
    for (const table of category.tables) {
      const rows = (file[table] ?? []) as Array<{ id: ID; updated_at: string }>
      for (const row of rows) {
        const local = await database.get(table, row.id)
        if (!local || (local as { updated_at: string }).updated_at < row.updated_at) {
          await database.put(table, row as never)
          await enqueue(table, row.id)
          result.applied++
        }
      }
    }
  }
  return result
}
