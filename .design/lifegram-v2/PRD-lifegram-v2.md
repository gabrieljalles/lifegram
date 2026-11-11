# PRD: Lifegram v2, o app que orquestra a minha vida

## 1. Resumo

O Lifegram passa a ter um centro só: a **agenda do dia**. Remédios, hábitos, treinos, práticas de coragem e compromissos viram itens do dia. Um check-in à noite registra felicidade, sono e as palavras do dia. Com esses dados, o app mostra **o que de fato me faz bem**. Agora porque o app cresceu por partes (treino, coragem, finanças) e ficou poluído: a auditoria de UX deu **4/10**.

## 3. Contexto

O Lifegram começou como app de treino e ganhou coragem, agenda, financeiro, frases e um jogo de XP e chefão. Cada área funciona, mas como um app separado.

- A tela Hoje mistura chefão, nível, quatro contadores, missões e baú.
- A mesma coisa tem nomes diferentes: atividade, missão, objetivo, degrau.
- O app sabe **o que eu fiz**, mas não **como eu me senti**. Sem isso, não dá para achar padrões.

**Por que agora:** já existe a base técnica (agenda com itens com e sem horário, sincronização, widget). Falta reorganizar e somar o registro de como me senti.

## 4. Objetivo

Tornar o Lifegram o **único lugar** onde organizo o dia e o **espelho** que mostra o que me faz feliz.

**Resultados-chave (8 semanas após a fase 1):**
1. **Uso diário:** check-in feito em pelo menos **6 de 7 noites**, por 8 semanas seguidas.
2. **Padrões:** com 30 dias de check-ins, o app mostra **pelo menos 1 ligação** entre um item e a felicidade, com amostra suficiente (14 dias ou mais, 5 de cada lado).
3. **Cumprir mais:** a parte dos itens do dia marcados como feitos sobe **10 pontos percentuais** em relação às 2 primeiras semanas.
4. **Um app só:** paro de usar outros apps de agenda, hábito e lembrete de remédio. Respondo sim ou não no fim das 8 semanas.

## 5. Para quem (segmentos)

Um usuário só, o dono do app, mas com **três trabalhos** diferentes:

1. **Organizar o dia:** saber o que fazer agora, sem esquecer remédio, hábito ou compromisso.
2. **Entender a si mesmo:** descobrir o que muda a felicidade, o sono e a energia.
3. **Praticar coragem:** fazer todo dia as práticas que dão medo e registrar o resultado na hora.

**Restrições:** uso no celular (PWA e widget Android), com uma mão e pouco tempo. Precisa funcionar sem internet. Os dados de hoje passam **intactos**.

## 6. Propostas de valor

### 6.1 Organizar o dia
- **Quem:** eu, de manhã e ao longo do dia.
- **Por quê:** fazer o que planejei, incluindo o que não tem hora (remédio, hábito).
- **Antes:** agenda numa aba, missões em outra, chefão na frente. Itens "a qualquer hora" se perdem.
- **Como:** a tela Hoje mostra só o dia, em ordem: agora, a qualquer hora, mais tarde, feitos. Um toque marca como feito, com a opção de desfazer.
- **Depois:** abro o app e em 2 segundos sei o que fazer. Nada fica esquecido.
- **Alternativas:** Google Agenda (não lida bem com o que não tem hora), apps de hábito (não têm compromissos), alarmes. O Lifegram junta tudo num lugar.

> Uma tela que mostra o meu dia inteiro, incluindo o que não tem hora, e que eu marco com um toque.

### 6.2 Entender a si mesmo
- **Quem:** eu, à noite e quando quero refletir.
- **Por quê:** saber quais atitudes melhoram ou pioram meu dia.
- **Antes:** só intuição. O app conta treinos e nãos, mas não sabe como me senti.
- **Como:** um check-in noturno (felicidade de 1 a 5, sono, até 3 palavras) e a tela Padrões, que compara os dias com e sem cada item.
- **Depois:** descubro, com números, o que manter e o que cortar. Por exemplo: "dias com treino: 4,1; sem: 3,2".
- **Alternativas:** Daylio e diários de humor (registram o humor, mas não sabem dos meus treinos, remédios e coragem). Aqui os dados do dia já estão no app, então o cruzamento é automático.

> Cada noite, 15 segundos de check-in. Com o tempo, o app mostra o que me faz bem.

### 6.3 Praticar coragem
- **Quem:** eu, quando surge a chance de agir.
- **Por quê:** agir antes do medo montar a desculpa e acompanhar a evolução.
- **Antes:** a Coragem tem muitos números e caminhos (funil, escada, trilha, painel, frases) na mesma tela.
- **Como:** a prática do dia vem da agenda; a Regra dos 3 segundos e o registro de não ou sim ficam a um toque.
- **Depois:** pratico todo dia e o registro entra nos Padrões. Coragem também se correlaciona com a felicidade.
- **Alternativas:** caderno, memória. Nada pronto liga prática de coragem ao meu humor.

> A coragem vira uma prática do dia, com registro em um toque e efeito visível nos padrões.

## 7. Solução

### 7.1 Fluxo principal
Abrir → **Hoje** → marcar itens ao longo do dia → aviso à noite → **check-in** → com o tempo, **Padrões**. Detalhes em [INFORMATION_ARCHITECTURE.md](./INFORMATION_ARCHITECTURE.md).

### 7.2 Funcionalidades da primeira versão
1. **Item do dia unificado:** os tipos Compromisso, Hábito, Remédio/Suplemento (com dose), Treino e Coragem. Cada um com horário fixo ou "a qualquer hora", uma vez ou recorrente.
2. **Tela Hoje nova:** agora, a qualquer hora, mais tarde e feitos, com desfazer por 5 segundos e a frase do momento.
3. **Check-in da noite:** aviso num horário escolhido. Pede felicidade (1 a 5), sono (horas dormidas e qualidade de 1 a 5), até 3 palavras de uma lista e uma nota livre opcional. Dá para preencher o dia anterior.
   - **Parte 2, "A noite de hoje"** (fatores que podem pesar no dia seguinte): álcool (em doses), transou, se masturbou, viu pornografia, café ou energético depois das 16h, comeu pesado depois das 21h, celular na cama depois das 23h, treinou depois das 20h (preenchido sozinho quando há treino registrado), cochilou de dia, briga ou estresse forte, e a hora em que vai deitar. Cada resposta é um toque (Não/Sim). A lista é editável em Ajustes: dá para tirar, renomear e criar perguntas.
   - **Sonhou esta noite?** é perguntado de manhã, na tela Hoje até o meio-dia, porque sonho se esquece rápido. A resposta aparece no check-in junto com o sono.
   - A parte 1 ganha **disposição hoje (1 a 5)**. Em Padrões, as respostas de uma noite são comparadas com o **dia seguinte**: felicidade, disposição e sono.
   - **Privacidade:** dados sensíveis. Ficam só na conta do usuário (RLS), nunca vão para o widget, e em Padrões podem aparecer com nomes discretos.
4. **Padrões:** a felicidade em 7 e 30 dias, os 3 itens mais ligados à felicidade (com o tamanho da amostra) e a constância por item ("26 de 30 dias"). O sono aparece como fator.
5. **Menu novo:** Hoje · Agenda · Coragem · Padrões · Vida, com redirecionamento das rotas antigas.
6. **Remover o jogo:** some XP, nível, chefão, missões, baú e a aba Progresso.
7. **Visual novo:** uma paleta com uma cor de destaque, menos texto, ícones sempre com nome.
8. **Migração sem perda:** as atividades atuais viram itens e todo o histórico continua valendo.

### 7.3 Tecnologia
- A base atual continua: React, IndexedDB e sincronização com o Supabase.
- Duas tabelas novas: `checkins` (com as respostas da parte 2 num campo `factors` jsonb, para a lista poder mudar sem migração) e a dose nos registros de item feito. Cada uma entra numa migração própria no Supabase.
- As correlações são calculadas no próprio aparelho.
- O widget Android continua funcionando sem mudanças.

### 7.4 Suposições e perguntas abertas
- **Suposição:** 15 segundos à noite é curto o bastante para virar hábito.
- **Suposição:** 14 dias de notas, com 5 de cada lado, bastam para mostrar uma tendência sem enganar. Isso é diferença de média, não prova de causa; a tela deve dizer isso.
- **Aberta:** a lista de palavras do dia. Proponho umas 12, editáveis.
- **Aberta:** o sono entra no check-in da noite (sobre a noite anterior) ou num check-in curto de manhã? Proponho à noite, para manter um momento só.
- **Aberta:** o que fazer com conquistas reais (recordes de carga). Proponho mantê-las como dado em Padrões → Treino, sem celebração em tela cheia.

## 8. Lançamento

| Fase | O que entra | Tempo estimado |
|---|---|---|
| **1. Base** | Item unificado, tela Hoje nova, check-in, menu novo, remoção do jogo, migração | 2 a 3 semanas |
| **2. Padrões** | Tela Padrões com correlações (útil depois de cerca de 2 semanas de check-ins) | 1 a 2 semanas |
| **3. Visual** | Paleta e tipografia novas em todas as telas, revisão de textos | 1 a 2 semanas (pode andar junto da fase 1) |
| **4. Depois** | Alimentação, correlações entre dois itens juntos, resumo semanal | A definir |

**Fora da primeira versão:**
- alimentação;
- recomendações automáticas ("faça X");
- integração com relógio ou app de saúde;
- várias pessoas usando o app;
- mudanças no Financeiro além de mover a aba para Vida.
