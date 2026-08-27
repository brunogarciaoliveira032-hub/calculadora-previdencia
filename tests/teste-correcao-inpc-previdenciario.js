/* ============================================================================
   TESTE-CORRECAO-INPC-PREVIDENCIARIO.JS — cobre js/domains/previdenciario/
   correcao/correcaoINPCPrevidenciario.js (Atualização 17).

   NÃO faz nenhuma chamada de rede real: `buscarSerieBcbComCache` e
   `BCB_SERIES` são dublados (mock determinístico) em vez de carregar o
   js/core/indices.js de verdade — o teste precisa rodar sem depender da
   API do Bacen estar no ar.

   Roda sem dependências externas: `node tests/teste-correcao-inpc-previdenciario.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function proximo(diferenca) { return Math.abs(diferenca) < 1e-9; }

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

// Série INPC sintética: 03/2001 = 1,00% ; 04/2001 = 2,00% ; 05/2001 = -1,00%.
// Fatores acumulados esperados (produto de (1+taxa/100) mês a mês):
//   2001-03: 1.01        2001-04: 1.0302        2001-05: 1.019898
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
    path.join(__dirname, '..', 'js', 'core', 'indices.js'), // pure functions used (indexarPorCompetencia); buscarSerieBcbComCache é sobrescrita abaixo
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'correcao', 'correcaoINPCPrevidenciario.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  sandbox.buscarSerieBcbComCache = mockBuscarSerie; // nunca chama a rede de verdade
  return sandbox;
}

async function main() {
  console.log('== CORREÇÃO/CORRECAOINPCPREVIDENCIARIO.JS (INPC mockado, sem rede) ==');

  await teste('buscarFatoresAcumuladosINPC acumula corretamente a série (produto mês a mês)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.buscarFatoresAcumuladosINPC('2001-03', '2001-05');
    assert.strictEqual(r.faltantes.length, 0);
    assert.ok(proximo(r.fatoresPorCompetencia['2001-03'] - 1.01), r.fatoresPorCompetencia['2001-03']);
    assert.ok(proximo(r.fatoresPorCompetencia['2001-04'] - 1.0302), r.fatoresPorCompetencia['2001-04']);
    assert.ok(proximo(r.fatoresPorCompetencia['2001-05'] - 1.019898), r.fatoresPorCompetencia['2001-05']);
    assert.strictEqual(r.origem, 'api');
  });

  await teste('corrigirValorPorINPC aplica a razão entre fatores acumulados (origem 03/2001 -> referência 05/2001)', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.buscarFatoresAcumuladosINPC('2001-03', '2001-05');
    const corrigido = sb.corrigirValorPorINPC(100, '2001-03', '2001-05', r.fatoresPorCompetencia);
    assert.ok(proximo(corrigido - 100.98), corrigido);
  });

  await teste('corrigirValorPorINPC devolve null (nunca inventa) quando falta o fator de alguma das competências', () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    assert.strictEqual(sb.corrigirValorPorINPC(100, '2001-03', '2001-12', { '2001-03': 1.01 }), null);
    assert.strictEqual(sb.corrigirValorPorINPC(100, '2001-01', '2001-03', { '2001-03': 1.01 }), null);
  });

  await teste('corrigirValorPorINPC devolve null para valor negativo', () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    assert.strictEqual(sb.corrigirValorPorINPC(-50, '2001-03', '2001-05', { '2001-03': 1.01, '2001-05': 1.02 }), null);
  });

  await teste('competência ausente na série do Bacen: fatoresPorCompetencia fica vazio e a lacuna é reportada (todo-ou-nada, nunca parcial)', async () => {
    // Pedido 03/2001 a 06/2001, mas o mock só cobre até 05/2001 (falta 06/2001).
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }));
    const r = await sb.buscarFatoresAcumuladosINPC('2001-03', '2001-06');
    assert.strictEqual(Object.keys(r.fatoresPorCompetencia).length, 0);
    assert.strictEqual(r.faltantes.length, 1);
    assert.strictEqual(r.faltantes[0].competencia, '2001-06');
  });

  await teste('API do Bacen indisponível (mock lança erro): todas as competências do período pedido viram faltantes, sem estimativa', async () => {
    const sb = carregar(async () => { throw new Error('HTTP 503'); });
    const r = await sb.buscarFatoresAcumuladosINPC('2001-03', '2001-05');
    assert.strictEqual(Object.keys(r.fatoresPorCompetencia).length, 0);
    assert.strictEqual(r.faltantes.length, 3);
    assert.ok(r.erro.includes('503'));
  });

  await teste('período vazio/ausente nunca lança erro', async () => {
    const sb = carregar(async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: null }));
    const r1 = await sb.buscarFatoresAcumuladosINPC('', '');
    assert.strictEqual(Object.keys(r1.fatoresPorCompetencia).length, 0);
    const r2 = await sb.buscarFatoresAcumuladosINPC('2001-05', '2001-03'); // início depois do fim
    assert.ok(r2.erro);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
}

main();
