/* ============================================================================
   TESTE-HISTORICO-PREVIDENCIARIO.JS — cobre js/domains/previdenciario/
   historico/historicoPrevidenciario.js (Atualização 16 — HistoricoPrevi-
   denciario como ENTIDADE consolidada: segurado, vinculos, remuneracoes,
   contribuicoes, beneficios, periodosEspeciais, periodosRurais,
   documentos, proveniencia).

   Roda sem dependências externas: `node tests/teste-historico-previdenciario.js`.
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

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorTempoContribuicao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cnis.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'ctps.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'requerimentoAdministrativo.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cartaConcessao.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'cartaIndeferimento.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'decisaoAdministrativa.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'processoJudicial.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'laudoPericial.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'ppp.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', 'index.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorVinculosCNIS.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorRemuneracoesCNIS.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'mapping', 'mapperPrevidenciario.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'historico', 'historicoPrevidenciario.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

// Vínculo único de 6 meses (03/2001 a 08/2001), remuneração lançada só em
// 4 dos 6 meses (05 e 06/2001 faltam) — diferencia carência aproximada
// (span do vínculo) de carência por remuneração (evidência real).
const TEXTO_CNIS_COM_LACUNA =
  'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' +
  'Relação de vínculos/contribuições\n' +
  '01/03/2001 a 31/08/2001 - EMPRESA X LTDA\n' +
  '03/2001 R$ 1.200,00\n' +
  '04/2001 R$ 1.200,00\n' +
  '07/2001 R$ 1.250,00\n' +
  '08/2001 R$ 1.250,00\n';

(() => {
  console.log('== INTEGRAÇÃO — HistoricoPrevidenciario (entidade consolidada) ==');
  const sb = carregar();

  teste('montarHistorico devolve exatamente os 9 campos da entidade pedida (+ ignorados, auditável)', () => {
    const historico = sb.montarHistorico({}, {});
    const chaves = Object.keys(historico).sort();
    assert.deepStrictEqual(chaves, [
      'beneficios', 'contribuicoes', 'documentos', 'ignorados',
      'periodosEspeciais', 'periodosRurais', 'proveniencia',
      'remuneracoes', 'segurado', 'vinculos'
    ].sort());
  });

  teste('segurado vem null quando não informado, e passa adiante quando informado', () => {
    assert.deepStrictEqual(semRealm(sb.montarHistorico({}, {}).segurado), { nome: null, cpf: null, nascimento: null });
    const comSegurado = sb.montarHistorico({ segurado: { nome: 'JOÃO DA SILVA', cpf: null, nascimento: '1970-01-01' } }, {});
    assert.strictEqual(comSegurado.segurado.nome, 'JOÃO DA SILVA');
  });

  teste('vínculos e remunerações recebem id, e a remuneração é associada ao vínculo pela competência', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    assert.strictEqual(historico.vinculos.length, 1);
    assert.strictEqual(historico.vinculos[0].id, 'v1');
    assert.strictEqual(historico.remuneracoes.length, 4);
    historico.remuneracoes.forEach(r => assert.strictEqual(r.vinculoId, 'v1'));
  });

  teste('contribuições são derivadas por competência (só as com remuneração > 0), 4 no cenário de lacuna', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    assert.strictEqual(historico.contribuicoes.length, 4);
    assert.deepStrictEqual(semRealm(historico.contribuicoes.map(c => c.competencia)), ['2001-03', '2001-04', '2001-07', '2001-08']);
    historico.contribuicoes.forEach(c => assert.strictEqual(c.vinculoId, 'v1'));
  });

  teste('remuneração sem vínculo correspondente entra com vinculoId null (nunca é descartada)', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto('12/2010 R$ 1.500,00\n', { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    assert.strictEqual(historico.remuneracoes.length, 1);
    assert.strictEqual(historico.remuneracoes[0].vinculoId, null);
    // ainda vira contribuição (contribuinte pode não ter vínculo empregatício associável)
    assert.strictEqual(historico.contribuicoes.length, 1);
    assert.strictEqual(historico.contribuicoes[0].vinculoId, null);
  });

  teste('competência em DOIS vínculos concomitantes: remuneração fica com vinculoId null mas lista os dois em vinculosCorrespondentes; contribuição correspondente fica ambigua', () => {
    const textoSobreposto =
      '01/03/2001 a 31/12/2001 - EMPRESA A\n' +
      '01/06/2001 a 30/09/2001 - EMPRESA B (concomitante)\n' +
      '07/2001 R$ 1.000,00\n';
    const candVinc = sb.extrairVinculosDoTexto(textoSobreposto, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(textoSobreposto, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});

    assert.strictEqual(historico.vinculos.length, 2);
    assert.strictEqual(historico.remuneracoes.length, 1);
    assert.strictEqual(historico.remuneracoes[0].vinculoId, null);
    assert.strictEqual(historico.remuneracoes[0].vinculosCorrespondentes.length, 2);
    // duas remunerações de fato existiriam se o CNIS listasse a mesma competência
    // sob os dois vínculos separadamente; aqui é uma única linha compartilhada,
    // então vira 1 contribuição (não ambigua por duplicidade de LANÇAMENTO,
    // só sem vínculo único determinado).
    assert.strictEqual(historico.contribuicoes.length, 1);
    assert.strictEqual(historico.contribuicoes[0].vinculoId, null);
  });

  teste('beneficios/periodosEspeciais/periodosRurais: sem entrada, ficam vazios; com candidatos "validado", passam; com "requer_revisao", ficam de fora por padrão', () => {
    const vazio = sb.montarHistorico({}, {});
    assert.strictEqual(vazio.beneficios.length, 0);
    assert.strictEqual(vazio.periodosEspeciais.length, 0);
    assert.strictEqual(vazio.periodosRurais.length, 0);

    const comCandidatos = sb.montarHistorico({
      beneficios: [{ tipo: 'beneficio', status: 'validado', numeroBeneficio: '123' }, { tipo: 'beneficio', status: 'requer_revisao', numeroBeneficio: '456' }],
      periodosEspeciais: [{ tipo: 'periodoEspecial', status: 'validado' }]
    }, {});
    assert.strictEqual(comCandidatos.beneficios.length, 1);
    assert.strictEqual(comCandidatos.beneficios[0].numeroBeneficio, '123');
    assert.strictEqual(comCandidatos.periodosEspeciais.length, 1);
  });

  teste('documentos é um manifesto único de fonte (documento+página+arquivo), independente de status de validação', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 5, arquivo: 'cnis.pdf' });
    const candRem = sb.extrairRemuneracoesDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 5, arquivo: 'cnis.pdf' });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    assert.strictEqual(historico.documentos.length, 1);
    assert.strictEqual(historico.documentos[0].documento, 'CNIS');
    assert.strictEqual(historico.documentos[0].pagina, 5);
    assert.strictEqual(historico.documentos[0].arquivo, 'cnis.pdf');
  });

  teste('proveniencia tem um registro rastreável por vínculo, remuneração e contribuição consolidados', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    // 1 vínculo + 4 remunerações + 4 contribuições = 9 registros de proveniência
    assert.strictEqual(historico.proveniencia.length, 9);
    const provVinculo = historico.proveniencia.find(p => p.tipo === 'vinculo');
    assert.strictEqual(provVinculo.refId, 'v1');
    assert.strictEqual(provVinculo.fonte.documento, 'CNIS');
    assert.ok(provVinculo.confianca > 0);
  });

  teste('candidato requer_revisao fica em ignorados por padrão, sem sumir sem explicação', () => {
    const candidatoRuim = sb.extrairVinculoDeLinha('30/06/2008 a 01/03/2001 - EMPRESA INVERTIDA LTDA');
    const historico = sb.montarHistorico({ vinculos: [candidatoRuim] }, {});
    assert.strictEqual(historico.vinculos.length, 0);
    assert.strictEqual(historico.ignorados.vinculos.length, 1);
  });

  teste('calcularTempoEcarenciaDeHistorico devolve tempo de contribuição e as duas carências lado a lado (aproximada 6 meses x por remuneração 4 meses)', () => {
    const candVinc = sb.extrairVinculosDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const candRem = sb.extrairRemuneracoesDoTexto(TEXTO_CNIS_COM_LACUNA, { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc, remuneracoes: candRem }, {});
    const r = sb.calcularTempoEcarenciaDeHistorico(historico, {});

    assert.ok(r.tempoContribuicao, 'deveria calcular tempo de contribuição');
    assert.strictEqual(r.carenciaAproximadaPorVinculo.totalMeses, 6);
    assert.strictEqual(r.carenciaPorRemuneracao.totalMeses, 4);
  });

  teste('sem nenhum dado de remuneração, carenciaPorRemuneracao fica null (nunca inventa um número)', () => {
    const candVinc = sb.extrairVinculosDoTexto('01/03/2001 a 31/08/2001 - EMPRESA SEM REMUNERAÇÃO LANÇADA\n', { numero: 1 });
    const historico = sb.montarHistorico({ vinculos: candVinc }, {});
    const r = sb.calcularTempoEcarenciaDeHistorico(historico, {});
    assert.strictEqual(r.carenciaPorRemuneracao, null);
    assert.ok(r.carenciaAproximadaPorVinculo, 'a aproximada continua disponível mesmo sem remuneração');
  });

  teste('histórico vazio não lança erro e devolve tudo null no cálculo', () => {
    const r = sb.calcularTempoEcarenciaDeHistorico(sb.montarHistorico({}, {}), {});
    assert.strictEqual(r.tempoContribuicao, null);
    assert.strictEqual(r.carenciaAproximadaPorVinculo, null);
    assert.strictEqual(r.carenciaPorRemuneracao, null);
  });

  teste('entrada ausente/malformada (undefined, tipos errados) nunca lança erro', () => {
    assert.doesNotThrow(() => sb.montarHistorico(undefined, undefined));
    assert.doesNotThrow(() => sb.montarHistorico(null, null));
    assert.doesNotThrow(() => sb.montarHistorico({ vinculos: 'não é array', remuneracoes: 123 }, {}));
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
