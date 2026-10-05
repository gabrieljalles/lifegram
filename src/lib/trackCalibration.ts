import type { Pace } from './tracks'

/**
 * Calibracao da trilha: as mesmas perguntas da entrevista de ponto de partida.
 *
 * Cada pergunta cobre um ou mais capitulos, e cada opcao diz o ritmo que eles
 * ganham. Sem resposta, o capitulo fica completo — na duvida, o caminho mais
 * gradual e o que nao frustra.
 */

export interface CalibrationQuestion {
  id: string
  question: string
  /** Quatro opcoes, da mais travada para a mais solta. */
  options: [string, string, string, string]
  /** Ritmo de cada capitulo para cada opcao, na mesma ordem das opcoes. */
  chapters: Record<string, [Pace, Pace, Pace, Pace]>
}

const C: Pace = 'completo'
const R: Pace = 'rapido'
const N: Pace = 'nivelamento'

/** O padrao das perguntas: so quem marca a ultima opcao pula por teste. */
const usual: [Pace, Pace, Pace, Pace] = [C, C, R, N]
/** Para o que ja e forte com pouca pratica: a terceira opcao ja vai a teste. */
const strong: [Pace, Pace, Pace, Pace] = [C, R, N, N]

export const CALIBRATION: CalibrationQuestion[] = [
  {
    id: 'olhar',
    question: 'Quando você cruza o olhar com um desconhecido na rua:',
    options: ['Desvio na hora', 'Seguro, sem sorrir', 'Sorrio às vezes', 'É natural'],
    chapters: { olhar: usual },
  },
  {
    id: 'cumprimento',
    question: 'Cumprimentar desconhecidos (porteiro, caixa, motorista):',
    options: ['Evito', 'Só respondo', 'Começo às vezes', 'Faço sempre'],
    chapters: { cumprimentos: usual, gentilezas: usual },
  },
  {
    id: 'pedidos',
    question: 'Pedir algo a um desconhecido (as horas, um caminho, uma foto):',
    options: ['Muito desconforto', 'Só a funcionários', 'Pouco desconforto', 'Nenhum'],
    chapters: { pedidos: strong },
  },
  {
    id: 'voz',
    question: 'Sua voz e sua postura numa interação:',
    options: ['Me pedem para repetir', 'Ok, mas evito ligar', 'Confortável', 'Seguro'],
    chapters: { voz: usual },
  },
  {
    id: 'balcao',
    question: 'Com atendentes, até onde vai a conversa?',
    options: ['Só o necessário', 'Respondo o papo', 'Puxo às vezes', 'Converso bem'],
    chapters: { balcao: usual },
  },
  {
    id: 'elogios',
    question: 'Elogiar alguém sem travar:',
    options: ['Quase nunca elogio', 'Só amigos e família', 'Coisas de desconhecidos', 'Desconhecidos, até mulheres'],
    chapters: { 'elogio-coisas': usual, 'elogio-pessoas': [C, C, R, R] },
  },
  {
    id: 'assunto',
    question: 'Puxar assunto do nada com um desconhecido:',
    options: ['Nunca faço', 'Raramente', 'Às vezes', 'Com frequência'],
    chapters: { assunto: usual },
  },
  {
    id: 'ousadia',
    question: 'Comer ou ir a evento sozinho, dançar, karaokê, perguntar em palestra:',
    options: ['Nenhuma', 'Uma ou duas', 'A maioria', 'Todas'],
    chapters: { ousadias: usual },
  },
  {
    id: 'duracao',
    question: 'Uma conversa com alguém que acabou de conhecer dura:',
    options: ['Segundos', 'Um ou dois minutos', 'Cinco minutos ou mais', 'O quanto eu quiser'],
    chapters: { conversa: usual, escuta: usual },
  },
  {
    id: 'historias',
    question: 'Contar histórias e fazer as pessoas rirem:',
    options: ['Travo', 'Só com íntimos', 'Com conhecidos', 'Com qualquer um'],
    chapters: { historias: usual, humor: usual },
  },
  {
    id: 'grupos',
    question: 'Em grupo (roda de amigos, reunião, aula):',
    options: ['Fico calado', 'Só se perguntarem', 'Participo', 'Puxo o grupo'],
    chapters: { grupos: strong },
  },
  {
    id: 'neutro',
    question: 'Falar com uma mulher sem intenção romântica:',
    options: ['Travo até assim', 'Ok se for prático', 'Converso normal', 'Tranquilo'],
    chapters: { elas: strong },
  },
  {
    id: 'atracao',
    question: 'E quando a mulher te atrai?',
    options: ['Não consigo falar', 'Falo se ela começar', 'Converso, sem mostrar', 'Mostro interesse'],
    chapters: { 'com-ela': usual, flerte: usual },
  },
  {
    id: 'historico',
    question: 'Sua experiência com flerte e convites:',
    options: ['Nenhuma', 'Só por app', 'Poucas vezes', 'Já saí com algumas'],
    // O fim da trilha nunca vai a teste: e o objetivo, nao um pre-requisito.
    chapters: { cantadas: [C, C, C, R], convite: [C, C, C, R] },
  },
]

/** Ritmo de cada capitulo a partir das respostas. Sem resposta, nada muda. */
export function pacesFromAnswers(answers: Record<string, number> | undefined): Record<string, Pace> {
  const paces: Record<string, Pace> = {}
  if (!answers) return paces
  for (const q of CALIBRATION) {
    const option = answers[q.id]
    if (option === undefined || option < 0 || option > 3) continue
    for (const [chapter, byOption] of Object.entries(q.chapters)) {
      paces[chapter] = byOption[option]
    }
  }
  return paces
}

export const isCalibrated = (answers: Record<string, number> | undefined): boolean =>
  Boolean(answers) && CALIBRATION.every((q) => answers![q.id] !== undefined)

export const PACE_LABEL: Record<Pace, string> = {
  completo: 'completo',
  rapido: '⚡ rápido',
  nivelamento: '🎯 teste',
}
