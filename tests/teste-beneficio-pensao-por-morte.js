/* ============================================================================
   TESTE-BENEFICIO-PENSAO-POR-MORTE.JS — cobre
   js/domains/previdenciario/beneficios/pensaoPorMorte.js (Atualização 44).

   Roda sem dependências externas: `node tests/teste-beneficio-pensao-por-morte.js`.
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
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'beneficios', 'pensaoPorMorte.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox;
}

(() => {
  console.log('== BENEFICIOS/PENSAOPORMORTE.JS (Lei 8.213/91, arts. 16/74-78) ==');
  const B = carregarModulo().BeneficioPensaoPorMorte;

  teste('elegibilidade aprova com qualidade de segurado e dependente reconhecidos', () => {
    const r = B.elegibilidadePensaoPorMorte({ qualidadeSeguradoFalecido: true, dependenteReconhecido: true });
    assert.strictEqual(r.elegivel, true);
  });

  teste('elegibilidade reprova sem qualidade de segurado do falecido', () => {
    const r = B.elegibilidadePensaoPorMorte({ qualidadeSeguradoFalecido: false, dependenteReconhecido: true });
    assert.strictEqual(r.elegivel, false);
  });

  teste('elegibilidade reprova sem dependente reconhecido', () => {
    const r = B.elegibilidadePensaoPorMorte({ qualidadeSeguradoFalecido: true, dependenteReconhecido: false });
    assert.strictEqual(r.elegivel, false);
  });

  teste('regraConjugeAtendePrazoIntegral: true quando 18+ contribuições E 2+ anos de união', () => {
    assert.strictEqual(B.regraConjugeAtendePrazoIntegral({ contribuicoesDoFalecido: 20, anosDeUniao: 3 }), true);
  });

  teste('regraConjugeAtendePrazoIntegral: false quando falta contribuições OU tempo de união', () => {
    assert.strictEqual(B.regraConjugeAtendePrazoIntegral({ contribuicoesDoFalecido: 10, anosDeUniao: 3 }), false);
    assert.strictEqual(B.regraConjugeAtendePrazoIntegral({ contribuicoesDoFalecido: 20, anosDeUniao: 1 }), false);
  });

  teste('regraConjugeAtendePrazoIntegral: true quando causaAcidentaria, mesmo sem os outros dois requisitos (dispensa, art. 77, §2º-A)', () => {
    assert.strictEqual(B.regraConjugeAtendePrazoIntegral({ contribuicoesDoFalecido: 2, anosDeUniao: 0, causaAcidentaria: true }), true);
  });

  teste('RMI: 1 dependente = cota familiar de 60% (50% + 10%)', () => {
    const r = B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 3000, numeroDependentes: 1 });
    assert.strictEqual(r.percentualCotaFamiliar, 0.60);
    assert.strictEqual(r.rmiCotaFamiliar, 1800);
    assert.strictEqual(r.rmiCotaPorDependente, 1800);
  });

  teste('RMI: 5 dependentes ou mais satura em 100% (50% + 5*10% = 100%, nunca ultrapassa)', () => {
    const r5 = B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 5 });
    assert.strictEqual(r5.percentualCotaFamiliar, 1.00);
    assert.strictEqual(r5.rmiCotaFamiliar, 2000);

    const r8 = B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 8 });
    assert.strictEqual(r8.percentualCotaFamiliar, 1.00, 'não pode ultrapassar 100% mesmo com mais dependentes');
  });

  teste('RMI: cota por dependente divide a cota familiar igualmente entre eles', () => {
    const r = B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 4000, numeroDependentes: 2 });
    // cota familiar: 50% + 20% = 70% de 4000 = 2800; dividido por 2 = 1400 cada
    assert.strictEqual(r.rmiCotaFamiliar, 2800);
    assert.strictEqual(r.rmiCotaPorDependente, 1400);
  });

  teste('rejeita valorBaseAposentadoria inválido', () => {
    assert.throws(() => B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 0, numeroDependentes: 1 }));
  });

  teste('rejeita numeroDependentes inválido (zero ou ausente)', () => {
    assert.throws(() => B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 0 }));
    assert.throws(() => B.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000 }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
