/* ============================================================================
   TERMOSPREVIDENCIARIOS.JS — TEXTO → CONCEITO CANÔNICO → CAMPO, para o
   domínio previdenciário. Mesmo problema que
   js/juridical-knowledge/terms/index.js resolve pro der-pr, mas com uma
   diferença deliberada de arquitetura:

   DECISÃO CONSCIENTE — DERIVAR EM VEZ DE TRANSCREVER: o der-pr autoriza 6
   arquivos de dicionário escritos à mão (property-terms.js etc.), cada
   `variants` digitado manualmente. O previdenciário JÁ TEM essa mesma
   informação em DICIONARIO_PREVIDENCIARIO.campos_semanticos (25 campos,
   cada um com `ancoras` — Atualização 1-11). Reescrever isso à mão aqui
   seria (a) duplicar dado que pode divergir do dicionário com o tempo e
   (b) risco real de erro de transcrição num domínio onde confundir
   DER/DIB/DIP tem consequência jurídica. Por isso este arquivo NÃO
   contém nenhuma âncora escrita à mão — ele só CONVERTE, em runtime, cada
   entrada de campos_semanticos para o formato que o resolvedor de termos
   espera ({canonical, field, category, variants, naoConfundirCom}).
   Qualquer âncora nova cadastrada em dicionarioPrevidenciario.js passa a
   valer aqui automaticamente, sem tocar neste arquivo.

   naoConfundirCom: `confundivel_com` no dicionário é texto livre
   ("dataDIB (a DER é a data do PEDIDO...)") pensado pra humano ler — o
   identificador antes do primeiro "(" é extraído por regex. Quando o
   identificador extraído não bate com nenhum `campo` real (ex.: texto sem
   parênteses, ou id que não existe como campo próprio), a entrada é
   simplesmente ignorada aqui (nunca lança erro) — checagem de
   integridade fica em validarTermosPrevidenciarios() (index.js desta
   pasta), não aqui.

   DEPENDE de (carregar antes deste arquivo): dicionarioPrevidenciario.js
============================================================================ */

function _prevExtrairIdConfundivel(textoLivre) {
  var m = /^([A-Za-zÀ-ÿ0-9_]+)/.exec(String(textoLivre || '').trim());
  return m ? m[1] : null;
}

var TERMOS_PREVIDENCIARIOS = (function () {
  if (typeof DICIONARIO_PREVIDENCIARIO === 'undefined') return [];
  return DICIONARIO_PREVIDENCIARIO.campos_semanticos.map(function (c) {
    return {
      canonical: c.campo,
      field: c.campo,
      category: c.categoria,
      variants: (c.ancoras || []).slice(),
      naoConfundirCom: (c.confundivel_com || [])
        .map(_prevExtrairIdConfundivel)
        .filter(function (id) { return !!id; }),
      pesoConfiancaBase: typeof c.peso_confianca_base === 'number' ? c.peso_confianca_base : null
    };
  });
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TERMOS_PREVIDENCIARIOS, _prevExtrairIdConfundivel };
}
