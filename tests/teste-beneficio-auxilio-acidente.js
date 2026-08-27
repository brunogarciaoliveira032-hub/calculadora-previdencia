/* ============================================================================
   TESTE-BENEFICIO-AUXILIO-ACIDENTE.JS — cobre
   js/domains/previdenciario/beneficios/auxilioAcidente.js (Atualização 44).

   Roda sem dependências externas: `node tests/teste-beneficio-auxilio-acidente.js`.
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
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'beneficios', 'auxilioAcidente.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== BENEFICIOS/AUXILIOACIDENTE.JS (Lei 8.213/91, art. 86) ==');
  const B = carregarModulo().BeneficioAuxilioAcidente;

  teste('elegibilidade aprova com sequela atestada, sem carência nem idade exigidas', () => {
    const r = B.elegibilidadeAuxilioAcidente({ sequelaComReducaoCapacidadeAtestada: true });
    assert.strictEqual(r.elegivel, true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.pendencias)), []);
  });

  teste('elegibilidade reprova sem sequela atestada', () => {
    const r = B.elegibilidadeAuxilioAcidente({ sequelaComReducaoCapacidadeAtestada: false });
    assert.strictEqual(r.elegivel, false);
    assert.strictEqual(r.pendencias.length, 1);
  });

  teste('RMI é 50% do salário de benefício', () => {
    const r = B.calcularRMIAuxilioAcidente({ salarioBeneficio: 4000 });
    assert.strictEqual(r.percentualAplicado, 0.50);
    assert.strictEqual(r.rmiFinal, 2000);
  });

  teste('aplica piso e teto do mesmo jeito que os outros módulos', () => {
    const rPiso = B.calcularRMIAuxilioAcidente({ salarioBeneficio: 1000, salarioMinimoVigente: 1518 });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = B.calcularRMIAuxilioAcidente({ salarioBeneficio: 20000, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
    assert.strictEqual(rTeto.aplicouTeto, true);
  });

  teste('rejeita salarioBeneficio inválido', () => {
    assert.throws(() => B.calcularRMIAuxilioAcidente({ salarioBeneficio: -1 }));
    assert.throws(() => B.calcularRMIAuxilioAcidente({}));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
