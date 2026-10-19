import { addDays, addMinutes, format, parseISO } from 'date-fns'
import { dayKey, occursOn } from './activities'
import { metaGet, metaSet, putActivity } from './db'
import type { Activity, Weekday } from './types'
import { nowISO } from './types'

/**
 * Espelho das atividades no Google Agenda.
 *
 * Mao unica: o app e a fonte da verdade e o Google so recebe — assim o
 * celular avisa na hora marcada sem o app precisar de servidor de push.
 *
 * Dois caminhos:
 * - Com um Client ID (digitado no app ou VITE_GOOGLE_CLIENT_ID): login Google
 *   no navegador (Google Identity Services) e cada atividade vira um evento,
 *   atualizado a cada mudanca.
 * - Sem configuracao: o link "adicionar ao Google Agenda" de cada atividade,
 *   que abre o evento ja preenchido para salvar a mao.
 */

const ENV_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const API = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

/**
 * Client ID digitado no proprio app. Nao e segredo — o Google o expoe em toda
 * pagina que faz login —, entao fica no aparelho e manda sobre o da build.
 */
const CLIENT_ID_KEY = 'gcal:client_id'

export function gcalClientId(): string | null {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)
    if (stored) return stored
  } catch {
    // Sem storage: sobra o da build.
  }
  return ENV_CLIENT_ID || null
}

/** O Client ID OAuth de aplicativo web sempre termina assim. */
export const isValidClientId = (id: string) => /^[\w-]+\.apps\.googleusercontent\.com$/.test(id)

/** Troca (ou apaga, com null) a chave: a sessao da chave anterior cai junto. */
export async function setGcalClientId(id: string | null) {
  await disconnectGcal()
  try {
    if (id) localStorage.setItem(CLIENT_ID_KEY, id.trim())
    else localStorage.removeItem(CLIENT_ID_KEY)
  } catch {
    throw new Error('Este navegador não deixa salvar a chave.')
  }
}

/** A chave veio do app (e pode ser trocada la) ou da build. */
export function gcalClientIdFromApp(): boolean {
  try {
    return localStorage.getItem(CLIENT_ID_KEY) !== null
  } catch {
    return false
  }
}

export const isGcalConfigured = (): boolean => gcalClientId() !== null

/** Token guardado por aparelho, com validade (o do Google dura ~1 h). */
const TOKEN_KEY = 'gcal:token'
/** Versao (updated_at) de cada atividade ja enviada: so reenvia o que mudou. */
const SYNCED_KEY = 'gcal:synced'

interface StoredToken {
  access_token: string
  expires_at: number
}

const BYDAY: Record<Weekday, string> = { 0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA' }

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/* ----------------------------------------------------------- o evento */

/** Primeiro dia em que a atividade acontece: o Google exige comecar nele. */
export function firstDay(activity: Activity): string | null {
  if (activity.kind === 'esporadica') return activity.date
  if (activity.days.length === 0) return null
  let date = parseISO(activity.starts_on)
  for (let i = 0; i < 7; i++, date = addDays(date, 1)) {
    if (occursOn(activity, date)) return dayKey(date)
  }
  return null
}

export function rruleOf(activity: Activity): string | null {
  if (activity.kind !== 'recorrente' || activity.days.length === 0) return null
  const days = [...activity.days].sort((a, b) => a - b).map((d) => BYDAY[d])
  return `RRULE:FREQ=WEEKLY;BYDAY=${days.join(',')}`
}

type EventTime = { date: string } | { dateTime: string; timeZone: string }

function span(activity: Activity, day: string): { start: EventTime; end: EventTime } {
  if (!activity.time) {
    return {
      start: { date: day },
      end: { date: dayKey(addDays(parseISO(day), 1)) },
    }
  }
  const start = parseISO(`${day}T${activity.time}:00`)
  const end = addMinutes(start, activity.duration_minutes)
  const tz = timeZone()
  return {
    start: { dateTime: format(start, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
    end: { dateTime: format(end, "yyyy-MM-dd'T'HH:mm:ss"), timeZone: tz },
  }
}

export function toEvent(activity: Activity) {
  const day = firstDay(activity)
  if (!day) return null
  const rrule = rruleOf(activity)
  return {
    summary: `${activity.icon} ${activity.title}`,
    description: 'Missão do Lifegram. Marque como feita no app para ganhar XP.',
    ...span(activity, day),
    ...(rrule ? { recurrence: [rrule] } : {}),
    extendedProperties: { private: { lifegram_id: activity.id } },
  }
}

/** Link que abre o evento preenchido no Google Agenda, sem login no app. */
export function templateUrl(activity: Activity): string | null {
  const day = firstDay(activity)
  if (!day) return null
  const compact = (iso: string) => iso.replace(/[-:]/g, '')
  const { start, end } = span(activity, day)
  const dates =
    'date' in start && 'date' in end
      ? `${compact(start.date)}/${compact(end.date)}`
      : `${compact((start as { dateTime: string }).dateTime)}/${compact((end as { dateTime: string }).dateTime)}`
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${activity.icon} ${activity.title}`,
    dates,
    ctz: timeZone(),
    details: 'Missão do Lifegram.',
  })
  const rrule = rruleOf(activity)
  if (rrule) params.set('recur', rrule)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/* -------------------------------------------------------------- login */

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
}

interface GoogleOAuth {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (response: TokenResponse) => void
        error_callback?: (error: { type: string }) => void
      }): { requestAccessToken(options?: { prompt?: string }): void }
      revoke(token: string, done?: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleOAuth
  }
}

let gisPromise: Promise<GoogleOAuth> | null = null

function loadGis(): Promise<GoogleOAuth> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google)
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Google indisponível')))
      script.onerror = () => {
        gisPromise = null
        reject(new Error('Não deu para carregar o login do Google. Está online?'))
      }
      document.head.appendChild(script)
    })
  }
  return gisPromise
}

function readToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const token = JSON.parse(raw) as StoredToken
    // Margem de um minuto: nao comecar um envio com token prestes a vencer.
    return token.expires_at - 60_000 > Date.now() ? token : null
  } catch {
    return null
  }
}

/** Ja conectou alguma vez neste aparelho (mesmo com o token vencido). */
export function gcalLinked(): boolean {
  try {
    return localStorage.getItem(TOKEN_KEY) !== null
  } catch {
    return false
  }
}

export const gcalTokenValid = (): boolean => readToken() !== null

/**
 * Pede o token ao Google. Precisa vir de um toque do usuario: fora disso o
 * navegador bloqueia a janela de login.
 */
export async function connectGcal(): Promise<void> {
  const clientId = gcalClientId()
  if (!clientId) throw new Error('Google Agenda não configurado: falta o Client ID.')
  const google = await loadGis()
  const token = await new Promise<StoredToken>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) return reject(new Error(response.error ?? 'Login cancelado.'))
        resolve({
          access_token: response.access_token,
          expires_at: Date.now() + (response.expires_in ?? 3600) * 1000,
        })
      },
      error_callback: (error) =>
        reject(new Error(error.type === 'popup_closed' ? 'Login cancelado.' : 'Login do Google falhou.')),
    })
    client.requestAccessToken({ prompt: gcalLinked() ? '' : 'consent' })
  })
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(token))
  } catch {
    // Sem storage: o token vale so ate fechar a aba.
    memoryToken = token
  }
}

let memoryToken: StoredToken | null = null

export async function disconnectGcal() {
  const token = readToken() ?? memoryToken
  memoryToken = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // nada a limpar
  }
  if (token && window.google) window.google.accounts.oauth2.revoke(token.access_token)
}

/* -------------------------------------------------------------- envio */

class AuthExpired extends Error {}

async function call(token: string, method: string, url: string, body?: unknown): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (response.status === 401) throw new AuthExpired('Sessão do Google expirou.')
  return response
}

export interface GcalResult {
  created: number
  updated: number
  removed: number
  /** Sem token valido: precisa tocar em "conectar" de novo. */
  needsLogin: boolean
  error?: string
}

/**
 * Espelha as atividades (inclusive arquivadas, que somem do Google). So
 * envia o que mudou desde o ultimo envio deste aparelho.
 */
export async function syncGcal(activities: Activity[]): Promise<GcalResult> {
  const result: GcalResult = { created: 0, updated: 0, removed: 0, needsLogin: false }
  const token = (readToken() ?? memoryToken)?.access_token
  if (!token) return { ...result, needsLogin: true }

  const synced = (await metaGet<Record<string, string>>(SYNCED_KEY)) ?? {}

  try {
    for (const activity of activities) {
      if (synced[activity.id] === activity.updated_at) continue
      const event = activity.archived ? null : toEvent(activity)
      let eventId = activity.gcal_event_id

      if (!event) {
        if (eventId) {
          const response = await call(token, 'DELETE', `${API}/${eventId}`)
          // 404/410: ja tinha sido apagado no Google — mesmo resultado.
          if (!response.ok && response.status !== 404 && response.status !== 410) {
            throw new Error(`Google respondeu ${response.status}`)
          }
          result.removed++
          eventId = null
        }
      } else {
        let response = eventId
          ? await call(token, 'PUT', `${API}/${eventId}`, event)
          : null
        if (response && (response.status === 404 || response.status === 410)) response = null
        if (response) {
          if (!response.ok) throw new Error(`Google respondeu ${response.status}`)
          result.updated++
        } else {
          response = await call(token, 'POST', API, event)
          if (!response.ok) throw new Error(`Google respondeu ${response.status}`)
          eventId = ((await response.json()) as { id: string }).id
          result.created++
        }
      }

      let stamp = activity.updated_at
      if (eventId !== activity.gcal_event_id) {
        stamp = nowISO()
        await putActivity({ ...activity, gcal_event_id: eventId, updated_at: stamp })
      }
      synced[activity.id] = stamp
      await metaSet(SYNCED_KEY, synced)
    }
  } catch (error) {
    if (error instanceof AuthExpired) {
      try {
        localStorage.removeItem(TOKEN_KEY)
      } catch {
        // ignora
      }
      memoryToken = null
      return { ...result, needsLogin: true }
    }
    result.error = error instanceof Error ? error.message : String(error)
  }
  return result
}
