/* ============================================================================
   TESTE-BACKEND-SERVER.JS — primeiro teste que exercita backend/server.js
   DE VERDADE (sobe o Express real, faz requisição HTTP real). Antes desta
   correção, o único lugar que "tocava" o backend era o E2E de revisão por
   IA (teste-e2e-fluxos-adicionais-previdenciario.js), e mesmo esse
   interceptava/mocava a rota via `page.route(...)` do Playwright — o
   código de backend/server.js em si (validação, disponibilidade sem
   ANTHROPIC_API_KEY, headers de segurança, servir os arquivos estáticos)
   nunca tinha rodado em nenhum teste.

   Precisa de `express`/`express-rate-limit`/`dotenv` instalados
   (dependências de produção do projeto, não do teste) — como os 2 testes
   E2E em Chromium, pula graciosamente se estiverem ausentes (ex.: ambiente
   sem `npm install`), respeitando a mesma variável CI_STRICT_E2E (ver
   tests/ci-strict-skip.js) para virar falha dura em vez de pulo, num
   pipeline que precise garantir que isto rodou.

   DESENHO: dois cenários (sem ANTHROPIC_API_KEY / com uma chave-dummy)
   precisam de valores DIFERENTES da env var ANTHROPIC_API_KEY, mas
   server.js lê `process.env.ANTHROPIC_API_KEY` numa `const` no topo do
   módulo, fixada no primeiro `require()` — um segundo `require()` no MESMO
   processo reaproveitaria o módulo já carregado (cache do Node) e nunca
   pegaria o novo valor. Por isso cada cenário roda num PROCESSO Node
   FILHO próprio (`--cenario=...`), com sua env var própria — nunca dois
   `require('../backend/server.js')` no mesmo processo.

   COMO RODAR: node tests/teste-backend-server.js
============================================================================ */

const path = require('path');
const { execFileSync } = require('child_process');
const { sairOuFalharSePular } = require('./ci-strict-skip');

if (process.argv[2] && process.argv[2].indexOf('--cenario=') === 0) {
  rodarCenarioFilho(process.argv[2].slice('--cenario='.length));
} else {
  rodarProcessoPai();
}

/* ==========================================================================
   PROCESSO PAI — dispara um teste() por cenário, cada um num filho.
========================================================================== */
function rodarProcessoPai() {
  try {
    require('express');
    require('express-rate-limit');
    require('dotenv');
  } catch (e) {
    sairOuFalharSePular('teste-backend-server', 'dependências de produção (express/express-rate-limit/dotenv) não encontradas');
  }

  let passaram = 0, falharam = 0;
  function teste(nome, cenario, envExtra) {
    try {
      execFileSync(process.execPath, [__filename, '--cenario=' + cenario], {
        env: Object.assign({}, process.env, envExtra),
        stdio: 'pipe',
        timeout: 15000
      });
      console.log('  OK  ' + nome);
      passaram++;
    } catch (e) {
      console.log('  FALHOU  ' + nome);
      const saida = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '');
      console.log('    ' + saida.split('\n').join('\n    '));
      falharam++;
    }
  }

  console.log('=== Teste de backend/server.js (Express real, requisição HTTP real) ===\n');

  teste(
    'Sem ANTHROPIC_API_KEY: servidor sobe normalmente (não sai do processo) e serve estático; rota de IA responde 503',
    'sem-chave',
    { ANTHROPIC_API_KEY: '' }
  );

  teste(
    'Com ANTHROPIC_API_KEY (dummy): validação de entrada da rota de IA rejeita corpo malformado com 400, sem chamar a Anthropic',
    'com-chave-dummy',
    { ANTHROPIC_API_KEY: 'sk-ant-chave-de-teste-nao-real' }
  );

  teste(
    'Header Content-Security-Policy está presente em toda resposta (mitigação para os scripts de CDN sem SRI — ver index.html)',
    'csp-header',
    { ANTHROPIC_API_KEY: '' }
  );

  console.log(`\n=== ${passaram + falharam} teste(s), ${passaram} passaram, ${falharam} falharam ===`);
  process.exit(falharam ? 1 : 0);
}

/* ==========================================================================
   PROCESSO FILHO — um cenário isolado por processo (ver DESENHO acima).
   Cada função lança (throw) em caso de falha; o processo termina com
   código 0 se nada lançou, ou o Node imprime o erro e sai !=0 sozinho.
========================================================================== */
function rodarCenarioFilho(cenario) {
  const assert = require('assert');
  const RAIZ_PROJETO = path.join(__dirname, '..');
  process.chdir(RAIZ_PROJETO); // server.js serve express.static(RAIZ_PROJETO) relativo a __dirname dele, não precisa disso, mas dotenv.config() lê .env do cwd — mantém isolado do resto do projeto real

  const { app } = require('../backend/server.js');
  const servidor = app.listen(0); // porta efêmera — nunca uma porta fixa, testes podem rodar em paralelo

  (async () => {
    try {
      const porta = servidor.address().port;
      const base = 'http://127.0.0.1:' + porta;

      if (cenario === 'sem-chave') {
        const respRaiz = await fetch(base + '/index.html');
        assert.strictEqual(respRaiz.status, 200, 'GET /index.html deveria servir o app estático normalmente mesmo sem ANTHROPIC_API_KEY (a correção era exatamente NÃO derrubar o processo por falta da chave)');
        const corpoRaiz = await respRaiz.text();
        assert.ok(corpoRaiz.includes('Calculadora Previdenciária') || corpoRaiz.includes('previdenci'), 'corpo de /index.html não parece o app esperado');

        const respIA = await fetch(base + '/api/previdenciario/ia-revisar-campos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propostas: [] })
        });
        assert.strictEqual(respIA.status, 503, 'sem ANTHROPIC_API_KEY, a rota de IA deveria responder 503 (indisponível), não derrubar o servidor nem fingir sucesso');
        const corpoIA = await respIA.json();
        assert.ok(corpoIA && /ANTHROPIC_API_KEY/.test(corpoIA.erro || ''), '503 deveria explicar a causa (ANTHROPIC_API_KEY ausente): ' + JSON.stringify(corpoIA));
      }

      if (cenario === 'com-chave-dummy') {
        const respVazio = await fetch(base + '/api/previdenciario/ia-revisar-campos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propostas: [] })
        });
        assert.strictEqual(respVazio.status, 400, 'propostas vazio deveria ser rejeitado com 400 pela validação, sem nunca chegar a chamar a Anthropic');

        const respIdDesconhecido = await fetch(base + '/api/previdenciario/ia-revisar-campos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propostas: [{ id: 'campoQueNaoExiste', valorExibicao: 'x', trecho: 'y' }] })
        });
        assert.strictEqual(respIdDesconhecido.status, 400, 'id de campo desconhecido deveria ser rejeitado com 400');
      }

      if (cenario === 'csp-header') {
        const resp = await fetch(base + '/index.html');
        const csp = resp.headers.get('content-security-policy');
        assert.ok(csp, 'esperava o header Content-Security-Policy em toda resposta');
        assert.ok(csp.includes("script-src 'self' https://cdnjs.cloudflare.com"), 'CSP deveria restringir script-src ao próprio site + cdnjs.cloudflare.com: ' + csp);
        assert.ok(!/unsafe-inline/.test(csp.split(';').find(d => d.trim().startsWith('script-src')) || ''), 'script-src não deveria incluir unsafe-inline (o único script inline foi extraído para js/core/temaEServiceWorker.js)');
      }

      servidor.close(() => process.exit(0));
    } catch (erro) {
      console.error(erro && erro.stack || erro);
      servidor.close(() => process.exit(1));
    }
  })();
}
