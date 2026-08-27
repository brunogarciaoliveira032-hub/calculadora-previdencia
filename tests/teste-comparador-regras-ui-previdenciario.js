/* ============================================================================
   TESTE-COMPARADOR-REGRAS-UI-PREVIDENCIARIO.JS — cobre a integração do
   comparador (comparador/comparadorRegrasPrevidenciarias.js, Atualização
   50) na renderização real (painelPrevidenciario.js): o painel "⚖️
   COMPARADOR PREVIDENCIÁRIO" aparece com a tabela de regras e o "🏆 MELHOR
   RESULTADO" quando resultado.comparadorRegras foi anexado.

   Roda sem dependências externas: `node tests/teste-comparador-regras-ui-previdenciario.js`.
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

  const arquivos = [
    'core/util.js',
    'core/leitorPdf.js',
    'domains/previdenciario/comparador/comparadorRegrasPrevidenciarias.js',
    'domains/previdenciario/ui/painelPrevidenciarioEstado.js',
    'domains/previdenciario/ui/painelPrevidenciarioConferencia.js',
    'domains/previdenciario/ui/painelPrevidenciarioCalculo.js',
    'domains/previdenciario/ui/painelPrevidenciarioResultado.js',
    'domains/previdenciario/ui/painelPrevidenciarioWiring.js'
  ];
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
    rmiTeorica: { rmiFinal: 2800, percentualAplicado: 0.6 }
  };
}

(() => {
  console.log('== INTEGRAÇÃO DO COMPARADOR NA UI — painelPrevidenciario.js (Atualização 50) ==');

  teste('renderizarResultadoPrev NÃO mostra o painel do comparador quando resultado.comparadorRegras está ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('COMPARADOR PREVIDENCIÁRIO'));
  });

  teste('com as 4 regras elegíveis (exemplo do usuário), mostra a tabela e o MELHOR RESULTADO correto', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPontos = { elegibilidade: { elegivel: true, pendencias: [], pontuacaoAtingida: 103, pontuacaoExigida: 103, tempoMinimoExigidoAnos: 35, anoReferencia: 2026 }, rmi: { rmiFinal: 3050, percentualAplicado: 0.7, anosExcedentesConsiderados: 5, aplicouPiso: false, aplicouTeto: false } };
    resultado.regraPedagio50 = { elegibilidade: { elegivel: true, pendencias: [], pedagioAnos: 1, tempoTotalExigidoAnos: 36, tempoMinimoAnos: 35 }, rmi: { rmiFinal: 2920, fatorPrevidenciarioAplicado: 0.9, aplicouPiso: false, aplicouTeto: false } };
    resultado.regraPedagio100 = { elegibilidade: { elegivel: true, pendencias: [], pedagioAnos: 2, tempoTotalExigidoAnos: 37, tempoMinimoAnos: 35, idadeMinimaAnos: 60 }, rmi: { rmiFinal: 3210, aplicouPiso: false, aplicouTeto: false } };
    resultado.comparadorRegras = sandbox.ComparadorRegrasPrevidenciarias.compararRegrasPrevidenciarias(resultado);

    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;

    assert.ok(html.includes('id="prevSecaoComparadorRegras"'));
    assert.ok(html.includes('COMPARADOR PREVIDENCIÁRIO'));
    assert.ok(html.includes('MELHOR RESULTADO — Pedágio 100%'));
    assert.ok(html.includes('R$ 3.210,00') || html.includes('3.210,00'));
  });

  teste('regra inelegível aparece na tabela com "NÃO" em Elegível e nunca vira o melhor resultado', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPontos = { elegibilidade: { elegivel: false, pendencias: ['idade insuficiente'], pontuacaoAtingida: 90, pontuacaoExigida: 103, tempoMinimoExigidoAnos: 35, anoReferencia: 2026 }, rmi: { rmiFinal: 9999, percentualAplicado: 0.9, anosExcedentesConsiderados: 15, aplicouPiso: false, aplicouTeto: false } };
    resultado.comparadorRegras = sandbox.ComparadorRegrasPrevidenciarias.compararRegrasPrevidenciarias(resultado);

    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    const idxComparador = html.indexOf('id="prevSecaoComparadorRegras"');
    const trechoComparador = html.substring(idxComparador, idxComparador + 1500);

    assert.ok(html.includes('MELHOR RESULTADO — Regra permanente'));
    assert.ok(trechoComparador.includes('NÃO'), 'a linha de Pontos na tabela do comparador deveria mostrar "NÃO" em Elegível');
  });

  teste('nenhuma regra avaliada: mostra mensagem explicativa, sem tabela nem melhor resultado', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = { tempoEcarencia: null, salarioBeneficio: null };
    resultado.comparadorRegras = sandbox.ComparadorRegrasPrevidenciarias.compararRegrasPrevidenciarias(resultado);

    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('Nenhuma regra de transição avaliada'));
    assert.ok(!html.includes('MELHOR RESULTADO'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
