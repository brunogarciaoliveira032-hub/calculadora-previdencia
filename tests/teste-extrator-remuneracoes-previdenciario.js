/* ============================================================================
   TESTE-EXTRATOR-REMUNERACOES-PREVIDENCIARIO.JS — cobre js/domains/
   previdenciario/extraction/extratorRemuneracoesCNIS.js (Atualização 15).

   Roda sem dependências externas: `node tests/teste-extrator-remuneracoes-previdenciario.js`.
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
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'extraction', 'extratorRemuneracoesCNIS.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

const TEXTO_REMUNERACOES_EXEMPLO =
  'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' +
  'Relação de vínculos/contribuições — Remunerações\n' +
  '03/2001 R$ 1.200,00\n' +
  '04/2001 - R$ 1.250,50\n' +
  'Competência: 05/2001 Remuneração: R$ 1.300,00\n' +
  '06/2001 R$ 0,00\n';

(() => {
  console.log('== EXTRAÇÃO/EXTRATORREMUNERACOESCNIS.JS ==');
  const sb = carregar();

  teste('extrai uma linha simples competência + valor', () => {
    const r = sb.extrairRemuneracaoDeLinha('03/2001 R$ 1.200,00');
    assert.ok(r);
    assert.strictEqual(r.tipo, 'remuneracao');
    assert.strictEqual(r.competencia, '2001-03');
    assert.strictEqual(r.valor, 1200);
    assert.strictEqual(r.valorZerado, false);
    assert.strictEqual(r.status, 'validado');
  });

  teste('aceita separador "-" entre competência e valor', () => {
    const r = sb.extrairRemuneracaoDeLinha('04/2001 - R$ 1.250,50');
    assert.ok(r);
    assert.strictEqual(r.competencia, '2001-04');
    assert.strictEqual(r.valor, 1250.5);
  });

  teste('aceita rótulos "Competência:"/"Remuneração:" explícitos', () => {
    const r = sb.extrairRemuneracaoDeLinha('Competência: 05/2001 Remuneração: R$ 1.300,00');
    assert.ok(r);
    assert.strictEqual(r.competencia, '2001-05');
    assert.strictEqual(r.valor, 1300);
  });

  teste('remuneração zerada é extraída (não descartada), mas marcada valorZerado e com conflito registrado', () => {
    const r = sb.extrairRemuneracaoDeLinha('06/2001 R$ 0,00');
    assert.ok(r);
    assert.strictEqual(r.valor, 0);
    assert.strictEqual(r.valorZerado, true);
    assert.ok(r.conflitos.length > 0);
  });

  teste('captura código de ocorrência entre parênteses quando presente, sem interpretá-lo', () => {
    const r = sb.extrairRemuneracaoDeLinha('07/2001 R$ 900,00 (13)');
    assert.ok(r);
    assert.strictEqual(r.codigoOcorrencia, '13');
  });

  teste('mês inválido (13/2001) não é extraído', () => {
    assert.strictEqual(sb.extrairRemuneracaoDeLinha('13/2001 R$ 900,00'), null);
  });

  teste('linha sem nenhum padrão de remuneração devolve null', () => {
    assert.strictEqual(sb.extrairRemuneracaoDeLinha('Consulta realizada em 10/08/2026'), null);
    assert.strictEqual(sb.extrairRemuneracaoDeLinha(''), null);
    assert.strictEqual(sb.extrairRemuneracaoDeLinha(null), null);
  });

  teste('extrairRemuneracoesDoTexto encontra as 4 remunerações do texto-exemplo, com fonte anexada', () => {
    const candidatos = sb.extrairRemuneracoesDoTexto(TEXTO_REMUNERACOES_EXEMPLO, { numero: 2, arquivo: 'cnis.pdf' });
    assert.strictEqual(candidatos.length, 4);
    candidatos.forEach(c => {
      assert.strictEqual(c.fonte.documento, 'CNIS');
      assert.strictEqual(c.fonte.pagina, 2);
    });
  });

  teste('extrairRemuneracoesDoDocumento só processa páginas classificadas como CNIS', () => {
    const paginas = [
      { numero: 1, texto: 'SENTENÇA. Julgo procedente o pedido do autor.' },
      { numero: 2, texto: TEXTO_REMUNERACOES_EXEMPLO }
    ];
    const candidatos = sb.extrairRemuneracoesDoDocumento(paginas);
    assert.strictEqual(candidatos.length, 4);
    candidatos.forEach(c => assert.strictEqual(c.fonte.pagina, 2));
  });

  teste('agruparRemuneracoesPorCompetencia detecta competência duplicada sem escolher uma sozinha', () => {
    const candidatos = [
      sb.extrairRemuneracaoDeLinha('03/2001 R$ 1.200,00'),
      sb.extrairRemuneracaoDeLinha('03/2001 R$ 1.300,00') // mesma competência, valor diferente (ex.: retificação)
    ];
    const agrupado = sb.agruparRemuneracoesPorCompetencia(candidatos);
    assert.strictEqual(agrupado.duplicadas.length, 1);
    assert.strictEqual(agrupado.duplicadas[0], '2001-03');
    assert.strictEqual(agrupado.porCompetencia.get('2001-03').length, 2);
  });

  teste('nunca lança erro para entrada vazia/ausente em nenhuma das funções', () => {
    assert.strictEqual(sb.extrairRemuneracoesDoTexto('', { numero: 1 }).length, 0);
    assert.strictEqual(sb.extrairRemuneracoesDoTexto(null, { numero: 1 }).length, 0);
    assert.strictEqual(sb.extrairRemuneracoesDoDocumento([]).length, 0);
    assert.strictEqual(sb.extrairRemuneracoesDoDocumento(null).length, 0);
    assert.strictEqual(sb.agruparRemuneracoesPorCompetencia(null).duplicadas.length, 0);
  });

  /* -------------------- FALLBACK DE DUAS LINHAS (Atualização 52) -------------------- */

  teste('extrairRemuneracaoDeParDeLinhas reconhece competência e valor quebrados em duas linhas', () => {
    const r = sb.extrairRemuneracaoDeParDeLinhas('07/2020', 'R$ 2.345,67');
    assert.ok(r);
    assert.strictEqual(r.competencia, '2020-07');
    assert.strictEqual(r.valor, 2345.67);
    assert.strictEqual(r.extraidoPorFallbackMultilinha, true);
  });

  teste('fallback de duas linhas SEMPRE fica com confiança baixa e status "requer_revisao" (nunca "validado" sozinho)', () => {
    const r = sb.extrairRemuneracaoDeParDeLinhas('07/2020', 'R$ 2.345,67');
    assert.strictEqual(r.status, 'requer_revisao');
    assert.ok(r.confianca < sb.ExtratorRemuneracoesPrevidenciario.LIMIAR_CONFIANCA_VALIDADO);
    assert.ok(r.conflitos.some(c => c.includes('fallback de duas linhas')));
  });

  teste('extrairRemuneracaoDeParDeLinhas NÃO casa se a primeira linha não for só competência', () => {
    assert.strictEqual(sb.extrairRemuneracaoDeParDeLinhas('07/2020 algo mais', 'R$ 2.345,67'), null);
  });

  teste('extrairRemuneracaoDeParDeLinhas NÃO casa se a segunda linha não for só valor', () => {
    assert.strictEqual(sb.extrairRemuneracaoDeParDeLinhas('07/2020', 'valor não informado ainda'), null);
  });

  teste('extrairRemuneracaoDeParDeLinhas rejeita mês inválido mesmo no formato de fallback', () => {
    assert.strictEqual(sb.extrairRemuneracaoDeParDeLinhas('13/2020', 'R$ 2.345,67'), null);
  });

  teste('extrairRemuneracoesDoTexto usa o fallback automaticamente quando a 1ª passada não encontra nada na linha', () => {
    const texto = [
      '07/2020',
      'R$ 2.345,67',
      '08/2020 R$ 2.400,00' // linha normal, de uma passada só, pro mesmo texto
    ].join('\n');
    const candidatos = sb.extrairRemuneracoesDoTexto(texto, { numero: 5, arquivo: 'cnis-escaneado.pdf' });
    assert.strictEqual(candidatos.length, 2);
    const viaFallback = candidatos.find(c => c.competencia === '2020-07');
    const viaLinhaUnica = candidatos.find(c => c.competencia === '2020-08');
    assert.ok(viaFallback.extraidoPorFallbackMultilinha);
    assert.strictEqual(viaFallback.valor, 2345.67);
    assert.strictEqual(viaFallback.fonte.arquivo, 'cnis-escaneado.pdf');
    assert.ok(!viaLinhaUnica.extraidoPorFallbackMultilinha);
  });

  teste('extrairRemuneracoesDoTexto NÃO deixa a 2ª passada "roubar" uma linha que já virou candidato pela 1ª passada', () => {
    // Linha única válida seguida de uma linha solta de competência (sem
    // valor correspondente) — não pode juntar a linha já aproveitada com
    // a próxima por engano.
    const texto = [
      '07/2020 R$ 2.345,67',
      '08/2020' // solta, sem valor na sequência (próxima linha é outra competência) — não deve virar nada
    ].join('\n');
    const candidatos = sb.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].competencia, '2020-07');
    assert.strictEqual(candidatos[0].extraidoPorFallbackMultilinha, undefined);
  });

  teste('extrairRemuneracoesDoTexto NÃO gera falso positivo por fallback quando as duas linhas soltas não têm relação (competência sem valor em sequência real)', () => {
    const texto = [
      '09/2020',
      'algum texto qualquer sem valor',
      '10/2020 R$ 1.000,00'
    ].join('\n');
    const candidatos = sb.extrairRemuneracoesDoTexto(texto, { numero: 1 });
    assert.strictEqual(candidatos.length, 1);
    assert.strictEqual(candidatos[0].competencia, '2020-10');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
