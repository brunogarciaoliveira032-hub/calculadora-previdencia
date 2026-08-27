/* ============================================================================
   TESTE-DIREITO-ADQUIRIDO-TEMPO-CONTRIBUICAO.JS — cobre
   js/domains/previdenciario/regras/direitoAdquirido/aposentadoriaTempoContribuicao.js
   (Atualização 51).

   Roda sem dependências externas: `node tests/teste-direito-adquirido-tempo-contribuicao.js`.
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

function carregarArquivo(sandbox, ...partesCaminho) {
  const caminho = path.join(__dirname, '..', ...partesCaminho);
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
}

function carregarModulo() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'motorRMI.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'direitoAdquirido', 'aposentadoriaTempoContribuicao.js');
  return sandbox;
}

(() => {
  console.log('== REGRAS/DIREITOADQUIRIDO/APOSENTADORIATEMPOCONTRIBUICAO.JS (pré-EC 103/2019) ==');

  teste('recusa carregar sem MotorRMI já no escopo', () => {
    const sandbox = {};
    vm.createContext(sandbox);
    assert.throws(() => {
      carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'regras', 'direitoAdquirido', 'aposentadoriaTempoContribuicao.js');
    }, /depende de MotorRMI/);
  });

  const sb = carregarModulo();
  const R = sb.RegraDireitoAdquiridoTempoContribuicao;

  /* -------------------- ELEGIBILIDADE -------------------- */

  teste('elegibilidade aprova homem com 35 anos + carência 180, mesmo sem atingir pontuação (fator obrigatório)', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 }, idadeEm13112019Anos: 50,
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, true);
    assert.strictEqual(r.dispensaFatorPrevidenciario, false); // 50+35=85, abaixo de 96
  });

  teste('elegibilidade aprova mulher com 30 anos + carência 180', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 30, meses: 0, dias: 0 }, idadeEm13112019Anos: 48,
      carenciaMeses: 180, sexo: 'mulher'
    });
    assert.strictEqual(r.elegivel, true);
  });

  teste('reprova por tempo de contribuição insuficiente em 13/11/2019', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 30, meses: 0, dias: 0 }, idadeEm13112019Anos: 50,
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('tempo de contribuição')));
  });

  teste('reprova por carência insuficiente mesmo com tempo suficiente', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 }, idadeEm13112019Anos: 50,
      carenciaMeses: 100, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('carência')));
  });

  teste('elegibilidade rejeita sexo inválido', () => {
    assert.throws(() => R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 }, idadeEm13112019Anos: 50,
      carenciaMeses: 180, sexo: 'outro'
    }));
  });

  /* -------------------- PONTUAÇÃO 96/86 (ART. 29-C) — DISPENSA DO FATOR -------------------- */

  teste('homem com pontuação exatamente 96 (idade+tempo) dispensa o fator previdenciário', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 }, idadeEm13112019Anos: 61,
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.pontuacaoAtingida, 96);
    assert.strictEqual(r.dispensaFatorPrevidenciario, true);
  });

  teste('homem com pontuação 95 (1 ponto abaixo) NÃO dispensa o fator', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 }, idadeEm13112019Anos: 60,
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.pontuacaoAtingida, 95);
    assert.strictEqual(r.dispensaFatorPrevidenciario, false);
  });

  teste('mulher com pontuação exatamente 86 dispensa o fator previdenciário', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 30, meses: 0, dias: 0 }, idadeEm13112019Anos: 56,
      carenciaMeses: 180, sexo: 'mulher'
    });
    assert.strictEqual(r.pontuacaoAtingida, 86);
    assert.strictEqual(r.dispensaFatorPrevidenciario, true);
  });

  teste('pendência específica quando idadeEm13112019Anos não é informada', () => {
    const r = R.elegibilidadeDireitoAdquiridoTempoContribuicao({
      tempoContribuicaoEm13112019: { anos: 35, meses: 0, dias: 0 },
      carenciaMeses: 180, sexo: 'homem'
    });
    assert.strictEqual(r.elegivel, false);
    assert.ok(r.pendencias.some(p => p.includes('idade em 13/11/2019')));
  });

  /* -------------------- RMI -------------------- */

  teste('RMI com pontuação dispensando o fator: 100% do salário de benefício, sem precisar de fatorPrevidenciario', () => {
    const r = R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 3000, dispensaFatorPrevidenciario: true });
    assert.strictEqual(r.percentualOuFatorAplicado, 1.0);
    assert.strictEqual(r.rmiFinal, 3000);
    assert.strictEqual(r.dispensouFatorPrevidenciario, true);
  });

  teste('RMI sem dispensa: aplica o fatorPrevidenciario informado', () => {
    const r = R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 3000, dispensaFatorPrevidenciario: false, fatorPrevidenciario: 0.85 });
    assert.strictEqual(r.percentualOuFatorAplicado, 0.85);
    assert.strictEqual(r.rmiFinal, 2550);
    assert.strictEqual(r.dispensouFatorPrevidenciario, false);
  });

  teste('RMI sem dispensa e sem fatorPrevidenciario informado: recusa calcular (nunca assume fator = 1)', () => {
    assert.throws(() => R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 3000, dispensaFatorPrevidenciario: false }), /fatorPrevidenciario é obrigatório/);
  });

  teste('RMI aplica piso e teto do mesmo jeito que os outros motores', () => {
    const rPiso = R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 1000, dispensaFatorPrevidenciario: true, salarioMinimoVigente: 1518 });
    assert.strictEqual(rPiso.rmiFinal, 1518);
    assert.strictEqual(rPiso.aplicouPiso, true);

    const rTeto = R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 10000, dispensaFatorPrevidenciario: true, tetoRGPSVigente: 8157.41 });
    assert.strictEqual(rTeto.rmiFinal, 8157.41);
    assert.strictEqual(rTeto.aplicouTeto, true);
  });

  teste('RMI rejeita salarioBeneficio inválido', () => {
    assert.throws(() => R.calcularRMIDireitoAdquiridoTempoContribuicao({ salarioBeneficio: 0, dispensaFatorPrevidenciario: true }));
    assert.throws(() => R.calcularRMIDireitoAdquiridoTempoContribuicao({ dispensaFatorPrevidenciario: true }));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
