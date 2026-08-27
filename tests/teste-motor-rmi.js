/* ============================================================================
   TESTE-MOTOR-RMI.JS — cobre js/domains/previdenciario/motorRMI.js
   (Atualização 13 — RMI da aposentadoria programada, regra permanente
   pós-EC 103/2019).

   Carrega o arquivo isolado num contexto vm próprio (mesmo padrão de
   tests/teste-motor-tempo-contribuicao.js) — este domínio ainda não está
   plugado a nenhum pipeline de extração.

   Roda sem dependências externas: `node tests/teste-motor-rmi.js`.
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

function carregarMotor() {
  const sandbox = {};
  vm.createContext(sandbox);
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorRMI.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== MOTORRMI.JS (aposentadoria programada, regra permanente) ==');
  const sb = carregarMotor();
  const M = sb.MotorRMI;

  teste('homem com exatamente 20 anos de contribuição recebe 60% do salário de benefício', () => {
    const r = M.calcularRMI({ salarioBeneficio: 3000, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.rmiFinal, 1800);
    assert.strictEqual(r.anosExcedentesConsiderados, 0);
  });

  teste('mulher com exatamente 15 anos de contribuição recebe 60% do salário de benefício', () => {
    const r = M.calcularRMI({ salarioBeneficio: 3000, tempoContribuicao: { anos: 15, meses: 0, dias: 0 }, sexo: 'mulher' });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.rmiFinal, 1800);
  });

  teste('homem com 25 anos completos de contribuição soma 5 anos excedentes x 2% = 70%', () => {
    const r = M.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: { anos: 25, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.anosExcedentesConsiderados, 5);
    assert.strictEqual(r.percentualAplicado, 0.70);
    assert.strictEqual(r.rmiFinal, 1400);
  });

  teste('ano excedente incompleto (só meses, sem fechar o ano) não gera adicional proporcional', () => {
    const r = M.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: { anos: 20, meses: 11, dias: 29 }, sexo: 'homem' });
    assert.strictEqual(r.anosExcedentesConsiderados, 0);
    assert.strictEqual(r.percentualAplicado, 0.60);
  });

  teste('aceita tempoContribuicao como número de anos fracionários direto', () => {
    const r = M.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: 23.5, sexo: 'mulher' });
    // 23.5 - 15 = 8.5 -> floor = 8 anos excedentes
    assert.strictEqual(r.anosExcedentesConsiderados, 8);
  });

  teste('aplica o piso do salário mínimo quando o cálculo fica abaixo dele', () => {
    const r = M.calcularRMI({
      salarioBeneficio: 1000, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem',
      salarioMinimoVigente: 1518
    });
    assert.strictEqual(r.rmiAntesDoPisoTeto, 600);
    assert.strictEqual(r.rmiFinal, 1518);
    assert.strictEqual(r.aplicouPiso, true);
    assert.strictEqual(r.aplicouTeto, false);
  });

  teste('aplica o teto do RGPS quando o cálculo fica acima dele', () => {
    const r = M.calcularRMI({
      salarioBeneficio: 10000, tempoContribuicao: { anos: 35, meses: 0, dias: 0 }, sexo: 'homem',
      tetoRGPSVigente: 8157.41
    });
    // 60% + 15 anos excedentes * 2% = 90% de 10000 = 9000, acima do teto
    assert.strictEqual(r.rmiAntesDoPisoTeto, 9000);
    assert.strictEqual(r.rmiFinal, 8157.41);
    assert.strictEqual(r.aplicouTeto, true);
  });

  teste('sem informar piso/teto, não aplica nenhum dos dois (fica por conta do chamador)', () => {
    const r = M.calcularRMI({ salarioBeneficio: 100, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(r.aplicouPiso, false);
    assert.strictEqual(r.aplicouTeto, false);
    assert.strictEqual(r.rmiFinal, 60);
  });

  teste('rejeita salarioBeneficio inválido', () => {
    assert.throws(() => M.calcularRMI({ salarioBeneficio: 0, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem' }));
    assert.throws(() => M.calcularRMI({ tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem' }));
  });

  teste('rejeita sexo inválido', () => {
    assert.throws(() => M.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'outro' }));
  });

  teste('elegibilidadeRegraPermanente aprova quando idade, tempo e carência batem', () => {
    const r = M.elegibilidadeRegraPermanente({
      idadeAnos: 65, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, carenciaMeses: 180, sexo: 'homem'
    });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidadeRegraPermanente lista todas as pendências quando nada bate', () => {
    const r = M.elegibilidadeRegraPermanente({
      idadeAnos: 55, tempoContribuicao: { anos: 10, meses: 0, dias: 0 }, carenciaMeses: 100, sexo: 'mulher'
    });
    assert.strictEqual(r.elegivel, false);
    assert.strictEqual(r.pendencias.length, 3);
  });

  teste('elegibilidadeRegraPermanente reprova por 1 mês de carência faltante mesmo com idade/tempo ok', () => {
    const r = M.elegibilidadeRegraPermanente({
      idadeAnos: 65, tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, carenciaMeses: 179, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.strictEqual(r.pendencias.length, 1);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
