import { describe, expect, it } from 'vitest'
import { encodeWidgetCode, sha256Hex, widgetLink } from './widget'

const decode = (code: string) =>
  JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(code.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ),
  )

describe('codigo do widget', () => {
  it('leva url, chave e token e cabe num link sem escapar nada', () => {
    const code = encodeWidgetCode('https://abc.supabase.co', 'sb_publishable_x?y', 'tok_ç+/')
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decode(code)).toEqual({
      u: 'https://abc.supabase.co',
      k: 'sb_publishable_x?y',
      t: 'tok_ç+/',
    })
    expect(widgetLink(code)).toBe(`lifegram-widget://setup?c=${code}`)
  })

  it('o hash bate com o sha256 que o Postgres calcula', async () => {
    // select encode(sha256(convert_to('abc', 'UTF8')), 'hex')
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
