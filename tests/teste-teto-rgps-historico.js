/* ============================================================================
   TESTE-TETO-RGPS-HISTORICO.JS — cobre
   js/domains/previdenciario/dados-historicos/tetoRgps.js (Atualização 42).

   Testa uma amostra de valores da tabela um a um (contra a fonte
   conferida), a lógica de consulta por competência (limite inferior,
   limite superior, competências intermediárias) e o aviso de possível
   desatualização.

   Roda sem dependências externas: `node tests/teste-teto-rgps-historico.js`.
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
    console.log(`      ${erro.message}`);
  }
}

function carregarModulo() {
  const sandbox = {};
  vm.createContext(sandbox);
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'dados-historicos', 'tetoRgps.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== DADOS-HISTORICOS/TETO-RGPS.JS (série histórica do teto do RGPS) ==');
  const sb = carregarModulo();
  const T = sb.TetoRgpsHistorico;

  teste('tabela tem 35 entradas (1994-03 a 2026-01), todas em ordem cronológica crescente', () => {
    const lista = T.TETO_RGPS_HISTORICO;
    assert.strictEqual(lista.length, 35);
    for (let i = 1; i < lista.length; i++) {
      assert.ok(lista[i].vigenciaDesde > lista[i - 1].vigenciaDesde, `entrada ${i} fora de ordem`);
    }
  });

  teste('amostra de valores conferidos contra a fonte (marco temporal do Plano Real e valores recentes)', () => {
    assert.strictEqual(T.tetoRgpsNaCompetencia('1994-03').valor, 582.86);
    assert.strictEqual(T.tetoRgpsNaCompetencia('1998-12').valor, 1200.00); // EC 20/1998
    assert.strictEqual(T.tetoRgpsNaCompetencia('2004-01').valor, 2400.00); // EC 41/2003
    assert.strictEqual(T.tetoRgpsNaCompetencia('2019-01').valor, 5839.45);
    assert.strictEqual(T.tetoRgpsNaCompetencia('2025-01').valor, 8157.41);
    assert.strictEqual(T.tetoRgpsNaCompetencia('2026-01').valor, 8475.55);
  });

  teste('competência intermediária (não é o mês exato de mudança) usa o valor vigente naquele mês', () => {
    // 2010-06 está entre 2010-01 (3467.40) e 2011-01 (3691.74) -> usa o de 2010
    const r = T.tetoRgpsNaCompetencia('2010-06');
    assert.strictEqual(r.valor, 3467.40);
    assert.strictEqual(r.vigenciaDesde, '2010-01');
  });

  teste('competência exatamente na véspera de uma mudança ainda usa o valor anterior', () => {
    // 2003-12 é o mês anterior à mudança de 2004-01 -> ainda usa o valor de jun/2003
    const r = T.tetoRgpsNaCompetencia('2003-12');
    assert.strictEqual(r.valor, 1869.34);
  });

  teste('competência anterior a 03/1994 devolve null — nunca estima', () => {
    assert.strictEqual(T.tetoRgpsNaCompetencia('1994-02'), null);
    assert.strictEqual(T.tetoRgpsNaCompetencia('1990-01'), null);
  });

  teste('competência recente (dentro de 13 meses da última entrada) não é marcada como desatualizada', () => {
    const r = T.tetoRgpsNaCompetencia('2026-06');
    assert.strictEqual(r.possivelmenteDesatualizado, false);
  });

  teste('competência distante da última entrada (mais de 13 meses) é marcada como possivelmente desatualizada, mas ainda devolve o último valor conhecido (nunca null)', () => {
    const r = T.tetoRgpsNaCompetencia('2028-06');
    assert.strictEqual(r.valor, 8475.55);
    assert.strictEqual(r.possivelmenteDesatualizado, true);
  });

  teste('rejeita formato de competência inválido', () => {
    assert.throws(() => T.tetoRgpsNaCompetencia('2020/01'));
    assert.throws(() => T.tetoRgpsNaCompetencia('junho de 2020'));
    assert.throws(() => T.tetoRgpsNaCompetencia(202001));
  });

  teste('cada entrada da tabela traz base legal (não vazia) e reajustePercentual coerente (só a primeira é null)', () => {
    const lista = T.TETO_RGPS_HISTORICO;
    lista.forEach((entrada, i) => {
      assert.ok(entrada.baseLegal && entrada.baseLegal.length > 0, `entrada ${i} sem base legal`);
      if (i === 0) {
        assert.strictEqual(entrada.reajustePercentual, null);
      } else {
        assert.strictEqual(typeof entrada.reajustePercentual, 'number');
      }
    });
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
