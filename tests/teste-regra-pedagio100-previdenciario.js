/* ============================================================================
   TESTE-REGRA-PEDAGIO100-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/regras/transicao/pedagio100.js (Atualização 41
   — regra de transição por pedágio de 100%, EC 103/2019, art. 20).

   Carrega motorRMI.js + pedagio100.js no MESMO contexto vm (mesmo padrão de
   tests/teste-regra-pontos-previdenciario.js).

   Roda sem dependências externas: `node tests/teste-regra-pedagio100-previdenciario.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function semRealm(valor) { return JSON.parse(JSON.stringify(valor)); }

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

function carregarArquivo(sandbox, ...partesCaminho) {
  const caminho = path.join(__dirname, '..', ...partesCaminho);
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
}

function carregarRegraPedagio100() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pedagio100.js');
  return sandbox;
}

(() => {
  console.log('== REGRAS/TRANSICAO/PEDAGIO100.JS (EC 103/2019, art. 20) ==');

  teste('pedagio100.js recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pedagio100.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarRegraPedagio100();
  const R = sb.RegraTransicaoPedagio100;

  teste('calcularPedagio100: homem faltando 3 anos em 13/11/2019 (32 de 35) tem pedágio de 3 anos (100%), total exigido 38', () => {
    const p = R.calcularPedagio100({ anos: 32, meses: 0, dias: 0 }, 'homem');
    assert.strictEqual(p.tempoFaltanteEm13112019Anos, 3);
    assert.strictEqual(p.pedagioAnos, 3);
    assert.strictEqual(p.tempoTotalExigidoAnos, 38);
  });

  teste('calcularPedagio100: mulher faltando 2 anos em 13/11/2019 (28 de 30) tem pedágio de 2 anos, total exigido 32', () => {
    const p = R.calcularPedagio100({ anos: 28, meses: 0, dias: 0 }, 'mulher');
    assert.strictEqual(p.tempoFaltanteEm13112019Anos, 2);
    assert.strictEqual(p.pedagioAnos, 2);
    assert.strictEqual(p.tempoTotalExigidoAnos, 32);
  });

  teste('calcularPedagio100: sem pré-condição de tempo mínimo em 13/11/2019 — mesmo tempo baixo gera pedágio calculável (não elegível na prática, mas não rejeitado por estrutura)', () => {
    const p = R.calcularPedagio100({ anos: 5, meses: 0, dias: 0 }, 'homem');
    assert.strictEqual(p.tempoFaltanteEm13112019Anos, 30);
    assert.strictEqual(p.pedagioAnos, 30);
    assert.strictEqual(p.tempoTotalExigidoAnos, 65);
  });

  teste('calcularPedagio100: quem já tinha o tempo mínimo em 13/11/2019 não tem pedágio', () => {
    const p = R.calcularPedagio100({ anos: 35, meses: 0, dias: 0 }, 'homem');
    assert.strictEqual(p.pedagioAnos, 0);
    assert.strictEqual(p.tempoTotalExigidoAnos, 35);
  });

  teste('elegibilidadeRegraPedagio100 aprova quando idade, tempo total com pedágio e carência batem (mulher)', () => {
    const r = R.elegibilidadeRegraPedagio100({
      idadeAnos: 57,
      tempoContribuicaoEm13112019: { anos: 28, meses: 0, dias: 0 }, // pedágio de 2 anos, exige 32
      tempoContribuicao: { anos: 32, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'mulher'
    });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
    assert.strictEqual(r.idadeMinimaAnos, 57);
    assert.strictEqual(r.pedagioAnos, 2);
  });

  teste('elegibilidadeRegraPedagio100 reprova por idade mínima não atingida (57 mulher / 60 homem)', () => {
    const r = R.elegibilidadeRegraPedagio100({
      idadeAnos: 55,
      tempoContribuicaoEm13112019: { anos: 28, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 32, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'mulher'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('idade mínima')));
  });

  teste('elegibilidadeRegraPedagio100 reprova por tempo total (com pedágio) insuficiente mesmo com idade ok', () => {
    const r = R.elegibilidadeRegraPedagio100({
      idadeAnos: 60,
      tempoContribuicaoEm13112019: { anos: 32, meses: 0, dias: 0 }, // pedágio de 3, exige 38
      tempoContribuicao: { anos: 36, meses: 0, dias: 0 }, // só 36
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('tempo de contribuição total')));
  });

  teste('elegibilidadeRegraPedagio100 reprova por carência insuficiente mesmo com o resto ok', () => {
    const r = R.elegibilidadeRegraPedagio100({
      idadeAnos: 60,
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 90, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidadeRegraPedagio100 rejeita sexo inválido', () => {
    assert.throws(() => R.elegibilidadeRegraPedagio100({
      idadeAnos: 60,
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'outro'
    }));
  });

  teste('calcularRMIRegraPedagio100: RMI é exatamente o salário de benefício (100%, sem fator previdenciário)', () => {
    const r = R.calcularRMIRegraPedagio100({ salarioBeneficio: 3000 });
    assert.strictEqual(r.rmiAntesDoPisoTeto, 3000);
    assert.strictEqual(r.rmiFinal, 3000);
  });

  teste('calcularRMIRegraPedagio100 recusa salarioBeneficio inválido', () => {
    assert.throws(() => R.calcularRMIRegraPedagio100({ salarioBeneficio: 0 }));
    assert.throws(() => R.calcularRMIRegraPedagio100({}));
  });

  teste('calcularRMIRegraPedagio100 aplica piso e teto do mesmo jeito que os outros motores', () => {
    const rPiso = R.calcularRMIRegraPedagio100({ salarioBeneficio: 1000, salarioMinimoVigente: 1518 });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = R.calcularRMIRegraPedagio100({ salarioBeneficio: 10000, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
    assert.strictEqual(rTeto.aplicouTeto, true);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
