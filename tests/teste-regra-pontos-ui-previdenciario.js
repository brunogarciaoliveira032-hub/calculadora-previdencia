/* ============================================================================
   TESTE-REGRA-PONTOS-UI-PREVIDENCIARIO.JS — cobre a integração da regra de
   transição por pontos (regras/transicao/pontos.js, Atualização 38) na UI
   (js/domains/previdenciario/ui/painelPrevidenciario.js, Atualização 39):

     1. avaliarRegraPontosSeAplicavel() — só chama RegraTransicaoPontos
        quando há dados mínimos (tempo, salário de benefício, carência já
        apurada com idade informada, sexo, competência de referência);
        nunca inventa/assume nenhum desses valores.
     2. renderizarResultadoPrev() — as caixas de RMI teórica e
        elegibilidade da regra de pontos só aparecem quando
        resultado.regraPontos foi anexado, SEMPRE em seções próprias
        separadas da regra permanente (nunca combinadas/substituindo).

   Carrega painelPrevidenciario.js num vm sandbox com um stub mínimo de
   document/localStorage (mesmo espírito de tests/dom-stub.js, mas só o
   necessário pra $()/escaparHtml/fmt funcionarem e pra capturar o
   innerHTML escrito por renderizarResultadoPrev).

   Roda sem dependências externas: `node tests/teste-regra-pontos-ui-previdenciario.js`.
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
    id,
    style: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    textContent: '',
    innerHTML: '',
    value: '',
    disabled: false,
    checked: false,
    addEventListener() {},
    removeEventListener() {}
  };
}

function carregarPainel() {
  const elementos = {};
  const documentoFake = {
    getElementById(id) {
      if (!elementos[id]) elementos[id] = criarElementoFake(id);
      return elementos[id];
    },
    addEventListener() {},
    createElement() { return criarElementoFake('anon'); }
  };
  const sandbox = {
    document: documentoFake,
    window: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    console,
    setTimeout,
    clearTimeout
  };
  sandbox.window.iniciarPipelineLeituraPdf = undefined;
  vm.createContext(sandbox);

  const arquivos = [
    'core/util.js',
    'core/leitorPdf.js', // define escaparHtml (única dependência usada daqui)
    'domains/previdenciario/motorRMI.js',
    'domains/previdenciario/regras/transicao/pontos.js',
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
    } catch (erro) {
      // leitorPdf.js pode depender de coisas de PDF/canvas que não nos
      // interessam aqui — só precisamos que escaparHtml() fique definida
      // no sandbox; se o arquivo falhar em outro ponto do carregamento
      // (ex.: acesso a alguma API de navegador ausente no stub), seguimos
      // em frente e checamos escaparHtml explicitamente depois.
    }
  });
  if (typeof sandbox.escaparHtml !== 'function') {
    throw new Error('escaparHtml não ficou definida no sandbox — pré-requisito do teste não atendido');
  }
  return { sandbox, elementos, documentoFake };
}

function resultadoBaseFake() {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 40, meses: 0, dias: 0 } } },
    salarioBeneficio: { salarioBeneficio: 3000 },
    elegibilidade: {
      elegivel: true,
      pendencias: [],
      regraVerificada: 'permanente (art. 26, EC 103/2019)',
      carencia: { totalMeses: 180, metodologia: 'Lei 8.213/91, art. 27', limitacoes: [] }
    },
    rmiTeorica: { rmiFinal: 2400, percentualAplicado: 0.80, anosExcedentesConsiderados: 20, aplicouPiso: false, aplicouTeto: false }
  };
}

(() => {
  console.log('== INTEGRAÇÃO REGRA DE PONTOS NA UI — painelPrevidenciario.js (Atualização 39) ==');

  teste('avaliarRegraPontosSeAplicavel calcula elegibilidade+RMI quando todos os dados mínimos estão presentes', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPontosSeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', idadeAnos: 68, competenciaReferencia: '2026-03',
      salarioMinimoVigente: 0, tetoRGPSVigente: 0
    });
    assert.ok(r, 'deveria ter retornado um resultado');
    assert.strictEqual(r.elegibilidade.elegivel, true);
    assert.strictEqual(r.rmi.tempoMinimoExigidoAnos, 35);
  });

  teste('avaliarRegraPontosSeAplicavel NÃO calcula quando idade não foi informada (carência não apurada)', () => {
    const { sandbox } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.elegibilidade.carencia = null; // mesmo estado que motorRMIDoHistorico.js devolve sem idadeAnos
    const r = sandbox.avaliarRegraPontosSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: undefined, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarRegraPontosSeAplicavel NÃO calcula quando falta salário de benefício', () => {
    const { sandbox } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.salarioBeneficio = { salarioBeneficio: null };
    const r = sandbox.avaliarRegraPontosSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 68, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarRegraPontosSeAplicavel NÃO lança erro e devolve undefined quando dataReferencia é inválida para a regra (ex.: antes de 2019)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPontosSeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', idadeAnos: 68, competenciaReferencia: '2015-03'
    });
    assert.strictEqual(r, undefined);
  });

  teste('renderizarResultadoPrev NÃO mostra seção da regra de pontos quando resultado.regraPontos está ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    // sem resultado.regraPontos
    sandbox.renderizarResultadoPrev(resultado, { nomeSegurado: 'Fulano', competenciaReferencia: '2026-03' });
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('prevSecaoRmiPontos'), 'não deveria ter a caixa de RMI da regra de pontos');
    assert.ok(!html.includes('prevSecaoElegibilidadePontos'), 'não deveria ter a caixa de elegibilidade da regra de pontos');
  });

  teste('renderizarResultadoPrev mostra as duas caixas (RMI + elegibilidade) da regra de pontos, separadas da regra permanente, quando resultado.regraPontos está presente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPontos = sandbox.avaliarRegraPontosSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 68, competenciaReferencia: '2026-03'
    });
    sandbox.renderizarResultadoPrev(resultado, { nomeSegurado: 'Fulano', competenciaReferencia: '2026-03' });
    const html = elementos['prevResultado'].innerHTML;

    assert.ok(html.includes('id="prevSecaoRmiPontos"'), 'deveria ter a caixa de RMI da regra de pontos');
    assert.ok(html.includes('id="prevSecaoElegibilidadePontos"'), 'deveria ter a caixa de elegibilidade da regra de pontos');
    assert.ok(html.includes('id="prevSecaoRmi"'), 'a caixa da regra permanente continua existindo, separada');
    assert.ok(html.includes('id="prevSecaoElegibilidade"'), 'a caixa de elegibilidade da regra permanente continua existindo, separada');
    assert.ok(html.includes('EC 103/2019, art. 15'), 'deveria citar a base legal da regra de pontos');
    assert.ok(html.includes('35 anos'), 'deveria mostrar o tempo mínimo próprio da regra de pontos (35 anos, homem)');
  });

  teste('renderizarResultadoPrev mostra pendências da regra de pontos quando ela reprova, mesmo com a regra permanente aprovando', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.tempoEcarencia.tempoContribuicao.tempoTotal = { anos: 20, meses: 0, dias: 0 }; // bate a permanente (mín. 20) mas não a de pontos (mín. 35)
    resultado.regraPontos = sandbox.avaliarRegraPontosSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 65, competenciaReferencia: '2026-03'
    });
    assert.strictEqual(resultado.regraPontos.elegibilidade.elegivel, false);
    sandbox.renderizarResultadoPrev(resultado, { nomeSegurado: 'Fulano', competenciaReferencia: '2026-03' });
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('❌ Não elegível'), 'deveria mostrar reprovação da regra de pontos');
    assert.ok(html.includes('tempo de contribuição mínimo'), 'deveria listar a pendência de tempo mínimo (35 anos) não atingido');
  });

  teste('renderizarResultadoPrev nunca inventa a limitação de filiação pré-2019 — ela aparece sempre que a caixa de pontos aparece', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPontos = sandbox.avaliarRegraPontosSeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 68, competenciaReferencia: '2026-03'
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('filiação ao RGPS anterior a 13/11/2019'), 'deveria avisar a limitação de filiação não verificada');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
