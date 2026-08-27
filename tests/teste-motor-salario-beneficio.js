/* ============================================================================
   TESTE-MOTOR-SALARIO-BENEFICIO.JS — cobre js/domains/previdenciario/
   motorSalarioBeneficio.js (Atualização 17). Mesma técnica de mock de
   `buscarSerieBcbComCache` do teste de correção — sem rede real.

   Roda sem dependências externas: `node tests/teste-motor-salario-beneficio.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function proximo(diferenca) { return Math.abs(diferenca) < 1e-6; }

function teste(nome, fn) {
  totalTestes++;
  const resultado = fn();
  const finalizar = (erro) => {
    if (erro) {
      totalFalhas++;
      console.log(`FALHA ${nome}`);
      console.log(`      ${erro.message}`);
    } else {
      console.log(`  OK  ${nome}`);
    }
  };
  if (resultado && typeof resultado.then === 'function') {
    return resultado.then(() => finalizar(null), finalizar);
  }
  finalizar(null);
  return Promise.resolve();
}

// Mesma série sintética do teste de correção: 03/2001=1%, 04/2001=2%, 05/2001=-1%.
// Fatores acumulados: 2001-03=1.01, 2001-04=1.0302, 2001-05=1.019898.
const DADOS_INPC_MOCK = [
  { data: '01/03/2001', valor: '1,00' },
  { data: '01/04/2001', valor: '2,00' },
  { data: '01/05/2001', valor: '-1,00' }
];

function carregar(mockBuscarSerie) {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'util.js'),
    path.join(__dirname, '..', 'js', 'core', 'indices.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'correcao', 'correcaoINPCPrevidenciario.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorSalarioBeneficio.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  sandbox.buscarSerieBcbComCache = mockBuscarSerie;
  return sandbox;
}

function historicoComContribuicoes(lista) {
  return { contribuicoes: lista };
}

async function main() {
  console.log('== MOTORSALARIOBENEFICIO.JS (contribuições -> correção INPC mockada -> média) ==');

  await teste('calcula a média corrigida das 3 competências elegíveis (contas batidas à mão: 1009.80, 990.00, 1000.00 -> média 999.93), com memória de cálculo completa por competência', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const historico = {
      contribuicoes: [
        { id: 'c1', competencia: '2001-03', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r1'] },
        { id: 'c2', competencia: '2001-04', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r2'] },
        { id: 'c3', competencia: '2001-05', valor: 1000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r3'] }
      ],
      remuneracoes: [
        { id: 'r1', competencia: '2001-03', valor: 1000, fonte: { documento: 'CNIS', pagina: 2, arquivo: 'cnis.pdf' } },
        { id: 'r2', competencia: '2001-04', valor: 1000, fonte: { documento: 'CNIS', pagina: 2, arquivo: 'cnis.pdf' } },
        { id: 'r3', competencia: '2001-05', valor: 1000, fonte: { documento: 'CNIS', pagina: 3, arquivo: 'cnis.pdf' } }
      ]
    };
    const r = await sb.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-05' });
    assert.strictEqual(r.quantidadeSalarios, 3);
    assert.ok(proximo(r.salarioBeneficio - 999.93), r.salarioBeneficio);
    assert.strictEqual(r.memoria.length, 3);
    assert.ok(proximo(r.memoria[0].valorAtualizado - 1009.80));
    assert.ok(proximo(r.memoria[1].valorAtualizado - 990.00));
    assert.ok(proximo(r.memoria[2].valorAtualizado - 1000.00));
    // índice utilizado, fator aplicado, participação na média e fonte —
    // todos os campos pedidos na memória de cálculo.
    r.memoria.forEach(m => {
      assert.ok(m.indiceUtilizado.includes('INPC'));
      assert.ok(m.fatorAplicado > 0);
      assert.ok(m.participacaoNaMedia > 0 && m.participacaoNaMedia < 100);
    });
    assert.strictEqual(r.memoria[0].fonte[0].pagina, 2);
    assert.strictEqual(r.memoria[2].fonte[0].pagina, 3);
    // participação na média deve somar 100% (soma dos 3 pesos)
    const somaParticipacao = r.memoria.reduce((acc, m) => acc + m.participacaoNaMedia, 0);
    assert.ok(proximo(somaParticipacao - 100), somaParticipacao);
  });

  await teste('competência anterior a 07/1994 é excluída da média (marco do Plano Real, Lei 8.213/91 art. 29-B)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const historico = historicoComContribuicoes([
      { id: 'c0', competencia: '1990-01', valor: 500, vinculoId: 'v0', ambigua: false },
      { id: 'c1', competencia: '2001-03', valor: 1000, vinculoId: 'v1', ambigua: false },
      { id: 'c2', competencia: '2001-05', valor: 1000, vinculoId: 'v1', ambigua: false }
    ]);
    const r = await sb.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-05' });
    assert.strictEqual(r.quantidadeSalarios, 2);
    assert.strictEqual(r.ignoradas.length, 1);
    assert.ok(r.ignoradas[0].motivo.includes('Plano Real'));
  });

  await teste('competência ambígua fica de fora por padrão, e só entra com opcoes.incluirAmbiguas', async () => {
    const sbSemIncluir = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const historico = historicoComContribuicoes([
      { id: 'c1', competencia: '2001-03', valor: 1000, vinculoId: 'v1', ambigua: false },
      { id: 'c2', competencia: '2001-04', valor: 1000, vinculoId: null, ambigua: true }
    ]);
    const semIncluir = await sbSemIncluir.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-04' });
    assert.strictEqual(semIncluir.quantidadeSalarios, 1);
    assert.strictEqual(semIncluir.ignoradas.length, 1);
    assert.ok(semIncluir.ignoradas[0].motivo.includes('ambígua'));

    const sbComIncluir = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const comIncluir = await sbComIncluir.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-04', incluirAmbiguas: true });
    assert.strictEqual(comIncluir.quantidadeSalarios, 2);
  });

  await teste('sem opcoes.competenciaReferencia, devolve erro explícito (não calcula com suposição de data)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    const r = await sb.calcularSalarioBeneficio(historicoComContribuicoes([{ id: 'c1', competencia: '2001-03', valor: 1000, ambigua: false }]), {});
    assert.strictEqual(r.salarioBeneficio, null);
    assert.ok(r.motivo.includes('competenciaReferencia'));
  });

  await teste('histórico sem nenhuma contribuição elegível devolve salarioBeneficio null com motivo explícito', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    const r = await sb.calcularSalarioBeneficio(historicoComContribuicoes([]), { competenciaReferencia: '2001-05' });
    assert.strictEqual(r.salarioBeneficio, null);
    assert.strictEqual(r.quantidadeSalarios, 0);
  });

  await teste('índice INPC ausente para alguma competência necessária bloqueia o cálculo (nunca estima)', async () => {
    // Pede período até 2001-06, mas o mock só cobre até 2001-05.
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const historico = historicoComContribuicoes([
      { id: 'c1', competencia: '2001-03', valor: 1000, ambigua: false },
      { id: 'c2', competencia: '2001-06', valor: 1000, ambigua: false }
    ]);
    const r = await sb.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-06' });
    assert.strictEqual(r.salarioBeneficio, null);
    assert.ok(r.faltantesIndice && r.faltantesIndice.length > 0);
  });

  await teste('API do Bacen indisponível bloqueia o cálculo em vez de usar um valor não corrigido', async () => {
    const sb = carregar(async () => { throw new Error('HTTP 503'); });
    const historico = historicoComContribuicoes([{ id: 'c1', competencia: '2001-03', valor: 1000, ambigua: false }]);
    const r = await sb.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-03' });
    assert.strictEqual(r.salarioBeneficio, null);
  });

  await teste('historico ausente/malformado nunca lança erro', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    const r1 = await sb.calcularSalarioBeneficio(null, { competenciaReferencia: '2001-05' });
    assert.strictEqual(r1.salarioBeneficio, null);
    const r2 = await sb.calcularSalarioBeneficio({}, { competenciaReferencia: '2001-05' });
    assert.strictEqual(r2.salarioBeneficio, null);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
}

main();
