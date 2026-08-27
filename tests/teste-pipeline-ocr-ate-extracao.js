/* ============================================================================
   TESTE-PIPELINE-OCR-ATE-EXTRACAO.JS — prova, com o pipeline REAL (não
   pulando etapas), que a Atualização 54 resolve o problema de ponta a
   ponta: PDF escaneado -> OCR (Tesseract mockado, mas com o MESMO formato
   de retorno real: `data.text` com quebras de linha) -> lerUmPdf() ->
   analisarEstrutura() -> normalizarTextoExtraido() -> pagina.texto ->
   extrairVinculosDoTexto()/extrairRemuneracoesDoTexto() -> MAIS DE UM
   candidato reconhecido.

   Os testes anteriores (teste-extrator-previdenciario.js,
   teste-extrator-remuneracoes-previdenciario.js,
   teste-e2e-previdenciario-cnis-ate-rmi.js,
   teste-e2e-pdf-real-previdenciario.js) injetam texto PRONTO direto nos
   extratores ou nos testes de UI — nenhum deles passava pelo caminho real
   de leitorPdf.js/estruturaTexto.js. Foi exatamente por isso que o
   achatamento (3 pontos: ocrDoCanvas, analisarEstrutura,
   limparEspacamento) ficou invisível para a suíte até agora. Este teste
   fecha essa lacuna.

   Roda sem dependências externas: `node tests/teste-pipeline-ocr-ate-extracao.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { carregarContextoPipeline } = require('./loader');
const { criarArquivoPdfFake } = require('./mocks-pdf-ocr');

let totalTestes = 0;
let totalFalhas = 0;

async function teste(nome, fn) {
  totalTestes++;
  try {
    await fn();
    console.log(`  OK  ${nome}`);
  } catch (erro) {
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.stack || erro.message}`);
  }
}

// Carrega os extratores previdenciários no MESMO contexto vm que
// carregarContextoPipeline() já criou (reaproveita o sandbox, em vez de
// reimplementar o pipeline de leitura) — via __executarNoContexto, já que
// os extratores usam `var`/`function` de nível superior (ficam acessíveis
// como sandbox.xxx depois de rodar no mesmo contexto).
function carregarExtratoresNoMesmoContexto(sandbox) {
  const arquivos = [
    'domains/previdenciario/extraction/reconstrucaoTabelaPrevidenciaria.js',
    'domains/previdenciario/extraction/extratorVinculosCNIS.js',
    'domains/previdenciario/extraction/extratorRemuneracoesCNIS.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    sandbox.__executarNoContexto(codigo);
  });
}

(async () => {
  console.log('== PIPELINE REAL: OCR (com quebras de linha) -> leitorPdf.js -> extratores previdenciários ==');

  await teste('CNIS escaneado com 1 vínculo + 3 remunerações em linhas separadas: todos os 4 fatos são extraídos (não só 1 linha achatada)', async () => {
    // Mesmo formato de saída real do Tesseract: `data.text` com quebras de
    // linha reais entre os "campos" que o OCR reconheceu na imagem.
    const textoOcr = [
      '01/03/2010 a 01/06/2020 EMPRESA TESTE PDF LTDA',
      '',
      '03/2018 R$ 1.500,00',
      '04/2018 R$ 1.550,00',
      '05/2018 R$ 1.600,00'
    ].join('\n');

    const sandbox = carregarContextoPipeline();
    carregarExtratoresNoMesmoContexto(sandbox);

    const arquivo = criarArquivoPdfFake('cnis-escaneado.pdf', [
      { digital: false, ocr: () => ({ texto: textoOcr, confianca: 91 }) }
    ]);

    const resultado = await sandbox.lerUmPdf(arquivo);
    assert.strictEqual(resultado.paginas.length, 1);
    const pagina = resultado.paginas[0];

    // A prova direta do bug relatado: o texto final da página NÃO pode
    // ter virado uma única linha achatada.
    const linhasNaoVazias = pagina.texto.split('\n').filter(l => l.trim().length > 0);
    assert.ok(linhasNaoVazias.length >= 4, `esperava pelo menos 4 linhas distintas no texto final da página, achou ${linhasNaoVazias.length}: ${JSON.stringify(pagina.texto)}`);

    // E o resultado prático: os extratores reais, chamados com o texto
    // que SAIU do pipeline de leitura (não um texto pronto de teste),
    // encontram o vínculo E as 3 remunerações — não só 1 fato solto.
    const vinculos = sandbox.extrairVinculosDoTexto(pagina.texto, { numero: 1, arquivo: 'cnis-escaneado.pdf' });
    const remuneracoes = sandbox.extrairRemuneracoesDoTexto(pagina.texto, { numero: 1, arquivo: 'cnis-escaneado.pdf' });

    assert.strictEqual(vinculos.length, 1, 'deveria extrair o vínculo do CNIS escaneado');
    assert.strictEqual(vinculos[0].empregador, 'EMPRESA TESTE PDF LTDA');

    assert.strictEqual(remuneracoes.length, 3, 'deveria extrair as 3 remunerações, uma por linha — não travar na primeira só porque o texto virou um bloco só');
    const competencias = remuneracoes.map(r => r.competencia).sort();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(competencias)), ['2018-03', '2018-04', '2018-05']);
  });

  await teste('texto digital (pdf.js, com hasEOL) passa pelo mesmo pipeline e também preserva as linhas até a extração', async () => {
    const sandbox = carregarContextoPipeline();
    carregarExtratoresNoMesmoContexto(sandbox);

    const arquivo = criarArquivoPdfFake('cnis-digital.pdf', [
      {
        digital: true,
        linhas: [
          '01/01/2015 a 01/01/2022 OUTRA EMPRESA LTDA',
          '',
          '06/2019 R$ 2.000,00',
          '07/2019 R$ 2.100,00'
        ]
      }
    ]);

    const resultado = await sandbox.lerUmPdf(arquivo);
    const pagina = resultado.paginas[0];
    const remuneracoes = sandbox.extrairRemuneracoesDoTexto(pagina.texto, { numero: 1 });
    assert.strictEqual(remuneracoes.length, 2);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
