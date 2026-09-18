# Workout — progresso na academia

App web (PWA) para seguir o treino e medir a evolução. Ele diz **qual exercício
fazer, quantos kg pegar e quantas repetições**, conta o descanso sozinho
(**1min30 por padrão**) e transforma cada série registrada em estatística.

Feito para o celular, **sem servidor pago** e **sem depender de internet na
academia**: os dados são gravados no aparelho na hora e sincronizam com a nuvem
quando dá.

## O que ele faz

**Durante o treino**

- Uma tela por série: foto do exercício, nome, carga, repetições e `Série 2/4`.
- Botão **PRONTO** grava a série e abre o descanso em tela cheia, com anel
  regressivo, bipe e vibração ao acabar, `+15s`, `−15s` e `Pular`.
- Terminou as séries, ele avança sozinho para o próximo exercício.
- Ajustou a carga? Ela vira o alvo das séries seguintes **e** do próximo treino.
- O painel da última vez mostra **cada série anterior** (peso × reps) e compara
  carga *e* repetições com o que você tem engatilhado agora.
- Bateu o teto de repetições em **todas** as séries? Na próxima vez o exercício
  sugere subir a carga, com um toque para aplicar.
- Relógio do treino no topo da tela, e aviso de fim de descanso mesmo com o
  celular no bolso.
- Bateu recorde? Confete na hora.
- Fechar o app, bloquear a tela ou perder o sinal não perde nada — ao voltar,
  você cai exatamente na série em que parou.

**Depois do treino**

- Resumo com volume levantado, duração, séries, recordes e comparação com a
  última vez que você fez aquele mesmo treino.
- Divisão do tempo: quanto você passou treinando e quanto descansando, com o
  descanso real cronometrado comparado ao planejado.
- Progresso por **semana / mês / ano**: volume, frequência e distribuição por
  grupo muscular.
- Calendário de frequência (heatmap) e sequência de treinos na home.
- Tocando em um exercício: **média de progresso mensal em kg/mês e %/mês**,
  recorde de carga, 1RM estimado, volume acumulado, frequência, gráfico de
  evolução e histórico série a série.

## Como a estatística é calculada

| Métrica | Fórmula |
|---|---|
| Volume de uma série | `repetições × carga` |
| 1RM estimado (Epley) | `carga × (1 + reps/30)` — compara 60kg×10 com 70kg×6 |
| Progresso mensal | inclinação de uma regressão linear do 1RM estimado por sessão, normalizada para 30 dias (mínimo de 3 sessões) |
| Consistência | R² da mesma reta — diz se a progressão é firme ou oscilante |
| Comparação com a última vez | vence quem tem o maior 1RM estimado — trocar carga por repetição conta como progresso |
| Sugestão de subir carga | teto de reps batido em **todas** as séries (padrão 15, editável) → carga + incremento (padrão 1 kg, editável) |
| Recorde | maior carga já feita, e maior `reps × carga` numa única série |
| Sequência | dias treinados seguidos, tolerando até 2 dias de descanso |

A lógica toda vive em [src/lib/stats.ts](src/lib/stats.ts), sem React e sem
banco — e é coberta por testes em
[src/lib/stats.test.ts](src/lib/stats.test.ts).

## Rodando

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes da camada de estatística
npm run build    # build de produção
npm run preview  # serve o build (necessário para testar o modo offline)
```

O app funciona completo sem nenhuma configuração — nesse modo os dados ficam
só no aparelho, com backup manual em JSON pelos Ajustes.

## Sincronização na nuvem (grátis, opcional)

1. Crie um projeto no [Supabase](https://supabase.com) (plano free).
2. No **SQL Editor**, rode [supabase/schema.sql](supabase/schema.sql) inteiro.
   Ele cria as tabelas, os índices, as políticas de RLS e o bucket privado das
   fotos. *Se você já tinha rodado o schema antes da dupla progressão existir,
   rode também [supabase/migrations/001_progressao.sql](supabase/migrations/001_progressao.sql).*
3. Copie `.env.example` para `.env` e preencha com a URL e a chave anônima
   (Project Settings → API).
4. Reinicie o `npm run dev`. Em **Ajustes**, informe seu e-mail: o acesso é por
   link mágico, sem senha.

Como a arquitetura é local-first, se o projeto do Supabase pausar por
inatividade (o free tier faz isso após ~1 semana parado), o app continua
funcionando normalmente — a fila de alterações sobe quando ele voltar.

## Publicando de graça

O build é estático, então qualquer hospedagem gratuita serve (Cloudflare Pages,
Vercel, Netlify, GitHub Pages):

- Comando de build: `npm run build`
- Diretório publicado: `dist`
- Redirecionar todas as rotas para `/index.html` (é uma SPA)

HTTPS é obrigatório para o PWA e para manter a tela acesa. Depois de abrir o
site no celular: Android → menu → **Instalar app**; iPhone → compartilhar →
**Adicionar à Tela de Início**.

## Estrutura

```
src/
  lib/
    types.ts     modelo de dados e o padrão de 90s de descanso
    db.ts        IndexedDB (fonte de verdade) + fila de sync + backup JSON
    stats.ts     volume, Epley, regressão, sequência, recordes  ← testado
    timer.ts     contagem ancorada no relógio, wake lock, bipe, vibração
    photo.ts     compressão para webp e cache offline da imagem
    supabase.ts  cliente e login por link mágico
    sync.ts      push/pull com resolução por updated_at
    workout.ts   iniciar, registrar série, descansar, encerrar
    store.tsx    estado do app em React
  screens/       Home, ActiveWorkout, WorkoutSummary, Stats, ExerciseDetail,
                 Settings e os editores de treino/exercício
  components/    RestTimer, PRCelebration, Heatmap, gráficos e UI base
supabase/
  schema.sql     tabelas, RLS e storage
```

### Duas decisões que explicam o resto do código

**O timer é ancorado em um instante absoluto**, nunca em um contador que
decrementa. A cada quadro ele recalcula `fim − agora`. Por isso o descanso
continua certo mesmo com a tela bloqueada, o app em segundo plano ou o
navegador congelando os timers da aba.

**O IndexedDB é a fonte de verdade, não um cache.** Toda escrita entra numa
fila (`outbox`) e o Supabase é atualizado depois. Nenhuma tela espera a rede,
então falta de sinal no subsolo da academia é um estado normal — não um erro.
