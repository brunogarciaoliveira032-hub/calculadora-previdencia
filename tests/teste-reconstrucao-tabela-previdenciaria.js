/* ============================================================================
   TESTE-RECONSTRUCAO-TABELA-PREVIDENCIARIA.JS — cobre
   js/domains/previdenciario/extraction/reconstrucaoTabelaPrevidenciaria.js
   (Atualização 53).

   Roda sem dependências externas: `node tests/teste-reconstrucao-tabela-previdenciaria.js`.
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

function carregarModulo() {
  const sandbox = {};
  vm.createContext(sandbox);
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'reconstrucaoTabelaPrevidenciaria.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox.ReconstrucaoTabelaPrevidenciaria;
}

(() => {
  console.log('== EXTRACTION/RECONSTRUCAOTABELAPREVIDENCIARIA.JS ==');
  const R = carregarModulo();

  /* -------------------- TOKENIZAÇÃO -------------------- */

  teste('tokenizarLinha reconhece competência + valor numa linha simples, na ordem em que aparecem', () => {
    const tokens = R.tokenizarLinha('07/2020 R$ 1.500,00');
    assert.strictEqual(tokens.length, 2);
    assert.strictEqual(tokens[0].tipo, 'data_competencia');
    assert.strictEqual(tokens[1].tipo, 'valor_monetario');
  });

  teste('tokenizarLinha reconhece um código entre parênteses como token separado do resto', () => {
    const tokens = R.tokenizarLinha('07/2020 (123) R$ 1.500,00');
    const tipos = semRealm(tokens.map(t => t.tipo));
    assert.deepStrictEqual(tipos, ['data_competencia', 'codigo_ocorrencia', 'valor_monetario']);
  });

  teste('tokenizarLinha reconhece a ordem trocada (valor antes da competência)', () => {
    const tokens = R.tokenizarLinha('R$ 1.500,00 07/2020');
    const tipos = semRealm(tokens.map(t => t.tipo));
    assert.deepStrictEqual(tipos, ['valor_monetario', 'data_competencia']);
  });

  teste('tokenizarLinha reconhece intervalo de datas como um token único (não dois tokens de data separados)', () => {
    const tokens = R.tokenizarLinha('01/01/2010 a 01/01/2020 EMPRESA TESTE LTDA');
    assert.strictEqual(tokens[0].tipo, 'data_intervalo');
    assert.strictEqual(tokens[1].tipo, 'texto_livre');
    assert.strictEqual(tokens[1].valorBruto, 'EMPRESA TESTE LTDA');
  });

  teste('tokenizarLinha nunca deixa dois padrões disputarem o mesmo trecho (intervalo de datas completas não vira duas competências soltas)', () => {
    const tokens = R.tokenizarLinha('01/03/2010 a 01/03/2020 EMPRESA');
    const tiposData = semRealm(tokens.filter(t => t.tipo === 'data_competencia' || t.tipo === 'data_intervalo').map(t => t.tipo));
    assert.deepStrictEqual(tiposData, ['data_intervalo']);
  });

  teste('tokenizarLinha devolve array vazio para linha vazia/sem nenhum padrão', () => {
    assert.deepStrictEqual(semRealm(R.tokenizarLinha('')), []);
    assert.deepStrictEqual(semRealm(R.tokenizarLinha('   ')), []);
    assert.deepStrictEqual(semRealm(R.tokenizarLinha('texto qualquer sem data nem valor')), [{ tipo: 'texto_livre', valorBruto: 'texto qualquer sem data nem valor', posicaoInicio: 0 }]);
  });

  /* -------------------- RECONSTRUÇÃO DE REMUNERAÇÃO -------------------- */

  teste('reconstruirCandidatoRemuneracao reconhece competência + valor com código no meio (caso que a regex de linha inteira rejeitaria)', () => {
    const r = R.reconstruirCandidatoRemuneracao('07/2020 (afastamento) R$ 1.500,00 código extra no fim');
    assert.ok(r);
    assert.strictEqual(r.competencia, '2020-07');
    assert.strictEqual(r.valor, 1500);
    assert.strictEqual(r.codigoOcorrencia, 'afastamento');
    assert.strictEqual(r.reconstruidoPorTokenizacao, true);
    assert.strictEqual(r.status, 'requer_revisao');
    assert.ok(r.confianca < 0.8);
  });

  teste('reconstruirCandidatoRemuneracao reconhece ordem invertida (valor antes da competência)', () => {
    const r = R.reconstruirCandidatoRemuneracao('R$ 2.000,00 08/2021');
    assert.ok(r);
    assert.strictEqual(r.competencia, '2021-08');
    assert.strictEqual(r.valor, 2000);
  });

  teste('reconstruirCandidatoRemuneracao devolve null sem competência OU sem valor', () => {
    assert.strictEqual(R.reconstruirCandidatoRemuneracao('07/2020 sem valor nenhum'), null);
    assert.strictEqual(R.reconstruirCandidatoRemuneracao('R$ 1.500,00 sem competência'), null);
  });

  teste('reconstruirCandidatoRemuneracao rejeita mês inválido', () => {
    assert.strictEqual(R.reconstruirCandidatoRemuneracao('13/2020 R$ 1.500,00'), null);
  });

  teste('reconstruirCandidatoRemuneracao carrega tokensEncontrados e motivoDecisao pra auditoria', () => {
    const r = R.reconstruirCandidatoRemuneracao('07/2020 R$ 1.500,00');
    assert.ok(Array.isArray(r.tokensEncontrados));
    assert.ok(r.tokensEncontrados.length >= 2);
    assert.ok(typeof r.motivoDecisao === 'string' && r.motivoDecisao.length > 0);
  });

  teste('reconstruirCandidatoRemuneracao marca remuneração zerada sem descartar', () => {
    const r = R.reconstruirCandidatoRemuneracao('07/2020 código R$ 0,00');
    assert.ok(r);
    assert.strictEqual(r.valorZerado, true);
    assert.ok(r.conflitos.some(c => c.includes('ausência de contribuição')));
  });

  /* -------------------- RECONSTRUÇÃO DE VÍNCULO -------------------- */

  teste('reconstruirCandidatoVinculo reconhece intervalo de datas + nome de empregador com ruído no meio', () => {
    const r = R.reconstruirCandidatoVinculo('01/03/2010 a 01/06/2020   CNPJ 12.345/0001  EMPRESA TESTE LTDA');
    assert.ok(r);
    assert.strictEqual(r.inicio, '2010-03-01');
    assert.strictEqual(r.fim, '2020-06-01');
    assert.ok(r.empregador.includes('EMPRESA TESTE LTDA'));
    assert.strictEqual(r.reconstruidoPorTokenizacao, true);
    assert.strictEqual(r.status, 'requer_revisao');
  });

  teste('reconstruirCandidatoVinculo reconhece vínculo em aberto ("atual") no lugar da data de fim', () => {
    const r = R.reconstruirCandidatoVinculo('01/03/2015 a atual EMPRESA ATUAL LTDA');
    assert.ok(r);
    assert.strictEqual(r.aberto, true);
    assert.strictEqual(r.fim, null);
  });

  teste('reconstruirCandidatoVinculo devolve null sem nenhum intervalo de datas reconhecível', () => {
    assert.strictEqual(R.reconstruirCandidatoVinculo('EMPRESA SEM NENHUMA DATA'), null);
  });

  teste('reconstruirCandidatoVinculo sinaliza conflito quando não sobra nome de empregador reconhecível', () => {
    const r = R.reconstruirCandidatoVinculo('01/03/2010 a 01/06/2020');
    assert.ok(r);
    assert.ok(r.conflitos.some(c => c.includes('empregador')));
  });

  teste('reconstruirCandidatoVinculo sinaliza conflito quando início é posterior ao fim (possível inversão)', () => {
    const r = R.reconstruirCandidatoVinculo('01/06/2020 a 01/03/2010 EMPRESA LTDA');
    assert.ok(r);
    assert.ok(r.conflitos.some(c => c.includes('inversão')));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
