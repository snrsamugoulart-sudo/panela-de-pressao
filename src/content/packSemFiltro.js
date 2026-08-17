// src/content/packSemFiltro.js
// Pacote de cartas usado exclusivamente pelo modo "Sem Filtro": perguntas
// mais absurdas e provocativas, mas sem conteúdo sexual/adulto explícito
// (conforme escopo definido para esta versão).

const PACK_SEM_FILTRO = [
  // ============================================================
  // COMUM
  // ============================================================
  { id: 'sf-c-01', rarity: 'comum', category: 'vergonha', text: 'Quem provavelmente trairia a dieta em menos de um dia?' },
  { id: 'sf-c-02', rarity: 'comum', category: 'decisoes-ruins', text: 'Quem provavelmente mentiria descaradamente pra sair de um compromisso chato?' },
  { id: 'sf-c-03', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente daria unfollow em alguém por uma bobagem?' },
  { id: 'sf-c-04', rarity: 'comum', category: 'decisoes-ruins', text: 'Quem provavelmente fingiria estar doente pra faltar no trabalho amanhã?' },
  { id: 'sf-c-05', rarity: 'comum', category: 'dinheiro', text: 'Quem provavelmente gastaria o salário inteiro em um único dia?' },
  { id: 'sf-c-06', rarity: 'comum', category: 'vergonha', text: 'Quem provavelmente esqueceria o nome de alguém no meio de uma apresentação?' },
  { id: 'sf-c-07', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar close pro espelho achando que ninguém tá vendo?' },
  { id: 'sf-c-08', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente stalkearia o ex nas redes sociais até hoje?' },
  { id: 'sf-c-09', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente inventaria uma história pra parecer mais interessante?' },
  { id: 'sf-c-10', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia brigar com o motorista de aplicativo por bobagem?' },
  { id: 'sf-c-11', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente fingiria ter lido o livro só pra participar da conversa?' },
  { id: 'sf-c-12', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia dar rolê sozinho e postar como se tivesse com a galera?' },
  { id: 'sf-c-13', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia mijar na piscina jurando que "todo mundo faz isso"?' },
  { id: 'sf-c-14', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia vomitar numa festa e continuar bebendo cinco minutos depois?' },
  { id: 'sf-c-15', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de "não fico com ciúmes" transbordando de ciúmes?' },
  { id: 'sf-c-16', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia falar mal de alguém sem saber que a pessoa tava logo atrás?' },
  { id: 'sf-c-17', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia dar match, conversar dois dias e sumir sem explicação?' },
  { id: 'sf-c-18', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia peidar durante uma sessão de ioga e culpar a respiração?' },
  { id: 'sf-c-19', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de vítima numa briga que começou porque ele mesmo errou?' },
  { id: 'sf-c-20', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia se gabar de uma vitória que na real foi sorte pura?' },
  { id: 'sf-c-21', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia dar uma de durão bêbado e apanhar feio de alguém bem menor?' },
  { id: 'sf-c-22', rarity: 'comum', category: 'cotidiano', text: 'Quem provavelmente ia comer escondido a comida de todo mundo na geladeira do trabalho?' },
  { id: 'sf-c-23', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia jurar amor eterno bêbado e esquecer completamente no dia seguinte?' },
  { id: 'sf-c-24', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia soltar uma indireta gigante e jurar que "não é pra ninguém específico"?' },
  { id: 'sf-c-25', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar um chilique digno de novela por uma bobagem qualquer?' },
  { id: 'sf-c-26', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia trair a confiança de alguém por uma fofoca boa demais pra guardar?' },
  { id: 'sf-c-27', rarity: 'comum', category: 'dinheiro', text: 'Quem provavelmente ia se gabar de ter feito uma dieta que na real durou meio dia?' },
  { id: 'sf-c-28', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia dar uma de sofredor no story só pra ganhar atenção de alguém específico?' },
  { id: 'sf-c-29', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia soltar um "não foi nada" enquanto por dentro tá se cortando de raiva?' },
  { id: 'sf-c-30', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia se meter numa briga alheia só pra aparecer?' },
  { id: 'sf-c-31', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia dar match com o ex sem querer e travar de vergonha?' },
  { id: 'sf-c-32', rarity: 'comum', category: 'cotidiano', text: 'Quem provavelmente ia esquecer completamente um compromisso importante bêbado no dia anterior?' },
  { id: 'sf-c-33', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia soltar aquele arroto de cerveja bem no meio de uma conversa séria?' },
  { id: 'sf-c-34', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia deixar o crush no vácuo só pra fingir que é difícil?' },
  { id: 'sf-c-35', rarity: 'comum', category: 'dinheiro', text: 'Quem provavelmente ia dar um migué gigante pra não devolver um dinheiro emprestado?' },
  { id: 'sf-c-36', rarity: 'comum', category: 'vergonha', text: 'Quem provavelmente ia rir tanto que ia soltar um pum sem querer na frente de todo mundo?' },
  { id: 'sf-c-37', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de santo enquanto esconde os podres mais bizarros?' },
  { id: 'sf-c-38', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia trocar de grupo de amigos só porque brigou com um de vocês?' },
  { id: 'sf-c-39', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia mandar áudio de 5 minutos chorando por uma bobagem?' },
  { id: 'sf-c-40', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de "tô de boa" e no fundo tá plotando vingança?' },
  { id: 'sf-c-41', rarity: 'comum', category: 'cotidiano', text: 'Quem provavelmente ia comer o resto de comida velha da geladeira só pra não desperdiçar?' },
  { id: 'sf-c-42', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia soltar aquele arroto que assusta o vizinho?' },
  { id: 'sf-c-43', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de expert numa área que mal entende, só pra não parecer burro?' },
  { id: 'sf-c-44', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia surtar de ciúmes por uma curtida boba no Instagram?' },
  { id: 'sf-c-45', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia negar até a morte que chorou vendo um filme?' },
  { id: 'sf-c-46', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia dar uma de "não gosto de fofoca" contando a fofoca inteirinha logo depois?' },
  { id: 'sf-c-47', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia dar um vexame gigante numa festa de trabalho por causa da bebida?' },
  { id: 'sf-c-48', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia dar uma de corajoso e ia fugir correndo de uma barata pequena?' },
  { id: 'sf-c-49', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia trair a confiança do grupo espalhando um segredo pesado?' },
  { id: 'sf-c-50', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia soltar um "juro que não fui eu" sabendo que foi ele mesmo?' },
  { id: 'sf-c-51', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de forte e chorar escondido no banheiro logo depois?' },
  { id: 'sf-c-52', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia armar uma treta gigante só pra ter assunto pro grupo?' },
  { id: 'sf-c-53', rarity: 'comum', category: 'personalidade', text: 'Quem provavelmente ia dar uma de "tô tranquilo" e ia mandar 15 mensagens seguidas de raiva?' },
  { id: 'sf-c-54', rarity: 'comum', category: 'amizade', text: 'Quem provavelmente ia trair um segredo por uma fofoca boa demais de guardar sozinho?' },
  { id: 'sf-c-55', rarity: 'comum', category: 'decisoes-ruins', text: 'Quem provavelmente ia dar uma de gente boa achando que assim ninguém desconfia da roubada que aprontou?' },
  { id: 'sf-c-56', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia dar risada nervosa quando pega no flagra fazendo merda?' },
  { id: 'sf-c-57', rarity: 'comum', category: 'situacoes-sociais', text: 'Quem provavelmente ia armar um clima e depois fugir com medo de assumir?' },
  { id: 'sf-c-58', rarity: 'comum', category: 'dinheiro', text: 'Quem provavelmente juraria que dividiu a conta certinho e na real ficou devendo?' },
  { id: 'sf-c-59', rarity: 'comum', category: 'situacoes-absurdas', text: 'Quem provavelmente ia acordar de ressaca jurando nunca mais beber e beber de novo na mesma semana?' },
  { id: 'sf-c-60', rarity: 'comum', category: 'tecnologia', text: 'Quem provavelmente ia dar biscoito no privado de alguém comprometido "só de brincadeira"?' },

  // ============================================================
  // ESPECIAL
  // ============================================================
  { id: 'sf-e-01', rarity: 'especial', category: 'decisoes-ruins', text: 'Quem provavelmente já mandou mensagem pro grupo errado falando mal de alguém que tava lá dentro?' },
  { id: 'sf-e-02', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente trairia a confiança de todo mundo por uma vantagem pequena?' },
  { id: 'sf-e-03', rarity: 'especial', category: 'decisoes-ruins', text: 'Quem provavelmente daria um jeitinho antiético se soubesse que ninguém ia descobrir mesmo?' },
  { id: 'sf-e-04', rarity: 'especial', category: 'competicao', text: 'Quem provavelmente ia dedurar todo mundo pra não se ferrar sozinho?' },
  { id: 'sf-e-05', rarity: 'especial', category: 'situacoes-sociais', text: 'Quem provavelmente ia armar uma cilada só pra ver a reação de alguém?' },
  { id: 'sf-e-06', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia trocar o crush de amigo pelo próprio crush sem pensar duas vezes?' },
  { id: 'sf-e-07', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia mentir descaradamente pra não assumir a culpa numa treta do grupo?' },
  { id: 'sf-e-08', rarity: 'especial', category: 'personalidade', text: 'Quem provavelmente venderia o próprio orgulho por uma vantagem besta?' },
  { id: 'sf-e-09', rarity: 'especial', category: 'competicao', text: 'Quem provavelmente ia sabotar alguém só pra brilhar mais na frente dos outros?' },
  { id: 'sf-e-10', rarity: 'especial', category: 'competicao', text: 'Quem provavelmente aceitaria qualquer roubada só pela fama de cinco minutos?' },
  { id: 'sf-e-11', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia jogar um amigo debaixo do ônibus pra se safar de uma bronca?' },
  { id: 'sf-e-12', rarity: 'especial', category: 'dinheiro', text: 'Quem provavelmente ia fingir uma emergência médica só pra não pagar a conta?' },
  { id: 'sf-e-13', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia trair um pacto de amizade por uma treta besta de festa?' },
  { id: 'sf-e-14', rarity: 'especial', category: 'situacoes-sociais', text: 'Quem provavelmente ia mentir sobre estar solteiro só pra dar em cima de alguém?' },
  { id: 'sf-e-15', rarity: 'especial', category: 'personalidade', text: 'Quem provavelmente ia esconder um podre gigante e agir feito santo na frente de todo mundo?' },
  { id: 'sf-e-16', rarity: 'especial', category: 'situacoes-absurdas', text: 'Quem provavelmente ia mandar o pior áudio bêbado da história e implorar pra apagar depois?' },
  { id: 'sf-e-17', rarity: 'especial', category: 'decisoes-ruins', text: 'Quem provavelmente ia inventar um trauma falso só pra ganhar uma desculpa de socorro?' },
  { id: 'sf-e-18', rarity: 'especial', category: 'personalidade', text: 'Quem provavelmente ia dar uma de vítima depois de ter armado a própria armadilha?' },
  { id: 'sf-e-19', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia trocar de time numa treta só pra ficar do lado que ganha?' },
  { id: 'sf-e-20', rarity: 'especial', category: 'amizade', text: 'Quem provavelmente ia sabotar o próprio amigo numa pegadinha que sai do controle?' },

  // ============================================================
  // CAOS
  // ============================================================
  {
    id: 'sf-x-01',
    rarity: 'caos',
    category: 'caos',
    text: 'Quem está se achando o rei/rainha do grupo só porque está na frente?',
    effect: { type: 'leader_only_vote' },
  },
  {
    id: 'sf-x-02',
    rarity: 'caos',
    category: 'caos',
    text: 'Quem venderia todo mundo do grupo por uma vantagem boa o suficiente?',
    effect: {
      type: 'winner_choice',
      options: [
        { key: 'pontos', label: '+2 pontos', delta: 2 },
        { key: 'imunidade', label: '+1 ponto e imunidade na próxima rodada', delta: 1, immunity: true },
      ],
    },
  },
  {
    id: 'sf-x-03',
    rarity: 'caos',
    category: 'caos',
    text: 'Quem tá precisando descer do salto porque já ganhou demais essa noite?',
    effect: { type: 'leader_only_vote' },
  },

  // ============================================================
  // LENDÁRIA
  // ============================================================
  {
    id: 'sf-l-01',
    rarity: 'lendaria',
    category: 'lendaria',
    text: 'Quem provavelmente causaria o maior escândalo do grupo em uma festa?',
    effect: { type: 'double_points_no_tie' },
  },
  {
    id: 'sf-l-02',
    rarity: 'lendaria',
    category: 'lendaria',
    text: 'Quem é a pessoa mais descontrolada quando bebe um pouquinho a mais?',
    effect: { type: 'random_bonus', values: [3, 2, 1, -1] },
  },
  {
    id: 'sf-l-03',
    rarity: 'lendaria',
    category: 'lendaria',
    text: 'Quem você escolheria pra levar a culpa da pior roubada da noite?',
    effect: { type: 'winner_curse' },
  },
];

module.exports = PACK_SEM_FILTRO;
