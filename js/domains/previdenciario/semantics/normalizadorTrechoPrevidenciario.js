/* ============================================================================
   NORMALIZADORTRECHOPREVIDENCIARIO.JS — versão previdenciária de
   js/core/semantic-mapper/termNormalizer.js (mesma lógica; duplicado só
   pelo nome da função, que é global e já usado pelo der-pr na mesma
   página). Reaproveita normalizarTexto() de js/core/normalizadorTexto.js
   DIRETO (sem duplicar) — esse é mecanismo genérico do core, não algo
   específico do der-pr, mesmo padrão já usado por
   js/domains/previdenciario/correcao/correcaoINPCPrevidenciario.js ao
   reaproveitar js/core/indices.js sem alteração.
============================================================================ */

function normalizarTrechoSemanticoPrevidenciario(textoBruto) {
  var texto = String(textoBruto == null ? '' : textoBruto);
  if (typeof normalizarTexto === 'function') {
    try {
      texto = normalizarTexto(texto) || texto;
    } catch (erro) {
      // Nunca deixa um erro de normalização impedir o mapeamento.
    }
  }
  return texto.replace(/\s+/g, ' ').trim();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizarTrechoSemanticoPrevidenciario };
}
