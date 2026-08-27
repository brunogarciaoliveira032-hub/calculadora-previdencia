/* ============================================================================
   EVIDENCIAPREVIDENCIARIA.JS — Evidence Layer do domínio previdenciário
   (item 4 do plano). Onde este item se encaixa no pipeline do usuário:

     PDF -> DOCUMENT TYPE -> SEMÂNTICA -> EVIDÊNCIA -> CANDIDATOS -> ...

   O item 1 (semantics/mapeamentoIndex.js) já sabe mapear UMA página pra
   uma lista de conceitos encontrados nela (mapearPaginaPrevidenciaria).
   O que faltava — e é o que este arquivo resolve — é agregar isso ao
   longo de TODAS as páginas/documentos de um caso, com proveniência
   completa, ANTES de decidir qual valor vence por campo (isso é o
   próximo item, 5 — Candidate Pool/Decision Engine, ainda não este).

   Uma "evidência" aqui é UMA MENÇÃO localizada de um campo, com toda a
   proveniência que já vem do item 1 (documento, página, tipo documental,
   confiança, se a fonte é preferencial/elegível) — nunca um valor
   decidido. Este módulo NUNCA escolhe um vencedor entre evidências
   concorrentes; só REPORTA quando duas evidências do mesmo campo têm
   valores diferentes (`.divergencias`) — decidir o que fazer com isso é
   trabalho do item 5/6, que ainda não existe.

   DEPENDE de (carregar antes deste arquivo):
     ../semantics/mapeamentoIndex.js (mapearPaginaPrevidenciaria)
============================================================================ */

/**
 * Monta o ledger de evidências de um caso inteiro.
 *
 * `documentos` — array de { documento, pagina, texto } (um item por página
 * lida; `documento` é um identificador livre — nome do arquivo/id — e
 * `pagina` é o número da página dentro dele; ambos só viram proveniência,
 * nunca são interpretados). Nunca lança erro: item sem `.texto` é ignorado
 * (não quebra o restante do lote).
 *
 * Devolve:
 *   { todas: [evidencia...],
 *     porCampo: { <campo>: [evidencia...] },
 *     campos: [<campo>...] (chaves de porCampo, sem duplicar),
 *     divergencias: [<campo>...] (campos com 2+ VALORES distintos entre
 *       as evidências encontradas — não diz qual está certo, só que
 *       existe divergência a resolver) }
 *
 * Cada `evidencia`: { campo, categoria, valor, valorBruto, tipoValor,
 *   documento, pagina, tipoDocumento, tipoDocumentoConfianca,
 *   tipoDocumentoAmbiguo, confiancaSemantica, isFontePreferencial,
 *   isFonteElegivel, naoConfundirCom }.
 */
function montarEvidenciasPrevidenciarias(documentos) {
  var todas = [];

  (documentos || []).forEach(function (item) {
    if (!item || !item.texto) return;
    var mapeados = (typeof mapearPaginaPrevidenciaria === 'function')
      ? mapearPaginaPrevidenciaria(item.texto)
      : [];

    mapeados.forEach(function (m) {
      todas.push({
        campo: m.field,
        categoria: m.category,
        valor: m.value,
        valorBruto: m.valueRaw,
        tipoValor: m.valueType,
        documento: item.documento != null ? item.documento : null,
        pagina: item.pagina != null ? item.pagina : null,
        tipoDocumento: m.documentType,
        tipoDocumentoConfianca: m.documentTypeConfidence,
        tipoDocumentoAmbiguo: m.documentTypeAmbiguous,
        confiancaSemantica: m.confidence,
        isFontePreferencial: m.isPreferredSource,
        isFonteElegivel: m.isEligibleSource,
        naoConfundirCom: m.naoConfundirCom ? m.naoConfundirCom.slice() : []
      });
    });
  });

  var porCampo = {};
  todas.forEach(function (ev) {
    if (!porCampo[ev.campo]) porCampo[ev.campo] = [];
    porCampo[ev.campo].push(ev);
  });

  var campos = Object.keys(porCampo);

  var divergencias = campos.filter(function (campo) {
    var valoresDistintos = {};
    porCampo[campo].forEach(function (ev) {
      valoresDistintos[JSON.stringify(ev.valor)] = true;
    });
    return Object.keys(valoresDistintos).length > 1;
  });

  return { todas: todas, porCampo: porCampo, campos: campos, divergencias: divergencias };
}

/** Atalho: só as evidências de UM campo (array vazio se o campo não apareceu em nenhuma página). */
function evidenciasDoCampoPrevidenciario(ledger, campo) {
  if (!ledger || !ledger.porCampo || !ledger.porCampo[campo]) return [];
  return ledger.porCampo[campo].slice();
}

/**
 * Pra um campo dado, devolve só as evidências vindas de fonte PREFERENCIAL
 * (mesmo critério que field-rules/index.js já calcula por evidência —
 * este módulo só filtra, nunca recalcula). Array vazio (nunca null/erro)
 * quando não há nenhuma, incluindo quando o campo não é catalogado em
 * field-rules (todas as evidências vêm com isFontePreferencial:false).
 */
function evidenciasPreferenciaisPrevidenciarias(ledger, campo) {
  return evidenciasDoCampoPrevidenciario(ledger, campo).filter(function (ev) { return ev.isFontePreferencial; });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    montarEvidenciasPrevidenciarias, evidenciasDoCampoPrevidenciario,
    evidenciasPreferenciaisPrevidenciarias
  };
}
