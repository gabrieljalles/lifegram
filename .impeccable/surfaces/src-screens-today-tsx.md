---
version: 1
slug: "src-screens-today-tsx"
primary_target: "src/screens/Today.tsx"
related_targets: []
---

## Escopo

Tela Hoje do Lifegram v2 (`/`), modo Operate. Ela define o mundo visual do app inteiro.

**Tarefa:** ver o que fazer agora e marcar com um toque. Os estados são feito, tomado, atrasado, agora, mais tarde e a qualquer hora.

**Restrições:**
- uso com uma mão, com as ações na metade de baixo;
- uso à noite com pouca luz, que pede um tema noturno;
- a voz é de treinador firme.

Arquitetura em `.design/lifegram-v2/INFORMATION_ARCHITECTURE.md`. Esboço aprovado em `.impeccable/mocks/decision/assigned.html`.

## Direction contract

**THESIS:** o app é a página do dia de uma agenda de papel brasileira: uma linha pautada por item, a fita marca o agora e o que foi feito fica riscado de caneta. Recusa o padrão da categoria, uma lista de cartões com caixinha de seleção e camada de pontos.

**OWN-WORLD:**
- **Dia:** papel `#FBFAF6`, pauta em azul-claro `#D6DEEC`, tinta de caneta azul `#1D3FA6` para ações e feitos, margem vermelha `#D2463C` para atraso e a fita, marca-texto `#F4E04D` para o agora.
- **Noite:** capa de tecido azul-noite `#10183A`, com tinta clara e marca-texto em âmbar baixo.
- **Tipo:** data e rótulos em Barlow Condensed; corpo em Roboto; horas em números tabulares.
- **Separações:** sem sombras, só linhas da pauta.
- **Estado pela forma da linha:** riscado é feito, sublinhado duplo vermelho é atrasado, tracejado é a qualquer hora.

**STORY:** ao abrir, você vê a data e a nota de ontem, acha a fita no agora e marca o item da vez. À noite, fecha o dia com o check-in.

**FIRST VIEWPORT:**
- Topo: data impressa grande (dia da semana em vermelho, número de 64 px, mês) à esquerda; nota de felicidade e sono de ontem à direita, separados por uma régua de 2 px.
- Frase do momento numa linha em itálico.
- Página pautada: coluna de horas de 60 px, margem vermelha, um item por linha de 52 px e a ação à direita (círculo, Iniciar, Fazer). A fita fica no agora.
- Seção "A qualquer hora" abaixo.
- Botão + azul acima do menu de 5 abas.

**FORM:** agenda diária de papel, item 7 da lista ordenada. seed:05d48043e526eee1

**Elevações herdadas:**
- estado pela forma da linha (do trilho espectral);
- marca feita no próprio item (do catálogo de convenção);
- escala fixa de pontos em Padrões e âmbar noturno (do atlas estelar);
- abas de dia na borda da Agenda (do manual de acetato);
- sem sombras e apagar isolado (do console escuro).

**Movimento assinatura:** ao marcar como feito, o risco de caneta atravessa o texto da esquerda para a direita em 180 ms. A fita desce para o próximo item.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
