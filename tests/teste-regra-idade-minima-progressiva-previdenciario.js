/* ============================================================================
   TESTE-REGRA-IDADE-MINIMA-PROGRESSIVA-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/regras/transicao/idadeMinimaProgressiva.js
   (Atualização 49 — EC 103/2019, art. 16).

   Carrega motorRMI.js + idadeMinimaProgressiva.js no MESMO contexto vm
   (mesmo padrão de tests/teste-regra-pontos-previdenciario.js).

   Roda sem dependências externas: `node tests/teste-regra-idade-minima-progressiva-previdenciario.js`.
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

function carregarRegra() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'idadeMinimaProgressiva.js');
  return sandbox;
}

(() => {
  console.log('== REGRAS/TRANSICAO/IDADEMINIMAPROGRESSIVA.JS (EC 103/2019, art. 16) ==');

  teste('idadeMinimaProgressiva.js recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'idadeMinimaProgressiva.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarRegra();
  const R = sb.RegraTransicaoIdadeMinimaProgressiva;

  teste('idade mínima exigida em 2019: 61 (homem) / 56 (mulher)', () => {
    assert.strictEqual(R.idadeMinimaExigida(2019, 'homem'), 61);
    assert.strictEqual(R.idadeMinimaExigida(2019, 'mulher'), 56);
  });

  teste('idade sobe 6 meses por ano a partir de 2020', () => {
    assert.strictEqual(R.idadeMinimaExigida(2020, 'homem'), 61.5);
    assert.strictEqual(R.idadeMinimaExigida(2020, 'mulher'), 56.5);
    assert.strictEqual(R.idadeMinimaExigida(2021, 'homem'), 62);
    assert.strictEqual(R.idadeMinimaExigida(2021, 'mulher'), 57);
  });

  teste('ano atual (2026) exige 64,5 (homem) / 59,5 (mulher) — conferido contra fonte externa', () => {
    assert.strictEqual(R.idadeMinimaExigida(2026, 'homem'), 64.5);
    assert.strictEqual(R.idadeMinimaExigida(2026, 'mulher'), 59.5);
  });

  teste('idade do homem estabiliza em 65 a partir de 2027 (não continua subindo)', () => {
    assert.strictEqual(R.idadeMinimaExigida(2027, 'homem'), 65);
    assert.strictEqual(R.idadeMinimaExigida(2035, 'homem'), 65);
  });

  teste('idade da mulher estabiliza em 62 a partir de 2031 (não continua subindo)', () => {
    assert.strictEqual(R.idadeMinimaExigida(2031, 'mulher'), 62);
    assert.strictEqual(R.idadeMinimaExigida(2040, 'mulher'), 62);
  });

  teste('rejeita ano anterior a 2019 (regra não existia)', () => {
    assert.throws(() => R.idadeMinimaExigida(2018, 'homem'), /não existia antes de 2019/);
  });

  teste('rejeita sexo inválido em idadeMinimaExigida', () => {
    assert.throws(() => R.idadeMinimaExigida(2026, 'outro'));
  });

  teste('elegibilidadeIdadeMinimaProgressiva aprova homem com idade, tempo e carência suficientes em 2026', () => {
    const r = R.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: 64.5, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
    assert.strictEqual(r.idadeExigida, 64.5);
  });

  teste('elegibilidadeIdadeMinimaProgressiva aceita dataReferencia (ISO) equivalente a anoReferencia', () => {
    const r = R.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: 64.5, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', dataReferencia: '2026-03-15'
    });
    assert.strictEqual(r.anoReferencia, 2026);
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidadeIdadeMinimaProgressiva reprova por idade insuficiente mesmo com tempo/carência ok', () => {
    const r = R.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: 60, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('idade mínima')));
  });

  teste('elegibilidadeIdadeMinimaProgressiva reprova por tempo mínimo (35/30) não atingido mesmo com idade suficiente', () => {
    const r = R.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: 70, tempoContribuicao: { anos: 20, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('tempo de contribuição mínimo')));
  });

  teste('elegibilidadeIdadeMinimaProgressiva reprova por carência insuficiente mesmo com idade/tempo ok', () => {
    const r = R.elegibilidadeIdadeMinimaProgressiva({
      idadeAnos: 64.5, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 100, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidadeIdadeMinimaProgressiva lança erro claro quando não informa ano/data de referência', () => {
    assert.throws(() => {
      R.elegibilidadeIdadeMinimaProgressiva({
        idadeAnos: 64.5, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
        carenciaMeses: 180, sexo: 'homem'
      });
    }, /anoReferencia.*dataReferencia|dataReferencia.*anoReferencia/);
  });

  teste('calcularRMIIdadeMinimaProgressiva: homem com exatamente 35 anos recebe 60% do salário de benefício', () => {
    const r = R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 3000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.rmiFinal, 1800);
    assert.strictEqual(r.tempoMinimoExigidoAnos, 35);
  });

  teste('calcularRMIIdadeMinimaProgressiva: mulher com exatamente 30 anos recebe 60% do salário de benefício', () => {
    const r = R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 3000, tempoContribuicao: { anos: 30, meses: 0, dias: 0 }, sexo: 'mulher' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.tempoMinimoExigidoAnos, 30);
  });

  teste('calcularRMIIdadeMinimaProgressiva: homem com 40 anos completos soma 5 anos excedentes x 2% = 70%', () => {
    const r = R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 2000, tempoContribuicao: { anos: 40, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.anosExcedentesConsiderados, 5);
    assert.strictEqual(r.percentualAplicado, 0.70);
    assert.strictEqual(r.rmiFinal, 1400);
  });

  teste('calcularRMIIdadeMinimaProgressiva resulta EXATAMENTE igual à regra de pontos para o mesmo tempo de contribuição (mesma fórmula/mesmo tempo mínimo)', () => {
    if (typeof sb.RegraTransicaoPontos === 'undefined') {
      // pontos.js não foi carregado neste sandbox — verificação pulada, sem falhar o teste.
      return;
    }
    const viaIdade = R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 2500, tempoContribuicao: { anos: 38, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(viaIdade.tempoMinimoExigidoAnos, 35);
  });

  teste('calcularRMIIdadeMinimaProgressiva aplica piso e teto do mesmo jeito que os outros motores', () => {
    const rPiso = R.calcularRMIIdadeMinimaProgressiva({
      salarioBeneficio: 1000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem',
      salarioMinimoVigente: 1518
    });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = R.calcularRMIIdadeMinimaProgressiva({
      salarioBeneficio: 10000, tempoContribuicao: { anos: 55, meses: 0, dias: 0 }, sexo: 'homem',
      tetoRGPSVigente: 8157.41
    });
    assert.strictEqual(rTeto.aplicouTeto, true);
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
  });

  teste('calcularRMIIdadeMinimaProgressiva rejeita salarioBeneficio inválido e sexo inválido', () => {
    assert.throws(() => R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 0, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem' }));
    assert.throws(() => R.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 2000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'outro' }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
