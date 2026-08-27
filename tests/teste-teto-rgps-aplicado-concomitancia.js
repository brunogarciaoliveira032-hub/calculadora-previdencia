/* ============================================================================
   TESTE-TETO-RGPS-APLICADO-CONCOMITANCIA.JS — cobre a integração entre
   dados-historicos/tetoRgps.js (Atualização 42) e a soma de concomitância
   real em historicoPrevidenciario.js (item 3 do checklist, Atualização
   32) — fecha a limitação que ficava só documentada como
   `.limitacaoTetoRgpsHistorico` (aviso de revisão manual) sem nunca
   aplicar o teto de fato.

   Roda sem dependências externas: `node tests/teste-teto-rgps-aplicado-concomitancia.js`.
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
    console.log(`      ${erro.stack || erro.message}`);
  }
}

function carregarHistorico() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    'core/calculoPeriodos.js',
    'domains/previdenciario/motorTempoContribuicao.js',
    'domains/previdenciario/dados-historicos/tetoRgps.js',
    'domains/previdenciario/document-types/cnis.js',
    'domains/previdenciario/document-types/ctps.js',
    'domains/previdenciario/document-types/requerimentoAdministrativo.js',
    'domains/previdenciario/document-types/cartaConcessao.js',
    'domains/previdenciario/document-types/cartaIndeferimento.js',
    'domains/previdenciario/document-types/decisaoAdministrativa.js',
    'domains/previdenciario/document-types/processoJudicial.js',
    'domains/previdenciario/document-types/laudoPericial.js',
    'domains/previdenciario/document-types/ppp.js',
    'domains/previdenciario/document-types/index.js',
    'domains/previdenciario/extraction/extratorVinculosCNIS.js',
    'domains/previdenciario/extraction/extratorRemuneracoesCNIS.js',
    'domains/previdenciario/mapping/mapperPrevidenciario.js',
    'domains/previdenciario/historico/historicoPrevidenciario.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

function carregarHistoricoSemTetoRgps() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    'core/calculoPeriodos.js',
    'domains/previdenciario/motorTempoContribuicao.js',
    // SEM dados-historicos/tetoRgps.js — simula ambiente onde o módulo
    // não foi carregado, pra provar que o fallback antigo continua vivo.
    'domains/previdenciario/document-types/cnis.js',
    'domains/previdenciario/document-types/ctps.js',
    'domains/previdenciario/document-types/requerimentoAdministrativo.js',
    'domains/previdenciario/document-types/cartaConcessao.js',
    'domains/previdenciario/document-types/cartaIndeferimento.js',
    'domains/previdenciario/document-types/decisaoAdministrativa.js',
    'domains/previdenciario/document-types/processoJudicial.js',
    'domains/previdenciario/document-types/laudoPericial.js',
    'domains/previdenciario/document-types/ppp.js',
    'domains/previdenciario/document-types/index.js',
    'domains/previdenciario/extraction/extratorVinculosCNIS.js',
    'domains/previdenciario/extraction/extratorRemuneracoesCNIS.js',
    'domains/previdenciario/mapping/mapperPrevidenciario.js',
    'domains/previdenciario/historico/historicoPrevidenciario.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== TETO DO RGPS HISTÓRICO APLICADO AUTOMATICAMENTE NA CONCOMITÂNCIA REAL ==');

  const sb = carregarHistorico();

  teste('soma de concomitância que EXCEDE o teto histórico da competência é limitada automaticamente ao teto', () => {
    // 2001-07: teto vigente é o de 2001-06 (R$ 1.430,00, Portaria 1.987/2001).
    // 1000 + 800 = 1800, acima do teto -> deve ser limitado a 1430.00.
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00\n' +
      '01/06/2001 a 30/09/2001 - EMPRESA B LTDA (concomitante)\n' +
      '07/2001 R$ 800,00\n';
    const candVinc = sb.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.ok(contribJulho);
    assert.strictEqual(contribJulho.concomitante, true);
    assert.strictEqual(contribJulho.valorAntesDoTetoRgps, 1800, 'a soma real (pré-teto) precisa continuar rastreável');
    assert.strictEqual(contribJulho.aplicouTetoRgpsHistorico, true);
    assert.strictEqual(contribJulho.valor, 1430.00, 'o valor final usado no cálculo precisa ser o teto da competência (Portaria 1.987/2001)');
    assert.ok(contribJulho.limitacaoTetoRgpsHistorico.includes('Portaria 1.987/2001'), 'a nota precisa citar a norma que embasou o teto aplicado');
  });

  teste('soma de concomitância DENTRO do teto histórico não é alterada, mas a nota informa qual teto foi conferido', () => {
    // Mesma competência (teto 1430,00), soma bem abaixo: 500 + 500 = 1000.
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 500,00\n' +
      '01/06/2001 a 30/09/2001 - EMPRESA B LTDA (concomitante)\n' +
      '07/2001 R$ 500,00\n';
    const candVinc = sb.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.strictEqual(contribJulho.valor, 1000, 'sem exceder o teto, a soma real permanece intacta');
    assert.strictEqual(contribJulho.aplicouTetoRgpsHistorico, false);
    assert.strictEqual(contribJulho.valorAntesDoTetoRgps, 1000);
    assert.ok(contribJulho.limitacaoTetoRgpsHistorico.includes('dentro do teto'), 'a nota precisa deixar claro que o teto foi conferido e não precisou ser aplicado');
  });

  teste('sem dados-historicos/tetoRgps.js carregado, cai no aviso antigo de revisão manual (nunca quebra, nunca aplica um teto inventado)', () => {
    const sbSemTeto = carregarHistoricoSemTetoRgps();
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00\n' +
      '01/06/2001 a 30/09/2001 - EMPRESA B LTDA (concomitante)\n' +
      '07/2001 R$ 800,00\n';
    const candVinc = sbSemTeto.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sbSemTeto.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const historico = sbSemTeto.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.strictEqual(contribJulho.valor, 1800, 'sem o módulo carregado, a soma real não é alterada (nunca aplica teto sem fonte confiável)');
    assert.strictEqual(contribJulho.aplicouTetoRgpsHistorico, false);
    assert.ok(contribJulho.limitacaoTetoRgpsHistorico.includes('não está carregado') || contribJulho.limitacaoTetoRgpsHistorico.includes('não pôde ser aplicado'));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
