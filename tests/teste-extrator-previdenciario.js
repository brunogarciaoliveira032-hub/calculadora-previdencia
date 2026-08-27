/* ============================================================================
   TESTE-EXTRATOR-PREVIDENCIARIO.JS — cobre js/domains/previdenciario/
   extraction/extratorVinculosCNIS.js (Atualização 13 — primeiro extrator
   real do domínio previdenciário: PDF-texto -> candidatos de vínculo).

   Roda sem dependências externas: `node tests/teste-extrator-previdenciario.js`.
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
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorVinculosCNIS.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

const TEXTO_CNIS_EXEMPLO =
  'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' +
  'Relação de vínculos/contribuições\n' +
  'NIT: 123.45678.90-1  Nome: JOÃO DA SILVA\n' +
  '01/03/2001 a 30/06/2008 - EMPRESA X LTDA\n' +
  '01/08/2008 a 15/02/2015 - COMÉRCIO Y EIRELI\n' +
  '01/03/2015 a atual - INDÚSTRIA Z S.A.\n';

(() => {
  console.log('== EXTRAÇÃO/EXTRATORVINCULOSCNIS.JS ==');
  const sb = carregar();

  teste('extrai uma linha simples de vínculo no formato exato do exemplo do produto', () => {
    const v = sb.extrairVinculoDeLinha('01/03/2001 a 30/06/2008 — EMPRESA X');
    assert.ok(v);
    assert.strictEqual(v.tipo, 'vinculo');
    assert.strictEqual(v.empregador, 'EMPRESA X');
    assert.strictEqual(v.inicio, '2001-03-01');
    assert.strictEqual(v.fim, '2008-06-30');
    assert.strictEqual(v.aberto, false);
    assert.strictEqual(v.status, 'validado');
    assert.ok(v.confianca >= 0.8, `confiança esperada alta, veio ${v.confianca}`);
  });

  teste('aceita "até" como conector entre as datas', () => {
    const v = sb.extrairVinculoDeLinha('10/01/1999 até 20/05/2003 - OUTRA EMPRESA LTDA');
    assert.ok(v);
    assert.strictEqual(v.inicio, '1999-01-10');
    assert.strictEqual(v.fim, '2003-05-20');
  });

  teste('reconhece vínculo em aberto ("atual") sem lançar erro e sem inventar uma data de fim', () => {
    const v = sb.extrairVinculoDeLinha('01/03/2015 a atual - INDÚSTRIA Z S.A.');
    assert.ok(v);
    assert.strictEqual(v.aberto, true);
    assert.strictEqual(v.fim, null);
  });

  teste('linha sem nenhum padrão de vínculo devolve null (não força um palpite)', () => {
    assert.strictEqual(sb.extrairVinculoDeLinha('Consulta realizada em 10/08/2026 às 14:32'), null);
    assert.strictEqual(sb.extrairVinculoDeLinha(''), null);
    assert.strictEqual(sb.extrairVinculoDeLinha(null), null);
  });

  teste('datas invertidas (início depois do fim) ainda é extraído, mas com conflito e status requer_revisao — nunca descartado silenciosamente', () => {
    const v = sb.extrairVinculoDeLinha('30/06/2008 a 01/03/2001 - EMPRESA INVERTIDA LTDA');
    assert.ok(v);
    assert.strictEqual(v.status, 'requer_revisao');
    assert.ok(v.conflitos.length > 0);
  });

  teste('nome de empregador vazio/sem conteúdo textual reduz a confiança e marca requer_revisao', () => {
    const v = sb.extrairVinculoDeLinha('01/03/2001 a 30/06/2008 - 12345');
    assert.ok(v);
    assert.strictEqual(v.status, 'requer_revisao');
  });

  teste('extrairVinculosDoTexto encontra os 3 vínculos do texto-exemplo de CNIS, anexando fonte.documento e fonte.pagina', () => {
    const candidatos = sb.extrairVinculosDoTexto(TEXTO_CNIS_EXEMPLO, { numero: 3, arquivo: 'cnis.pdf' });
    assert.strictEqual(candidatos.length, 3);
    candidatos.forEach(c => {
      assert.strictEqual(c.fonte.documento, 'CNIS');
      assert.strictEqual(c.fonte.pagina, 3);
      assert.strictEqual(c.fonte.arquivo, 'cnis.pdf');
    });
    assert.strictEqual(candidatos[0].empregador, 'EMPRESA X LTDA');
    assert.strictEqual(candidatos[1].empregador, 'COMÉRCIO Y EIRELI');
    assert.strictEqual(candidatos[2].aberto, true);
  });

  teste('extrairVinculosDoTexto nunca lança erro para texto vazio/ausente', () => {
    assert.strictEqual(sb.extrairVinculosDoTexto('', { numero: 1 }).length, 0);
    assert.strictEqual(sb.extrairVinculosDoTexto(null, { numero: 1 }).length, 0);
  });

  teste('extrairVinculosDoDocumento só processa páginas classificadas como CNIS (ignora páginas de sentença, por exemplo)', () => {
    const paginas = [
      { numero: 1, texto: 'SENTENÇA. Julgo procedente o pedido do autor.' },
      { numero: 2, texto: TEXTO_CNIS_EXEMPLO }
    ];
    const candidatos = sb.extrairVinculosDoDocumento(paginas);
    assert.strictEqual(candidatos.length, 3);
    candidatos.forEach(c => assert.strictEqual(c.fonte.pagina, 2));
  });

  teste('extrairVinculosDoDocumento nunca lança erro para lista vazia/ausente', () => {
    assert.strictEqual(sb.extrairVinculosDoDocumento([]).length, 0);
    assert.strictEqual(sb.extrairVinculosDoDocumento(null).length, 0);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
