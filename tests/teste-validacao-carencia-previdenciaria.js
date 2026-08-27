/* ============================================================================
   TESTE-VALIDACAO-CARENCIA-PREVIDENCIARIA.JS — cobre js/domains/
   previdenciario/carencia/validacaoCarenciaPrevidenciaria.js (correção
   pedida pelo usuário: carência não é "quantidade de vínculos" nem
   "quantidade de remunerações > 0" isoladamente — precisa aplicar a
   distinção do art. 27, I e II da Lei 8.213/91).

   Sem dependência de rede (módulo síncrono, puro). Roda com:
   `node tests/teste-validacao-carencia-previdenciaria.js`.
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

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'carencia', 'validacaoCarenciaPrevidenciaria.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== CARENCIA/VALIDACAOCARENCIAPREVIDENCIARIA.JS (art. 27, I e II, Lei 8.213/91) ==');
  const sb = carregar();

  teste('vínculo com LACUNA de remuneração ainda conta a carência inteira do span (art. 27, I — filiação, não depende de remuneração ter sido lançada)', () => {
    // 6 meses de vínculo (03 a 08/2001), mas remuneração só lançada em 4
    // deles (mesmo cenário de lacuna já usado na Atualização 15) — a
    // carência pela filiação NÃO deve ser reduzida pela lacuna.
    const historico = {
      vinculos: [{ id: 'v1', inicio: '2001-03-01', fim: '2001-08-31' }],
      contribuicoes: [
        { competencia: '2001-03', valor: 1000, vinculoId: 'v1' },
        { competencia: '2001-04', valor: 1000, vinculoId: 'v1' },
        // 05 e 06/2001 SEM remuneração lançada (lacuna do CNIS)
        { competencia: '2001-07', valor: 1000, vinculoId: 'v1' },
        { competencia: '2001-08', valor: 1000, vinculoId: 'v1' }
      ]
    };
    const r = sb.validarCarenciaPrevidenciaria(historico);
    assert.strictEqual(r.totalMeses, 6, 'os 6 meses do vínculo devem contar, mesmo com lacuna de remuneração em 2 deles');
    assert.ok(r.competencias.includes('2001-05'), 'competência sem remuneração lançada ainda conta, por filiação');
    assert.ok(r.competencias.includes('2001-06'));
  });

  teste('contribuição SEM vínculo (contribuinte individual) só conta a partir do efetivo pagamento (art. 27, II)', () => {
    const historico = {
      vinculos: [],
      contribuicoes: [
        { competencia: '2010-01', valor: 500, vinculoId: null },
        { competencia: '2010-03', valor: 500, vinculoId: null } // 02/2010 nunca foi pago — não conta
      ]
    };
    const r = sb.validarCarenciaPrevidenciaria(historico);
    assert.strictEqual(r.totalMeses, 2);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.competencias)).sort(), ['2010-01', '2010-03']);
    assert.ok(!r.competencias.includes('2010-02'), 'mês sem pagamento efetivo não pode ser presumido');
  });

  teste('contribuição SEM vínculo e SEM valor > 0 (competência sem recolhimento) não conta', () => {
    const historico = { vinculos: [], contribuicoes: [{ competencia: '2010-01', valor: 0, vinculoId: null }] };
    const r = sb.validarCarenciaPrevidenciaria(historico);
    assert.strictEqual(r.totalMeses, 0);
  });

  teste('combina as duas regras (vínculo + contribuinte avulso) sem contar competência em dobro', () => {
    const historico = {
      vinculos: [{ id: 'v1', inicio: '2001-03-01', fim: '2001-05-31' }], // 3 meses por filiação
      contribuicoes: [
        { competencia: '2001-03', valor: 1000, vinculoId: 'v1' },
        { competencia: '2001-04', valor: 1000, vinculoId: 'v1' },
        { competencia: '2001-05', valor: 1000, vinculoId: 'v1' },
        { competencia: '2010-01', valor: 500, vinculoId: null } // avulsa, +1 mês
      ]
    };
    const r = sb.validarCarenciaPrevidenciaria(historico);
    assert.strictEqual(r.totalMeses, 4); // 3 do vínculo + 1 avulsa, nenhuma duplicidade
  });

  teste('dois vínculos concomitantes no mesmo mês contam só uma vez (mesclagem de período)', () => {
    const historico = {
      vinculos: [
        { id: 'v1', inicio: '2001-03-01', fim: '2001-05-31' },
        { id: 'v2', inicio: '2001-04-01', fim: '2001-06-30' } // sobrepõe abril e maio
      ],
      contribuicoes: []
    };
    const r = sb.validarCarenciaPrevidenciaria(historico);
    assert.strictEqual(r.totalMeses, 4); // 03,04,05,06 — não 6 (3+3), a sobreposição não dobra
  });

  teste('histórico ausente/vazio nunca lança erro, devolve totalMeses 0', () => {
    assert.strictEqual(sb.validarCarenciaPrevidenciaria(null).totalMeses, 0);
    assert.strictEqual(sb.validarCarenciaPrevidenciaria(undefined).totalMeses, 0);
    assert.strictEqual(sb.validarCarenciaPrevidenciaria({}).totalMeses, 0);
    assert.strictEqual(sb.validarCarenciaPrevidenciaria({ vinculos: [], contribuicoes: [] }).totalMeses, 0);
  });

  teste('o resultado sempre traz metodologia e limitações — nunca é apresentado como definitivo/fechado', () => {
    const r = sb.validarCarenciaPrevidenciaria({ vinculos: [{ id: 'v1', inicio: '2001-03-01', fim: '2001-03-31' }], contribuicoes: [] });
    assert.ok(typeof r.metodologia === 'string' && r.metodologia.includes('Art. 27'));
    assert.ok(Array.isArray(r.limitacoes) && r.limitacoes.length > 0);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
