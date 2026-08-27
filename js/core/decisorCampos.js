/* ============================================================================
   DECISORCAMPOS.JS — Prioridade 4 do checklist: "decisão".

   PROBLEMA QUE ISTO RESOLVE: a lógica de "tenho vários candidatos para o
   mesmo campo, qual venceu e por quê" estava reimplementada inteira dentro
   de processarEspecificacaoHistorico() (inteligenciaJuridica.js) — cerca de
   100 linhas misturando agrupamento por valor, cálculo de confiança final,
   montagem de conflitos, montagem de evidências e texto de justificativa,
   tudo específico daquele único ponto de uso. Isso não era reaproveitável
   por nenhum outro extrator/decisor do app.

   Este arquivo formaliza essa lógica num motor único e genérico (sem
   conhecimento de desapropriação, sentença, oferta etc.):

     CANDIDATO + EVIDÊNCIA + CONFIANÇA + CONFLITOS + REGRAS = DECISÃO

   - CANDIDATO: um valor possível para o campo. Aqui candidato e evidência
     andam juntos no mesmo objeto — no domínio deste app, todo candidato tem
     necessariamente uma origem no documento (página, trecho, âncora), então
     seria artificial separá-los em duas listas paralelas:
       { valor, confianca, pagina, trecho, expressao?, paragrafo? }
   - EVIDÊNCIA: pagina/trecho/expressao/paragrafo de cada candidato, acima —
     é o que aparece na conferência (Fase 6) para auditar "de onde veio cada
     opção", não só a vencedora.
   - CONFIANÇA: um número por candidato (calculado por quem chama — este
     arquivo não decide COMO estimar confiança, só o que fazer com ela depois
     de estimada; ver sistemaConfianca.js para a régua de confiança-base).
   - CONFLITOS: quando mais de um VALOR distinto aparece com confiança
     parecida (ou quando quem chamou pede explicitamente para reportar todo
     concorrente, ver `opcoes.sempreConflito`), isso vira um conflito
     registrado — nunca escondido silenciosamente.
   - REGRAS: funções plugáveis que ajustam a lista de candidatos ANTES do
     agrupamento/decisão (filtrar por confiança mínima, desempatar por ter
     âncora textual...). Regras específicas do domínio jurídico (ex.: "o
     acórdão que reforma a sentença vence", "índice ambíguo fica com
     confiança baixa") continuam em inteligenciaJuridica.js — são regras de
     NEGÓCIO, não de mecânica de decisão, e cada uma tem efeitos colaterais
     próprios (troca de fonte, alerta específico) que não cabem num motor
     genérico. As regras aqui são as puramente mecânicas, reaproveitáveis por
     qualquer campo/extrator.

   USO TÍPICO:
     const decisao = decidirCampo(candidatos, { chaveDe, formatar });
     // decisao = { valor, confianca, pagina, trecho, conflitos, evidencias,
     //             justificativa, emConflito } ou null se não havia candidato

   Para o caso de "já sei qual é o vencedor (decidido em outro lugar), só
   preciso montar conflitos/evidências/justificativa contra os concorrentes"
   (o caso de processarEspecificacaoHistorico), use montarDecisao() direto —
   ver função 3 abaixo.

   DEPENDE de: nada obrigatoriamente. Se sistemaConfianca.js (CONFIANCA_BASE)
   já estiver carregado, usa CONFIANCA_BASE.CONFLITO_NAO_RESOLVIDO como piso
   padrão de confiança em conflito; senão cai num literal equivalente (0.3).
   Deve carregar depois de sistemaConfianca.js e antes de
   inteligenciaJuridica.js (que passa a consumir isto).
============================================================================ */

const MARGEM_CONFLITO_PADRAO = 0.15; // diferença de confiança abaixo da qual dois valores concorrentes são tratados como empate (conflito), não como vencedor claro
const BONUS_CORROBORACAO = 0.05; // por ocorrência EXTRA do mesmo valor (independente, em página/âncora diferente) — nunca leva a confiança acima de 0.95
const TETO_CONFIANCA_CORROBORACAO = 0.95;

function confiancaConflitoPadrao(){
  return (typeof CONFIANCA_BASE !== 'undefined' && CONFIANCA_BASE.CONFLITO_NAO_RESOLVIDO != null)
    ? CONFIANCA_BASE.CONFLITO_NAO_RESOLVIDO
    : 0.3;
}

/* ------------------------------------------------------------------------
   1. REGRAS PADRÃO (mecânicas, sem conhecimento de domínio)
   Uma regra é `(candidatos, contexto) => candidatos` — recebe a lista plana
   de candidatos válidos e devolve uma lista (a mesma, filtrada, reordenada
   ou com `.confianca` ajustada). Rodam em sequência, na ordem do array
   `opcoes.regras` passado a decidirCampo().
------------------------------------------------------------------------ */

// Fábrica: descarta candidatos abaixo de um piso de confiança ANTES da
// decisão — evita que um candidato muito fraco "vença" só por ser o único
// encontrado numa rodada específica, quando na prática não há evidência
// suficiente para decidir nada.
function regraLimiarMinimo(limiar){
  return function(candidatos){
    return candidatos.filter(c => c.confianca >= limiar);
  };
}

// Em caso de empate EXATO de confiança entre candidatos, dá uma vantagem
// mínima (não decisiva sobre uma diferença real) a quem tem uma expressão de
// âncora textual identificada — "temos uma explicação de por que este valor
// é o certo" pesa mais do que "foi só o número mais próximo".
function regraDesempatarPorExpressaoAncora(candidatos){
  return candidatos.map(c => {
    if(!c.expressao) return c;
    return { ...c, confianca: Math.min(0.99, c.confianca + 0.001) };
  });
}

const REGRAS_PADRAO = [regraDesempatarPorExpressaoAncora];

/* ------------------------------------------------------------------------
   2. AGRUPAMENTO — candidatos que representam o MESMO valor (via
   `chaveDe`, ex.: centavos para moeda, string ISO para data) viram um único
   grupo, com todas as ocorrências preservadas. Conflito é entre GRUPOS
   (valores distintos), nunca entre ocorrências repetidas do mesmo valor —
   isso é corroboração, tratado como bônus de confiança, não como divergência.
------------------------------------------------------------------------ */
function agruparAvaliacoesPorValor(candidatos, chaveDe){
  const grupos = new Map();
  (candidatos || []).forEach(c => {
    const chave = chaveDe(c.valor);
    if(!grupos.has(chave)) grupos.set(chave, { valor: c.valor, ocorrencias: [] });
    grupos.get(chave).ocorrencias.push(c);
  });
  return Array.from(grupos.values()).map(g => ({
    ...g,
    confiancaMax: g.ocorrencias.length
      ? Math.min(TETO_CONFIANCA_CORROBORACAO, Math.max(...g.ocorrencias.map(o => o.confianca || 0)) + BONUS_CORROBORACAO * (g.ocorrencias.length - 1))
      : 0
  }));
}

/* ------------------------------------------------------------------------
   3. MONTAGEM DA DECISÃO a partir de um vencedor JÁ ESCOLHIDO (por
   decidirCampo() abaixo, ou por quem chamar diretamente quando o vencedor já
   foi decidido em outro lugar — ver processarEspecificacaoHistorico() em
   inteligenciaJuridica.js) + a lista de grupos concorrentes.

   `opcoes.sempreConflito` força o modo conflito mesmo quando a diferença de
   confiança entre vencedor e maior concorrente é grande — usado quando o
   objetivo é reportar TODA divergência encontrada (auditoria), não só as
   que realmente mudariam a decisão.
------------------------------------------------------------------------ */
function montarDecisao(vencedor, concorrentes, opcoes){
  opcoes = opcoes || {};
  const formatar = opcoes.formatar || (v => String(v));
  const margemConflito = opcoes.margemConflito != null ? opcoes.margemConflito : MARGEM_CONFLITO_PADRAO;
  const confiancaConflito = opcoes.confiancaConflito != null ? opcoes.confiancaConflito : confiancaConflitoPadrao();

  const decisao = {
    valor: vencedor.valor,
    confianca: vencedor.confiancaMax,
    pagina: null,
    trecho: '',
    conflitos: [],
    evidencias: [],
    justificativa: null,
    emConflito: false
  };

  const ocorrenciasVencedor = (vencedor.ocorrencias || []).slice().sort((a, b) => b.confianca - a.confianca);
  const evidenciaEscolhida = ocorrenciasVencedor[0] || null;
  if(evidenciaEscolhida){
    decisao.pagina = evidenciaEscolhida.pagina || null;
    decisao.trecho = evidenciaEscolhida.trecho || '';
  }

  const concorrentesRelevantes = (concorrentes || []).filter(g => g.ocorrencias && g.ocorrencias.length);
  if(!concorrentesRelevantes.length) return decisao; // nenhum concorrente — decisão limpa, sem conflito

  const maiorConcorrente = concorrentesRelevantes.slice().sort((a, b) => b.confiancaMax - a.confiancaMax)[0];
  const emConflito = opcoes.sempreConflito || (vencedor.confiancaMax - maiorConcorrente.confiancaMax) < margemConflito;
  if(!emConflito) return decisao; // concorrente existe, mas o vencedor se destaca claramente — sem necessidade de sinalizar

  decisao.emConflito = true;
  decisao.confianca = Math.min(vencedor.confiancaMax, confiancaConflito);

  decisao.conflitos = concorrentesRelevantes.map(g => {
    const primeira = g.ocorrencias[0];
    return {
      tipo: opcoes.tipoConflito || 'candidato_concorrente',
      valor: g.valor,
      vezes: g.ocorrencias.length,
      pagina: primeira.pagina ? primeira.pagina.numero : null,
      arquivo: primeira.pagina ? (primeira.pagina.arquivo || null) : null,
      trecho: primeira.trecho || '',
      mensagem: `Outro valor (${formatar(g.valor)}) encontrado ${g.ocorrencias.length}x ${opcoes.contextoMensagem || 'com confiança semelhante'}.`
    };
  });

  // --- EVIDÊNCIAS: a escolhida (se houver) + cada ocorrência concorrente,
  // sempre com página/parágrafo/confiança/expressão — auditável mesmo para
  // quem foi descartado, não só para o vencedor.
  const paraEntrada = (c, escolhido) => ({
    escolhido,
    valor: c.valor,
    pagina: c.pagina ? c.pagina.numero : null,
    arquivo: c.pagina ? (c.pagina.arquivo || null) : null,
    paragrafo: c.paragrafo || null,
    confianca: c.confianca,
    expressao: c.expressao || '',
    trecho: c.trecho || ''
  });
  decisao.evidencias = [
    ...(evidenciaEscolhida ? [paraEntrada(evidenciaEscolhida, true)] : []),
    ...concorrentesRelevantes.flatMap(g => g.ocorrencias.slice().sort((a, b) => b.confianca - a.confianca).map(c => paraEntrada(c, false)))
  ];

  // --- JUSTIFICATIVA: só dá pra explicar "por que este e não aquele" quando
  // existe evidência do próprio vencedor para comparar (ver guard acima).
  if(evidenciaEscolhida){
    const partes = concorrentesRelevantes.map(g => {
      const c = g.ocorrencias.slice().sort((a, b) => b.confianca - a.confianca)[0];
      const ondeEscolhida = evidenciaEscolhida.pagina ? `pág. ${evidenciaEscolhida.pagina.numero}` : 'origem não identificada';
      const ondeAlt = c.pagina ? `pág. ${c.pagina.numero}` : 'origem não identificada';
      const expEscolhida = evidenciaEscolhida.expressao ? `, junto de "${evidenciaEscolhida.expressao}"` : '';
      const expAlt = c.expressao ? `, junto de "${c.expressao}"` : '';
      return `optou-se por "${formatar(vencedor.valor)}" (${ondeEscolhida}${evidenciaEscolhida.paragrafo ? `, parágrafo ${evidenciaEscolhida.paragrafo}` : ''}, confiança estimada ${Math.round(evidenciaEscolhida.confianca * 100)}%${expEscolhida}) em vez de "${formatar(c.valor)}" (${ondeAlt}${c.paragrafo ? `, parágrafo ${c.paragrafo}` : ''}, confiança estimada ${Math.round(c.confianca * 100)}%${expAlt})`;
    });
    decisao.justificativa = partes.join('; ') + '. Confiança estimada por proximidade a uma âncora textual mais ou menos específica e pelas regras aplicadas — não substitui a leitura do trecho pelo advogado.';
  }

  return decisao;
}

/* ------------------------------------------------------------------------
   4. DECISÃO COMPLETA — candidato + evidência + confiança + conflitos +
   regras, tudo num só passo, para quando ninguém ainda decidiu o vencedor
   (diferente de processarEspecificacaoHistorico, que já parte de um valor
   pinado por classificadorExtrator.js e só audita divergência).

   `opcoes`:
     chaveDe(valor)        — chave de agrupamento (padrão: identidade)
     formatar(valor)       — para mensagens legíveis (padrão: String())
     regras                — array de funções (padrão: REGRAS_PADRAO)
     contexto              — objeto livre repassado a cada regra
     margemConflito        — ver MARGEM_CONFLITO_PADRAO
     confiancaConflito     — ver confiancaConflitoPadrao()
     sempreConflito        — força reportar todo concorrente (ver montarDecisao)
     tipoConflito          — string livre para campo.conflitos[].tipo
     contextoMensagem      — trecho da frase da mensagem de conflito
------------------------------------------------------------------------ */
function decidirCampo(candidatos, opcoes){
  opcoes = opcoes || {};
  const chaveDe = opcoes.chaveDe || (v => v);
  const regras = opcoes.regras || REGRAS_PADRAO;
  const contexto = opcoes.contexto || {};

  let pool = (candidatos || []).filter(c =>
    c && c.valor !== null && c.valor !== undefined && c.valor !== '' &&
    typeof c.confianca === 'number' && isFinite(c.confianca)
  );
  if(!pool.length) return null;

  regras.forEach(regra => { pool = regra(pool, contexto) || pool; });
  if(!pool.length) return null;

  const grupos = agruparAvaliacoesPorValor(pool, chaveDe).sort((a, b) => b.confiancaMax - a.confiancaMax);
  const [vencedor, ...concorrentes] = grupos;

  return montarDecisao(vencedor, concorrentes, opcoes);
}
