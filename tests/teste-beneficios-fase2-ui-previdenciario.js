/* ============================================================================
   TESTE-BENEFICIOS-FASE2-UI-PREVIDENCIARIO.JS — cobre a integração de
   auxílio por incapacidade temporária, auxílio-acidente, pensão por morte
   e salário-maternidade na UI (painelPrevidenciario.js, Atualização 44).

   Mesmo padrão de teste-beneficio-incapacidade-permanente-ui-previdenciario.js:
   só avalia quando "avaliar" está marcado; cada seção tem IDs próprios e
   nunca aparece sozinha sem os dados mínimos.

   Roda sem dependências externas: `node tests/teste-beneficios-fase2-ui-previdenciario.js`.
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
    'domains/previdenciario/beneficios/auxilioIncapacidadeTemporaria.js',
    'domains/previdenciario/beneficios/auxilioAcidente.js',
    'domains/previdenciario/beneficios/pensaoPorMorte.js',
    'domains/previdenciario/beneficios/salarioMaternidade.js',
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
      // ver mesmo comentário nos outros testes de UI.
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
    salarioBeneficio: { salarioBeneficio: 3000, quantidadeSalarios: 12, competenciaReferencia: '2026-01', memoria: [] },
    elegibilidade: null,
    rmiTeorica: null
  };
}

function historicoFakeComMeses(n) {
  const mesInicio = 1, anoInicio = 2015;
  const mesFimIdx = mesInicio - 1 + (n - 1);
  const anoFim = anoInicio + Math.floor(mesFimIdx / 12);
  const mesFim = (mesFimIdx % 12) + 1;
  const ultimoDia = new Date(anoFim, mesFim, 0).getDate();
  return {
    vinculos: [{ id: 'v1', inicio: `${anoInicio}-01-01`, fim: `${anoFim}-${String(mesFim).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`, tipo: 'comum' }],
    contribuicoes: []
  };
}

(() => {
  console.log('== INTEGRAÇÃO FASE 2 (AUX. INCAPACIDADE TEMP., AUX.-ACIDENTE, PENSÃO, MATERNIDADE) NA UI ==');

  /* -------------------- AUXÍLIO POR INCAPACIDADE TEMPORÁRIA -------------------- */

  teste('auxílio temporário: NÃO avalia sem "avaliar" marcado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarAuxilioIncapacidadeTemporariaSeAplicavel(resultadoBaseFake(), historicoFakeComMeses(12), { avaliar: false });
    assert.strictEqual(r, undefined);
  });

  teste('auxílio temporário: avalia RMI (91%) e elegibilidade (carência 12) quando marcado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarAuxilioIncapacidadeTemporariaSeAplicavel(resultadoBaseFake(), historicoFakeComMeses(12), {
      avaliar: true, incapacidadeAtestada: true
    });
    assert.ok(r);
    assert.strictEqual(r.rmi.rmiFinal, 2730); // 91% de 3000
    assert.strictEqual(r.elegibilidade.elegivel, true);
  });

  /* -------------------- AUXÍLIO-ACIDENTE -------------------- */

  teste('auxílio-acidente: NÃO avalia sem "avaliar" marcado', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarAuxilioAcidenteSeAplicavel(resultadoBaseFake(), { avaliar: false });
    assert.strictEqual(r, undefined);
  });

  teste('auxílio-acidente: avalia RMI (50%) sem precisar de carência nem sexo', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarAuxilioAcidenteSeAplicavel(resultadoBaseFake(), { avaliar: true, sequelaAtestada: true });
    assert.ok(r);
    assert.strictEqual(r.rmi.rmiFinal, 1500); // 50% de 3000
    assert.strictEqual(r.elegibilidade.elegivel, true);
  });

  /* -------------------- PENSÃO POR MORTE -------------------- */

  teste('pensão: NÃO avalia sem numeroDependentes', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarPensaoPorMorteSeAplicavel(resultadoBaseFake(), { avaliar: true, qualidadeSeguradoFalecido: true, dependenteReconhecido: true });
    assert.strictEqual(r, undefined);
  });

  teste('pensão: com valorJaRecebido informado, usa esse valor direto (segurado já aposentado)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarPensaoPorMorteSeAplicavel(resultadoBaseFake(), {
      avaliar: true, qualidadeSeguradoFalecido: true, dependenteReconhecido: true,
      numeroDependentes: 1, valorJaRecebido: 4000
    });
    assert.ok(r);
    assert.strictEqual(r.valorBaseAposentadoria, 4000);
    assert.strictEqual(r.rmi.rmiCotaFamiliar, 2400); // 60% de 4000
    assert.ok(r.origemValorBase.includes('informado manualmente'));
  });

  teste('pensão: SEM valorJaRecebido, auto-calcula como se fosse incapacidade permanente não acidentária (mesma fórmula do art. 26)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarPensaoPorMorteSeAplicavel(resultadoBaseFake(), {
      avaliar: true, qualidadeSeguradoFalecido: true, dependenteReconhecido: true,
      numeroDependentes: 1, sexo: 'homem'
      // sem valorJaRecebido
    });
    assert.ok(r);
    // 20 anos de contribuição -> 60% de 3000 = 1800 (base auto-calculada)
    assert.strictEqual(r.valorBaseAposentadoria, 1800);
    assert.ok(r.origemValorBase.includes('calculado automaticamente'));
  });

  teste('pensão: SEM valorJaRecebido e SEM sexo, não consegue avaliar (auto-cálculo precisa de sexo)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarPensaoPorMorteSeAplicavel(resultadoBaseFake(), {
      avaliar: true, qualidadeSeguradoFalecido: true, dependenteReconhecido: true, numeroDependentes: 1
    });
    assert.strictEqual(r, undefined);
  });

  /* -------------------- SALÁRIO-MATERNIDADE -------------------- */

  teste('maternidade: NÃO avalia sem categoria', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarSalarioMaternidadeSeAplicavel({ avaliar: true, salarioMinimoVigente: 1518 });
    assert.strictEqual(r, undefined);
  });

  teste('maternidade: categoria especial_economia_familiar usa o salário mínimo sem precisar de baseCalculo', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarSalarioMaternidadeSeAplicavel({
      avaliar: true, segurada: true, eventoGerador: true,
      categoria: 'especial_economia_familiar', salarioMinimoVigente: 1518
    });
    assert.ok(r);
    assert.strictEqual(r.rmi.rmiFinal, 1518);
    assert.strictEqual(r.elegibilidade.elegivel, true);
  });

  teste('maternidade: sem carência mesmo que a categoria fosse historicamente exigida (regra pós-STF)', () => {
    const { sandbox } = carregarPainel();
    const r = sandbox.avaliarSalarioMaternidadeSeAplicavel({
      avaliar: true, segurada: true, eventoGerador: true,
      categoria: 'demais', baseCalculo: 2000, salarioMinimoVigente: 1518
    });
    assert.strictEqual(r.elegibilidade.elegivel, true);
  });

  /* -------------------- RENDERIZAÇÃO -------------------- */

  teste('renderizarResultadoPrev NÃO mostra nenhuma das 4 seções novas quando ausentes', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.renderizarResultadoPrev(resultadoBaseFake(), {});
    const html = elementos['prevResultado'].innerHTML;
    assert.ok(!html.includes('prevSecaoAuxTemp'));
    assert.ok(!html.includes('prevSecaoAuxAcidente'));
    assert.ok(!html.includes('prevSecaoPensaoMorte'));
    assert.ok(!html.includes('prevSecaoMaternidade'));
  });

  teste('renderizarResultadoPrev mostra as 4 seções, cada uma com IDs próprios, quando todas presentes', () => {
    const { sandbox, elementos } = carregarPainel();
    const resultado = resultadoBaseFake();
    resultado.auxilioIncapacidadeTemporaria = sandbox.avaliarAuxilioIncapacidadeTemporariaSeAplicavel(resultado, historicoFakeComMeses(12), { avaliar: true, incapacidadeAtestada: true });
    resultado.auxilioAcidente = sandbox.avaliarAuxilioAcidenteSeAplicavel(resultado, { avaliar: true, sequelaAtestada: true });
    resultado.pensaoPorMorte = sandbox.avaliarPensaoPorMorteSeAplicavel(resultado, { avaliar: true, qualidadeSeguradoFalecido: true, dependenteReconhecido: true, numeroDependentes: 2, valorJaRecebido: 3000 });
    resultado.salarioMaternidade = sandbox.avaliarSalarioMaternidadeSeAplicavel({ avaliar: true, segurada: true, eventoGerador: true, categoria: 'empregada_avulsa', baseCalculo: 3000, salarioMinimoVigente: 1518 });

    sandbox.renderizarResultadoPrev(resultado, {});
    const html = elementos['prevResultado'].innerHTML;

    assert.ok(html.includes('id="prevSecaoAuxTempRmi"'));
    assert.ok(html.includes('id="prevSecaoAuxTempElegibilidade"'));
    assert.ok(html.includes('id="prevSecaoAuxAcidenteRmi"'));
    assert.ok(html.includes('id="prevSecaoAuxAcidenteElegibilidade"'));
    assert.ok(html.includes('id="prevSecaoPensaoMorteRmi"'));
    assert.ok(html.includes('id="prevSecaoPensaoMorteElegibilidade"'));
    assert.ok(html.includes('id="prevSecaoMaternidadeRmi"'));
    assert.ok(html.includes('id="prevSecaoMaternidadeElegibilidade"'));
    // seções da regra permanente/incapacidade permanente continuam intactas (não substituídas)
    assert.ok(!html.includes('undefined'), 'nenhum campo deveria vazar "undefined" pro HTML final');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
