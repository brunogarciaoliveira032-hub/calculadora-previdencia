/* ============================================================================
   TESTE-VALIDACAO-FINAL-UI-PREVIDENCIARIO.JS — cobre a integração do
   validador final (validacaoFinal/validadorFinalCalculo.js, Atualização
   48) na renderização real (painelPrevidenciario.js): o painel "STATUS DO
   CÁLCULO" aparece no topo do resultado quando resultado.validacaoFinal
   foi anexado, com a cor/rótulo certos por statusGeral.

   Roda sem dependências externas: `node tests/teste-validacao-final-ui-previdenciario.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function teste(nome, fn) {
  totalTestes++;
  try {
    fn();
    console.log(`  OK  ${nome}`);
  } catch (erro) {
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.stack || erro.message}`);
  }
}

function criarElementoFake(id) {
  return {
    id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    textContent: '', innerHTML: '', value: '', disabled: false, checked: false,
    addEventListener() {}, removeEventListener() {}
  };
}

function carregarPainel() {
  const elementos = {};
  const documentoFake = {
    getElementById(id) { if (!elementos[id]) elementos[id] = criarElementoFake(id); return elementos[id]; },
    addEventListener() {},
    createElement() { return criarElementoFake('anon'); }
  };
  const sandbox = {
    document: documentoFake, window: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    console, setTimeout, clearTimeout
  };
  sandbox.window.iniciarPipelineLeituraPdf = undefined;
  vm.createContext(sandbox);

  const arquivos = ['core/util.js', 'core/leitorPdf.js',
    'domains/previdenciario/ui/painelPrevidenciarioEstado.js',
    'domains/previdenciario/ui/painelPrevidenciarioConferencia.js',
    'domains/previdenciario/ui/painelPrevidenciarioCalculo.js',
    'domains/previdenciario/ui/painelPrevidenciarioResultado.js',
    'domains/previdenciario/ui/painelPrevidenciarioWiring.js'];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    try {
      new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
    } catch (erro) { /* ver mesmo comentário nos outros testes de UI */ }
  });
  if (typeof sandbox.escaparHtml !== 'function') {
    throw new Error('escaparHtml não ficou definida no sandbox');
  }
  return { sandbox, elementos };
}

function resultadoBaseFake() {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 20, meses: 0, dias: 0 } } },
    salarioBeneficio: { salarioBeneficio: 3000, quantidadeSalarios: 12, competenciaReferencia: '2026-01', memoria: [] },
    elegibilidade: { elegivel: true, pendencias: [], regraVerificada: 'permanente', carencia: { totalMeses: 180, metodologia: 'Lei 8.213/91, art. 27', limitacoes: [] } },
    rmiTeorica: { rmiFinal: 1800, percentualAplicado: 0.6 }
  };
}

(() => {
  console.log('== INTEGRAÇÃO DA VALIDAÇÃO FINAL NA UI — painelPrevidenciario.js (Atualização 48) ==');

  teste('renderizarResultadoPrev NÃO mostra o painel de status quando resultado.validacaoFinal está ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('STATUS DO CÁLCULO'));
    assert.ok(!html.includes('prevSecaoValidacaoFinal'));
  });

  teste('statusGeral "validado" mostra 🟢 VALIDADO', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.validacaoFinal = { statusGeral: 'validado', itens: [{ codigo: 'x', rotulo: 'Item X', status: 'ok', detalhe: 'tudo certo' }] };
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoValidacaoFinal"'));
    assert.ok(html.includes('🟢 VALIDADO'));
    assert.ok(html.includes('Item X'));
  });

  teste('statusGeral "validado_com_ressalvas" mostra 🟡 VALIDADO COM RESSALVAS', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.validacaoFinal = { statusGeral: 'validado_com_ressalvas', itens: [{ codigo: 'x', rotulo: 'Item X', status: 'ressalva', detalhe: 'revisar' }] };
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('🟡 VALIDADO COM RESSALVAS'));
  });

  teste('statusGeral "bloqueado" mostra 🔴 CÁLCULO BLOQUEADO', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.validacaoFinal = { statusGeral: 'bloqueado', itens: [{ codigo: 'x', rotulo: 'Item X', status: 'bloqueado', detalhe: 'DIB depois da DER' }] };
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('🔴 CÁLCULO BLOQUEADO'));
    assert.ok(html.includes('DIB depois da DER'));
  });

  teste('o painel de validação aparece ANTES do card de auditoria no HTML final', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.validacaoFinal = { statusGeral: 'validado', itens: [{ codigo: 'x', rotulo: 'Item X', status: 'ok' }] };
    sandbox.renderizarResultadoPrev(resultado, { nomeSegurado: 'Fulano' });
    const html = elementos['prevResultado'].innerHTML;
    const idxValidacao = html.indexOf('prevSecaoValidacaoFinal');
    const idxAuditoria = html.indexOf('prev-auditoria-cabecalho');
    assert.ok(idxValidacao >= 0 && idxAuditoria >= 0);
    assert.ok(idxValidacao < idxAuditoria, 'validação final deveria vir antes do card de auditoria');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
