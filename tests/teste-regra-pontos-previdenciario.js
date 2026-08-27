/* ============================================================================
   TESTE-REGRA-PONTOS-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/regras/transicao/pontos.js (Atualização 38 —
   regra de transição por pontos, EC 103/2019, art. 15).

   Carrega motorRMI.js + pontos.js no MESMO contexto vm (pontos.js depende
   de MotorRMI já estar no escopo, igual acontece via <script> no navegador
   real) — mesmo padrão de tests/teste-motor-rmi-do-historico.js.

   Roda sem dependências externas: `node tests/teste-regra-pontos-previdenciario.js`.
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

function carregarRegraPontos() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pontos.js');
  return sandbox;
}

(() => {
  console.log('== REGRAS/TRANSICAO/PONTOS.JS (EC 103/2019, art. 15) ==');

  teste('pontos.js recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'transicao', 'pontos.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarRegraPontos();
  const R = sb.RegraTransicaoPontos;

  teste('pontuação mínima exigida em 2019: 96 (homem) / 86 (mulher)', () => {
    assert.strictEqual(R.pontuacaoMinimaExigida(2019, 'homem'), 96);
    assert.strictEqual(R.pontuacaoMinimaExigida(2019, 'mulher'), 86);
  });

  teste('pontuação sobe 1 ponto por ano', () => {
    assert.strictEqual(R.pontuacaoMinimaExigida(2023, 'homem'), 100);
    assert.strictEqual(R.pontuacaoMinimaExigida(2023, 'mulher'), 90);
  });

  teste('ano atual (2026) exige 103 (homem) / 93 (mulher)', () => {
    assert.strictEqual(R.pontuacaoMinimaExigida(2026, 'homem'), 103);
    assert.strictEqual(R.pontuacaoMinimaExigida(2026, 'mulher'), 93);
  });

  teste('pontuação do homem estabiliza em 105 a partir de 2028 (não continua subindo)', () => {
    assert.strictEqual(R.pontuacaoMinimaExigida(2028, 'homem'), 105);
    assert.strictEqual(R.pontuacaoMinimaExigida(2035, 'homem'), 105);
  });

  teste('pontuação da mulher estabiliza em 100 a partir de 2033 (não continua subindo)', () => {
    assert.strictEqual(R.pontuacaoMinimaExigida(2033, 'mulher'), 100);
    assert.strictEqual(R.pontuacaoMinimaExigida(2040, 'mulher'), 100);
  });

  teste('rejeita ano anterior a 2019 (regra não existia)', () => {
    assert.throws(() => R.pontuacaoMinimaExigida(2018, 'homem'), /não existia antes de 2019/);
  });

  teste('rejeita sexo inválido em pontuacaoMinimaExigida', () => {
    assert.throws(() => R.pontuacaoMinimaExigida(2026, 'outro'));
  });

  teste('elegibilidadeRegraPontos aprova homem com pontuação, tempo e carência suficientes em 2026', () => {
    // 35 anos de contribuição + idade 68 = 103 pontos, exatamente o exigido em 2026
    const r = R.elegibilidadeRegraPontos({
      idadeAnos: 68, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
    assert.strictEqual(r.pontuacaoExigida, 103);
    assert.strictEqual(r.pontuacaoAtingida, 103);
  });

  teste('elegibilidadeRegraPontos aceita dataReferencia (ISO) equivalente a anoReferencia', () => {
    const rComData = R.elegibilidadeRegraPontos({
      idadeAnos: 68, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', dataReferencia: '2026-03-15'
    });
    assert.strictEqual(rComData.anoReferencia, 2026);
    assert.strictEqual(rComData.elegivel, true);
  });

  teste('elegibilidadeRegraPontos reprova por pontuação insuficiente mesmo com tempo mínimo batido', () => {
    // 35 anos de tempo (bate o mínimo) mas só 60 anos de idade = 95 pontos, abaixo dos 103 exigidos em 2026
    const r = R.elegibilidadeRegraPontos({
      idadeAnos: 60, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.strictEqual(r.pendencias.length, 1);
    assert.ok(r.pendencias[0].includes('pontuação'));
  });

  teste('elegibilidadeRegraPontos reprova por tempo mínimo de 35/30 anos não atingido, mesmo com pontuação total suficiente', () => {
    // 30 anos de tempo (abaixo do mínimo de 35 para homem) + idade 73 = 103 pontos (bate a pontuação),
    // mas o tempo mínimo próprio da regra de pontos (35 anos) não foi atingido
    const r = R.elegibilidadeRegraPontos({
      idadeAnos: 73, tempoContribuicao: { anos: 30, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('tempo de contribuição mínimo')));
  });

  teste('elegibilidadeRegraPontos reprova por carência insuficiente mesmo com pontuação e tempo ok', () => {
    const r = R.elegibilidadeRegraPontos({
      idadeAnos: 68, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 100, sexo: 'homem', anoReferencia: 2026
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidadeRegraPontos lança erro claro quando não informa ano/data de referência', () => {
    assert.throws(() => {
      R.elegibilidadeRegraPontos({
        idadeAnos: 68, tempoContribuicao: { anos: 35, meses: 0, dias: 0 },
        carenciaMeses: 180, sexo: 'homem'
      });
    }, /anoReferencia.*dataReferencia|dataReferencia.*anoReferencia/);
  });

  teste('calcularRMIRegraPontos: homem com exatamente 35 anos recebe 60% do salário de benefício', () => {
    const r = R.calcularRMIRegraPontos({ salarioBeneficio: 3000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.rmiFinal, 1800);
    assert.strictEqual(r.anosExcedentesConsiderados, 0);
    assert.strictEqual(r.tempoMinimoExigidoAnos, 35);
  });

  teste('calcularRMIRegraPontos: mulher com exatamente 30 anos recebe 60% do salário de benefício', () => {
    const r = R.calcularRMIRegraPontos({ salarioBeneficio: 3000, tempoContribuicao: { anos: 30, meses: 0, dias: 0 }, sexo: 'mulher' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.tempoMinimoExigidoAnos, 30);
  });

  teste('calcularRMIRegraPontos: homem com 40 anos completos soma 5 anos excedentes x 2% = 70%', () => {
    const r = R.calcularRMIRegraPontos({ salarioBeneficio: 2000, tempoContribuicao: { anos: 40, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.anosExcedentesConsiderados, 5);
    assert.strictEqual(r.percentualAplicado, 0.70);
    assert.strictEqual(r.rmiFinal, 1400);
  });

  teste('calcularRMIRegraPontos usa tempo mínimo diferente do MotorRMI.calcularRMI para o mesmo tempo de contribuição', () => {
    // 25 anos de contribuição: na regra permanente (mínimo 20) já gera 5 anos excedentes;
    // na regra de pontos (mínimo 35) ainda está abaixo do mínimo, 0 anos excedentes.
    const permanente = sb.MotorRMI.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: { anos: 25, meses: 0, dias: 0 }, sexo: 'homem' });
    const pontos = R.calcularRMIRegraPontos({ salarioBeneficio: 2000, tempoContribuicao: { anos: 25, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(permanente.anosExcedentesConsiderados, 5);
    assert.strictEqual(pontos.anosExcedentesConsiderados, 0);
    assert.strictEqual(pontos.percentualAplicado, 0.60);
  });

  teste('calcularRMIRegraPontos aplica piso e teto do mesmo jeito que MotorRMI.calcularRMI', () => {
    const rPiso = R.calcularRMIRegraPontos({
      salarioBeneficio: 1000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem',
      salarioMinimoVigente: 1518
    });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = R.calcularRMIRegraPontos({
      salarioBeneficio: 10000, tempoContribuicao: { anos: 55, meses: 0, dias: 0 }, sexo: 'homem',
      tetoRGPSVigente: 8157.41
    });
    assert.strictEqual(rTeto.aplicouTeto, true);
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
  });

  teste('calcularRMIRegraPontos rejeita salarioBeneficio inválido e sexo inválido', () => {
    assert.throws(() => R.calcularRMIRegraPontos({ salarioBeneficio: 0, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem' }));
    assert.throws(() => R.calcularRMIRegraPontos({ salarioBeneficio: 2000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'outro' }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
