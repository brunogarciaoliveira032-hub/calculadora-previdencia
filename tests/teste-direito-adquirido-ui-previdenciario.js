/* ============================================================================
   TESTE-DIREITO-ADQUIRIDO-UI-PREVIDENCIARIO.JS — cobre a integração do
   direito adquirido à aposentadoria por tempo de contribuição
   (regras/direitoAdquirido/aposentadoriaTempoContribuicao.js) na UI real
   (painelPrevidenciario.js, Atualização 51), incluindo o comparador
   (Atualização 50).

   Roda sem dependências externas: `node tests/teste-direito-adquirido-ui-previdenciario.js`.
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
    'domains/previdenciario/regras/direitoAdquirido/aposentadoriaTempoContribuicao.js',
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

(() => {
  console.log('== INTEGRAÇÃO DIREITO ADQUIRIDO (TEMPO DE CONTRIBUIÇÃO) NA UI — Atualização 51 ==');

  teste('avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel NÃO avalia sem "avaliar" marcado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({ avaliar: false, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35 });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel calcula elegibilidade sem precisar do salário de benefício ainda', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 61, carenciaEm13112019Meses: 180
    });
    assert.ok(r);
    assert.strictEqual(r.elegibilidade.elegivel, true);
    assert.strictEqual(r.rmi, undefined, 'sem salarioBeneficio80MaioresSalarios, a RMI não deveria ser calculada');
  });

  teste('avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel calcula RMI quando pontuação dispensa o fator (não precisa de fatorPrevidenciario)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 61, carenciaEm13112019Meses: 180,
      salarioBeneficio80MaioresSalarios: 3000
    });
    assert.ok(r.rmi);
    assert.strictEqual(r.rmi.dispensouFatorPrevidenciario, true);
    assert.strictEqual(r.rmi.rmiFinal, 3000);
  });

  teste('avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel exige fatorPrevidenciario quando a pontuação NÃO dispensa', () => {
    const { sandbox } = carregarPainel();
    const semFator = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 55, carenciaEm13112019Meses: 180, // pontuação 90, abaixo de 96
      salarioBeneficio80MaioresSalarios: 3000
    });
    assert.strictEqual(semFator.rmi, undefined, 'sem fator informado e sem dispensa, a RMI não deveria ser calculada');

    const comFator = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 55, carenciaEm13112019Meses: 180,
      salarioBeneficio80MaioresSalarios: 3000, fatorPrevidenciario: 0.85
    });
    assert.strictEqual(comFator.rmi.rmiFinal, 2550);
    assert.strictEqual(comFator.rmi.dispensouFatorPrevidenciario, false);
  });

  teste('renderizarResultadoPrev NÃO mostra a seção de direito adquirido quando ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev({}, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('DireitoAdquirido'));
  });

  teste('renderizarResultadoPrev mostra RMI+elegibilidade do direito adquirido com IDs próprios quando presente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = {};
    resultado.direitoAdquiridoTempoContribuicao = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 61, carenciaEm13112019Meses: 180,
      salarioBeneficio80MaioresSalarios: 3000
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoRmiDireitoAdquirido"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadeDireitoAdquirido"'));
    assert.ok(html.includes('art. 53'));
    assert.ok(html.includes('DISPENSADO'));
  });

  teste('renderizarResultadoPrev mostra aviso pedindo o salário de benefício (sem inventar RMI) quando ausente', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = {};
    resultado.direitoAdquiridoTempoContribuicao = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 61, carenciaEm13112019Meses: 180
      // sem salarioBeneficio80MaioresSalarios
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoRmiDireitoAdquirido"'));
    assert.ok(html.includes('Informe o "Salário de benefício (80% maiores salários)"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadeDireitoAdquirido"'), 'a elegibilidade continua aparecendo mesmo sem o salário de benefício');
  });

  teste('o comparador de regras inclui o direito adquirido e pode elegê-lo como melhor resultado', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [], regraVerificada: 'permanente', carencia: { totalMeses: 180, metodologia: 'x', limitacoes: [] } },
      rmiTeorica: { rmiFinal: 2000, percentualAplicado: 0.6, anosExcedentesConsiderados: 0, aplicouPiso: false, aplicouTeto: false },
      salarioBeneficio: { salarioBeneficio: 2000, quantidadeSalarios: 1, competenciaReferencia: '2026-01', memoria: [] },
      tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 20, meses: 0, dias: 0 } } }
    };
    resultado.direitoAdquiridoTempoContribuicao = sandbox.avaliarDireitoAdquiridoTempoContribuicaoSeAplicavel({
      avaliar: true, sexo: 'homem', tempoContribuicaoEm13112019Anos: 35,
      idadeEm13112019Anos: 61, carenciaEm13112019Meses: 180,
      salarioBeneficio80MaioresSalarios: 5000
    });
    resultado.comparadorRegras = sandbox.ComparadorRegrasPrevidenciarias.compararRegrasPrevidenciarias(resultado);

    assert.strictEqual(resultado.comparadorRegras.melhorRegra.nome, 'Direito adquirido (tempo de contribuição)');
    assert.strictEqual(resultado.comparadorRegras.melhorRegra.rmiFinal, 5000);

    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('MELHOR RESULTADO — Direito adquirido'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
