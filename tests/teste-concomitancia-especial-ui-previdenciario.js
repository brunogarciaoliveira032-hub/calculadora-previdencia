/* ============================================================================
   TESTE-CONCOMITANCIA-ESPECIAL-UI-PREVIDENCIARIO.JS — cobre a propagação
   de `.houveConcomitanciaEspecial` (motorTempoContribuicao.js, Atualização
   45) até a caixa "Tempo de contribuição" da tela real
   (painelPrevidenciario.js).

   Roda sem dependências externas: `node tests/teste-concomitancia-especial-ui-previdenciario.js`.
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

function resultadoComTempo(houveConcomitanciaEspecial) {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 10, meses: 0, dias: 0 }, houveConcomitanciaEspecial: houveConcomitanciaEspecial } },
    salarioBeneficio: { salarioBeneficio: 3000, quantidadeSalarios: 12, competenciaReferencia: '2026-01', memoria: [] },
    elegibilidade: null,
    rmiTeorica: null
  };
}

(() => {
  console.log('== PROPAGAÇÃO DO AVISO DE CONCOMITÂNCIA DE ATIVIDADE ESPECIAL NA UI ==');

  teste('SEM concomitância especial, nenhum aviso aparece na caixa de tempo de contribuição', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoComTempo(false), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('CONCOMITÂNCIA de atividade especial'));
  });

  teste('COM concomitância especial, o aviso aparece na caixa de tempo de contribuição', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoComTempo(true), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoTempo"'));
    assert.ok(html.includes('CONCOMITÂNCIA de atividade especial'));
    assert.ok(html.includes('fator mais vantajoso'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
