/* ============================================================================
   INDEX.JS — Fachada do domínio "Previdenciário" (RGPS/INSS).

   Objeto global de navegação sobre DICIONARIO_PREVIDENCIARIO, que continua
   acessível diretamente por quem preferir.

   ORDEM DE CARREGAMENTO: dicionarioPrevidenciario.js -> index.js (este
   arquivo). Sem dependência de nenhum outro módulo do app.

   ORIGEM (v1.0.0): nasceu como só conhecimento de referência, ainda não
   plugado a nenhum pipeline — ver cabeçalho de dicionarioPrevidenciario.js
   e docs/ARQUITETURA-ATUAL.md para o estado atual (hoje plugado ao
   pipeline completo de extração/decisão).
============================================================================ */

function campoPrevidenciarioPorNome(nomeCampo) {
  return DICIONARIO_PREVIDENCIARIO.campos_semanticos.find(c => c.campo === nomeCampo) || null;
}

function tipoDocumentoPrevidenciarioPorChave(chave) {
  return DICIONARIO_PREVIDENCIARIO.tipos_documento[chave] || null;
}

function siglaPrevidenciaria(sigla) {
  return DICIONARIO_PREVIDENCIARIO.siglario[sigla] || null;
}

function conflitosDoCampoPrevidenciario(nomeCampo) {
  return DICIONARIO_PREVIDENCIARIO.matriz_conflitos.filter(c => c.campos.includes(nomeCampo));
}

var ConhecimentoPrevidenciario = {
  versaoModulo: '1.0.0',
  dicionario: DICIONARIO_PREVIDENCIARIO,
  campoPorNome: campoPrevidenciarioPorNome,
  tipoDocumentoPorChave: tipoDocumentoPrevidenciarioPorChave,
  sigla: siglaPrevidenciaria,
  conflitosDoCampo: conflitosDoCampoPrevidenciario
};
