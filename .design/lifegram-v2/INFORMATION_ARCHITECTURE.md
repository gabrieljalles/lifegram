# Arquitetura de Informação: Lifegram v2

> O app que orquestra a sua vida. A agenda é a base: tudo o que você faz é um
> item do dia, e uma nota de felicidade fecha cada dia. Com o tempo, o app
> cruza os dois e mostra o que te faz bem.

## Decisões tomadas (11/11/2026)

| Decisão | Escolha |
|---|---|
| Camada de jogo (XP, nível, chefão, missões, baú) | **Remover de vez.** Só ficam dados reais. |
| Menu inferior | **Hoje · Agenda · Coragem · Padrões · Vida** |
| Nota de felicidade | **À noite, num horário escolhido.** Se esquecer, dá para preencher no dia seguinte. |
| Remédios e suplementos | **Tipo de item da agenda, com dose.** Não têm área própria. |
| Alimentação | **Fica para depois** (fase 2). A estrutura já reserva o lugar. |

## O modelo mental: tudo é um item do dia

Um único conceito, **Item**, substitui o que hoje está dividido entre atividade, missão, objetivo e degrau na tela Hoje.

| Tipo de item | Ícone | Exemplo | O que acontece ao tocar |
|---|---|---|---|
| Compromisso | 📌 | Dentista 14:00 | Marca como feito. |
| Hábito | 🔁 | Meditar, ler 10 páginas | Marca como feito. |
| Remédio / Suplemento | 💊 | Creatina 5 g | Marca como tomado e registra a dose. |
| Treino | 🏋️ | Treino A 18:30 | **Iniciar** abre o treino ao vivo. Ao terminar, o item fica feito. |
| Coragem | 🦁 | Olhar no espelho 10 s | Abre a prática na Coragem e registra a tentativa. |
| Alimentação (fase 2) | 🍽️ | Almoço | Reservado. |

Cada item tem:
- **Horário:** um horário fixo, ou "a qualquer hora" (precisa acontecer no dia, mas sem hora).
- **Frequência:** só uma vez (numa data) ou recorrente (dias da semana).

A **nota de felicidade** não é um item: é o fechamento do dia. Feito e não feito, junto com a nota, são os dados das correlações.

## Mapa do app

- **Hoje** `/` (onde você passa 80% do tempo)
  - Check-in do dia `/checkin/:date` (sheet)
- **Agenda** `/agenda`
  - Novo item `/agenda/novo?tipo=…`
  - Detalhe ou edição do item `/agenda/item/:itemId`
  - Dia específico `/agenda/:date` (ver e marcar dias passados)
- **Coragem** `/coragem`
  - Regra dos 3 segundos `/coragem/agora` (modo tela cheia)
  - Escada do medo `/coragem/escada`
    - Degrau `/coragem/escada/:goalId`
    - Nova tentativa `/coragem/escada/:goalId/tentativa`
  - Trilha `/coragem/trilha` (calibrar: `/coragem/trilha/calibrar`)
  - Números da coragem `/coragem/numeros` (o antigo "painel")
- **Padrões** `/padroes`
  - Felicidade ao longo do tempo `/padroes/felicidade`
  - Correlação de um item `/padroes/item/:itemId`
  - Treino (gráficos e recordes) `/padroes/treino`
    - Exercício `/padroes/treino/:exerciseId`
  - Peso corporal `/padroes/peso`
- **Vida** `/vida` (hub das áreas)
  - Treino `/vida/treino`
    - Treinos da semana `/vida/treino/rotinas` → `/vida/treino/rotinas/:routineId`
    - Exercícios `/vida/treino/exercicios` → `/vida/treino/exercicios/:exerciseId`
    - Treino ao vivo `/treino` (imersivo, sem menu)
    - Resumo do treino `/treino/resumo/:sessionId`
  - Saúde `/vida/saude`: remédios e suplementos ativos (derivados dos itens), peso corporal
  - Financeiro `/vida/financeiro`
    - Investimentos `/vida/financeiro/investimentos` (comprar, vender, ativo)
    - Impostos `/vida/financeiro/impostos`
  - Frases `/vida/frases`
  - Ajustes `/vida/ajustes`
    - Conta e sincronização, avisos, dias de descanso
    - Integrações: Google Agenda, widget Android
    - Backup e importação

## Navegação

- **Principal (menu inferior, 5 abas, sempre visível):** Hoje · Agenda · Coragem · Padrões · Vida.
- **Secundária:** dentro de Vida, uma lista de áreas (Treino, Saúde, Financeiro, Frases, Ajustes). Dentro de Coragem, a tela inicial leva às subtelas; não há abas de filtro.
- **Utilitária:** Ajustes mora em Vida e não tem engrenagem solta na tela Hoje. A configuração do Google Agenda sai da tela Agenda e vai para Ajustes → Integrações.
- **Imersiva:** o treino ao vivo e a Regra dos 3 segundos escondem o menu.
- **Ação de criar:** um botão "+" fixo em Hoje e Agenda abre a escolha do tipo de item (Compromisso, Hábito, Remédio, Treino, Coragem).
- **Profundidade máxima:** 3 níveis (aba → área → detalhe).

## Hierarquia de conteúdo

### Hoje
1. **Data e nota do dia.** Mostra a nota já registrada, ou um botão discreto para registrar se for noite. É o que fecha o dia.
2. **Frase do momento.** Uma linha, sem cartão chamativo.
3. **Agora / atrasados.** O próximo item com horário, com o botão de marcar. É a ação principal da tela.
4. **A qualquer hora.** Hábitos, remédios e coragem do dia ainda não feitos.
5. **Mais tarde.** O resto do dia, por horário.
6. **Feitos.** Recolhidos no fim, com contador ("6 de 9 feitos").
7. **Check-in da noite.** Cartão "Como foi seu dia?" depois do horário escolhido.

Sai da tela Hoje: chefão, nível/XP, os quatro números (corrente, dias perfeitos, nãos, recordes), missões, baú e o botão "Montar um treino".

### Agenda
1. **Faixa da semana** (dias com bolinhas de quanto foi feito). Serve para navegar entre dias.
2. **Itens do dia escolhido**, agrupados por horário.
3. **Todos os itens**, agrupados por tipo (recorrentes e únicos). É onde se gerencia: editar, pausar, arquivar.

Sai da Agenda: o bloco do Google Agenda (vai para Ajustes) e o "+20 XP" dos itens.

### Coragem
1. **Prática de hoje.** O item de coragem do dia (vem da agenda), com o botão "Fazer agora".
2. **Regra dos 3 segundos.** Um botão grande para quando aparecer a chance.
3. **Registrar rápido.** Botões Não / Sim do funil, com um toque.
4. **Sua escada.** Os degraus em andamento, até 3, com o link "ver todos".
5. **Trilha.** O próximo passo da trilha adaptativa.
6. **Números.** Um link para o painel, sem gráficos na tela inicial.

As frases saem da Coragem e vão para Vida → Frases. A opção "Romance" (solteiro) sai de Ajustes → Pessoal e vira uma opção dentro do funil da Coragem.

### Padrões
1. **Felicidade recente.** Média dos últimos 7 e 30 dias, com uma linha simples.
2. **O que mais se liga à sua felicidade.** Os 3 itens com maior diferença de nota entre os dias em que você fez e os dias em que não fez. Só aparece com dados suficientes.
3. **Constância por item.** Por exemplo, "Creatina: 26 de 30 dias".
4. **Áreas.** Atalhos para Treino (volume, recordes, frequência) e Peso.

### Vida
1. **Lista de áreas** com um resumo de uma linha cada: Treino ("próximo: Treino A, sex"), Saúde ("2 suplementos ativos"), Financeiro ("R$ … investidos"), Frases ("12 frases"), Ajustes.

## Fluxos principais

### Marcar o que fiz (o fluxo mais frequente)
1. Abre o app e cai em **Hoje**.
2. Vê o item da vez no topo.
3. Toca no círculo: fica feito, com um aviso de 5 segundos e a opção **Desfazer**.
   - Remédio com dose variável: abre um campo rápido para a dose, com a última dose já preenchida.
   - Treino: o botão é **Iniciar** e leva ao treino ao vivo. Ao terminar, o item fica feito.
   - Coragem: o botão é **Fazer** e leva à prática. Ao registrar, o item fica feito.

### Fechar o dia
1. No horário escolhido (ex.: 21:30), chega um aviso: "Como foi seu dia?"
2. O check-in abre como sheet: nota de 1 a 5 (5 rostos), até 3 palavras opcionais (cansado, focado, ansioso…) e uma nota livre opcional.
3. Salva e volta para Hoje, com a nota no topo.
   - Se esquecer: no dia seguinte, Hoje mostra "Ontem ficou sem nota" com um toque para preencher.

### Criar um item
1. Toca em **+** em Hoje ou Agenda.
2. Escolhe o tipo: Compromisso, Hábito, Remédio, Treino ou Coragem.
3. Preenche o formulário do tipo: nome, horário ou "a qualquer hora", dias, mais a dose (remédio), o treino da semana (treino) ou o degrau (coragem).
4. Salva e o item aparece em Hoje se for para hoje.

### Descobrir um padrão
1. Abre **Padrões**.
2. Vê "O que mais se liga à sua felicidade": por exemplo, "Dias com treino: nota média 4,1 · sem treino: 3,2 (32 dias)".
3. Toca no item e abre a correlação: o gráfico dos dias feitos e não feitos com a nota, e o tamanho da amostra.
   - Com menos de 14 dias de notas, ou menos de 5 dias de cada lado: mostra "Ainda juntando dados: faltam N dias", sem conclusão.

### Praticar coragem na hora
1. Vê a chance e toca em **Coragem → Regra dos 3 segundos** (ou no atalho do widget).
2. Contagem 3-2-1 e vai.
3. Registra o resultado: Não / Sim / etapa seguinte.

## Nomes (um termo por conceito)

| Conceito | Nome na interface | Substitui |
|---|---|---|
| Qualquer coisa no dia | **Item** ("novo item") | atividade, missão, quest |
| Item sem hora | **A qualquer hora** | qualquer hora, dia livre |
| Item repetido | **Recorrente** | rotina (na agenda) |
| Item de uma vez | **Uma vez** | esporádica |
| Concluir | **Feito** / **Tomado** (remédio) | check, cumprir, missão completa |
| Fechamento do dia | **Check-in** | (novo) |
| Nota do dia | **Felicidade** (1 a 5) | (novo) |
| Plano de musculação | **Treino da semana** | rotina, plano de treino, treino ABC |
| Sessão feita | **Treino** (no histórico) | sessão |
| Meta de coragem | **Degrau** (da escada) | objetivo, meta |
| Registro de coragem | **Tentativa** | (mantém) |
| Não recebido | **Não** | (mantém) |
| Constância | **X de Y dias** | corrente, dias perfeitos, streak |

Palavras que saem do app: XP, nível, chefão, missão, baú, bônus, normalizado.

## Componentes reaproveitados

| Componente | Usado em | Variações |
|---|---|---|
| `ItemRow` (linha de item com círculo de feito) | Hoje, Agenda, Coragem (prática do dia) | Por tipo: círculo (padrão), **Iniciar** (treino), **Fazer** (coragem), dose (remédio) |
| `DayStrip` (faixa da semana) | Agenda, Padrões (correlação) | Na Agenda é navegação; em Padrões mostra feito/não feito |
| `CheckinSheet` | Hoje, aviso noturno, "ontem ficou sem nota" | Data editável quando é retroativo |
| `AreaRow` (área com resumo de uma linha) | Vida, Padrões → Áreas | Nenhuma |
| `ScreenHeader` (título + voltar + 1 ação) | Todas as telas internas | No máximo **uma** ação no topo; ícones sempre com nome |
| `TabBar` (5 abas) | Todas, exceto as imersivas | Some no treino ao vivo e na Regra dos 3 segundos |
| `UndoToast` | Feito, apagar, registrar não/sim | Substitui as confirmações quando dá para desfazer |

## Crescimento do conteúdo

| Conteúdo | Cresce como | Como a estrutura aguenta |
|---|---|---|
| Itens marcados (feito por dia) | Todo dia, para sempre | Hoje e Agenda mostram só a semana; Padrões agrega por período (7, 30, 90 dias, tudo) |
| Check-ins | 1 por dia | Linha do tempo em Padrões → Felicidade, por mês |
| Itens | Dezenas | Agenda → "Todos os itens" agrupado por tipo, com busca e arquivados recolhidos |
| Treinos e séries | Por treino | Histórico paginado por mês |
| Tentativas e nãos | Várias por semana | Números da coragem agregados; lista completa só no degrau |
| Frases | Dezenas | Lista simples |
| Alimentação (fase 2) | Várias por dia | Entra como tipo de item. Os detalhes ficam numa área própria em Vida |

## Regras de URL

- **Padrão:** `/<aba>/<área>/<item>`, em português e no singular para detalhes (`/agenda/item/:itemId`).
- **Parâmetros dinâmicos:** `:itemId`, `:date` (YYYY-MM-DD), `:goalId`, `:routineId`, `:exerciseId`, `:sessionId`.
- **Query:** `?tipo=` no novo item; `?periodo=7|30|90|tudo` em Padrões.
- **Redirecionamentos das rotas antigas**, para não quebrar links e o widget:
  - `/academia` → `/vida/treino`
  - `/desempenho` e `/stats` → `/padroes`
  - `/coragem/painel` → `/coragem/numeros`
  - `/coragem/mapa` → `/coragem/trilha`
  - `/coragem/frases` → `/vida/frases`
  - `/treinos` → `/vida/treino/rotinas`
  - `/exercicios` → `/vida/treino/exercicios`
  - `/financeiro` → `/vida/financeiro`
  - `/config` → `/vida/ajustes`
  - `/agenda/nova` → `/agenda/novo`

## O que sai do app (remoção do jogo)

Telas e componentes que deixam de existir:
- O chefão da semana (`Boss3D`, `bossGen`).
- Nível e XP (`xp.ts`, `LevelCard`).
- Missões e baú (`missions.ts`, `MissionCard`).
- A celebração de recorde em tela cheia (`PRCelebration`). Os recordes continuam como dado em Padrões → Treino.
- A aba Progresso. O conteúdo dela vira Padrões.

Os dados de treino, coragem e agenda **não são apagados**. Só a camada de pontos some.
