/* ============================================================================
   TESTE-CLASSIFICADOR-TIPO-DOCUMENTO-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/document-types/*.js. Atualização 13: primeiro
   tipo documental real (cnis). Atualização 21: catálogo expandido para os
   9 tipos documentais já catalogados em dicionarioPrevidenciario.js (ctps,
   requerimentoAdministrativo, cartaConcessao, cartaIndeferimento,
   decisaoAdministrativa, processoJudicial, laudoPericial, ppp) — os novos
   testes cobrem sobretudo as exclusões que evitam colisão entre tipos
   parecidos (concessão x indeferimento, administrativa x judicial, laudo x
   sentença que só cita o laudo).

   Roda sem dependências externas: `node tests/teste-classificador-tipo-documento-previdenciario.js`.
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

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    'cnis.js', 'ctps.js', 'requerimentoAdministrativo.js', 'cartaConcessao.js',
    'cartaIndeferimento.js', 'decisaoAdministrativa.js', 'processoJudicial.js',
    'laudoPericial.js', 'ppp.js', 'index.js'
  ].map(f => path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'document-types', f));
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== DOCUMENT-TYPES/PREVIDENCIARIO (classificador de tipo documental) ==');
  const sb = carregar();

  teste('catálogo tem exatamente 9 tipos documentais (Atualização 21)', () => {
    assert.strictEqual(sb.DOC_TIPOS_PREVIDENCIARIOS.length, 9);
    const esperados = [
      'cartaConcessao', 'cartaIndeferimento', 'cnis', 'ctps',
      'decisaoAdministrativa', 'laudoPericial', 'ppp',
      'processoJudicial', 'requerimentoAdministrativo'
    ];
    const ids = sb.DOC_TIPOS_PREVIDENCIARIOS.map(t => t.id);
    esperados.forEach(id => assert.ok(ids.includes(id), `catálogo deveria conter "${id}"`));
    assert.strictEqual(ids.length, esperados.length);
  });

  teste('reconhece um extrato CNIS real pelo cabeçalho oficial', () => {
    const texto = 'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\nRelação de vínculos/contribuições\nNIT: 123.45678.90-1';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'cnis');
    assert.ok(r.confianca >= 0.7, `confiança esperada alta, veio ${r.confianca}`);
  });

  teste('NÃO reconhece como CNIS um texto de carta de concessão que só cita o CNIS de passagem (Atualização 21: agora reconhece corretamente como cartaConcessao, já que esse tipo passou a existir no catálogo)', () => {
    const texto = 'CARTA DE CONCESSÃO. Benefício concedido com base nos dados constantes no CNIS do segurado.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'cnis', 'sinal de exclusão (carta de concessão) deveria zerar a pontuação de CNIS');
    assert.strictEqual(r.id, 'cartaConcessao');
  });

  teste('NÃO reconhece como CNIS uma sentença que cita "CNIS" apenas de passagem, sem os sinais estruturais do extrato (Atualização 21: agora reconhece corretamente como processoJudicial)', () => {
    const texto = 'SENTENÇA. Analisado o CNIS acostado aos autos, julgo procedente o pedido.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'cnis', 'sinal de exclusão (sentença/acórdão) deveria zerar a pontuação de CNIS');
    assert.strictEqual(r.id, 'processoJudicial');
  });

  teste('texto vazio/ausente nunca lança erro, devolve null', () => {
    assert.strictEqual(sb.identificarTipoDocumentoPrevidenciario(''), null);
    assert.strictEqual(sb.identificarTipoDocumentoPrevidenciario(null), null);
    assert.strictEqual(sb.identificarTipoDocumentoPrevidenciario(undefined), null);
  });

  teste('classificarTipoDocumentoPrevidenciario devolve confiança 0 (não lança) para texto sem nenhum sinal', () => {
    const ranking = sb.classificarTipoDocumentoPrevidenciario('texto qualquer sem relação nenhuma com o domínio');
    assert.strictEqual(ranking.length, 9);
    ranking.forEach(r => assert.strictEqual(r.confianca, 0));
  });

  teste('tipoDocumentalPrevidenciarioPorId acha o cnis e devolve null para id desconhecido', () => {
    assert.strictEqual(sb.tipoDocumentalPrevidenciarioPorId('cnis').name.includes('CNIS'), true);
    assert.strictEqual(sb.tipoDocumentalPrevidenciarioPorId('inexistente'), null);
  });

  teste('reconhece uma CTPS real pela página de contrato de trabalho', () => {
    const texto = 'CARTEIRA DE TRABALHO E PREVIDÊNCIA SOCIAL\nContrato de Trabalho\nAdmissão: 03/04/1998\nFunção: Auxiliar Administrativo\nAnotações Gerais';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'ctps');
  });

  teste('NÃO reconhece como CTPS um extrato CNIS que cita "conforme CTPS anexa" de passagem', () => {
    const texto = 'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS. Vínculo comprovado conforme CTPS anexa.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'ctps', 'sinal de exclusão do CNIS deveria impedir CTPS aqui');
  });

  teste('reconhece um requerimento administrativo pela DER', () => {
    const texto = 'REQUERIMENTO ADMINISTRATIVO\nData de Entrada do Requerimento: 10/01/2023\nDER: 10/01/2023\nProtocolo nº 123456789';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'requerimentoAdministrativo');
  });

  teste('reconhece uma carta de concessão pelo NB e espécie', () => {
    const texto = 'CARTA DE CONCESSÃO\nConcessão de Benefício\nNB: 123.456.789-0\nEspécie: 42 - Aposentadoria por Tempo de Contribuição\nRenda Mensal Inicial: R$ 2.500,00';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'cartaConcessao');
  });

  teste('NÃO reconhece como carta de concessão uma carta de indeferimento', () => {
    const texto = 'CARTA DE CONCESSÃO. Benefício não concedido. Indeferimento do pedido.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'cartaConcessao', 'sinal de indeferimento deveria excluir concessão');
  });

  teste('reconhece uma carta de indeferimento pelo motivo', () => {
    const texto = 'COMUNICADO DE DECISÃO\nIndeferimento\nMotivo do Indeferimento: carência não cumprida';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'cartaIndeferimento');
  });

  teste('reconhece uma decisão administrativa (JRPS) pela junta de recursos', () => {
    const texto = 'JUNTA DE RECURSOS DA PREVIDÊNCIA SOCIAL\nRecurso Administrativo\nA turma decide: mantém a decisão recorrida.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'decisaoAdministrativa');
  });

  teste('NÃO reconhece como decisão administrativa uma sentença de vara federal', () => {
    const texto = 'JUNTA DE RECURSOS. Vara Federal. Sentença. Julgo procedente o pedido.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'decisaoAdministrativa', 'sinal de vara federal/sentença deveria excluir decisão administrativa');
  });

  teste('reconhece um processo judicial pela vara federal e sentença', () => {
    const texto = '1ª VARA FEDERAL\nProcesso nº 5001234-56.2022.4.04.7000\nAutor: João da Silva\nRéu: INSS - Instituto Nacional do Seguro Social\nSENTENÇA. Julgo procedente o pedido.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'processoJudicial');
  });

  teste('NÃO reconhece como processo judicial uma decisão da junta de recursos', () => {
    const texto = 'CONSELHO DE RECURSOS DA PREVIDÊNCIA SOCIAL. Processo nº 12345. Recurso Administrativo. Reforma a decisão.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'processoJudicial', 'sinal de conselho de recursos deveria excluir processo judicial');
  });

  teste('reconhece um laudo pericial pelos quesitos e data de início da incapacidade', () => {
    const texto = 'LAUDO PERICIAL\nPerito: Dr. Fulano\nQuesitos\nData de Início da Incapacidade: 05/06/2021\nIncapacidade total e temporária. CID: M54';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'laudoPericial');
  });

  teste('NÃO reconhece como laudo pericial uma sentença que só cita o laudo de passagem', () => {
    const texto = 'SENTENÇA. Vara Federal. Considerando o laudo pericial acostado, julgo procedente o pedido.';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.notStrictEqual(r && r.id, 'laudoPericial', 'sinal de sentença deveria excluir laudo pericial');
  });

  teste('reconhece um PPP pelos agentes nocivos e responsável técnico', () => {
    const texto = 'PERFIL PROFISSIOGRÁFICO PREVIDENCIÁRIO - PPP\nAgentes Nocivos: ruído\nResponsável pelos Registros Ambientais: Fulano, Eng. de Segurança';
    const r = sb.identificarTipoDocumentoPrevidenciario(texto);
    assert.ok(r, 'deveria reconhecer');
    assert.strictEqual(r.id, 'ppp');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
