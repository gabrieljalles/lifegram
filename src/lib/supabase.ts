import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * A nuvem e opcional por design. Sem as variaveis de ambiente o app roda
 * inteiro em modo local — util para testar e para quem nao quer conta.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export const PHOTO_BUCKET = 'exercise-photos'

/** Uma assinatura longa evita ficar re-assinando a cada abertura do app. */
export const SIGNED_URL_TTL = 60 * 60 * 24 * 365

export async function currentUser(): Promise<User | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data.user ?? null
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('Supabase nao configurado')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}
