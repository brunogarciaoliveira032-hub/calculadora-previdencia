/* ============================================================================
   HISTORICOPREVIDENCIARIO.JS — a ENTIDADE consolidada do segurado, pedida
   pelo usuário para substituir "motores recebendo dados soltos":

     {
       segurado: {nome, cpf, nascimento},
       vinculos: [],
       remuneracoes: [],
       contribuicoes: [],
       beneficios: [],
       periodosEspeciais: [],
       periodosRurais: [],
       documentos: [],
       proveniencia: []
     }

   A PARTIR DESTA ATUALIZAÇÃO, o consumo pretendido é: montarHistorico()
   UMA VEZ (junta tudo que foi extraído, valida, consolida, gera
   proveniência) e depois só se passa o HISTÓRICO ADIANTE — nunca mais um
   array de vínculos solto de um lado e um array de remunerações solto de
   outro. calcularTempoEcarenciaDeHistorico() é o único ponto que ainda
   "desmonta" o histórico em arrays crus, e só porque MotorTempoContribuicao
   é (de propósito) uma função pura sem saber o que é um "histórico" — ver
   nota no bloco 4 sobre por que os motores NÃO foram reescritos para
   aceitar o objeto inteiro.

   CAMPOS SEM EXTRATOR PRÓPRIO NESTA ENTREGA (escopo consciente, não
   inventado): `segurado`, `beneficios`, `periodosEspeciais`,
   `periodosRurais`. A FORMA já existe (para os motores futuros poderem
   contar com ela) mas o CONTEÚDO só chega de fora:
     - `segurado`: passado pronto em `entrada.segurado` (ex.: já digitado
       no formulário) — nenhum extrator de identificação existe ainda;
       fica `{nome:null, cpf:null, nascimento:null}` se não informado.
     - `beneficios`/`periodosEspeciais`/`periodosRurais`: aceitos como
       candidatos já prontos em `entrada.beneficios`/
       `entrada.periodosEspeciais`/`entrada.periodosRurais` (mesmo
       contrato de status 'validado'/'requer_revisao' dos outros
       candidatos) — filtrados do mesmo jeito que vínculo/remuneração, mas
       SEM nenhuma extração de PDF por trás ainda (isso é
       document-types/ppp.js e carta-concessao.js, registrados como
       próxima fatia em ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md). Um
       candidato sem `.status` é aceito como já validado por quem chamou
       (mesma convenção defensiva do resto do arquivo).

   `vinculos`/`remuneracoes` continuam vindo de extratorVinculosCNIS.js/
   extratorRemuneracoesCNIS.js (únicos extratores reais até aqui).

   `contribuicoes` é DERIVADO, não um extrator: uma entrada por
   competência com remuneração > 0 realmente lançada (pode ou não estar
   ligada a um vínculo — contribuinte individual/facultativo contribui
   sem vínculo empregatício, por isso `vinculoId` pode ser `null`).

   `documentos` é DERIVADO: manifesto único (documento+página+arquivo) de
   toda fonte vista em `vinculos`/`remuneracoes` de entrada, mesmo as
   descartadas por validação — é "o que foi lido", não "o que foi usado".

   `proveniencia` é DERIVADO: um registro por FATO consolidado
   (vínculo/remuneração/contribuição), sempre rastreável de volta à fonte
   e à confiança/status originais — a peça que permite a uma tela futura
   responder "de onde veio esse número?" sem reabrir o PDF.

   DEPENDE de (globais, carregar antes deste arquivo):
     - vinculosParaMotorTempoContribuicao()      (mapping/mapperPrevidenciario.js)
     - MotorTempoContribuicao                     (motorTempoContribuicao.js)
============================================================================ */

function _prevGerarId(prefixo, indice) {
  return prefixo + (indice + 1);
}

function _prevCompetenciaDoIso(dataIso) {
  return dataIso ? String(dataIso).slice(0, 7) : null;
}

function _prevCompetenciaDentroDoVinculo(competencia, vinculo) {
  var compIni = _prevCompetenciaDoIso(vinculo.inicio);
  var compFim = _prevCompetenciaDoIso(vinculo.fim);
  if (!compIni || !compFim) return false;
  return competencia >= compIni && competencia <= compFim;
}

// Candidatos de beneficio/periodoEspecial/periodoRural ainda não têm
// extrator real (ver cabeçalho) — este filtro só aplica o MESMO critério
// de status já usado para vínculo/remuneração, sem tentar entender o
// conteúdo do candidato.
function _prevFiltrarCandidatosGenericos(lista, incluirRequerRevisao) {
  return (Array.isArray(lista) ? lista : []).filter(function (c) {
    if (!c) return false;
    if (!c.status) return true; // sem status = aceito como já validado por quem chamou
    return incluirRequerRevisao || c.status === 'validado';
  });
}

/* ------------------------------------------------------------------------
   1. VÍNCULOS — reaproveita vinculosParaMotorTempoContribuicao()
   (mapping/mapperPrevidenciario.js), não duplica a lógica de filtro por
   status/vínculo em aberto. Só acrescenta `.id` para virar a chave que
   remuneracoes/contribuicoes/proveniencia referenciam.
------------------------------------------------------------------------ */
function _prevMontarVinculos(candidatosVinculo, opcoes) {
  var mapeado = (typeof vinculosParaMotorTempoContribuicao === 'function')
    ? vinculosParaMotorTempoContribuicao(candidatosVinculo, opcoes)
    : { vinculos: [], ignorados: (candidatosVinculo || []).map(function (c) { return { candidato: c, motivo: 'vinculosParaMotorTempoContribuicao não carregado' }; }) };

  var vinculos = mapeado.vinculos.map(function (v, i) {
    return Object.assign({ id: _prevGerarId('v', i) }, v);
  });
  return { vinculos: vinculos, ignorados: mapeado.ignorados };
}

/* ------------------------------------------------------------------------
   2. REMUNERAÇÕES — filtra por status (mesmo critério do mapper de
   vínculo) e anexa `.vinculoId`/`.vinculosCorrespondentes` (associação
   por competência, mesma regra já usada na versão anterior deste
   arquivo): 0 vínculos correspondentes -> `.vinculoId: null` (remuneração
   sem vínculo, nunca descartada); 1 -> `.vinculoId` preenchido; 2+ ->
   `.vinculoId: null` mas `.vinculosCorrespondentes` lista todos (ambíguo,
   nunca escolhido sozinho).
------------------------------------------------------------------------ */
function _prevMontarRemuneracoes(candidatosRemuneracao, vinculos, opcoes) {
  var incluirRequerRevisao = !!opcoes.incluirRequerRevisaoRemuneracoes;
  var validas = [];
  var ignoradas = [];
  (Array.isArray(candidatosRemuneracao) ? candidatosRemuneracao : []).forEach(function (r) {
    if (!r || r.tipo !== 'remuneracao') return;
    if (!incluirRequerRevisao && r.status !== 'validado') {
      ignoradas.push({ candidato: r, motivo: 'status "' + r.status + '" (não validado) — use opcoes.incluirRequerRevisaoRemuneracoes para incluir mesmo assim' });
      return;
    }
    validas.push(r);
  });

  var remuneracoes = validas.map(function (r, i) {
    var correspondentes = vinculos.filter(function (v) { return _prevCompetenciaDentroDoVinculo(r.competencia, v); });
    return Object.assign({ id: _prevGerarId('r', i) }, r, {
      vinculoId: correspondentes.length === 1 ? correspondentes[0].id : null,
      vinculosCorrespondentes: correspondentes.map(function (v) { return v.id; })
    });
  });
  return { remuneracoes: remuneracoes, ignoradas: ignoradas };
}

/* ------------------------------------------------------------------------
   3. CONTRIBUIÇÕES — derivadas das remunerações com valor > 0: uma
   entrada por COMPETÊNCIA. Quando mais de uma remuneração cai na mesma
   competência, distingue dois casos que a versão anterior deste arquivo
   tratava como se fossem o mesmo ("ambígua", usando só a primeira
   remuneração e descartando a(s) outra(s) silenciosamente do `.valor`):

     a) CONCOMITÂNCIA REAL (Art. 32, Lei 8.213/91) — a competência cai
        dentro do período de DOIS OU MAIS VÍNCULOS (ex.: dois empregos
        simultâneos) E há mais de uma remuneração lançada para ela. A lei
        manda SOMAR os salários de contribuição de cada atividade para
        formar o salário de contribuição daquela competência — não
        escolher um e descartar o outro. Aqui a soma é feita e a
        competência entra marcada `.concomitante: true` (não `.ambigua`
        — não é problema de qualidade de dado, é regra legal).
        POR QUE OLHAR OS VÍNCULOS ATIVOS, NÃO `remuneracao.vinculoId`:
        quando dois vínculos realmente se sobrepõem por todo o mês, CADA
        remuneração daquele mês bate em AMBOS (correspondentes.length>1),
        então `_prevMontarRemuneracoes()` já zera `.vinculoId` das duas
        por ambiguidade de associação — usar `.vinculoId` aqui erraria
        exatamente o caso mais comum de concomitância real. O sinal
        correto é: quantos vínculos do HISTÓRICO cobrem esta competência
        (independente de qual remuneração "pertence" a qual).
        ATUALIZADO na Atualização 42 (comentário corrigido pela perícia de
        software — estava desatualizado): a lei também manda respeitar o
        teto do RGPS *vigente na competência*, e desde que
        dados-historicos/tetoRgps.js passou a existir, o teto DA ÉPOCA já
        É aplicado automaticamente à soma concomitante logo abaixo,
        sempre que a tabela cobrir a competência — ver
        `TetoRgpsHistorico.tetoRgpsNaCompetencia()` e o bloco
        `aplicouTetoRgpsHistorico`. Só cai no aviso para revisão manual
        (sem aplicar nada) quando a competência não é coberta pela tabela
        (antes de 03/1994) ou o módulo não está carregado.
     b) AMBIGUIDADE DE DADO (só 0 ou 1 vínculo cobre a competência, mas
        ainda assim há mais de uma remuneração lançada — provável
        retificação/duplicidade de lançamento no CNIS, não duas
        atividades simultâneas) — comportamento JÁ EXISTENTE preservado:
        marca `.ambigua: true`, usa só a primeira ocorrência como valor
        de referência, nunca soma sem confirmação humana
        (`opcoes.incluirAmbiguas` em motorSalarioBeneficio.js).

   `.codigoOcorrencia` (já capturado por extratorRemuneracoesCNIS.js, mas
   até esta entrega nunca chegava até aqui) agora é propagado para
   `.codigosOcorrencia` (array, um por remuneração de origem) e cruzado
   com uma lista PEQUENA e HEURÍSTICA de palavras-chave associadas a
   pendência (`PREV_PALAVRAS_PENDENCIA_CODIGO_OCORRENCIA`, abaixo) — NÃO é
   uma tabela oficial de códigos de ocorrência do INSS (este projeto não
   tem acesso a ela); é só um sinal textual sobre a anotação entre
   parênteses que o próprio CNIS já traz na linha da remuneração. Quando
   bate, `.possivelPendencia: true` — motorSalarioBeneficio.js exclui a
   competência da média por padrão (mesmo tratamento conservador já dado
   a `.ambigua`), sempre com o motivo explícito, nunca descartando sem
   dizer por quê.
------------------------------------------------------------------------ */

// Heurística textual, não uma tabela oficial de códigos de ocorrência do
// INSS (ver comentário acima) — cada termo é testado como substring
// (case-insensitive, sem acento) do que veio entre parênteses na linha do
// CNIS. Lista pequena de propósito: um falso negativo (pendência não
// detectada) só deixa a competência seguir para revisão humana normal;
// um falso positivo é pior (exclui uma competência boa sem necessidade),
// por isso a lista fica restrita a termos inequívocos.
var PREV_PALAVRAS_PENDENCIA_CODIGO_OCORRENCIA = ['pend', 'aguardando', 'nao processad', 'não processad', 'em analise', 'em análise'];

function _prevRemuneracaoIndicaPendencia(r) {
  if (!r || !r.codigoOcorrencia) return false;
  var normalizado = String(r.codigoOcorrencia).toLowerCase();
  return PREV_PALAVRAS_PENDENCIA_CODIGO_OCORRENCIA.some(function (palavra) { return normalizado.indexOf(palavra) !== -1; });
}

function _prevMontarContribuicoes(remuneracoes, vinculos) {
  vinculos = Array.isArray(vinculos) ? vinculos : [];
  var porCompetencia = new Map();
  remuneracoes.filter(function (r) { return r.valor > 0; }).forEach(function (r) {
    if (!porCompetencia.has(r.competencia)) porCompetencia.set(r.competencia, []);
    porCompetencia.get(r.competencia).push(r);
  });

  var contribuicoes = [];
  var indice = 0;
  Array.from(porCompetencia.keys()).sort().forEach(function (competencia) {
    var lista = porCompetencia.get(competencia);
    var codigosOcorrencia = lista.map(function (r) { return r.codigoOcorrencia; }).filter(Boolean);
    var possivelPendencia = lista.some(_prevRemuneracaoIndicaPendencia);

    if (lista.length === 1) {
      contribuicoes.push({
        id: _prevGerarId('c', indice++),
        competencia: competencia,
        valor: lista[0].valor,
        vinculoId: lista[0].vinculoId,
        remuneracaoIds: [lista[0].id],
        ambigua: false,
        concomitante: false,
        codigosOcorrencia: codigosOcorrencia,
        possivelPendencia: possivelPendencia
      });
      return;
    }

    // Mais de uma remuneração na mesma competência: só é CONCOMITÂNCIA
    // REAL se DOIS OU MAIS VÍNCULOS do histórico cobrem esta competência
    // (ver explicação longa acima sobre por que não usar
    // remuneracao.vinculoId aqui) — qualquer outra combinação (0 ou 1
    // vínculo cobrindo o mês) cai no caso conservador de AMBIGUIDADE,
    // sem adivinhar.
    var vinculosAtivos = vinculos.filter(function (v) { return _prevCompetenciaDentroDoVinculo(competencia, v); });
    var ehConcomitanciaReal = vinculosAtivos.length >= 2;

    if (ehConcomitanciaReal) {
      var somaConcomitante = lista.reduce(function (acc, r) { return acc + r.valor; }, 0);
      // Aplica o teto do RGPS vigente NA COMPETÊNCIA (dados-historicos/
      // tetoRgps.js, Atualização 42) automaticamente quando a tabela cobre
      // a competência — antes disso, o sistema só reportava a limitação
      // sem aplicar nada. Se a tabela não cobrir (competência anterior a
      // 03/1994 — não deveria acontecer, já que salários antes de 07/1994
      // são excluídos em outra etapa) ou o módulo não estiver carregado,
      // cai no aviso antigo pedindo revisão manual, sem travar o cálculo.
      var infoTeto = (typeof TetoRgpsHistorico !== 'undefined' && TetoRgpsHistorico.tetoRgpsNaCompetencia)
        ? TetoRgpsHistorico.tetoRgpsNaCompetencia(competencia)
        : null;
      var aplicouTetoRgpsHistorico = false;
      var valorFinal = Math.round(somaConcomitante * 100) / 100;
      var limitacaoTetoRgpsHistorico = 'soma de ' + lista.length + ' salário(s) de contribuição concomitante(s) (Art. 32, Lei 8.213/91) — teto do RGPS vigente NA COMPETÊNCIA não pôde ser aplicado automaticamente (dados-historicos/tetoRgps.js não cobre esta competência ou não está carregado); revisar manualmente se a soma supera o teto da época.';

      if (infoTeto) {
        if (valorFinal > infoTeto.valor) {
          aplicouTetoRgpsHistorico = true;
          valorFinal = infoTeto.valor;
          limitacaoTetoRgpsHistorico = 'soma de ' + lista.length + ' salário(s) de contribuição concomitante(s) (Art. 32, Lei 8.213/91) — teto do RGPS de ' + infoTeto.vigenciaDesde + ' (' + infoTeto.baseLegal + ') aplicado automaticamente, pois a soma excedia o limite.' +
            (infoTeto.possivelmenteDesatualizado ? ' AVISO: esta competência está distante da última atualização conhecida da tabela de tetos — confira se já existe Portaria mais recente.' : '');
        } else {
          limitacaoTetoRgpsHistorico = 'soma de ' + lista.length + ' salário(s) de contribuição concomitante(s) (Art. 32, Lei 8.213/91) — dentro do teto do RGPS de ' + infoTeto.vigenciaDesde + ' (' + infoTeto.baseLegal + '), nenhum limite aplicado.' +
            (infoTeto.possivelmenteDesatualizado ? ' AVISO: esta competência está distante da última atualização conhecida da tabela de tetos — confira se já existe Portaria mais recente.' : '');
        }
      }

      contribuicoes.push({
        id: _prevGerarId('c', indice++),
        competencia: competencia,
        valor: valorFinal,
        valorAntesDoTetoRgps: Math.round(somaConcomitante * 100) / 100,
        aplicouTetoRgpsHistorico: aplicouTetoRgpsHistorico,
        vinculoId: null, // mais de um vínculo ativo — a soma pertence à competência, não a um vínculo só
        remuneracaoIds: lista.map(function (r) { return r.id; }),
        ambigua: false,
        concomitante: true,
        vinculosConcomitantesIds: vinculosAtivos.map(function (v) { return v.id; }),
        limitacaoTetoRgpsHistorico: limitacaoTetoRgpsHistorico,
        codigosOcorrencia: codigosOcorrencia,
        possivelPendencia: possivelPendencia
      });
      return;
    }

    contribuicoes.push({
      id: _prevGerarId('c', indice++),
      competencia: competencia,
      valor: lista[0].valor,
      vinculoId: lista[0].vinculoId,
      remuneracaoIds: lista.map(function (r) { return r.id; }),
      ambigua: true,
      concomitante: false,
      codigosOcorrencia: codigosOcorrencia,
      possivelPendencia: possivelPendencia
    });
  });
  return contribuicoes;
}

/* ------------------------------------------------------------------------
   4. DOCUMENTOS — manifesto único de fonte (documento+página+arquivo),
   sobre TODOS os candidatos de entrada (validados ou não — é "o que foi
   lido", não "o que entrou no cálculo").
------------------------------------------------------------------------ */
function _prevMontarDocumentos(candidatosVinculo, candidatosRemuneracao) {
  var vistos = new Map();
  (candidatosVinculo || []).concat(candidatosRemuneracao || []).forEach(function (c) {
    if (!c || !c.fonte) return;
    var chave = (c.fonte.documento || '') + '|' + (c.fonte.pagina != null ? c.fonte.pagina : '') + '|' + (c.fonte.arquivo || '');
    if (!vistos.has(chave)) {
      vistos.set(chave, { documento: c.fonte.documento || null, pagina: c.fonte.pagina != null ? c.fonte.pagina : null, arquivo: c.fonte.arquivo || null });
    }
  });
  return Array.from(vistos.values());
}

/* ------------------------------------------------------------------------
   5. PROVENIÊNCIA — um registro por fato consolidado, sempre rastreável
   de volta à fonte/confiança/status originais.
------------------------------------------------------------------------ */
function _prevMontarProveniencia(vinculos, remuneracoes, contribuicoes) {
  var registros = [];
  vinculos.forEach(function (v) {
    var origem = v._origem || {};
    registros.push({ tipo: 'vinculo', refId: v.id, fonte: origem.fonte || null, confianca: origem.confianca != null ? origem.confianca : null, status: origem.status || null, trecho: origem.trecho || null });
  });
  remuneracoes.forEach(function (r) {
    registros.push({ tipo: 'remuneracao', refId: r.id, fonte: r.fonte || null, confianca: r.confianca != null ? r.confianca : null, status: r.status || null, trecho: r.trecho || null });
  });
  contribuicoes.forEach(function (c) {
    registros.push({ tipo: 'contribuicao', refId: c.id, derivadaDe: c.remuneracaoIds, ambigua: c.ambigua });
  });
  return registros;
}

/**
 * Monta o HISTÓRICO PREVIDENCIÁRIO consolidado — a entidade única que
 * substitui candidatos soltos de vínculo/remuneração como entrada de
 * qualquer motor de cálculo.
 *
 * @param {{vinculos?:object[], remuneracoes?:object[], beneficios?:object[],
 *          periodosEspeciais?:object[], periodosRurais?:object[],
 *          segurado?:{nome?:string,cpf?:string,nascimento?:string}}} entrada
 *        — candidatos BRUTOS (saída dos extratores), não pré-filtrados.
 * @param {{incluirRequerRevisao?:boolean, incluirRequerRevisaoRemuneracoes?:boolean,
 *          dataReferencia?:string, tipo?:'comum'|'especial'}} [opcoes]
 */
function montarHistorico(entrada, opcoes) {
  entrada = entrada || {};
  opcoes = opcoes || {};

  var candidatosVinculo = Array.isArray(entrada.vinculos) ? entrada.vinculos : [];
  var candidatosRemuneracao = Array.isArray(entrada.remuneracoes) ? entrada.remuneracoes : [];

  var montadoVinculos = _prevMontarVinculos(candidatosVinculo, opcoes);
  var montadoRemuneracoes = _prevMontarRemuneracoes(candidatosRemuneracao, montadoVinculos.vinculos, opcoes);
  var contribuicoes = _prevMontarContribuicoes(montadoRemuneracoes.remuneracoes, montadoVinculos.vinculos);

  return {
    segurado: entrada.segurado || { nome: null, cpf: null, nascimento: null },
    vinculos: montadoVinculos.vinculos,
    remuneracoes: montadoRemuneracoes.remuneracoes,
    contribuicoes: contribuicoes,
    beneficios: _prevFiltrarCandidatosGenericos(entrada.beneficios, !!opcoes.incluirRequerRevisao),
    periodosEspeciais: _prevFiltrarCandidatosGenericos(entrada.periodosEspeciais, !!opcoes.incluirRequerRevisao),
    periodosRurais: _prevFiltrarCandidatosGenericos(entrada.periodosRurais, !!opcoes.incluirRequerRevisao),
    documentos: _prevMontarDocumentos(candidatosVinculo, candidatosRemuneracao),
    proveniencia: _prevMontarProveniencia(montadoVinculos.vinculos, montadoRemuneracoes.remuneracoes, contribuicoes),
    // Além da forma pedida: nunca descartar candidato sem dizer por quê
    // (mesma filosofia de todo o resto do projeto) — auditável, mas não
    // atrapalha quem só quer consumir os 9 campos da entidade acima.
    ignorados: {
      vinculos: montadoVinculos.ignorados,
      remuneracoes: montadoRemuneracoes.ignoradas
    }
  };
}

/* ------------------------------------------------------------------------
   6. MOTORES A PARTIR DO HISTÓRICO — MotorTempoContribuicao continua uma
   função PURA (recebe array de vínculo, devolve tempo) — de propósito:
   isso é o que permite testá-lo isolado (tests/teste-motor-tempo-
   contribuicao.js) sem nenhuma dependência de extração. Reescrevê-lo para
   "entender" o histórico inteiro amarraria o motor genérico a um formato
   de entidade específico deste domínio, perdendo a separação mecanismo/
   domínio que o resto do projeto persegue (ver docs/ARQUITETURA-
   MIGRACAO-PREVIDENCIARIO.md). Este bloco é o único ponto que ainda
   "desmonta" o histórico em array cru — e é o ÚNICO lugar que precisa
   saber fazer isso: quem consome o pipeline (UI, testes, futura API) só
   chama montarHistorico() e depois esta função, nunca mexe em vínculo/
   remuneração solto de novo.

   AVISO (achado do usuário, pós-Atualização 18): `carenciaAproximadaPor
   Vinculo` e `carenciaPorRemuneracao`, devolvidas abaixo, são INDICADORES
   TÉCNICOS BRUTOS — nenhum dos dois é a carência legal. "Todo mês dentro
   do span de um vínculo" não é carência, nem "toda remuneração > 0" é
   carência (Lei 8.213/91, art. 27, distingue segurado empregado —
   conta pela filiação — de contribuinte individual — conta pelo efetivo
   pagamento). Para a carência aplicada de fato (usada em checagem de
   elegibilidade), ver `validarCarenciaPrevidenciaria()` em
   `carencia/validacaoCarenciaPrevidenciaria.js` — que também não se
   chama de "definitiva", só mais correta que os dois indicadores daqui.
------------------------------------------------------------------------ */
function calcularTempoEcarenciaDeHistorico(historico, opcoes) {
  opcoes = opcoes || {};
  if (!historico || !historico.vinculos || historico.vinculos.length === 0) {
    return { tempoContribuicao: null, carenciaAproximadaPorVinculo: null, carenciaPorRemuneracao: null };
  }
  if (typeof MotorTempoContribuicao === 'undefined') {
    return { tempoContribuicao: null, carenciaAproximadaPorVinculo: null, carenciaPorRemuneracao: null, erro: 'MotorTempoContribuicao não carregado' };
  }

  var vinculosParaMotor = historico.vinculos.map(function (v) {
    return { inicio: v.inicio, fim: v.fim, tipo: v.tipo, anosExposicao: v.anosExposicao };
  });

  var tempoContribuicao = MotorTempoContribuicao.calcularTempoContribuicao(vinculosParaMotor, opcoes);
  var carenciaAproximadaPorVinculo = MotorTempoContribuicao.calcularCarencia(vinculosParaMotor);

  var competenciasComContribuicao = (historico.contribuicoes || []).map(function (c) { return c.competencia; });
  var carenciaPorRemuneracao = competenciasComContribuicao.length > 0
    ? { competencias: competenciasComContribuicao.slice(), totalMeses: competenciasComContribuicao.length }
    : null;

  return { tempoContribuicao: tempoContribuicao, carenciaAproximadaPorVinculo: carenciaAproximadaPorVinculo, carenciaPorRemuneracao: carenciaPorRemuneracao };
}

var HistoricoPrevidenciario = {
  versaoModulo: '2.1.0',
  montarHistorico: montarHistorico,
  calcularTempoEcarenciaDeHistorico: calcularTempoEcarenciaDeHistorico
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HistoricoPrevidenciario, montarHistorico, calcularTempoEcarenciaDeHistorico };
}

/* ----------------------------------------------------------------------
   PRÓXIMA DECISÃO EM ABERTO (registrada aqui, não decidida sozinha):
   salário de benefício continua fora de escopo (precisa da série
   histórica de índices, ver Atualização 15 em ARQUITETURA-MIGRACAO-
   PREVIDENCIARIO.md) — quando existir, `historico.remuneracoes` já é a
   fonte pronta (competência + valor, com proveniência) para alimentá-lo,
   sem precisar de nenhuma mudança de formato aqui.
---------------------------------------------------------------------- */
