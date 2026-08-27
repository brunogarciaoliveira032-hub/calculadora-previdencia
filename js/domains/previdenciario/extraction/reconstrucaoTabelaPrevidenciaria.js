/* ============================================================================
   RECONSTRUCAOTABELAPREVIDENCIARIA.JS — camada de reconstrução de linhas
   entre a leitura de PDF/OCR e os extratores (extratorVinculosCNIS.js /
   extratorRemuneracoesCNIS.js). Atualização 53, a pedido do usuário.

   PROBLEMA REAL: os extratores tinham (até esta entrega) só regex
   ANCORADAS NA LINHA INTEIRA ("^...$") — funcionam bem no PDF sintético de
   teste, mas um CNIS real, escaneado/OCR, frequentemente:
     - insere um código (matrícula, indicador) ENTRE a data e o valor;
     - inverte a ordem (valor antes da competência, por exemplo);
     - adiciona espaçamento irregular que não muda o SIGNIFICADO da linha,
       mas quebra uma regex ancorada.
   Nesses casos, a regex de linha inteira simplesmente não bate em NADA — a
   linha é silenciosamente ignorada, e o dado correspondente nunca chega
   ao histórico nem ao cálculo. É exatamente o risco que o usuário
   descreveu: "não deixar uma regex decidir sozinha que uma linha é uma
   contribuição".

   O QUE ESTA CAMADA FAZ: em vez de casar a linha inteira de uma vez,
   TOKENIZA a linha — varre em busca de cada tipo de dado conhecido
   (intervalo de datas, competência MM/AAAA, valor R$, código entre
   parênteses) em QUALQUER posição da linha, na ordem em que aparecem, e
   deixa o resto como texto livre (candidato a nome de empregador). Um
   candidato só é montado quando os tokens ESSENCIAIS pro tipo (vínculo:
   intervalo de datas; remuneração: competência + valor) estão presentes
   — não importa a ordem exata ou o que tem entre eles.

   LIMITAÇÃO IMPORTANTE, REGISTRADA COM DESTAQUE (não escondida): esta
   camada NÃO faz reconstrução de tabela por COORDENADA (posição x/y na
   página, colunas reais do PDF). js/core/leitorPdf.js já descarta a
   posição de cada palavra ao juntar o texto da página em uma string só
   (`juntarItensComQuebras`, que preserva só as quebras de linha reais,
   não a coordenada horizontal) — pelo tempo em que o texto chega até
   aqui, a informação de coluna física já não existe mais. O que esta
   camada reconstrói é a ORDEM DOS TOKENS dentro do texto de uma linha, o
   que resolve os casos mais comuns (código no meio, ordem trocada,
   espaçamento irregular), mas não é o mesmo que reconstruir colunas
   físicas de uma tabela real. Fazer isso de verdade exigiria mudar
   js/core/leitorPdf.js para preservar a posição x de cada `item` de
   `getTextContent()` (dado disponível no PDF.js, hoje descartado) —
   mudança maior, de escopo próprio, não incluída nesta entrega.

   TODO candidato produzido por esta camada carrega, para auditoria (nunca
   decide sozinho, sempre `status:'requer_revisao'`):
     `.tokensEncontrados` — [{tipo, valorBruto, posicaoInicio}], a "posição/
       coluna" pedida, no sentido de posição textual, não geométrica;
     `.reconstruidoPorTokenizacao: true`;
     `.motivoDecisao` — frase legível explicando quais tokens fecharam o
       candidato.
============================================================================ */

// Tipos de token reconhecidos, cada um com seu próprio regex — aplicados
// em varredura (não ancorados), então casam em qualquer posição da linha.
var PREV_TOKEN_PADROES = [
  { tipo: 'data_intervalo', regex: /\d{1,2}[\/.]\d{1,2}[\/.]\d{4}\s*(?:a|até|-|–|—)\s*(?:\d{1,2}[\/.]\d{1,2}[\/.]\d{4}|atual|em\s+aberto|em\s+curso|n[ãa]o\s+informad[ao]|indeterminad[ao])/i },
  { tipo: 'data_competencia', regex: /\b\d{2}\/\d{4}\b/ },
  { tipo: 'valor_monetario', regex: /r\$\s?[\d.]{1,12},\d{2}/i },
  { tipo: 'codigo_ocorrencia', regex: /\([^)]{1,40}\)/ }
];

/**
 * Tokeniza uma linha: varre em busca de cada padrão conhecido (em
 * qualquer posição), remove os trechos casados, e trata o que sobra
 * (texto não-vazio) como um token `texto_livre`. Devolve os tokens NA
 * ORDEM em que aparecem na linha original.
 *
 * @param {string} linha
 * @returns {Array<{tipo:string, valorBruto:string, posicaoInicio:number}>}
 */
function tokenizarLinha(linha) {
  var texto = String(linha || '');
  var ocupado = new Array(texto.length).fill(false);
  var tokensBrutos = [];

  PREV_TOKEN_PADROES.forEach(function (padrao) {
    var regexGlobal = new RegExp(padrao.regex.source, padrao.regex.flags.replace('g', '') + 'g');
    var m;
    while ((m = regexGlobal.exec(texto)) !== null) {
      var inicio = m.index, fim = inicio + m[0].length;
      var jaOcupado = false;
      for (var i = inicio; i < fim; i++) { if (ocupado[i]) { jaOcupado = true; break; } }
      if (jaOcupado) continue; // não deixa dois padrões disputarem o mesmo trecho (ex.: data dentro de um intervalo já casado)
      for (var j = inicio; j < fim; j++) ocupado[j] = true;
      tokensBrutos.push({ tipo: padrao.tipo, valorBruto: m[0], posicaoInicio: inicio });
      if (regexGlobal.lastIndex === m.index) regexGlobal.lastIndex++; // evita loop infinito em match vazio
    }
  });

  // Texto livre: os trechos NÃO ocupados por nenhum token conhecido,
  // colapsados (espaços múltiplos viram um só), descartando fragmentos
  // vazios ou só pontuação/espaço.
  var posicao = 0;
  while (posicao < texto.length) {
    if (ocupado[posicao]) { posicao++; continue; }
    var inicioLivre = posicao;
    while (posicao < texto.length && !ocupado[posicao]) posicao++;
    var bruto = texto.slice(inicioLivre, posicao);
    var limpo = bruto.replace(/\s+/g, ' ').replace(/^[\s.,;:\-–—]+|[\s.,;:\-–—]+$/g, '');
    if (limpo.length > 0) {
      tokensBrutos.push({ tipo: 'texto_livre', valorBruto: limpo, posicaoInicio: inicioLivre });
    }
  }

  tokensBrutos.sort(function (a, b) { return a.posicaoInicio - b.posicaoInicio; });
  return tokensBrutos;
}

function _prevReconstrucaoDiasNoMesReal(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function _prevReconstrucaoParseDataIso(strData) {
  if (typeof parseDataBRParaIso === 'function') return parseDataBRParaIso(strData);
  var m = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/.exec(String(strData || ''));
  if (!m) return null;
  var dia = m[1].padStart(2, '0'), mes = m[2].padStart(2, '0'), ano = m[3];
  // Correção (achado da perícia de software, mesma classe de bug já
  // corrigida em classificadorExtrator.js/extratorVinculosCNIS.js): antes
  // só conferia 1-31, aceitando datas calendariamente inexistentes.
  if (+mes < 1 || +mes > 12 || +dia < 1 || +dia > _prevReconstrucaoDiasNoMesReal(+ano, +mes)) return null;
  return ano + '-' + mes + '-' + dia;
}

function _prevReconstrucaoParseValorMoedaBR(strValor) {
  var limpo = String(strValor || '').replace(/[^\d.,]/g, '');
  // Correção (achado da perícia de software, mesma classe de bug já
  // corrigida em classificadorExtrator.js/extratorRemuneracoesCNIS.js).
  var m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  var parteInteira = m[1].replace(/\./g, '');
  var parteDecimal = (m[2] || '0');
  while (parteDecimal.length < 2) parteDecimal += '0';
  var n = parseFloat(parteInteira + '.' + parteDecimal);
  return isFinite(n) ? n : null;
}

var PREV_REGEX_FIM_EM_ABERTO_RECONSTRUCAO = /^(atual|em\s+aberto|em\s+curso|n[ãa]o\s+informad[ao]|indeterminad[ao])$/i;

/**
 * Fallback de RECONSTRUÇÃO POR TOKENIZAÇÃO para remuneração: acha os
 * tokens essenciais (competência + valor) em QUALQUER posição/ordem numa
 * única linha — cobre os casos que a regex de linha inteira do extrator
 * principal rejeita (código no meio, ordem trocada, espaçamento
 * irregular). NUNCA sai como "validado" — sempre `requer_revisao`.
 *
 * @returns {object|null} mesmo formato de extrairRemuneracaoDeLinha()
 *   (extratorRemuneracoesCNIS.js), com `.tokensEncontrados`,
 *   `.reconstruidoPorTokenizacao:true`, `.motivoDecisao`.
 */
function reconstruirCandidatoRemuneracao(linha) {
  var tokens = tokenizarLinha(linha);
  var tokenCompetencia = tokens.find(function (t) { return t.tipo === 'data_competencia'; });
  var tokenValor = tokens.find(function (t) { return t.tipo === 'valor_monetario'; });
  if (!tokenCompetencia || !tokenValor) return null;

  var m = /(\d{2})\/(\d{4})/.exec(tokenCompetencia.valorBruto);
  var mes = m[1], ano = m[2];
  if (+mes < 1 || +mes > 12) return null;
  var valor = _prevReconstrucaoParseValorMoedaBR(tokenValor.valorBruto);
  if (valor === null) return null;

  var tokenCodigo = tokens.find(function (t) { return t.tipo === 'codigo_ocorrencia'; });
  var valorZerado = valor === 0;
  var conflitos = ['extraído por reconstrução tokenizada (ordem/posição fora do padrão de linha esperado) — confira o trecho original antes de confirmar'];
  if (valorZerado) conflitos.push('remuneração zerada — não presumir ausência de contribuição sem checar o código de ocorrência');

  return {
    tipo: 'remuneracao',
    competencia: ano + '-' + mes,
    valor: valor,
    valorZerado: valorZerado,
    codigoOcorrencia: tokenCodigo ? tokenCodigo.valorBruto.replace(/^\(|\)$/g, '') : null,
    confianca: 0.45,
    status: 'requer_revisao',
    conflitos: conflitos,
    trecho: String(linha).trim(),
    tokensEncontrados: tokens,
    reconstruidoPorTokenizacao: true,
    motivoDecisao: 'competência (' + tokenCompetencia.valorBruto + ') + valor (' + tokenValor.valorBruto + ') encontrados na linha, fora do padrão estrito de posição'
  };
}

/**
 * Fallback de RECONSTRUÇÃO POR TOKENIZAÇÃO para vínculo: acha o token
 * essencial (intervalo de datas) em qualquer posição da linha, e usa o
 * texto livre remanescente como candidato a nome do empregador — cobre
 * separadores fora do padrão esperado, ruído entre a data e o nome etc.
 * NUNCA sai como "validado".
 *
 * @returns {object|null} mesmo formato de extrairVinculoDeLinha()
 *   (extratorVinculosCNIS.js), com `.tokensEncontrados`,
 *   `.reconstruidoPorTokenizacao:true`, `.motivoDecisao`.
 */
function reconstruirCandidatoVinculo(linha) {
  var tokens = tokenizarLinha(linha);
  var tokenIntervalo = tokens.find(function (t) { return t.tipo === 'data_intervalo'; });
  if (!tokenIntervalo) return null;

  var mIntervalo = /^(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})\s*(?:a|até|-|–|—)\s*(\d{1,2}[\/.]\d{1,2}[\/.]\d{4}|atual|em\s+aberto|em\s+curso|n[ãa]o\s+informad[ao]|indeterminad[ao])$/i.exec(tokenIntervalo.valorBruto);
  if (!mIntervalo) return null;
  var inicioIso = _prevReconstrucaoParseDataIso(mIntervalo[1]);
  var fimBruto = mIntervalo[2];
  var aberto = PREV_REGEX_FIM_EM_ABERTO_RECONSTRUCAO.test(fimBruto.trim());
  var fimIso = aberto ? null : _prevReconstrucaoParseDataIso(fimBruto);
  if (!inicioIso) return null;
  if (!aberto && !fimIso) return null;

  var tokensTexto = tokens.filter(function (t) { return t.tipo === 'texto_livre'; });
  var empregador = tokensTexto.map(function (t) { return t.valorBruto; }).join(' ').trim();

  var conflitos = ['extraído por reconstrução tokenizada (ordem/posição fora do padrão de linha esperado) — confira o trecho original antes de confirmar'];
  if (empregador.length < 3 || !/[a-zà-ú]/i.test(empregador)) {
    conflitos.push('nome do empregador vazio ou sem conteúdo textual reconhecível');
  }
  if (!aberto && fimIso && inicioIso > fimIso) {
    conflitos.push('data de início posterior à data de fim (possível inversão)');
  }

  return {
    tipo: 'vinculo',
    empregador: empregador || null,
    inicio: inicioIso,
    fim: fimIso,
    aberto: aberto,
    confianca: 0.45,
    status: 'requer_revisao',
    conflitos: conflitos,
    trecho: String(linha).trim(),
    tokensEncontrados: tokens,
    reconstruidoPorTokenizacao: true,
    motivoDecisao: 'intervalo de datas (' + tokenIntervalo.valorBruto + ') encontrado na linha, fora do padrão estrito de posição'
  };
}

var ReconstrucaoTabelaPrevidenciaria = {
  versaoModulo: '1.0.0',
  tokenizarLinha: tokenizarLinha,
  reconstruirCandidatoRemuneracao: reconstruirCandidatoRemuneracao,
  reconstruirCandidatoVinculo: reconstruirCandidatoVinculo
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ReconstrucaoTabelaPrevidenciaria,
    tokenizarLinha, reconstruirCandidatoRemuneracao, reconstruirCandidatoVinculo
  };
}
