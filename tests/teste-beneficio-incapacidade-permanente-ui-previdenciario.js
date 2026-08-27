/* ============================================================================
   TESTE-BENEFICIO-INCAPACIDADE-PERMANENTE-UI-PREVIDENCIARIO.JS — cobre a
   integração da aposentadoria por incapacidade permanente
   (beneficios/incapacidadePermanente.js) na UI (painelPrevidenciario.js,
   Atualização 43):

     1. avaliarBeneficioIncapacidadePermanenteSeAplicavel() — só avalia
        quando o usuário marcou "avaliar" explicitamente (diferente das
        regras de transição, que avaliam sempre que os dados batem);
        carência é apurada por validarCarenciaPrevidenciaria() diretamente
        (12 meses), independente de idade ter sido informada.
     2. renderizarResultadoPrev() — a seção só aparece quando
        resultado.beneficioIncapacidadePermanente foi anexado, sempre
        separada das demais (regra permanente/transição).

   Roda sem dependências externas: `node tests/teste-beneficio-incapacidade-permanente-ui-previdenciario.js`.
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
    'core/calculoPeriodos.js',
    'domains/previdenciario/motorRMI.js',
    'domains/previdenciario/beneficios/incapacidadePermanente.js',
    'domains/previdenciario/carencia/validacaoCarenciaPrevidenciaria.js',
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
      // ver mesmo comentário nos outros testes de UI — leitorPdf.js pode
      // falhar em partes que não usamos aqui.
    }
  });
  if (typeof sandbox.escaparHtml !== 'function') {
    throw new Error('escaparHtml não ficou definida no sandbox — pré-requisito do teste não atendido');
  }
  return { sandbox, elementos };
}

function resultadoBaseFake() {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 20, meses: 0, dias: 0 } } },
    salarioBeneficio: { salarioBeneficio: 3000 },
    elegibilidade: null, // incapacidade permanente não depende disto (sem idade exigida)
    rmiTeorica: null
  };
}

function historicoFakeComContribuicoes(n) {
  // Regra I (art. 27, Lei 8.213/91) conta toda competência dentro do SPAN
  // do vínculo — não a quantidade de contribuições lançadas. Por isso o
  // vínculo aqui cobre exatamente n meses (não 10 anos fixos).
  const mesInicio = 1;
  const anoInicio = 2015;
  const mesFimIdx = mesInicio - 1 + (n - 1);
  const anoFim = anoInicio + Math.floor(mesFimIdx / 12);
  const mesFim = (mesFimIdx % 12) + 1;
  const ultimoDia = new Date(anoFim, mesFim, 0).getDate();
  const vinculos = [{
    id: 'v1',
    inicio: `${anoInicio}-${String(mesInicio).padStart(2, '0')}-01`,
    fim: `${anoFim}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`,
    tipo: 'comum'
  }];
  return { vinculos, contribuicoes: [] };
}

(() => {
  console.log('== INTEGRAÇÃO INCAPACIDADE PERMANENTE NA UI — painelPrevidenciario.js (Atualização 43) ==');

  teste('avaliarBeneficioIncapacidadePermanenteSeAplicavel NÃO avalia quando "avaliar" não foi marcado (diferente das regras de transição)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultadoBaseFake(), historicoFakeComContribuicoes(12), {
      avaliar: false, incapacidadeAtestada: true
    });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarBeneficioIncapacidadePermanenteSeAplicavel avalia elegibilidade+RMI (caso não acidentário) quando marcado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultadoBaseFake(), historicoFakeComContribuicoes(12), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: false, sexo: 'homem'
    });
    assert.ok(r);
    assert.strictEqual(r.elegibilidade.elegivel, true);
    assert.strictEqual(r.rmi.percentualAplicado, 0.60); // 20 anos exatos
    assert.strictEqual(r.carencia.totalMeses, 12);
  });

  teste('avaliarBeneficioIncapacidadePermanenteSeAplicavel: caso acidentário não precisa de sexo (RMI 100% direto)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultadoBaseFake(), historicoFakeComContribuicoes(12), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: true
    });
    assert.ok(r);
    assert.strictEqual(r.rmi.rmiFinal, 3000);
    assert.strictEqual(r.rmi.causaAcidentaria, true);
  });

  teste('avaliarBeneficioIncapacidadePermanenteSeAplicavel reprova elegibilidade por carência insuficiente (12 meses exigidos, não 180)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultadoBaseFake(), historicoFakeComContribuicoes(6), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: true
    });
    assert.strictEqual(r.elegibilidade.elegivel, false);
    assert.strictEqual(r.carencia.totalMeses, 6);
  });

  teste('avaliarBeneficioIncapacidadePermanenteSeAplicavel: dispensaCarencia aprova mesmo com poucas contribuições', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultadoBaseFake(), historicoFakeComContribuicoes(1), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: true, dispensaCarencia: true
    });
    assert.strictEqual(r.elegibilidade.elegivel, true);
  });

  teste('renderizarResultadoPrev NÃO mostra a seção de incapacidade permanente quando ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('IncapacidadePermanente'));
  });

  teste('renderizarResultadoPrev mostra RMI+elegibilidade da incapacidade permanente, com IDs próprios, quando presente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.beneficioIncapacidadePermanente = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultado, historicoFakeComContribuicoes(12), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: true
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoRmiIncapacidadePermanente"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadeIncapacidadePermanente"'));
    assert.ok(html.includes('art. 42'));
  });

  teste('renderizarResultadoPrev mostra o acréscimo de 25% (grande invalidez) quando aplicado, citando o art. 45', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.beneficioIncapacidadePermanente = sandbox.avaliarBeneficioIncapacidadePermanenteSeAplicavel(resultado, historicoFakeComContribuicoes(12), {
      avaliar: true, incapacidadeAtestada: true, causaAcidentaria: true, necessitaAssistenciaPermanente: true
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('grande invalidez'));
    assert.ok(html.includes('art. 45'));
    assert.ok(html.includes('3.750,00') || html.includes('R$3750') || html.includes('3750'), 'deveria mostrar o valor final com o adicional (3000 * 1.25 = 3750)');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
