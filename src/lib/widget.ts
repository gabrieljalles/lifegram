/**
 * Widget de frases no Android (pasta android-widget). O app do widget nao faz
 * login: ele recebe daqui um codigo que so serve para LER as suas frases, pela
 * funcao widget_phrases (migracao 016). Gerar um codigo novo invalida o antigo.
 */

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase'

/** Onde o APK fica publicado, junto com o proprio Lifegram. */
export const WIDGET_APK_URL = '/lifegram-widget.apk'

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** O codigo que o app do widget le: JSON {u, k, t} em base64url. */
export function encodeWidgetCode(url: string, key: string, token: string): string {
  return base64Url(new TextEncoder().encode(JSON.stringify({ u: url, k: key, t: token })))
}

/** Link que abre o app do widget ja com o codigo. */
export const widgetLink = (code: string) => `lifegram-widget://setup?c=${code}`

/**
 * O mesmo link no formato que o Chrome do Android abre com seguranca. Tem que
 * ser um toque de verdade num link: redirecionar sozinho o Chrome bloqueia.
 */
export const widgetIntentLink = (code: string) =>
  `intent://setup?c=${code}#Intent;scheme=lifegram-widget;package=app.lifegram.widget;end`

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Gera um codigo novo para o widget e guarda so o hash dele na nuvem. */
export async function createWidgetCode(): Promise<string> {
  if (!supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Nuvem não configurada.')
  const { data } = await supabase.auth.getSession()
  const userId = data.session?.user.id
  if (!userId) throw new Error('Entre na sua conta (Ajustes) para conectar o widget.')

  const token = base64Url(crypto.getRandomValues(new Uint8Array(24)))
  const { error } = await supabase
    .from('widget_tokens')
    .upsert(
      { user_id: userId, token_hash: await sha256Hex(token), created_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) {
    throw new Error(
      error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta rodar supabase/migrations/016_widget.sql no Supabase.'
        : error.message,
    )
  }
  return encodeWidgetCode(SUPABASE_URL, SUPABASE_ANON_KEY, token)
}
