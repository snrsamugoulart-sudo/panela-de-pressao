# Panela de Pressão 🔥 — V3

Jogo de cartas social multiplayer para navegador. Uma carta aparece,
todo mundo vota em quem "combina" mais com ela, os votos são revelados
ao mesmo tempo e quem recebe mais votos pontua. A liderança gera Pressão
— quanto mais isolado na frente, mais vale a pena desafiar o líder.
Cartas especiais, caóticas e lendárias mudam as regras da rodada de vez
em quando, e minigames curtos interrompem o jogo pra gerar caos extra.

> LER → RIR → APONTAR → VER A DESGRAÇA ACONTECER.

V3.0 — evolução da V2 (mantém Node + Express + Socket.IO, sem framework
de front-end, exatamente como pedido).

## Como rodar localmente

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

## Como testar com dois ou mais dispositivos

1. Descubra o IP local da máquina que roda o servidor (`ipconfig` no
   Windows, `ifconfig`/`ip a` no Mac/Linux).
2. Nos outros dispositivos, **na mesma rede Wi-Fi**, acesse
   `http://SEU_IP:3000`.
3. O anfitrião cria a sala, escolhe seu avatar, ajusta a configuração no
   lobby (modo, pontos, frequência de cartas especiais, Pressão,
   minigames, tempo de votação, perguntas da galera) e inicia.

Se a conexão cair no meio do jogo, é só recarregar a página no mesmo
link (`?sala=CÓDIGO`) — o jogo tenta reconectar sozinho.

## Testes automatizados

```bash
npm install               # já traz socket.io-client como devDependency
npm run test:unit         # regras puras, sem rede — 13 verificações
npm run test:integration  # jogadores reais via socket.io-client — 48 verificações
npm test                  # roda tudo (61 verificações no total)
```

## Estrutura

```
panela-de-pressao/
├── server.js                      # entrada: Express + Socket.IO
├── package.json / README.md
├── src/
│   ├── rooms.js                    # salas, snapshot p/ reconexão, cooldowns
│   ├── players.js                  # jogador (+ avatar, token de reconexão)
│   ├── roomConfig.js               # modos e valores de config válidos
│   ├── pressure.js                 # cálculo do nível de Pressão
│   ├── customQuestions.js          # validação das Perguntas da Galera
│   ├── content/
│   │   ├── packPadrao.js            # 157 cartas (Básico/Caótico)
│   │   ├── packSemFiltro.js         # 86 cartas (Sem Filtro)
│   │   └── index.js                 # sorteio por raridade + frequência configurável
│   ├── cardEffects.js              # motor de efeitos + bônus de Pressão
│   ├── minigames.js                # 6 minigames (3 motores reaproveitados)
│   ├── minigameRunner.js           # orquestração de timers/eventos
│   ├── game.js                     # núcleo de regras de partida
│   └── socketHandlers.js           # liga tudo aos eventos de rede
├── public/
│   ├── index.html
│   ├── css/style.css                # identidade visual "PS1 de festa"
│   └── js/
│       ├── main.js                   # conecta socket, reconexão automática
│       ├── audio.js                  # efeitos sonoros sintetizados (Web Audio)
│       ├── voice.js                  # chat de voz via WebRTC (malha P2P)
│       ├── state.js / ui.js
│       └── screens/
│           ├── home.js                 # + seletor de avatar
│           ├── lobby.js                # + config nova + Perguntas da Galera
│           ├── game.js                 # + HUD de Pressão + reações
│           ├── result.js               # + nota de bônus de Pressão
│           ├── minigame.js             # + alvo-certo, tiro-ao-alvo, batata-quente
│           └── victory.js
└── test/
    ├── unit-v2-test.js / unit-v3-test.js
    └── integration-v2-test.js / integration-v3-test.js / integration-voice-test.js
```

## Sistema de Pressão

A Pressão mede o quanto o líder está isolado dos demais (diferença de
pontos pro segundo colocado, escalada pela pontuação de vitória
configurada — funciona igual numa partida de 3 pontos ou de 10).

- **Nível 0** (gap pequeno): sem efeito.
- **Nível 1 a 3**: quando alguém que **não** era líder antes da rodada
  vence uma carta comum/especial/caos-sem-efeito-de-pontuação, ganha um
  bônus extra igual ao nível de Pressão (então até +3 além do +1 padrão).

O líder **nunca é punido** diretamente — ele só vê a barra de fogo 🔥
subindo no HUD e sabe que todo mundo tem mais incentivo pra tentar
"roubar" a rodada dele. Pode ser desligado no lobby.

## Cartas: raridade e frequência

4 raridades (comum, especial 🟢, caos 🟣, lendária 🔴), sorteadas com peso
configurável no lobby: **Off** (só comum), **Poucas**, **Normal**,
**Muitas**. O motor de efeitos (`cardEffects.js`) nunca compara o texto
da carta — só o `effect.type` — então adicionar uma carta nova é só
empurrar um objeto no array do pacote.

Efeitos implementados: `leader_only_vote` (Derrubem o Rei), `winner_choice`
(Ganância: +2 ou +1 com imunidade), `double_points_no_tie` (Panela de
Pressão: vale 2, mas empate zera), `random_bonus` (Roleta: +3/+2/+1/-1) e
`winner_curse` (Vingança: vencedor escolhe quem ganha ou perde 1 ponto).

**243 cartas no total** (157 no pacote padrão, 86 no Sem Filtro),
cobrindo personalidade, amizade, situações absurdas, cotidiano, escola,
dinheiro, sobrevivência, vergonha, competição, decisões ruins, jogos,
tecnologia e criatividade.

## Perguntas da Galera

Com a opção ligada no lobby, qualquer jogador pode sugerir uma pergunta
própria antes da partida começar (8–140 caracteres, limite de 40 por
sala, cooldown de 3s por jogador). Elas entram no baralho da sessão como
cartas comuns e podem ser removidas pelo autor ou pelo anfitrião antes
de começar. Não persistem entre partidas nem exigem conta.

## Minigames

6 minigames, reaproveitando 3 "motores" de resolução (corrida por
clique, contagem de cliques, e "não faça nada") com apresentações
diferentes — a alternativa seria simular movimento/física real em
canvas, o que eu decidi **não** fingir fazer:

- **Pegue a Coroa** / **Alvo Certo** — corrida pra tocar o alvo certo
  primeiro (Alvo Certo valida o índice correto no servidor).
- **Dedo Nervoso** / **Tiro ao Alvo** — quem clicar mais vezes na janela
  de tempo vence.
- **Não Clique** / **Batata Quente** — Não Clique premia quem resiste;
  Batata Quente penaliza quem estiver segurando quando o tempo acabar
  (a "batata" passa sozinha, rotacionada pelo servidor a cada ~700ms).

Disparados a cada N rodadas (3/5/7/10) ou no modo "Aleatório" (~22% de
chance por rodada a partir da 2ª).

## O que NÃO foi implementado (e por quê)

Sendo direto, como o próprio prompt pediu:

- **Personagens 3D low-poly de verdade**: não modelei nem animei nada em
  3D. Isso exige um pipeline de assets (modelagem, rig, animação) que
  está fora do que dá pra produzir com qualidade real neste formato.
  Implementei avatares 2D (cor + emoji, customizáveis) consistentes com
  a identidade visual, em vez de fingir um sistema 3D que não funcionaria
  de verdade.
- **Música**: não incluí trilha sonora. Implementei efeitos sonoros
  curtos **sintetizados na hora via Web Audio API** (sem nenhum arquivo
  de áudio externo — zero risco de direito autoral), mas compor música
  de verdade para os diferentes estados do jogo é produção de áudio, não
  algo que eu deveria fingir com bipes.
- **Corrida Maluca / Pega o Bicho / Empurra-Empurra / Sobreviva**: esses
  minigames sugeridos exigiriam movimento/física em tempo real (canvas
  ou WebGL) pra funcionar de verdade — implementei 6 minigames genuínos
  em vez de simular fisicamente esses 4 de forma capenga.

## Testes realizados (de verdade)

- `unit-v2-test.js` (8) — regras herdadas: carta Especial, Derrubem o
  Rei, Ganância, imunidade, Vingança, timeout automático, Panela de
  Pressão, vitória.
- `unit-v3-test.js` (5) — bônus de Pressão aplicado/desligado, cálculo de
  nível, perguntas da galera no sorteio real, intervalo "Aleatório".
- `integration-v2-test.js` (29) — os 24 itens do checklist anterior,
  revalidados com a nova config (frequência de cartas em vez de
  liga/desliga, winScore 3/5/7/10, etc).
- `integration-v3-test.js` (12) — reconexão (queda + `rejoin_room` +
  recupera a MESMA sessão sem duplicar jogador + consegue votar depois),
  Perguntas da Galera (submeter, validar tamanho, remover com permissão
  correta), reações (chegam em tempo real, cooldown bloqueia spam),
  8 ciclos de minigame via socket real (viu Alvo Certo, Tiro ao Alvo,
  Batata Quente, Dedo Nervoso, Não Clique e Coroa rodando de ponta a
  ponta em diferentes execuções).

**Total: 61 verificações automatizadas, todas passando** (54 da V3 +
7 de sinalização do chat de voz), rodadas do
zero (`npm install` limpo) antes de empacotar.

Encontrei e corrigi bugs reais nesse processo — o mais importante:
descobri que meu teste de integração anterior usava valores de config
(`winScore: 999`, `minigameInterval: 1`) que não existem na lista pública
de opções válidas e por isso eram silenciosamente ignorados, caindo no
padrão do modo. Corrigi os testes pra forçar esses valores direto no
estado da sala quando o objetivo é controlar o cenário de teste
(igual eu já fazia pra forçar cartas específicas), e mantive a validação
real (rejeitar valores fora da lista) intacta no código de produção,
porque é o comportamento correto.

## Limitações conhecidas

- Sem persistência: estado vive na memória do processo; reinício do
  servidor derruba salas ativas.
- Reconexão funciona por token salvo no `localStorage` do navegador —
  troca de navegador/dispositivo não reconecta (é uma sessão nova).
- Perguntas da Galera não têm filtro de conteúdo automático além de
  tamanho — é confiança entre quem está jogando junto, como um jogo de
  mesa mesmo.
- Timeout de escolha interativa (Ganância/Vingança, 20s) foi validado
  via função pura + estrutura do timer, não com uma espera real de 20s
  no teste de integração (o timer de votação, esse sim, foi testado
  esperando os 15s reais).

## Chat de voz (WebRTC)

Implementado nesta versão (V3.1) — inicialmente estava planejado só para
a V3.4, mas foi adiantado a pedido.

- **Malha WebRTC**: cada jogador conecta diretamente com todos os outros
  (funciona bem até os 12 jogadores por sala já suportados). O servidor
  **nunca vê nem toca no áudio** — só retransmite mensagens de sinalização
  (`voice_join`, `voice_signal`, `voice_peer_joined/left`) pra cada
  navegador conseguir negociar a conexão direto com o outro.
- **Indicador de quem está falando**: anel verde animado no avatar,
  calculado localmente em cada navegador via `AnalyserNode` (Web Audio),
  sem depender do servidor.
- **Push-to-talk opcional**: por padrão o microfone fica sempre aberto
  (mais simples); quem preferir pode ligar "segurar pra falar" no painel.
- **Volume e mute individuais**: um controle de volume e um botão de
  silenciar por pessoa, aplicados só localmente (não afeta o que os
  outros ouvem).
- Botão 🎙️ fixo no canto superior direito, disponível em qualquer tela
  assim que você está numa sala (lobby, jogo, resultado, minigame,
  vitória).

**Limitação honesta**: uso apenas servidores **STUN públicos e gratuitos**
(Google) pra atravessar NAT. Isso cobre a grande maioria das redes
domésticas/4G, mas em redes bem restritivas (algumas redes corporativas,
NAT simétrico) a conexão direta pode falhar — a solução definitiva seria
um servidor **TURN** próprio (ex: coturn autogerenciado, ou um serviço
como Twilio/Xirsys), que exige infraestrutura paga/hospedada e não está
incluído aqui.

**O que eu consegui testar de verdade**: toda a camada de **sinalização**
— quem é avisado de quem, na hora certa, e que o servidor retransmite o
conteúdo do sinal sem alterá-lo nem vazá-lo pro jogador errado (7
verificações automatizadas em `test/integration-voice-test.js`, rodando
contra o servidor real). **O que eu NÃO consigo testar aqui**: áudio de
verdade passando entre navegadores — isso depende de microfone e
navegador reais, que não existem neste ambiente headless. Preciso que
você confirme isso jogando de verdade com outra pessoa.


