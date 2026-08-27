/* ============================================================================
   TESTE-CONCOMITANCIA-PENDENCIA-PREVIDENCIARIA.JS — cobre o item 3 do
   checklist de melhorias ("Cobertura de Cenários Complexos nos Motores de
   Cálculo — RMI e Concomitância"):

     1. historicoPrevidenciario.js — competência coberta por DOIS OU MAIS
        vínculos simultâneos, com mais de uma remuneração lançada nela,
        precisa somar os salários de contribuição (Art. 32, Lei 8.213/91)
        e marcar `.concomitante: true` — NUNCA descartar uma das
        remunerações silenciosamente (comportamento antigo);
     2. essa mesma competência precisa continuar distinta de uma
        AMBIGUIDADE comum (retificação/duplicidade sob o mesmo vínculo),
        que continua `.ambigua: true` e não é somada;
     3. `.codigoOcorrencia` (já extraído, antes descartado) precisa
        chegar até `contribuicoes[].codigosOcorrencia`, e um código com
        indício textual de pendência precisa virar `.possivelPendencia`;
     4. motorSalarioBeneficio.js precisa: (a) NUNCA excluir competência
        concomitante por padrão (é regra legal, não problema de dado);
        (b) excluir por padrão competência com possível pendência, só
        incluindo com `opcoes.incluirComPendencia`; (c) carregar os dois
        avisos até a memória de cálculo, para a UI poder mostrar (item 2
        do checklist, já entregue).

   Roda sem dependências externas: `node tests/teste-concomitancia-pendencia-previdenciaria.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

function teste(nome, fn) {
  totalTestes++;
  const resultado = fn();
  const finalizar = (erro) => {
    if (erro) {
      totalFalhas++;
      console.log(`FALHA ${nome}`);
      console.log(`      ${erro.stack || erro.message}`);
    } else {
      console.log(`  OK  ${nome}`);
    }
  };
  if (resultado && typeof resultado.then === 'function') {
    return resultado.then(() => finalizar(null), finalizar);
  }
  finalizar(null);
  return Promise.resolve();
}

function carregarHistorico() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    'core/calculoPeriodos.js',
    'domains/previdenciario/motorTempoContribuicao.js',
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

// Série sintética mínima para o motor de correção INPC (mesmo padrão de
// tests/teste-motor-salario-beneficio.js).
const DADOS_INPC_MOCK = [
  { data: '01/07/2001', valor: '0,00' }
];

function carregarMotorSalario(mockBuscarSerie) {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    'core/util.js',
    'core/indices.js',
    'domains/previdenciario/correcao/correcaoINPCPrevidenciario.js',
    'domains/previdenciario/motorSalarioBeneficio.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  sandbox.buscarSerieBcbComCache = mockBuscarSerie;
  return sandbox;
}

function mockSerieOk() {
  return async () => ({ dados: DADOS_INPC_MOCK, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' });
}

(async () => {
  console.log('== CONCOMITÂNCIA REAL E POSSÍVEL PENDÊNCIA (item 3 do checklist) ==');

  const sbHist = carregarHistorico();

  await teste('dois empregos simultâneos (vínculos sobrepostos por vários meses), cada um com remuneração própria na mesma competência: soma os dois, marca .concomitante (não .ambigua)', () => {
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00\n' +
      '01/06/2001 a 30/09/2001 - EMPRESA B LTDA (concomitante)\n' +
      '07/2001 R$ 800,00\n';
    const candVinc = sbHist.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sbHist.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    assert.strictEqual(candVinc.length, 2, 'os dois vínculos precisam ser reconhecidos pelo extrator');
    assert.strictEqual(candRem.length, 2, 'as duas remunerações de 07/2001 precisam ser reconhecidas separadamente');

    const historico = sbHist.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    assert.strictEqual(historico.vinculos.length, 2);

    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.ok(contribJulho, 'precisa existir uma contribuição consolidada para 07/2001');
    assert.strictEqual(contribJulho.ambigua, false, 'concomitância real NUNCA é tratada como ambiguidade de dado');
    assert.strictEqual(contribJulho.concomitante, true);
    assert.strictEqual(contribJulho.valor, 1800, 'valor precisa ser a SOMA dos dois salários (1000 + 800), nunca só um deles');
    assert.strictEqual(contribJulho.remuneracaoIds.length, 2, 'as duas remunerações de origem precisam ficar rastreáveis');
    assert.ok(contribJulho.limitacaoTetoRgpsHistorico, 'precisa vir com o aviso sobre o teto do RGPS histórico não aplicado');
    assert.strictEqual(contribJulho.vinculosConcomitantesIds.length, 2);
  });

  await teste('mesmo vínculo com duas remunerações na mesma competência (retificação/duplicidade): continua .ambigua, NÃO soma', () => {
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00\n' +
      '07/2001 R$ 1.100,00\n'; // provável retificação do mesmo vínculo, mesmo mês
    const candVinc = sbHist.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sbHist.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const historico = sbHist.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.ok(contribJulho);
    assert.strictEqual(contribJulho.ambigua, true, 'só um vínculo ativo no mês — não é concomitância real, é ambiguidade de dado');
    assert.strictEqual(contribJulho.concomitante, false);
    assert.strictEqual(contribJulho.valor, 1000, 'ambiguidade nunca soma — usa a primeira ocorrência como referência, igual ao comportamento já existente');
  });

  await teste('código de ocorrência com indício textual de pendência propaga até a contribuição como .possivelPendencia', () => {
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00 (Pendente)\n';
    const candVinc = sbHist.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sbHist.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    assert.strictEqual(candRem[0].codigoOcorrencia, 'Pendente');

    const historico = sbHist.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.strictEqual(contribJulho.possivelPendencia, true);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(contribJulho.codigosOcorrencia)), ['Pendente']);
  });

  await teste('código de ocorrência SEM termo de pendência não é sinalizado (não inventa alerta por qualquer anotação)', () => {
    const texto =
      '01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' +
      '07/2001 R$ 1.000,00 (Licença maternidade)\n';
    const candVinc = sbHist.extrairVinculosDoTexto(texto, { numero: 1 });
    const candRem = sbHist.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    const historico = sbHist.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    const contribJulho = historico.contribuicoes.find(c => c.competencia === '2001-07');
    assert.strictEqual(contribJulho.possivelPendencia, false);
  });

  // ---- motorSalarioBeneficio.js: concomitância nunca excluída por padrão; pendência excluída por padrão ----

  await teste('motorSalarioBeneficio.js NUNCA exclui competência concomitante por padrão (é regra legal, não problema de dado)', async () => {
    const sb = carregarMotorSalario(mockSerieOk());
    const historico = {
      contribuicoes: [
        { id: 'c1', competencia: '2001-07', valor: 1800, vinculoId: null, remuneracaoIds: ['r1', 'r2'], ambigua: false, concomitante: true, limitacaoTetoRgpsHistorico: 'aviso de teto', possivelPendencia: false, codigosOcorrencia: [] }
      ],
      remuneracoes: []
    };
    const resultado = await sb.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-07' });
    assert.strictEqual(resultado.salarioBeneficio, 1800, 'a única competência (concomitante) precisa ter entrado no cálculo, sem correção pois o índice mockado é 0%');
    assert.strictEqual(resultado.ignoradas.length, 0);
    assert.strictEqual(resultado.memoria[0].concomitante, true, 'a memória de cálculo precisa carregar o aviso de concomitância até a UI (item 2 do checklist)');
    assert.strictEqual(resultado.memoria[0].limitacaoTetoRgpsHistorico, 'aviso de teto');
  });

  await teste('motorSalarioBeneficio.js exclui por padrão competência com possível pendência, e inclui só com opcoes.incluirComPendencia', async () => {
    const historico = {
      contribuicoes: [
        { id: 'c1', competencia: '2001-07', valor: 1000, vinculoId: 'v1', remuneracaoIds: ['r1'], ambigua: false, concomitante: false, possivelPendencia: true, codigosOcorrencia: ['Pendente'] }
      ],
      remuneracoes: []
    };

    const sbExcluida = carregarMotorSalario(mockSerieOk());
    const resultadoExcluida = await sbExcluida.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-07' });
    assert.strictEqual(resultadoExcluida.salarioBeneficio, null, 'sem opcoes.incluirComPendencia, a única competência pendente precisa deixar o cálculo bloqueado');
    assert.strictEqual(resultadoExcluida.ignoradas.length, 1);
    assert.ok(resultadoExcluida.ignoradas[0].motivo.includes('pendência'));

    const sbIncluida = carregarMotorSalario(mockSerieOk());
    const resultadoIncluida = await sbIncluida.calcularSalarioBeneficio(historico, { competenciaReferencia: '2001-07', incluirComPendencia: true });
    assert.strictEqual(resultadoIncluida.salarioBeneficio, 1000, 'com incluirComPendencia, a competência entra normalmente');
    assert.strictEqual(resultadoIncluida.memoria[0].possivelPendencia, true, 'mesmo incluída, a memória de cálculo precisa continuar mostrando o alerta (nunca escondido)');
  });

  console.log(`\n${totalTestes - totalFalhas}/${totalTestes} testes passaram.`);
  if (totalFalhas > 0) process.exit(1);
})();
