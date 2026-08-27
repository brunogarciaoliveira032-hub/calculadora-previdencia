/* ============================================================================
   TESTE-REGRA-IDADE-MINIMA-PROGRESSIVA-UI-PREVIDENCIARIO.JS — cobre a
   integração da regra de transição por idade mínima progressiva
   (regras/transicao/idadeMinimaProgressiva.js) na UI real
   (painelPrevidenciario.js, Atualização 49).

   Roda sem dependências externas: `node tests/teste-regra-idade-minima-progressiva-ui-previdenciario.js`.
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
    'domains/previdenciario/motorRMI.js',
    'domains/previdenciario/regras/transicao/idadeMinimaProgressiva.js',
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
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 40, meses: 0, dias: 0 } } },
    salarioBeneficio: { salarioBeneficio: 3000, quantidadeSalarios: 12, competenciaReferencia: '2026-01', memoria: [] },
    elegibilidade: {
      elegivel: true, pendencias: [], regraVerificada: 'permanente',
      carencia: { totalMeses: 180, metodologia: 'Lei 8.213/91, art. 27', limitacoes: [] }
    },
    rmiTeorica: { rmiFinal: 2400, percentualAplicado: 0.80, anosExcedentesConsiderados: 20, aplicouPiso: false, aplicouTeto: false }
  };
}

(() => {
  console.log('== INTEGRAÇÃO REGRA DE IDADE MÍNIMA PROGRESSIVA NA UI — painelPrevidenciario.js (Atualização 49) ==');

  teste('avaliarRegraIdadeMinimaProgressivaSeAplicavel calcula elegibilidade+RMI quando todos os dados mínimos estão presentes', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', idadeAnos: 64.5, competenciaReferencia: '2026-03',
      salarioMinimoVigente: 0, tetoRGPSVigente: 0
    });
    assert.ok(r);
    assert.strictEqual(r.elegibilidade.elegivel, true);
    assert.strictEqual(r.elegibilidade.idadeExigida, 64.5);
    assert.strictEqual(r.rmi.tempoMinimoExigidoAnos, 35);
  });

  teste('avaliarRegraIdadeMinimaProgressivaSeAplicavel NÃO calcula quando idade não foi informada (carência não apurada)', () => {
    const { sandbox } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.elegibilidade.carencia = null;
    const r = sandbox.avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: undefined, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarRegraIdadeMinimaProgressivaSeAplicavel reprova quando a idade fica abaixo da exigida no ano', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', idadeAnos: 60, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(r.elegibilidade.elegivel, false);
    assert.ok(r.elegibilidade.pendencias.some(p => p.includes('idade mínima')));
  });

  teste('renderizarResultadoPrev NÃO mostra seção da regra de idade progressiva quando ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('IdadeProgressiva'));
  });

  teste('renderizarResultadoPrev mostra as duas caixas (RMI + elegibilidade) quando resultado.regraIdadeMinimaProgressiva está presente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraIdadeMinimaProgressiva = sandbox.avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 64.5, competenciaReferencia: '2026-03'
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoRmiIdadeProgressiva"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadeIdadeProgressiva"'));
    assert.ok(html.includes('EC 103/2019, art. 16'));
    assert.ok(html.includes('35 anos'));
  });

  teste('renderizarResultadoPrev mostra pendência de idade quando a regra reprova, mesmo com a permanente aprovando', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraIdadeMinimaProgressiva = sandbox.avaliarRegraIdadeMinimaProgressivaSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 62, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(resultado.regraIdadeMinimaProgressiva.elegibilidade.elegivel, false);
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('❌ Não elegível'));
    assert.ok(html.includes('idade mínima não atingida'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
