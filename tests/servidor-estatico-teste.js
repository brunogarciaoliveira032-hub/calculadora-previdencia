/* ============================================================================
   SERVIDOR-ESTATICO-TESTE.JS — servidor HTTP mínimo, só para os testes
   Playwright (tests/teste-e2e-*.js) servirem index.html por http://
   localhost em vez de file://.

   POR QUE ISSO EXISTE: fetch('/api/...') dentro de uma página carregada via
   file:// resolve para file:///api/... e o Chromium recusa isso ("URL
   scheme file is not supported") ANTES mesmo de chegar à camada de rede —
   nem page.route() consegue interceptar. Qualquer teste que precise mockar
   uma chamada de rede da própria aplicação (fallback de IA, classificação
   de candidatos, revisão de IA...) precisa servir por http://. Os testes
   que só verificam extração -> DOM (sem fetch) continuam livres para usar
   file://, mais simples.
============================================================================ */

const path = require('path');
const fs = require('fs');
const http = require('http');

const TIPOS_MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

// Serve a raiz do projeto (index.html, js/, ícones...) numa porta efêmera
// local. Devolve o servidor já escutando — quem chama é responsável por
// `servidor.close()` ao terminar.
function iniciarServidorEstaticoIndexHtml(){
  const raiz = path.join(__dirname, '..');
  return new Promise((resolve) => {
    const servidor = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      const caminho = path.join(raiz, urlPath === '/' ? '/index.html' : urlPath);
      fs.readFile(caminho, (erro, dados) => {
        if(erro){ res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'Content-Type': TIPOS_MIME[path.extname(caminho).toLowerCase()] || 'application/octet-stream' });
        res.end(dados);
      });
    });
    servidor.listen(0, '127.0.0.1', () => resolve(servidor));
  });
}

module.exports = { iniciarServidorEstaticoIndexHtml };
