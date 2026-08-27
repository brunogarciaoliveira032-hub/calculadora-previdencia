/* ============================================================================
   TERMOSPREVIDENCIARIOS/INDEX.JS — resolve TEXTO -> CONCEITO -> CAMPO pra
   o domínio previdenciário. MESMO ALGORITMO de
   js/juridical-knowledge/terms/index.js (variante mais longa vence,
   fronteira de palavra só pra variante puramente ASCII sem acento/símbolo)
   — deliberadamente DUPLICADO, não reaproveitado, mesmo motivo de
   namespacing já registrado em document-types/index.js deste domínio:
   os dois domínios carregam na mesma página e identificarTermo() já é
   nome global usado pelo der-pr.

   DEPENDE de (carregar antes deste arquivo): termosPrevidenciarios.js
============================================================================ */

function _prevEscaparRegexTermo(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

function _prevPodeUsarFronteiraDePalavra(variante) {
  return /^[a-z0-9]+$/i.test(variante);
}

function _prevConstruirRegexVarianteTermo(variante) {
  var escapada = _prevEscaparRegexTermo(variante);
  return _prevPodeUsarFronteiraDePalavra(variante)
    ? new RegExp('\\b' + escapada + '\\b', 'i')
    : new RegExp(escapada, 'i');
}

var _PREV_VARIANTES_ORDENADAS = TERMOS_PREVIDENCIARIOS
  .reduce(function (acc, entrada) {
    (entrada.variants || []).forEach(function (v) {
      acc.push({ variant: v, regex: _prevConstruirRegexVarianteTermo(v), entry: entrada });
    });
    return acc;
  }, [])
  .sort(function (a, b) { return b.variant.length - a.variant.length; });

/**
 * Acha o PRIMEIRO conceito previdenciário (mais específico, por ordenação
 * de comprimento) cuja variante bate no texto. Devolve a entrada completa
 * ({canonical, field, category, variants, naoConfundirCom,
 * pesoConfiancaBase}) ou null. `categoria` opcional restringe a busca.
 */
function identificarTermoPrevidenciario(textoBruto, categoria) {
  var texto = String(textoBruto || '');
  for (var i = 0; i < _PREV_VARIANTES_ORDENADAS.length; i++) {
    var item = _PREV_VARIANTES_ORDENADAS[i];
    if (categoria && item.entry.category !== categoria) continue;
    if (item.regex.test(texto)) return item.entry;
  }
  return null;
}

/**
 * Varre o texto inteiro e devolve todos os conceitos previdenciários
 * distintos encontrados (array de canonicals). `categoria` opcional.
 */
function localizarConceitosPrevidenciarios(textoBruto, categoria) {
  var texto = String(textoBruto || '');
  var encontrados = {};
  TERMOS_PREVIDENCIARIOS.forEach(function (entrada) {
    if (categoria && entrada.category !== categoria) return;
    if (encontrados[entrada.canonical]) return;
    var bate = (entrada.variants || []).some(function (v) {
      return _prevConstruirRegexVarianteTermo(v).test(texto);
    });
    if (bate) encontrados[entrada.canonical] = true;
  });
  return Object.keys(encontrados);
}

/** Entrada completa pelo id canônico (= nome do campo), ou null. */
function termoPrevidenciarioPorCanonico(canonical) {
  return TERMOS_PREVIDENCIARIOS.find(function (t) { return t.canonical === canonical; }) || null;
}

/** Atalho texto -> campo. Null se não reconhecido. */
function conceitoParaCampoPrevidenciario(textoBruto) {
  var termo = identificarTermoPrevidenciario(textoBruto);
  return termo ? termo.field : null;
}

/** Todas as entradas de uma categoria (identificacao|beneficio|datas|valores|vinculos). */
function termosPrevidenciariosPorCategoria(categoria) {
  return TERMOS_PREVIDENCIARIOS.filter(function (t) { return t.category === categoria; });
}

/**
 * Checagem de integridade (uso em teste, não em runtime): sem `canonical`
 * duplicado, toda entrada tem `field`/`category`/ao menos 1 variant, todo
 * id em `naoConfundirCom` existe como `canonical` de alguma outra entrada
 * (quando não existir, é reportado — não é erro fatal, pode ser um campo
 * fora de campos_semanticos, como numeroProcesso, de propósito).
 */
function validarTermosPrevidenciarios() {
  var problemas = [];
  var vistos = {};
  TERMOS_PREVIDENCIARIOS.forEach(function (t) {
    if (vistos[t.canonical]) problemas.push('canonical duplicado: ' + t.canonical);
    vistos[t.canonical] = true;
    if (!t.field) problemas.push(t.canonical + ': sem field');
    if (!t.category) problemas.push(t.canonical + ': sem category');
    if (!t.variants || t.variants.length === 0) problemas.push(t.canonical + ': sem nenhuma variant');
  });
  TERMOS_PREVIDENCIARIOS.forEach(function (t) {
    (t.naoConfundirCom || []).forEach(function (id) {
      if (!vistos[id]) problemas.push(t.canonical + ': naoConfundirCom aponta pra "' + id + '", que não existe como campo próprio (pode ser esperado, ex.: numeroProcesso)');
    });
  });
  return problemas;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    identificarTermoPrevidenciario, localizarConceitosPrevidenciarios,
    termoPrevidenciarioPorCanonico, conceitoParaCampoPrevidenciario,
    termosPrevidenciariosPorCategoria, validarTermosPrevidenciarios
  };
}
