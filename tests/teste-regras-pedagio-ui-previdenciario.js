/* ============================================================================
   TESTE-REGRAS-PEDAGIO-UI-PREVIDENCIARIO.JS — cobre a integração das
   regras de transição por PEDÁGIO DE 50% (art. 17) e PEDÁGIO DE 100%
   (art. 20) na UI (painelPrevidenciario.js, Atualização 41):

     1. avaliarRegraPedagio50SeAplicavel()/avaliarRegraPedagio100SeAplicavel()
        — só chamam os respectivos módulos quando há dados mínimos; a RMI
        do pedágio de 50% fica ausente (não undefined por erro, mas por
        falta de dado) quando o fator previdenciário não foi informado,
        SEM impedir a elegibilidade de aparecer.
     2. renderizarResultadoPrev() — as caixas de cada regra só aparecem
        quando o respectivo resultado.regraPedagioXX foi anexado, sempre em
        seções próprias, separadas entre si e da regra permanente/pontos.

   Roda sem dependências externas: `node tests/teste-regras-pedagio-ui-previdenciario.js`.
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
    'domains/previdenciario/regras/transicao/pontos.js',
    'domains/previdenciario/regras/transicao/pedagio50.js',
    'domains/previdenciario/regras/transicao/pedagio100.js',
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
      // ver mesmo comentário de teste-regra-pontos-ui-previdenciario.js —
      // leitorPdf.js pode falhar em partes que não usamos aqui.
    }
  });
  if (typeof sandbox.escaparHtml !== 'function') {
    throw new Error('escaparHtml não ficou definida no sandbox — pré-requisito do teste não atendido');
  }
  return { sandbox, elementos };
}

function resultadoBaseFake() {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 38, meses: 0, dias: 0 } } },
    salarioBeneficio: { salarioBeneficio: 3000 },
    elegibilidade: {
      elegivel: true, pendencias: [], regraVerificada: 'permanente (art. 26, EC 103/2019)',
      carencia: { totalMeses: 180, metodologia: 'Lei 8.213/91, art. 27', limitacoes: [] }
    },
    rmiTeorica: { rmiFinal: 2400, percentualAplicado: 0.80, anosExcedentesConsiderados: 18, aplicouPiso: false, aplicouTeto: false }
  };
}

(() => {
  console.log('== INTEGRAÇÃO REGRAS DE PEDÁGIO 50%/100% NA UI — painelPrevidenciario.js (Atualização 41) ==');

  /* -------------------- PEDÁGIO 50% -------------------- */

  teste('avaliarRegraPedagio50SeAplicavel calcula elegibilidade+RMI quando fator previdenciário é informado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPedagio50SeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', tempoContribuicaoEm13112019Anos: 34, fatorPrevidenciario: 0.85,
      salarioMinimoVigente: 0, tetoRGPSVigente: 0
    });
    assert.ok(r);
    assert.ok(r.rmi, 'RMI deveria ter sido calculada com o fator informado');
    assert.strictEqual(r.rmi.fatorPrevidenciarioAplicado, 0.85);
    assert.strictEqual(r.elegibilidade.tempoMinimoAnos, 35);
  });

  teste('avaliarRegraPedagio50SeAplicavel calcula elegibilidade MAS NÃO a RMI quando fator previdenciário não foi informado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPedagio50SeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', tempoContribuicaoEm13112019Anos: 34
      // sem fatorPrevidenciario
    });
    assert.ok(r, 'deveria retornar elegibilidade mesmo sem o fator');
    assert.strictEqual(r.rmi, undefined);
    assert.ok(r.elegibilidade);
  });

  teste('avaliarRegraPedagio50SeAplicavel NÃO calcula nada quando falta tempoContribuicaoEm13112019Anos', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPedagio50SeAplicavel(resultadoBaseFake(), { sexo: 'homem', fatorPrevidenciario: 0.85 });
    assert.strictEqual(r, undefined);
  });

  /* -------------------- PEDÁGIO 100% -------------------- */

  teste('avaliarRegraPedagio100SeAplicavel calcula elegibilidade+RMI quando os dados mínimos estão presentes', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPedagio100SeAplicavel(resultadoBaseFake(), {
      sexo: 'homem', idadeAnos: 60, tempoContribuicaoEm13112019Anos: 32
    });
    assert.ok(r);
    assert.ok(r.rmi, 'RMI do pedágio de 100% não depende de fator, deveria vir sempre que os dados mínimos existem');
    assert.strictEqual(r.rmi.rmiFinal, 3000); // 100% direto do salário de benefício
    assert.strictEqual(r.elegibilidade.idadeMinimaAnos, 60);
  });

  teste('avaliarRegraPedagio100SeAplicavel NÃO calcula quando falta tempoContribuicaoEm13112019Anos', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarRegraPedagio100SeAplicavel(resultadoBaseFake(), { sexo: 'homem', idadeAnos: 60 });
    assert.strictEqual(r, undefined);
  });

  teste('avaliarRegraPedagio100SeAplicavel NÃO calcula quando falta salário de benefício', () => {
    const { sandbox } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.salarioBeneficio = { salarioBeneficio: null };
    const r = sandbox.avaliarRegraPedagio100SeAplicavel(resultado, { sexo: 'homem', idadeAnos: 60, tempoContribuicaoEm13112019Anos: 32 });
    assert.strictEqual(r, undefined);
  });

  /* -------------------- RENDERIZAÇÃO -------------------- */

  teste('renderizarResultadoPrev NÃO mostra nenhuma caixa de pedágio quando os resultados estão ausentes', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('Pedagio50') && !html.includes('Pedagio100'));
  });

  teste('renderizarResultadoPrev mostra as caixas de pedágio de 50% e 100%, separadas entre si e com IDs próprios', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPedagio50 = sandbox.avaliarRegraPedagio50SeAplicavel(resultado, {
      sexo: 'homem', tempoContribuicaoEm13112019Anos: 34, fatorPrevidenciario: 0.85
    });
    resultado.regraPedagio100 = sandbox.avaliarRegraPedagio100SeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 60, tempoContribuicaoEm13112019Anos: 32
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;

    assert.ok(html.includes('id="prevSecaoRmiPedagio50"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadePedagio50"'));
    assert.ok(html.includes('id="prevSecaoRmiPedagio100"'));
    assert.ok(html.includes('id="prevSecaoElegibilidadePedagio100"'));
    assert.ok(html.includes('art. 17'));
    assert.ok(html.includes('art. 20'));
  });

  teste('renderizarResultadoPrev mostra aviso pedindo o fator previdenciário (sem inventar RMI) quando ele não foi informado', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPedagio50 = sandbox.avaliarRegraPedagio50SeAplicavel(resultado, {
      sexo: 'homem', tempoContribuicaoEm13112019Anos: 34
      // sem fator
    });
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('id="prevSecaoRmiPedagio50"'), 'a seção de RMI deveria aparecer, mas com o aviso, não um valor inventado');
    assert.ok(html.includes('Informe o fator previdenciário'));
    assert.ok(html.includes('id="prevSecaoElegibilidadePedagio50"'), 'a elegibilidade continua aparecendo mesmo sem o fator');
  });

  teste('renderizarResultadoPrev mostra pendências específicas de cada regra de pedágio quando reprovam por motivos diferentes', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.regraPedagio50 = sandbox.avaliarRegraPedagio50SeAplicavel(resultado, {
      sexo: 'homem', tempoContribuicaoEm13112019Anos: 20, fatorPrevidenciario: 0.85 // não passa da pré-condição (33)
    });
    resultado.regraPedagio100 = sandbox.avaliarRegraPedagio100SeAplicavel(resultado, {
      sexo: 'homem', idadeAnos: 50, tempoContribuicaoEm13112019Anos: 32 // idade insuficiente (mín. 60)
    });
    assert.strictEqual(resultado.regraPedagio50.elegibilidade.elegivel, false);
    assert.strictEqual(resultado.regraPedagio100.elegibilidade.elegivel, false);
    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(html.includes('pré-condição do art. 17'));
    assert.ok(html.includes('idade mínima'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
