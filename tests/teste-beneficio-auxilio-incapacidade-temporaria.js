/* ============================================================================
   TESTE-BENEFICIO-AUXILIO-INCAPACIDADE-TEMPORARIA.JS — cobre
   js/domains/previdenciario/beneficios/auxilioIncapacidadeTemporaria.js
   (Atualização 44).

   Roda sem dependências externas: `node tests/teste-beneficio-auxilio-incapacidade-temporaria.js`.
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
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'beneficios', 'auxilioIncapacidadeTemporaria.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== BENEFICIOS/AUXILIOINCAPACIDADETEMPORARIA.JS (Lei 8.213/91, arts. 59/61) ==');
  const B = carregarModulo().BeneficioAuxilioIncapacidadeTemporaria;

  teste('elegibilidade aprova com incapacidade atestada e 12 meses de carência', () => {
    const r = B.elegibilidadeAuxilioIncapacidadeTemporaria({ incapacidadeAtestada: true, carenciaMeses: 12 });
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidade reprova sem incapacidade atestada', () => {
    const r = B.elegibilidadeAuxilioIncapacidadeTemporaria({ incapacidadeAtestada: false, carenciaMeses: 20 });
    assert.strictEqual(r.elegivel, false);
  });

  teste('elegibilidade reprova por carência insuficiente sem dispensa', () => {
    const r = B.elegibilidadeAuxilioIncapacidadeTemporaria({ incapacidadeAtestada: true, carenciaMeses: 5 });
    assert.strictEqual(r.elegivel, false);
  });

  teste('elegibilidade aprova sem carência quando dispensaCarencia é true', () => {
    const r = B.elegibilidadeAuxilioIncapacidadeTemporaria({ incapacidadeAtestada: true, carenciaMeses: 0, dispensaCarencia: true });
    assert.strictEqual(r.elegivel, true);
  });

  teste('RMI é 91% do salário de benefício', () => {
    const r = B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 2000 });
    assert.strictEqual(r.percentualAplicado, 0.91);
    assert.strictEqual(r.rmiFinal, 1820);
  });

  teste('aplica piso do salário mínimo', () => {
    const r = B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 1000, salarioMinimoVigente: 1518 });
    assert.strictEqual(r.rmiFinal, 1518);
    assert.strictEqual(r.aplicouPiso, true);
  });

  teste('aplica teto do RGPS', () => {
    const r = B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 10000, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(r.rmiFinal, 8157.41);
    assert.strictEqual(r.aplicouTeto, true);
  });

  teste('aplica o limite opcional da média dos últimos 12 SC (art. 29, §10) quando informado', () => {
    const r = B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 5000, limiteMediaUltimos12SC: 3000 });
    assert.strictEqual(r.rmiAntesDoPisoTeto, 4550); // 91% de 5000
    assert.strictEqual(r.rmiFinal, 3000);
    assert.strictEqual(r.aplicouLimiteUltimos12SC, true);
  });

  teste('sem o limite informado, não aplica nada além do próprio percentual', () => {
    const r = B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 5000 });
    assert.strictEqual(r.aplicouLimiteUltimos12SC, false);
  });

  teste('rejeita salarioBeneficio inválido', () => {
    assert.throws(() => B.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 0 }));
    assert.throws(() => B.calcularRMIAuxilioIncapacidadeTemporaria({}));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
