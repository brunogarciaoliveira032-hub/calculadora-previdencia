/* ============================================================================
   TESTE-RECONSTRUCAO-TABELA-INTEGRADA-EXTRATORES.JS — cobre a integração
   da 3ª camada de fallback (extraction/reconstrucaoTabelaPrevidenciaria.js,
   Atualização 53) dentro de extrairRemuneracoesDoTexto() e
   extrairVinculosDoTexto() — casos que a regex de linha inteira (1ª
   camada) e o fallback de duas linhas (2ª camada, só em
   remuneracoesCNIS) REJEITAM, mas que a reconstrução por tokenização
   resolve.

   Roda sem dependências externas: `node tests/teste-reconstrucao-tabela-integrada-extratores.js`.
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
    console.log(`      ${erro.stack || erro.message}`);
  }
}

function carregarArquivo(sandbox, ...partesCaminho) {
  const caminho = path.join(__dirname, '..', ...partesCaminho);
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
}

function carregarComReconstrucao() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'extraction', 'reconstrucaoTabelaPrevidenciaria.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'extraction', 'extratorRemuneracoesCNIS.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'extraction', 'extratorVinculosCNIS.js');
  return sandbox;
}

function carregarSemReconstrucao() {
  const sandbox = {};
  vm.createContext(sandbox);
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'extraction', 'extratorRemuneracoesCNIS.js');
  carregarArquivo(sandbox, 'js', 'domains', 'previdenciario', 'extraction', 'extratorVinculosCNIS.js');
  return sandbox;
}

(() => {
  console.log('== 3ª CAMADA DE FALLBACK (RECONSTRUÇÃO TOKENIZADA) INTEGRADA AOS DOIS EXTRATORES ==');

  const sb = carregarComReconstrucao();

  teste('extrairRemuneracoesDoTexto usa a reconstrução tokenizada quando há código entre a competência e o valor (1ª camada rejeitaria)', () => {
    const texto = '07/2020 (afastamento) R$ 1.500,00';
    const candidatos = sb.extrairRemuneracoesDoTexto(texto, { numero: 3, arquivo: 'cnis-real.pdf' });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].competencia, '2020-07');
    assert.strictEqual(candidatos[0].valor, 1500);
    assert.strictEqual(candidatos[0].reconstruidoPorTokenizacao, true);
    assert.strictEqual(candidatos[0].status, 'requer_revisao');
    assert.strictEqual(candidatos[0].fonte.pagina, 3);
    assert.strictEqual(candidatos[0].fonte.arquivo, 'cnis-real.pdf');
  });

  teste('extrairRemuneracoesDoTexto usa a reconstrução tokenizada quando a ordem está trocada (valor antes da competência)', () => {
    const candidatos = sb.extrairRemuneracoesDoTexto('R$ 2.000,00 08/2021', { numero: 1 });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].competencia, '2021-08');
    assert.strictEqual(candidatos[0].valor, 2000);
  });

  teste('extrairRemuneracoesDoTexto prioriza a 1ª camada (linha normal) sobre a reconstrução quando a linha já bate no padrão estrito', () => {
    const candidatos = sb.extrairRemuneracoesDoTexto('07/2020 R$ 1.500,00', { numero: 1 });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].reconstruidoPorTokenizacao, undefined, 'não deveria precisar do fallback pra uma linha já no padrão normal');
  });

  teste('extrairRemuneracoesDoTexto combina as 3 camadas no mesmo texto sem duplicar nem perder nenhuma competência', () => {
    const texto = [
      '01/2020 R$ 1.000,00',           // 1ª camada (linha normal)
      '02/2020',                        // 2ª camada (fallback de 2 linhas)
      'R$ 1.100,00',
      '03/2020 (123) R$ 1.200,00'       // 3ª camada (reconstrução tokenizada)
    ].join('\n');
    const candidatos = sb.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const competencias = candidatos.map(c => c.competencia).sort();
    assert.deepStrictEqual(semRealm(competencias), ['2020-01', '2020-02', '2020-03']);
  });

  teste('extrairVinculosDoTexto usa a reconstrução tokenizada quando o nome do empregador vem ANTES da data (1ª camada, ancorada no início da linha, rejeitaria)', () => {
    const texto = 'EMPRESA REAL LTDA 01/03/2010 a 01/06/2020';
    const candidatos = sb.extrairVinculosDoTexto(texto, { numero: 2, arquivo: 'cnis-real.pdf' });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].inicio, '2010-03-01');
    assert.strictEqual(candidatos[0].fim, '2020-06-01');
    assert.ok(candidatos[0].empregador.includes('EMPRESA REAL LTDA'));
    assert.strictEqual(candidatos[0].reconstruidoPorTokenizacao, true);
    assert.strictEqual(candidatos[0].fonte.pagina, 2);
  });

  teste('extrairVinculosDoTexto prioriza a 1ª camada quando a linha já bate no padrão estrito', () => {
    const candidatos = sb.extrairVinculosDoTexto('01/03/2010 a 01/06/2020 EMPRESA NORMAL LTDA', { numero: 1 });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].reconstruidoPorTokenizacao, undefined);
  });

  teste('sem o módulo de reconstrução carregado, os extratores continuam funcionando normalmente (defensivo, sem erro)', () => {
    const sbSemReconstrucao = carregarSemReconstrucao();
    const candidatosRem = sbSemReconstrucao.extrairRemuneracoesDoTexto('07/2020 (código) R$ 1.500,00', { numero: 1 });
    assert.strictEqual(candidatosRem.length, 0, 'sem reconstrução carregada, este caso continua não sendo extraído — comportamento antigo preservado');

    const candidatosNormal = sbSemReconstrucao.extrairRemuneracoesDoTexto('07/2020 R$ 1.500,00', { numero: 1 });
    assert.strictEqual(candidatosNormal.length, 1, 'a 1ª camada continua funcionando sem o módulo de reconstrução');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
