/* Service worker — cacheia os arquivos locais do app para uso offline.
   Os scripts de CDN (jsPDF, autoTable, SheetJS, pdf.js, Tesseract), usados
   na leitura de PDF e nas exportações, continuam exigindo internet no
   momento do uso — igual ao app original. */

// A lista abaixo cobre TODO script referenciado pelo index.html (só o
// domínio previdenciário, após a remoção do módulo de desapropriação); o
// teste tests/teste-sanidade-carga.js falha se um novo script for
// adicionado ao index.html e esquecido aqui. Ao mexer nesta lista, subir o
// CACHE_NAME.
const CACHE_NAME = 'calculadora-previdenciaria-duarte-v12';
const ARQUIVOS_LOCAIS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './js/core/temaEServiceWorker.js',
  './js/core/util.js',
  './js/core/indices.js',
  './js/core/estruturaTexto.js',
  './js/core/estruturaTextoAsync.js',
  './js/core/workers/estruturaTextoWorker.js',
  './js/core/normalizadorTexto.js',
  './js/core/leitorPdf.js',
  './js/core/classificadorExtrator.js',
  './js/core/decisorCampos.js',
  './js/core/motorRelatorios.js',
  './js/core/calculoPeriodos.js',
  './js/domains/previdenciario/dicionarioPrevidenciario.js',
  './js/domains/previdenciario/index.js',
  './js/domains/previdenciario/motorTempoContribuicao.js',
  './js/domains/previdenciario/dados-historicos/tetoRgps.js',
  './js/domains/previdenciario/motorRMI.js',
  './js/domains/previdenciario/regras/direitoAdquirido/aposentadoriaTempoContribuicao.js',
  './js/domains/previdenciario/regras/transicao/pontos.js',
  './js/domains/previdenciario/regras/transicao/idadeMinimaProgressiva.js',
  './js/domains/previdenciario/regras/transicao/pedagio50.js',
  './js/domains/previdenciario/regras/transicao/pedagio100.js',
  './js/domains/previdenciario/comparador/comparadorRegrasPrevidenciarias.js',
  './js/domains/previdenciario/beneficios/incapacidadePermanente.js',
  './js/domains/previdenciario/beneficios/auxilioIncapacidadeTemporaria.js',
  './js/domains/previdenciario/beneficios/auxilioAcidente.js',
  './js/domains/previdenciario/beneficios/pensaoPorMorte.js',
  './js/domains/previdenciario/beneficios/salarioMaternidade.js',
  './js/domains/previdenciario/validacaoFinal/validadorFinalCalculo.js',
  './js/domains/previdenciario/document-types/cnis.js',
  './js/domains/previdenciario/document-types/ctps.js',
  './js/domains/previdenciario/document-types/requerimentoAdministrativo.js',
  './js/domains/previdenciario/document-types/cartaConcessao.js',
  './js/domains/previdenciario/document-types/cartaIndeferimento.js',
  './js/domains/previdenciario/document-types/decisaoAdministrativa.js',
  './js/domains/previdenciario/document-types/processoJudicial.js',
  './js/domains/previdenciario/document-types/laudoPericial.js',
  './js/domains/previdenciario/document-types/ppp.js',
  './js/domains/previdenciario/document-types/index.js',
  './js/domains/previdenciario/semantics/termosPrevidenciarios.js',
  './js/domains/previdenciario/semantics/termos-index.js',
  './js/domains/previdenciario/semantics/conceptResolverPrevidenciario.js',
  './js/domains/previdenciario/semantics/normalizadorTrechoPrevidenciario.js',
  './js/domains/previdenciario/semantics/semanticMapperPrevidenciario.js',
  './js/domains/previdenciario/semantics/mapeamentoIndex.js',
  './js/domains/previdenciario/evidence/evidenciaPrevidenciaria.js',
  './js/domains/previdenciario/candidates/candidatePoolPrevidenciario.js',
  './js/domains/previdenciario/decision/decisionEnginePrevidenciario.js',
  './js/domains/previdenciario/ia/iaRevisoraPrevidenciaria.js',
  './js/domains/previdenciario/preenchimento/preenchimentoAutomaticoPrevidenciario.js',
  './js/domains/previdenciario/field-rules/vinculos.js',
  './js/domains/previdenciario/field-rules/contribuicoes.js',
  './js/domains/previdenciario/field-rules/campos.js',
  './js/domains/previdenciario/field-rules/index.js',
  './js/domains/previdenciario/extraction/reconstrucaoTabelaPrevidenciaria.js',
  './js/domains/previdenciario/extraction/extratorVinculosCNIS.js',
  './js/domains/previdenciario/extraction/extratorRemuneracoesCNIS.js',
  './js/domains/previdenciario/mapping/mapperPrevidenciario.js',
  './js/domains/previdenciario/historico/historicoPrevidenciario.js',
  './js/domains/previdenciario/correcao/correcaoINPCPrevidenciario.js',
  './js/domains/previdenciario/motorSalarioBeneficio.js',
  './js/domains/previdenciario/carencia/validacaoCarenciaPrevidenciaria.js',
  './js/domains/previdenciario/motorRMIDoHistorico.js',
  './js/domains/previdenciario/ui/painelPrevidenciarioEstado.js',
  './js/domains/previdenciario/ui/painelPrevidenciarioConferencia.js',
  './js/domains/previdenciario/ui/painelPrevidenciarioCalculo.js',
  './js/domains/previdenciario/ui/painelPrevidenciarioResultado.js',
  './js/domains/previdenciario/ui/painelPrevidenciarioWiring.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ARQUIVOS_LOCAIS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes =>
      Promise.all(nomes.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Só intercepta pedidos do próprio app (mesma origem); CDNs vão direto à rede.
  if (url.origin !== self.location.origin) return;
  // A Cache API só aceita GET — POST (ex.: /api/ia-fallback, que fala com o
  // backend) precisa ir direto à rede, sem passar pelo cache.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(respostaCache => {
      const buscaRede = fetch(event.request).then(respostaRede => {
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, respostaRede.clone()));
        return respostaRede;
      }).catch(() => respostaCache);
      return respostaCache || buscaRede;
    })
  );
});
