/* ============================================================================
   TESTE-BENEFICIO-SALARIO-MATERNIDADE.JS — cobre
   js/domains/previdenciario/beneficios/salarioMaternidade.js (Atualização 44).

   Roda sem dependências externas: `node tests/teste-beneficio-salario-maternidade.js`.
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
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'beneficios', 'salarioMaternidade.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== BENEFICIOS/SALARIOMATERNIDADE.JS (Lei 8.213/91, arts. 25/71-73; STF, ADIs 2.110/2.111) ==');
  const B = carregarModulo().BeneficioSalarioMaternidade;

  teste('elegibilidade aprova com segurada + evento gerador, SEM checar carência (regra pós-STF)', () => {
    const r = B.elegibilidadeSalarioMaternidade({ segurada: true, eventoGerador: true });
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidade reprova sem qualidade de segurada', () => {
    const r = B.elegibilidadeSalarioMaternidade({ segurada: false, eventoGerador: true });
    assert.strictEqual(r.elegivel, false);
  });

  teste('elegibilidade reprova sem evento gerador comprovado', () => {
    const r = B.elegibilidadeSalarioMaternidade({ segurada: true, eventoGerador: false });
    assert.strictEqual(r.elegivel, false);
  });

  teste('RMI empregada/avulsa usa a baseCalculo informada (remuneração integral)', () => {
    const r = B.calcularRMISalarioMaternidade({ categoria: 'empregada_avulsa', baseCalculo: 3500, salarioMinimoVigente: 1518 });
    assert.strictEqual(r.rmiFinal, 3500);
    assert.strictEqual(r.aplicouPiso, false);
  });

  teste('RMI doméstica usa a baseCalculo informada (último salário de contribuição)', () => {
    const r = B.calcularRMISalarioMaternidade({ categoria: 'domestica', baseCalculo: 2000, salarioMinimoVigente: 1518 });
    assert.strictEqual(r.rmiFinal, 2000);
  });

  teste('RMI especial_economia_familiar é SEMPRE o salário mínimo vigente, sem precisar de baseCalculo', () => {
    const r = B.calcularRMISalarioMaternidade({ categoria: 'especial_economia_familiar', salarioMinimoVigente: 1518 });
    assert.strictEqual(r.rmiFinal, 1518);
  });

  teste('RMI especial_contribuinte_individual e demais usam a baseCalculo informada', () => {
    const r1 = B.calcularRMISalarioMaternidade({ categoria: 'especial_contribuinte_individual', baseCalculo: 1000, salarioMinimoVigente: 1518 });
    assert.strictEqual(r1.rmiFinal, 1518, 'abaixo do salário mínimo, o piso é aplicado');
    assert.strictEqual(r1.aplicouPiso, true);

    const r2 = B.calcularRMISalarioMaternidade({ categoria: 'demais', baseCalculo: 2500, salarioMinimoVigente: 1518 });
    assert.strictEqual(r2.rmiFinal, 2500);
  });

  teste('nunca fica abaixo do salário mínimo (art. 73), em qualquer categoria', () => {
    const r = B.calcularRMISalarioMaternidade({ categoria: 'demais', baseCalculo: 500, salarioMinimoVigente: 1518 });
    assert.strictEqual(r.rmiFinal, 1518);
    assert.strictEqual(r.aplicouPiso, true);
  });

  teste('aplica teto do RGPS quando informado', () => {
    const r = B.calcularRMISalarioMaternidade({ categoria: 'empregada_avulsa', baseCalculo: 20000, salarioMinimoVigente: 1518, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(r.rmiFinal, 8157.41);
    assert.strictEqual(r.aplicouTeto, true);
  });

  teste('rejeita categoria inválida', () => {
    assert.throws(() => B.calcularRMISalarioMaternidade({ categoria: 'invalida', baseCalculo: 2000, salarioMinimoVigente: 1518 }));
  });

  teste('rejeita salarioMinimoVigente ausente (piso legal sempre obrigatório)', () => {
    assert.throws(() => B.calcularRMISalarioMaternidade({ categoria: 'empregada_avulsa', baseCalculo: 2000 }));
  });

  teste('rejeita baseCalculo ausente para categorias que exigem (não especial_economia_familiar)', () => {
    assert.throws(() => B.calcularRMISalarioMaternidade({ categoria: 'demais', salarioMinimoVigente: 1518 }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
