/* ============================================================================
   TEMAESERVICEWORKER.JS — alternância de tema claro/escuro + registro do
   service worker. Único conteúdo de <script> ANTES vivia inline em
   index.html; foi extraído pra arquivo próprio para permitir uma Content-
   Security-Policy sem 'unsafe-inline' em script-src (ver CSP em
   backend/server.js) — um <script> inline exigiria 'unsafe-inline' (ou um
   nonce por requisição, que não dá pra gerar servindo index.html como
   arquivo estático puro) e isso enfraqueceria a política pra TODO o app,
   não só pra este trecho. Mesmo comportamento de antes, sem mudança
   funcional nenhuma.

   DEPENDE de (carregar antes deste arquivo): nada.
============================================================================ */

function alternarTema(){
  const html = document.documentElement;
  const atual = html.getAttribute('data-theme');
  const novo = atual === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', novo);
  document.getElementById('themeIcon').textContent = novo === 'dark' ? '☀️' : '🌙';
  document.getElementById('themeLabel').textContent = novo === 'dark' ? 'Tema claro' : 'Tema escuro';
  try{ localStorage.setItem('da_tema', novo); }catch(e){}
}

(function(){
  try{
    const salvo = localStorage.getItem('da_tema');
    if(salvo === 'dark'){
      document.documentElement.setAttribute('data-theme','dark');
    }
  }catch(e){}
})();

document.addEventListener('DOMContentLoaded', function(){
  if(document.documentElement.getAttribute('data-theme') === 'dark'){
    document.getElementById('themeIcon').textContent = '☀️';
    document.getElementById('themeLabel').textContent = 'Tema claro';
  }
});

// Registra o service worker (uso offline + instalação como app)
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { alternarTema };
}
