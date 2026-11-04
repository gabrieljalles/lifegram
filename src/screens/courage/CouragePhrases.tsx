import { useRef, useState } from 'react'
import { Button, Card, Header, Section } from '../../components/ui'
import { confirmDialog } from '../../lib/dialog'
import { addPhrase, deletePhrase, updatePhrase } from '../../lib/motivation'
import { isSupabaseConfigured } from '../../lib/supabase'
import { useApp } from '../../lib/store'
import type { MotivationPhrase } from '../../lib/types'
import { WIDGET_APK_URL, createWidgetCode, widgetIntentLink } from '../../lib/widget'

/**
 * Suas frases: o que voce escreve aqui aparece no topo da tela Hoje, uma por
 * vez, trocando a cada visita.
 */
export default function CouragePhrases() {
  const { motivationPhrases, reload } = useApp()
  const [editing, setEditing] = useState<MotivationPhrase | null>(null)

  return (
    <div className="pb-6">
      <Header
        title="Minhas frases"
        subtitle={
          motivationPhrases.length === 0
            ? 'Mensagens que te marcaram'
            : `${motivationPhrases.length} ${motivationPhrases.length === 1 ? 'frase' : 'frases'} · uma por vez na tela Hoje`
        }
        back="/coragem"
      />

      <Section title={editing ? 'Editar frase' : 'Nova frase'}>
        <PhraseForm
          key={editing?.id ?? 'nova'}
          initial={editing}
          onCancel={editing ? () => setEditing(null) : undefined}
          onSave={async (text, author) => {
            if (editing) await updatePhrase(editing, text, author)
            else await addPhrase(text, author)
            setEditing(null)
            await reload()
          }}
        />
      </Section>

      {motivationPhrases.length > 0 && (
        <Section title="Guardadas">
          <div className="flex flex-col gap-2">
            {motivationPhrases.map((phrase) => (
              <Card key={phrase.id} className="p-3.5">
                <p className="whitespace-pre-line text-sm font-semibold leading-snug text-ink-100">
                  “{phrase.text}”
                </p>
                {phrase.author && <p className="mt-1 text-xs text-ink-400">— {phrase.author}</p>}
                <div className="mt-2.5 flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(phrase)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (
                        !(await confirmDialog({
                          title: 'Apagar esta frase?',
                          message: 'Ela deixa de aparecer na tela Hoje.',
                          confirmLabel: 'Apagar',
                          danger: true,
                        }))
                      )
                        return
                      if (editing?.id === phrase.id) setEditing(null)
                      await deletePhrase(phrase)
                      await reload()
                    }}
                  >
                    Apagar
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}

      <Section title="Widget no Android">
        <WidgetSetup />
      </Section>
    </div>
  )
}

/**
 * Leva as frases para a tela inicial do Android: baixa o app do widget e
 * conecta com um codigo que so le as frases.
 */
function WidgetSetup() {
  const { userEmail } = useApp()
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const connect = async () => {
    if (busy) return
    setBusy(true)
    setNote(null)
    try {
      setCode(await createWidgetCode())
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'Não deu para gerar o código.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      setNote('Código copiado. No app Lifegram Frases, toque em Colar e conectar.')
    } catch {
      setNote('Não deu para copiar: segure no código abaixo e copie.')
    }
  }

  return (
    <Card className="p-4">
      <p className="text-sm leading-relaxed text-ink-300">
        Uma frase sua na tela inicial do celular, nova a cada desbloqueio. Toque no widget para
        trocar.
      </p>
      <ol className="mt-3 flex flex-col gap-1 text-sm text-ink-100">
        <li>1. Baixe e instale o app do widget.</li>
        <li>2. Volte aqui, toque em Conectar widget e depois em Abrir no app do widget.</li>
        <li>3. No app, toque em Adicionar o widget.</li>
      </ol>
      <div className="mt-3 flex flex-col gap-2">
        <a
          href={WIDGET_APK_URL}
          download
          className="rounded-xl border border-ink-700 bg-ink-800 px-4 py-3 text-center text-sm font-bold active:bg-ink-700"
        >
          Baixar o app do widget (APK)
        </a>
        {!isSupabaseConfigured || !userEmail ? (
          <p className="text-xs text-ink-400">
            Para conectar, entre na sua conta em Ajustes: o widget lê as frases da nuvem.
          </p>
        ) : (
          <Button onClick={() => void connect()} disabled={busy}>
            {busy ? 'Gerando…' : code ? 'Gerar outro código' : 'Conectar widget'}
          </Button>
        )}
        {code && (
          <>
            <a
              href={widgetIntentLink(code)}
              className="rounded-xl bg-go-500 px-4 py-3 text-center text-sm font-black text-ink-950 active:bg-go-600"
            >
              Abrir no app do widget ›
            </a>
            <Button variant="ghost" onClick={() => void copy()}>
              Copiar código
            </Button>
            <p className="select-all break-all rounded-lg bg-ink-900 p-2 font-mono text-[10px] text-ink-400">
              {code}
            </p>
          </>
        )}
        {note && <p className="text-xs text-ink-300">{note}</p>}
      </div>
      <p className="mt-3 text-xs text-ink-400">
        O Android pode pedir para liberar a instalação de apps fora da Play Store. O código só
        permite ler suas frases; gerar um novo desliga o anterior.
      </p>
    </Card>
  )
}

function PhraseForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: MotivationPhrase | null
  onSave: (text: string, author: string) => Promise<void>
  onCancel?: () => void
}) {
  const [text, setText] = useState(initial?.text ?? '')
  const [author, setAuthor] = useState(initial?.author ?? '')
  const [busy, setBusy] = useState(false)
  // Trava imediata contra toque duplo (o `busy` so muda no proximo render).
  const locked = useRef(false)

  const submit = async () => {
    if (!text.trim() || locked.current) return
    locked.current = true
    setBusy(true)
    try {
      await onSave(text, author)
      setText('')
      setAuthor('')
    } finally {
      locked.current = false
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        placeholder="Ex.: A coragem não é a ausência do medo, é agir apesar dele."
        aria-label="Frase"
        className="w-full resize-none rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-brand-500"
      />
      <input
        value={author}
        onChange={(event) => setAuthor(event.target.value)}
        placeholder="Quem disse (opcional)"
        aria-label="Autor"
        className="mt-2 w-full rounded-xl border border-ink-700 bg-ink-800 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
      />
      <div className="mt-3 flex gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
        <Button className="flex-1" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {initial ? 'Salvar alterações' : 'Guardar frase'}
        </Button>
      </div>
    </Card>
  )
}
