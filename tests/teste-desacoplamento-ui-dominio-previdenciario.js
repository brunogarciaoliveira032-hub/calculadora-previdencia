/* ============================================================================
   TESTE-DESACOPLAMENTO-UI-DOMINIO-PREVIDENCIARIO.JS — cobre o item 4 do
   checklist de melhorias ("Desacoplamento de Lógica entre UI e Camada de
   Domínio"):

     1. processarPaginasLidasPrevidenciario() (painelPrevidenciario.js) não
        reimplementa mais a classificação "isto é CNIS?" nem o try/catch de
        extração por página — delega inteiramente para
        extrairVinculosDoDocumentoComRelatorio()/extrairRemuneracoesDoDocu
        mentoComRelatorio() (extraction/*.js, já testados isoladamente em
        tests/teste-extrator-*-previdenciario.js). Este teste prova que o
        RESULTADO continua correto depois da delegação (regressão) e que
        uma falha de extração isolada (simulada substituindo a função de
        domínio por um dublê) ainda chega em PREV_UI_ESTADO.paginasComErro
        — a UI não precisa saber COMO a falha foi detectada, só precisa
        propagar o que o domínio devolveu.
     2. _prevUiMotivoEspecifico() (painelPrevidenciario.js) é pura
        apresentação (escolhe qual string mostrar), nunca decide se o
        cálculo pode ou não prosseguir — isso é 100% de
        motorRMIDoHistorico.js/motorSalarioBeneficio.js.

   Roda com: node tests/teste-desacoplamento-ui-dominio-previdenciario.js
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

function carregarPainel() {
  const sandbox = { document: { addEventListener() {} } };
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
    'domains/previdenciario/historico/historicoPrevidenciario.js',
    'domains/previdenciario/ui/painelPrevidenciarioEstado.js',
    'domains/previdenciario/ui/painelPrevidenciarioConferencia.js',
    'domains/previdenciario/ui/painelPrevidenciarioCalculo.js',
    'domains/previdenciario/ui/painelPrevidenciarioResultado.js',
    'domains/previdenciario/ui/painelPrevidenciarioWiring.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== DESACOPLAMENTO UI/DOMÍNIO — painelPrevidenciario.js (item 4 do checklist) ==');

  teste('processarPaginasLidasPrevidenciario delega a extração ao domínio: resultado continua correto (regressão) para um CNIS real de 2 páginas', () => {
    const sb = carregarPainel();
    sb.PREV_UI_ESTADO.candidatosVinculo = [];
    sb.PREV_UI_ESTADO.candidatosRemuneracao = [];
    sb.PREV_UI_ESTADO.documentosLidos = [];
    sb.PREV_UI_ESTADO.paginasParaEvidencia = [];
    sb.PREV_UI_ESTADO.paginasComErro = [];

    const resultadoLeitura = {
      nomeArquivo: 'cnis.pdf',
      paginas: [
        { numero: 1, texto: 'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n01/03/2001 a 31/12/2001 - EMPRESA A LTDA\n' },
        { numero: 2, texto: 'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n07/2001 R$ 1.000,00\n08/2001 R$ 1.050,00\n' }
      ]
    };
    sb.processarPaginasLidasPrevidenciario(resultadoLeitura);

    assert.strictEqual(sb.PREV_UI_ESTADO.documentosLidos.length, 2, 'cada página lida precisa entrar na tabela de documentos, independente de ser CNIS');
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosVinculo.length, 1, 'o vínculo da página 1 precisa ter sido extraído pelo domínio');
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosRemuneracao.length, 2, 'as 2 remunerações da página 2 precisam ter sido extraídas pelo domínio');
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosRemuneracao[0].fonte.pagina, 2, 'a proveniência (página) precisa continuar correta depois da delegação');
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosRemuneracao[0].fonte.arquivo, 'cnis.pdf');
    assert.strictEqual(sb.PREV_UI_ESTADO.paginasParaEvidencia.length, 2, 'toda página (qualquer tipo) continua alimentando a Evidence Layer');
  });

  teste('página que não é CNIS não gera candidato de vínculo/remuneração (classificação continua sendo decisão do domínio, não da UI)', () => {
    const sb = carregarPainel();
    sb.PREV_UI_ESTADO.candidatosVinculo = [];
    sb.PREV_UI_ESTADO.candidatosRemuneracao = [];
    sb.PREV_UI_ESTADO.documentosLidos = [];
    sb.PREV_UI_ESTADO.paginasParaEvidencia = [];
    sb.PREV_UI_ESTADO.paginasComErro = [];

    const resultadoLeitura = {
      nomeArquivo: 'requerimento.pdf',
      paginas: [{ numero: 1, texto: 'REQUERIMENTO DE APOSENTADORIA POR IDADE\nData de Entrada do Requerimento: 10/03/2020\n' }]
    };
    sb.processarPaginasLidasPrevidenciario(resultadoLeitura);

    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosVinculo.length, 0);
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosRemuneracao.length, 0);
    assert.strictEqual(sb.PREV_UI_ESTADO.paginasParaEvidencia.length, 1, 'mesmo não sendo CNIS, a página ainda alimenta a Evidence Layer (pode ter dataDER/dataDIB/etc.)');
  });

  teste('página com erro de LEITURA (leitorPdf.js) não é enviada para extração, e nunca gera candidato', () => {
    const sb = carregarPainel();
    sb.PREV_UI_ESTADO.candidatosVinculo = [];
    sb.PREV_UI_ESTADO.candidatosRemuneracao = [];
    sb.PREV_UI_ESTADO.documentosLidos = [];
    sb.PREV_UI_ESTADO.paginasParaEvidencia = [];
    sb.PREV_UI_ESTADO.paginasComErro = [];

    const resultadoLeitura = {
      nomeArquivo: 'cnis.pdf',
      paginas: [{ numero: 3, texto: '', erroLeitura: 'PDF corrompido nesta página' }]
    };
    sb.processarPaginasLidasPrevidenciario(resultadoLeitura);

    assert.strictEqual(sb.PREV_UI_ESTADO.documentosLidos.length, 1);
    assert.strictEqual(sb.PREV_UI_ESTADO.documentosLidos[0].erroLeitura, 'PDF corrompido nesta página');
    assert.strictEqual(sb.PREV_UI_ESTADO.candidatosVinculo.length, 0);
    assert.strictEqual(sb.PREV_UI_ESTADO.paginasParaEvidencia.length, 0, 'página com falha de leitura não tem texto útil — não entra na Evidence Layer');
  });

  teste('falha de EXTRAÇÃO reportada pelo domínio (dublê simulando erro) chega em PREV_UI_ESTADO.paginasComErro sem a UI precisar saber o motivo técnico', () => {
    const sb = carregarPainel();
    sb.PREV_UI_ESTADO.candidatosVinculo = [];
    sb.PREV_UI_ESTADO.candidatosRemuneracao = [];
    sb.PREV_UI_ESTADO.documentosLidos = [];
    sb.PREV_UI_ESTADO.paginasParaEvidencia = [];
    sb.PREV_UI_ESTADO.paginasComErro = [];

    // Dublê do domínio: simula extrairVinculosDoDocumentoComRelatorio()
    // reportando uma falha isolada — a UI não sabe (nem precisa saber) que
    // isso veio de um regex/try-catch interno, só repassa o relatório.
    sb.extrairVinculosDoDocumentoComRelatorio = function () {
      return { candidatos: [], paginasComErro: [{ numero: 1, arquivo: 'cnis.pdf', motivo: 'falha simulada de extração' }] };
    };

    const resultadoLeitura = {
      nomeArquivo: 'cnis.pdf',
      paginas: [{ numero: 1, texto: 'CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\n' }]
    };
    sb.processarPaginasLidasPrevidenciario(resultadoLeitura);

    assert.strictEqual(sb.PREV_UI_ESTADO.paginasComErro.length, 1);
    assert.ok(sb.PREV_UI_ESTADO.paginasComErro[0].motivo.includes('falha simulada de extração'));
  });

  teste('_prevUiMotivoEspecifico prioriza o motivo aninhado de salarioBeneficio (mais específico) sobre o motivo genérico de nível superior', () => {
    const sb = carregarPainel();
    const resultado = {
      motivo: 'salário de benefício não pôde ser calculado — ver .salarioBeneficio.motivo',
      salarioBeneficio: { salarioBeneficio: null, motivo: 'nenhum salário de contribuição elegível encontrado no histórico' }
    };
    assert.strictEqual(sb._prevUiMotivoEspecifico(resultado), 'nenhum salário de contribuição elegível encontrado no histórico');
  });

  teste('_prevUiMotivoEspecifico cai para o motivo de nível superior quando não há motivo aninhado (ex.: sexo não informado)', () => {
    const sb = carregarPainel();
    const resultado = { motivo: 'opcoes.sexo ("homem" ou "mulher") é obrigatório para MotorRMI.calcularRMI', salarioBeneficio: { salarioBeneficio: 1000 } };
    assert.strictEqual(sb._prevUiMotivoEspecifico(resultado), 'opcoes.sexo ("homem" ou "mulher") é obrigatório para MotorRMI.calcularRMI');
  });

  teste('_prevUiMotivoEspecifico nunca inventa um motivo quando não há nenhum (resultado bem-sucedido)', () => {
    const sb = carregarPainel();
    assert.strictEqual(sb._prevUiMotivoEspecifico({ salarioBeneficio: { salarioBeneficio: 1000 } }), null);
    assert.strictEqual(sb._prevUiMotivoEspecifico(null), null);
  });

  console.log(`\n${totalTestes - totalFalhas}/${totalTestes} testes passaram.`);
  if (totalFalhas > 0) process.exit(1);
})();
