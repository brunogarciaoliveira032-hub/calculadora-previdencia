/* ============================================================================
   TESTE-REGRA-PEDAGIO50-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/regras/transicao/pedagio50.js (Atualização 41 —
   regra de transição por pedágio de 50%, EC 103/2019, art. 17).

   Carrega motorRMI.js + pedagio50.js no MESMO contexto vm (mesmo padrão de
   tests/teste-regra-pontos-previdenciario.js).

   Roda sem dependências externas: `node tests/teste-regra-pedagio50-previdenciario.js`.
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

function carregarRegraPedagio50() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pedagio50.js');
  return sandbox;
}

(() => {
  console.log('== REGRAS/TRANSICAO/PEDAGIO50.JS (EC 103/2019, art. 17) ==');

  teste('pedagio50.js recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pedagio50.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarRegraPedagio50();
  const R = sb.RegraTransicaoPedagio50;

  teste('calcularPedagio50: homem faltando 4 anos em 13/11/2019 (31 de 35) tem pedágio de 2 anos, total exigido 37', () => {
    const p = R.calcularPedagio50({ anos: 31, meses: 0, dias: 0 }, 'homem');
    assert.strictEqual(p.tempoFaltanteEm13112019Anos, 4);
    assert.strictEqual(p.pedagioAnos, 2);
    assert.strictEqual(p.tempoTotalExigidoAnos, 37);
  });

  teste('preCondicaoAtendida é false quando o tempo em 13/11/2019 não passa do limite (33 homem, 28 mulher)', () => {
    const p1 = R.calcularPedagio50({ anos: 31, meses: 0, dias: 0 }, 'homem'); // 31 não é > 33
    assert.strictEqual(p1.preCondicaoAtendida, false);
    const p2 = R.calcularPedagio50({ anos: 34, meses: 0, dias: 0 }, 'homem'); // 34 > 33
    assert.strictEqual(p2.preCondicaoAtendida, true);
    const p3 = R.calcularPedagio50({ anos: 29, meses: 0, dias: 0 }, 'mulher'); // 29 > 28
    assert.strictEqual(p3.preCondicaoAtendida, true);
    const p4 = R.calcularPedagio50({ anos: 28, meses: 0, dias: 0 }, 'mulher'); // 28 não é > 28
    assert.strictEqual(p4.preCondicaoAtendida, false);
  });

  teste('calcularPedagio50: quem já tinha o tempo mínimo em 13/11/2019 não tem pedágio (0 anos faltantes)', () => {
    const p = R.calcularPedagio50({ anos: 35, meses: 0, dias: 0 }, 'homem');
    assert.strictEqual(p.tempoFaltanteEm13112019Anos, 0);
    assert.strictEqual(p.pedagioAnos, 0);
    assert.strictEqual(p.tempoTotalExigidoAnos, 35);
  });

  teste('elegibilidadeRegraPedagio50 aprova quando pré-condição, tempo total com pedágio e carência batem (homem)', () => {
    const r = R.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: { anos: 34, meses: 0, dias: 0 }, // > 33, pedágio de 0,5 ano
      tempoContribuicao: { anos: 35, meses: 6, dias: 0 }, // >= 35,5 exigido
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
    assert.strictEqual(r.pedagioAnos, 0.5);
    assert.strictEqual(r.tempoTotalExigidoAnos, 35.5);
  });

  teste('elegibilidadeRegraPedagio50 reprova por pré-condição não atendida mesmo com tempo total suficiente', () => {
    const r = R.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: { anos: 25, meses: 0, dias: 0 }, // não > 33
      tempoContribuicao: { anos: 40, meses: 0, dias: 0 }, // tempo total até bate (35 + 5 de pedágio = 40)
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('pré-condição')));
  });

  teste('elegibilidadeRegraPedagio50 reprova por tempo total (com pedágio) insuficiente mesmo com pré-condição ok', () => {
    const r = R.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: { anos: 34, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, // exige 35,5, só tem 35
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('tempo de contribuição total')));
  });

  teste('elegibilidadeRegraPedagio50 reprova por carência insuficiente mesmo com o resto ok', () => {
    const r = R.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 100, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidadeRegraPedagio50 rejeita sexo inválido', () => {
    assert.throws(() => R.elegibilidadeRegraPedagio50({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 },
      tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'outro'
    }));
  });

  teste('calcularRMIRegraPedagio50: aplica salário de benefício x fator previdenciário informado', () => {
    const r = R.calcularRMIRegraPedagio50({ salarioBeneficio: 2000, fatorPrevidenciario: 0.85 });
    assert.strictEqual(r.rmiAntesDoPisoTeto, 1700);
    assert.strictEqual(r.rmiFinal, 1700);
    assert.strictEqual(r.fatorPrevidenciarioAplicado, 0.85);
  });

  teste('calcularRMIRegraPedagio50 recusa calcular sem fatorPrevidenciario (nunca assume 1,0)', () => {
    assert.throws(() => R.calcularRMIRegraPedagio50({ salarioBeneficio: 2000 }), /fatorPrevidenciario é obrigatório/);
  });

  teste('calcularRMIRegraPedagio50 recusa salarioBeneficio inválido', () => {
    assert.throws(() => R.calcularRMIRegraPedagio50({ salarioBeneficio: 0, fatorPrevidenciario: 1 }));
  });

  teste('calcularRMIRegraPedagio50 aplica piso e teto do mesmo jeito que os outros motores', () => {
    const rPiso = R.calcularRMIRegraPedagio50({ salarioBeneficio: 1000, fatorPrevidenciario: 0.5, salarioMinimoVigente: 1518 });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = R.calcularRMIRegraPedagio50({ salarioBeneficio: 10000, fatorPrevidenciario: 1.5, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
    assert.strictEqual(rTeto.aplicouTeto, true);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
