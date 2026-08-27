/* ============================================================================
   SEMANTICMAPPERPREVIDENCIARIO.JS — versão previdenciária de
   js/core/semantic-mapper/semanticMapper.js: junta
   normalizadorTrechoPrevidenciario.js + conceptResolverPrevidenciario.js e
   extrai o VALOR. Mesmo algoritmo, mesma régua de confiança pequena e
   documentada — duplicado com nomes próprios pelo mesmo motivo de
   namespacing dos outros arquivos deste domínio (mapearTrecho,
   EXTRATORES_VALOR_SEMANTICO etc. já são globais do der-pr).

   EXTRATORES DE VALOR — a régua de tipos aqui difere da versão der-pr
   porque o domínio é outro: acrescenta 'cid' (Classificação Internacional
   de Doenças, ex. "M54"), mantém monetario/percentual/data/cpf (formatos
   genéricos, não específicos de nenhum domínio) e usa 'numero_documento'
   como catch-all pra NB (número de benefício), nº de processo etc. — a
   mesma limitação honesta do der-pr: reconhecimento de FORMATO, não de
   significado (não distingue um NB de um nº de processo só pelo formato;
   quem chama já sabe qual campo está procurando, então isso raramente
   importa na prática).

   DEPENDE de (globais, carregados antes deste arquivo):
     - normalizarTrechoSemanticoPrevidenciario()   (./normalizadorTrechoPrevidenciario.js)
     - resolverConceitoPrevidenciario(),
       resolverTipoDocumentoPrevidenciario(),
       fonteEhPreferencialParaPrevidenciario(),
       fonteEhElegivelParaPrevidenciario()          (./conceptResolverPrevidenciario.js)
   Funções de parsing de valor (parseValorMoedaBR, parsePercentualBR,
   parseDataBRParaIso — js/classificadorExtrator.js) são OPCIONAIS, mesmo
   padrão defensivo do resto do arquivo.
============================================================================ */

var CONFIANCA_BASE_CONCEITO_MAPEADO_PREV = 0.85;
var BONUS_VALOR_CAPTURADO_MAPEADO_PREV = 0.08;
var BONUS_FONTE_PREFERENCIAL_MAPEAMENTO_PREV = 0.04;
var TETO_CONFIANCA_MAPEAMENTO_PREV = 0.99;

function escaparRegexParaMapeamentoPrevidenciario(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function podeUsarFronteiraDePalavraMapeamentoPrevidenciario(variante) {
  return /^[a-z0-9]+$/i.test(variante);
}

function localizarVarianteNoTrechoPrevidenciario(termo, textoNormalizado) {
  var variantes = (termo && termo.variants ? termo.variants.slice() : [])
    .sort(function (a, b) { return b.length - a.length; });
  for (var i = 0; i < variantes.length; i++) {
    var variante = variantes[i];
    var escapada = escaparRegexParaMapeamentoPrevidenciario(variante);
    var regex = new RegExp(
      podeUsarFronteiraDePalavraMapeamentoPrevidenciario(variante) ? ('\\b' + escapada + '\\b') : escapada,
      'i'
    );
    var casamento = regex.exec(textoNormalizado);
    if (casamento) return { variante: variante, inicio: casamento.index, fim: casamento.index + casamento[0].length };
  }
  return null;
}

var EXTRATORES_VALOR_SEMANTICO_PREVIDENCIARIO = [
  {
    tipo: 'monetario',
    regex: /R\$\s*[\d.,]+/i,
    converter: function (bruto) {
      var numero = bruto.replace(/^R\$\s*/i, '');
      return (typeof parseValorMoedaBR === 'function') ? parseValorMoedaBR(numero) : bruto;
    }
  },
  {
    tipo: 'percentual',
    regex: /\d+(?:[.,]\d+)?\s*%/,
    converter: function (bruto) {
      return (typeof parsePercentualBR === 'function') ? parsePercentualBR(bruto) : bruto;
    }
  },
  {
    tipo: 'data',
    regex: /\d{1,2}\/\d{1,2}\/\d{2,4}/,
    converter: function (bruto) {
      if (typeof parseDataBRParaIso !== 'function') return bruto;
      return parseDataBRParaIso(bruto) || bruto;
    }
  },
  {
    tipo: 'cid',
    regex: /\b[A-Z]\d{2}(?:\.\d)?\b/,
    converter: function (bruto) { return bruto.toUpperCase(); }
  },
  {
    tipo: 'cpf',
    regex: /\d{3}\.\d{3}\.\d{3}-\d{2}/,
    converter: function (bruto) { return bruto; }
  },
  {
    tipo: 'numero_documento', // NB, nº de processo, protocolo...
    regex: /\d[\d.\-\/]*/,
    converter: function (bruto) { return bruto; }
  }
];

var SEPARADORES_POS_ROTULO_PREV = /^[\s:.\-–—]*?(?:n\.?\s*[ºo°]?\.?\s*)?[\s:.\-–—]*/i;

function trechoAposRotuloPrevidenciario(textoNormalizado, fimDoRotulo) {
  var resto = textoNormalizado.slice(fimDoRotulo);
  var indiceCorte = resto.search(/\.\s+(?=[A-ZÀ-Ý])/);
  if (indiceCorte > -1) resto = resto.slice(0, indiceCorte);
  resto = resto.replace(SEPARADORES_POS_ROTULO_PREV, '');
  return resto.slice(0, 80).trim();
}

function extrairValorDoTrechoPrevidenciario(trecho) {
  for (var i = 0; i < EXTRATORES_VALOR_SEMANTICO_PREVIDENCIARIO.length; i++) {
    var extrator = EXTRATORES_VALOR_SEMANTICO_PREVIDENCIARIO[i];
    var casamento = extrator.regex.exec(trecho);
    if (casamento) {
      return { valor: extrator.converter(casamento[0]), valorBruto: casamento[0], tipoValor: extrator.tipo };
    }
  }
  var textoLivre = trecho.trim();
  return textoLivre ? { valor: textoLivre, valorBruto: textoLivre, tipoValor: 'texto_livre' } : null;
}

function mapearTrechoPrevidenciario(textoBruto, opcoes) {
  opcoes = opcoes || {};

  var textoNormalizado = normalizarTrechoSemanticoPrevidenciario(textoBruto);
  if (!textoNormalizado) return null;

  var termo = resolverConceitoPrevidenciario(textoNormalizado, opcoes.categoria);
  if (!termo) return null;

  return construirResultadoSemanticoPrevidenciario(termo, textoNormalizado, opcoes);
}

function construirResultadoSemanticoPrevidenciario(termo, textoNormalizado, opcoes) {
  opcoes = opcoes || {};

  var posicao = localizarVarianteNoTrechoPrevidenciario(termo, textoNormalizado);
  var trechoValor = posicao ? trechoAposRotuloPrevidenciario(textoNormalizado, posicao.fim) : textoNormalizado;
  var valorExtraido = extrairValorDoTrechoPrevidenciario(trechoValor);

  var textoParaTipoDocumento = opcoes.textoContexto || textoNormalizado;
  var tipoDocumento = resolverTipoDocumentoPrevidenciario(textoParaTipoDocumento, opcoes);

  var confianca = CONFIANCA_BASE_CONCEITO_MAPEADO_PREV;
  if (valorExtraido) confianca += BONUS_VALOR_CAPTURADO_MAPEADO_PREV;

  var isPreferredSource = false;
  var isEligibleSource = null;
  if (tipoDocumento && tipoDocumento.id) {
    isPreferredSource = fonteEhPreferencialParaPrevidenciario(termo.field, tipoDocumento.id);
    isEligibleSource = fonteEhElegivelParaPrevidenciario(termo.field, tipoDocumento.id);
    if (isPreferredSource) confianca += BONUS_FONTE_PREFERENCIAL_MAPEAMENTO_PREV;
  }
  confianca = Math.min(TETO_CONFIANCA_MAPEAMENTO_PREV, Math.round(confianca * 100) / 100);

  return {
    concept: termo.canonical,
    field: termo.field,
    value: valorExtraido ? valorExtraido.valor : null,
    confidence: confianca,
    documentType: tipoDocumento ? tipoDocumento.id : null,

    category: termo.category,
    documentTypeConfidence: tipoDocumento ? tipoDocumento.confianca : null,
    documentTypeAmbiguous: tipoDocumento ? !!tipoDocumento.emAmbiguidade : null,
    documentTypeOrigin: tipoDocumento ? tipoDocumento.origem : null,
    isPreferredSource: isPreferredSource,
    isEligibleSource: isEligibleSource,
    valueRaw: valorExtraido ? valorExtraido.valorBruto : null,
    valueType: valorExtraido ? valorExtraido.tipoValor : null,
    naoConfundirCom: termo.naoConfundirCom ? termo.naoConfundirCom.slice() : []
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    mapearTrechoPrevidenciario, construirResultadoSemanticoPrevidenciario,
    localizarVarianteNoTrechoPrevidenciario, trechoAposRotuloPrevidenciario,
    extrairValorDoTrechoPrevidenciario
  };
}
