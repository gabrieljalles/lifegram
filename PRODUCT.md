# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Um usuário só: o dono do app, que usa o Lifegram como PWA instalado no celular Android, mais o widget de frases na tela inicial. Três trabalhos:

1. **Organizar o dia:** saber o que fazer agora, sem esquecer remédio, hábito ou compromisso.
2. **Entender a si mesmo:** descobrir quais atitudes se ligam a dias mais felizes e a um sono melhor.
3. **Praticar coragem:** executar todo dia práticas que dão medo e registrar o resultado na hora.

## Product Purpose

Orquestrar a vida inteira por um app só. A agenda é a base: compromissos, hábitos, remédios e suplementos (com dose), treinos e práticas de coragem viram itens do dia. Cada item tem horário fixo ou "a qualquer hora". Um check-in à noite registra felicidade (1 a 5), sono e até 3 palavras do dia. Com o tempo, a tela Padrões cruza o que foi feito com a felicidade.

Sucesso, 8 semanas após a fase 1 (detalhes em `.design/lifegram-v2/PRD-lifegram-v2.md`):
- check-in em pelo menos 6 de 7 noites;
- pelo menos 1 padrão encontrado com 30 dias de dados;
- a parte dos itens feitos sobe 10 pontos percentuais;
- os outros apps de agenda, hábito e remédio deixam de ser usados.

## Positioning

As atitudes do dia já estão registradas no próprio app (treinos, remédios, coragem, hábitos), então o cruzamento com a felicidade é automático. Um diário de humor comum só sabe o que a pessoa lembra de marcar.

## Operating Context

- **De manhã, ao acordar:** ver o dia, tomar remédios e suplementos.
- **Na rua, com uma mão:** marcar um item rápido, registrar coragem na hora (Regra dos 3 segundos, não e sim).
- **Na academia:** treino ao vivo entre as séries. A tela é imersiva e tem cronômetro de descanso.
- **À noite, na cama, com pouca luz:** check-in e revisão do dia.

Funciona sem internet (IndexedDB) e sincroniza com o Supabase quando há conexão. O Google Agenda pode receber os itens. O widget Android lê as frases.

## Capabilities and Constraints

- **Stack existente:** React 19, TypeScript, Vite, Tailwind 4, PWA, IndexedDB e Supabase. O deploy é no Cloudflare Workers.
- **Arquitetura v2 decidida:** menu Hoje · Agenda · Coragem · Padrões · Vida, descrito em `.design/lifegram-v2/INFORMATION_ARCHITECTURE.md`.
- **A camada de jogo sai de vez:** XP, nível, chefão, missões e baú.
- **Os dados atuais passam intactos para a v2:** treinos, coragem, agenda, financeiro e frases.
- **Glossário:** item, a qualquer hora, recorrente, uma vez, feito/tomado, check-in, felicidade, treino da semana, degrau, tentativa, não. Palavras que saem: XP, nível, missão, chefão, baú, normalizado.
- **Correlações:** só aparecem com pelo menos 14 dias de notas e 5 dias de cada lado. É uma diferença de médias, não uma prova de causa, e a interface diz isso.
- **Fica para depois:** alimentação.
- **Em aberto:** a lista de palavras do dia; o momento de perguntar o sono (proposta: no check-in da noite).

## Brand Commitments

- **Nome:** Lifegram.
- **Idioma:** português do Brasil.
- **Voz: treinador firme.** Frases curtas e diretas que cobram e empurram ("Atrasado. Vai agora."), sem euforia e sem infantilizar. A firmeza nunca vira humilhação: um dia ruim é registrado sem julgamento.
- **Ícone atual:** pentagrama neon dos cinco elementos (`public/icon.svg`).

## Evidence on Hand

- Auditoria de UX de 11/11/2026, nota 4/10, com capturas das telas atuais. Os principais problemas: excesso de elementos na tela Hoje, termos misturados, contagens divergentes, cada card com uma cor.
- Dados reais do usuário no app e no Supabase.
- Ainda não existe nenhum dado de felicidade: o check-in é novo.

## Product Principles

1. **O dia primeiro.** Toda tela responde "o que faço agora?" ou "como foi?". O resto fica a um toque.
2. **Dado real, não pontos.** Só aparecem números que medem a vida (feito, dose, nota, sono, carga), nunca pontuação inventada.
3. **Um toque para registrar.** Marcar, tomar ou registrar coragem cabe em um toque com uma mão, e sempre dá para desfazer.
4. **Honesto com a amostra.** Padrão só com dados suficientes, sempre dizendo quantos dias sustentam a conclusão.
5. **Firme, nunca cruel.** A voz cobra a ação, não a pessoa.

## Accessibility & Inclusion

- Uso com uma mão: alvos de toque de pelo menos 44 px, com as ações principais na metade de baixo da tela.
- Uso à noite com pouca luz: tema escuro de baixo brilho, sem brancos puros grandes. O contraste do texto fica em pelo menos 4,5:1.
