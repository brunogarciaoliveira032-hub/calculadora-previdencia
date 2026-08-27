/* ============================================================================
   CI-STRICT-SKIP.JS — helper minúsculo compartilhado pelos 2 testes E2E
   reais em Chromium (teste-e2e-pdf-real-previdenciario.js e
   teste-e2e-fluxos-adicionais-previdenciario.js).

   PROBLEMA QUE ISTO RESOLVE: os dois testes pulam (process.exit(0) — "OK,
   nada rodou") quando falta uma dependência externa ao Node puro
   (`playwright` não instalado, ou `pdftotext`/poppler-utils ausente do
   PATH). Isso é o comportamento certo pra um clone local sem essas
   dependências instaladas — mas o MESMO exit(0) também acontecia (e o
   `npm test` também ficava "verde") num CI mal configurado que nunca
   rodou `npm install`/`playwright install chromium`, escondendo que os
   dois únicos testes que abrem um browser de verdade nunca executaram.

   `sairOuFalharSePular(rotulo, motivo)` decide entre os dois:
     - CI_STRICT_E2E não definida (ou "0"/"false") -> comportamento de
       sempre: loga e `process.exit(0)` (pular sem falhar). Padrão dev
       local.
     - CI_STRICT_E2E="1" (ou "true") -> `process.exit(1)` (falha): um
       pipeline de CI que exporta essa variável está dizendo "aqui as
       dependências de E2E são obrigatórias, pular não é sucesso".
============================================================================ */

function ciStrictE2eAtivo() {
  var v = String(process.env.CI_STRICT_E2E || '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

function sairOuFalharSePular(rotulo, motivo) {
  if (ciStrictE2eAtivo()) {
    console.error('[' + rotulo + '] ' + motivo + ' — FALHANDO (CI_STRICT_E2E=1: dependência de E2E é obrigatória neste pipeline, pular não conta como sucesso).');
    process.exit(1);
  }
  console.log('[' + rotulo + '] ' + motivo + ' — pulando este teste (defina CI_STRICT_E2E=1 para tratar isto como falha em vez de pulo).');
  process.exit(0);
}

module.exports = { sairOuFalharSePular, ciStrictE2eAtivo };
