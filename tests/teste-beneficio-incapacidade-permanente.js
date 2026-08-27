/* ============================================================================
   TESTE-BENEFICIO-INCAPACIDADE-PERMANENTE.JS — cobre
   js/domains/previdenciario/beneficios/incapacidadePermanente.js
   (Atualização 43 — fase 1 do catálogo de espécies de benefício).

   Carrega motorRMI.js + incapacidadePermanente.js no MESMO contexto vm
   (mesmo padrão de tests/teste-regra-pontos-previdenciario.js).

   Roda sem dependências externas: `node tests/teste-beneficio-incapacidade-permanente.js`.
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

function carregarModulo() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'beneficios', 'incapacidadePermanente.js');
  return sandbox;
}

(() => {
  console.log('== BENEFICIOS/INCAPACIDADEPERMANENTE.JS (Lei 8.213/91, arts. 42/45; EC 103/2019, art. 26) ==');

  teste('incapacidadePermanente.js recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'beneficios', 'incapacidadePermanente.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarModulo();
  const B = sb.BeneficioIncapacidadePermanente;

  /* -------------------- ELEGIBILIDADE -------------------- */

  teste('elegibilidade aprova com incapacidade atestada e carência de 12 meses, sem exigir idade nem tempo mínimo', () => {
    const r = B.elegibilidadeIncapacidadePermanente({ incapacidadeAtestada: true, carenciaMeses: 12 });
    assert.deepStrictEqual(semRealm(r.pendencias), []);
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidade reprova quando incapacidade não foi atestada, mesmo com carência suficiente', () => {
    const r = B.elegibilidadeIncapacidadePermanente({ incapacidadeAtestada: false, carenciaMeses: 24 });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('incapacidade')));
  });

  teste('elegibilidade reprova por carência insuficiente quando não há dispensa', () => {
    const r = B.elegibilidadeIncapacidadePermanente({ incapacidadeAtestada: true, carenciaMeses: 6 });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidade aprova SEM carência quando dispensaCarencia é true (acidente/doença listada), mesmo com carenciaMeses baixo', () => {
    const r = B.elegibilidadeIncapacidadePermanente({ incapacidadeAtestada: true, carenciaMeses: 0, dispensaCarencia: true });
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidade acumula as duas pendências quando nada bate', () => {
    const r = B.elegibilidadeIncapacidadePermanente({ incapacidadeAtestada: false, carenciaMeses: 3 });
    assert.strictEqual(r.pendencias.length, 2);
  });

  /* -------------------- RMI — CASO NÃO ACIDENTÁRIO (reaproveita MotorRMI) -------------------- */

  teste('RMI não acidentária usa a MESMA fórmula da regra permanente: homem com 20 anos exatos recebe 60%', () => {
    const r = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 3000, causaAcidentaria: false,
      tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem'
    });
    assert.strictEqual(r.percentualAplicado, 0.60);
    assert.strictEqual(r.rmiBase, 1800);
    assert.strictEqual(r.rmiFinal, 1800);
    assert.strictEqual(r.causaAcidentaria, false);
  });

  teste('RMI não acidentária: homem com 25 anos completos soma 5 anos excedentes x 2% = 70% (idêntico ao MotorRMI.calcularRMI)', () => {
    const viaBeneficio = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 2000, causaAcidentaria: false,
      tempoContribuicao: { anos: 25, meses: 0, dias: 0 }, sexo: 'homem'
    });
    const viaMotorRMI = sb.MotorRMI.calcularRMI({ salarioBeneficio: 2000, tempoContribuicao: { anos: 25, meses: 0, dias: 0 }, sexo: 'homem' });
    assert.strictEqual(viaBeneficio.rmiBase, viaMotorRMI.rmiFinal);
    assert.strictEqual(viaBeneficio.percentualAplicado, viaMotorRMI.percentualAplicado);
    assert.strictEqual(viaBeneficio.anosExcedentesConsiderados, 5);
  });

  teste('RMI não acidentária: mulher com 15 anos exatos recebe 60% (mesmo tempo mínimo de 15 anos da regra permanente)', () => {
    const r = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 2000, causaAcidentaria: false,
      tempoContribuicao: { anos: 15, meses: 0, dias: 0 }, sexo: 'mulher'
    });
    assert.strictEqual(r.percentualAplicado, 0.60);
  });

  /* -------------------- RMI — CASO ACIDENTÁRIO (100% direto) -------------------- */

  teste('RMI acidentária é 100% do salário de benefício, sem fórmula de anos excedentes, mesmo com pouco tempo de contribuição', () => {
    const r = B.calcularRMIIncapacidadePermanente({ salarioBeneficio: 3000, causaAcidentaria: true });
    assert.strictEqual(r.rmiBase, 3000);
    assert.strictEqual(r.rmiFinal, 3000);
    assert.strictEqual(r.percentualAplicado, null);
    assert.strictEqual(r.anosExcedentesConsiderados, null);
    assert.strictEqual(r.causaAcidentaria, true);
  });

  teste('RMI acidentária aplica piso e teto do mesmo jeito que os outros motores', () => {
    const rPiso = B.calcularRMIIncapacidadePermanente({ salarioBeneficio: 1000, causaAcidentaria: true, salarioMinimoVigente: 1518 });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = B.calcularRMIIncapacidadePermanente({ salarioBeneficio: 10000, causaAcidentaria: true, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
    assert.strictEqual(rTeto.aplicouTeto, true);
  });

  /* -------------------- ADICIONAL DE 25% (GRANDE INVALIDEZ, ART. 45) -------------------- */

  teste('adicional de 25% é aplicado sobre a RMI-base quando necessitaAssistenciaPermanente é true', () => {
    const r = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 3000, causaAcidentaria: true, necessitaAssistenciaPermanente: true
    });
    assert.strictEqual(r.rmiBase, 3000);
    assert.strictEqual(r.adicionalGrandeInvalidezAplicado, true);
    assert.strictEqual(r.rmiFinal, 3750); // 3000 * 1.25
  });

  teste('sem necessitaAssistenciaPermanente, RMI final é igual à RMI-base (nenhum adicional)', () => {
    const r = B.calcularRMIIncapacidadePermanente({ salarioBeneficio: 3000, causaAcidentaria: true });
    assert.strictEqual(r.adicionalGrandeInvalidezAplicado, false);
    assert.strictEqual(r.rmiFinal, r.rmiBase);
  });

  teste('adicional de 25% ULTRAPASSA o teto do RGPS de propósito (art. 45, parágrafo único, "a") — só a RMI-base respeita o teto', () => {
    const r = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 10000, causaAcidentaria: true, tetoRGPSVigente: 8157.41, necessitaAssistenciaPermanente: true
    });
    assert.strictEqual(r.rmiBase, 8157.41, 'a RMI-base respeita o teto normalmente');
    assert.strictEqual(r.aplicouTeto, true);
    assert.strictEqual(r.rmiFinal, 10196.76, 'o valor final (com o adicional) ULTRAPASSA o teto de propósito: 8157.41 * 1.25');
  });

  teste('adicional de 25% também funciona no caso não acidentário (sobre o resultado da fórmula 60%+2%/ano)', () => {
    const r = B.calcularRMIIncapacidadePermanente({
      salarioBeneficio: 2000, causaAcidentaria: false,
      tempoContribuicao: { anos: 20, meses: 0, dias: 0 }, sexo: 'homem',
      necessitaAssistenciaPermanente: true
    });
    assert.strictEqual(r.rmiBase, 1200); // 60% de 2000
    assert.strictEqual(r.rmiFinal, 1500); // 1200 * 1.25
  });

  teste('rejeita salarioBeneficio inválido', () => {
    assert.throws(() => B.calcularRMIIncapacidadePermanente({ salarioBeneficio: 0, causaAcidentaria: true }));
    assert.throws(() => B.calcularRMIIncapacidadePermanente({ causaAcidentaria: true }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
