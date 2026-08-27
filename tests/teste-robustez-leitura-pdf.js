/* ============================================================================
   TESTE-ROBUSTEZ-LEITURA-PDF.JS — cobre js/core/leitorPdf.js: uma falha
   isolada de leitura numa única página (PDF corrompido/malformado, erro de
   OCR) NUNCA pode abortar a leitura do documento inteiro. Antes desta
   melhoria, qualquer exceção dentro do laço de páginas de lerUmPdf()
   propagava e derrubava todo o arquivo — mesmo páginas já lidas com
   sucesso eram perdidas.

   Cobre também o mesmo isolamento por página dentro de anexos incorporados
   ao PDF (lerAnexosDoPdf) e a resiliência do fallback síncrono de
   analisarEstruturaEmLote() (estruturaTextoAsync.js) quando um texto
   isolado do lote faz analisarEstrutura() lançar erro.

   Roda sem dependências externas: `node tests/teste-robustez-leitura-pdf.js`.
============================================================================ */

const assert = require('assert');
const { carregarContextoPipeline } = require('./loader');
const { criarArquivoPdfFake } = require('./mocks-pdf-ocr');

let totalTestes = 0;
let totalFalhas = 0;

async function teste(nome, fn){
  totalTestes++;
  try{
    await fn();
    console.log(`  OK  ${nome}`);
  }catch(erro){
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.stack || erro.message}`);
  }
}

(async () => {

  await teste('página com falha de leitura no meio do documento não aborta as demais páginas', async () => {
    const sb = carregarContextoPipeline();
    const arquivo = criarArquivoPdfFake('processo.pdf', [
      { digital: true, texto: 'Primeira página, lida normalmente.' },
      { digital: true, forcarErroLeitura: 'PDF malformado nesta página (stream corrompido)' },
      { digital: true, texto: 'Terceira página, lida normalmente também.' }
    ]);

    const resultado = await sb.lerUmPdf(arquivo);

    assert.strictEqual(resultado.paginas.length, 3, 'as 3 páginas devem aparecer no resultado, mesmo a que falhou');
    assert.strictEqual(resultado.paginas[0].texto.includes('Primeira'), true);
    assert.strictEqual(resultado.paginas[2].texto.includes('Terceira'), true);
    assert.strictEqual(resultado.paginas[1].texto, '', 'página com falha entra com texto vazio, nunca quebra a leitura');
    assert.ok(resultado.paginas[1].erroLeitura, 'página com falha carrega o motivo em .erroLeitura');
    assert.ok(Array.isArray(resultado.paginasComErro) && resultado.paginasComErro.length === 1, 'a falha aparece em .paginasComErro');
    assert.strictEqual(resultado.paginasComErro[0].numero, 2);
    assert.ok(resultado.paginasComErro[0].motivo.includes('malformado'));
  });

  await teste('OCR (Tesseract) PRESERVA quebras de linha reais no texto final da página — Atualização 54, correção crítica', async () => {
    // Antes da correção, ocrDoCanvas() fazia .replace(/\s+/g,' '), que
    // também colapsava \n em espaço — destruindo a estrutura de linhas que
    // js/core/estruturaTexto.js e os extratores previdenciários (linha a
    // linha) dependem para funcionar. Este teste simula exatamente o
    // texto de exemplo do usuário: 3 campos em linhas separadas.
    const sb = carregarContextoPipeline();
    const textoOcrComQuebras = 'DIB: 15/05/2020\n\nRENDA MENSAL INICIAL:\nR$ 1.500,00\n\nDER: 10/01/2020';
    const arquivo = criarArquivoPdfFake('escaneado.pdf', [
      { digital: false, ocr: () => ({ texto: textoOcrComQuebras, confianca: 92 }) }
    ]);

    const resultado = await sb.lerUmPdf(arquivo);

    assert.strictEqual(resultado.paginas.length, 1);
    const textoFinal = resultado.paginas[0].texto;
    assert.ok(textoFinal.includes('\n'), 'o texto final da página OCR precisa preservar pelo menos uma quebra de linha real');
    const linhas = textoFinal.split('\n').filter(l => l.trim().length > 0);
    assert.ok(linhas.some(l => l.includes('DIB: 15/05/2020')), 'a linha da DIB precisa continuar separada das demais');
    assert.ok(linhas.some(l => l.includes('RENDA MENSAL INICIAL')), 'a linha do rótulo precisa continuar separada do valor');
    assert.ok(linhas.some(l => l.includes('R$ 1.500,00')), 'a linha do valor precisa continuar separada do rótulo');
    assert.ok(linhas.some(l => l.includes('DER: 10/01/2020')), 'a linha da DER precisa continuar separada das demais');
    // Não pode ter virado uma única linha gigante (comportamento antigo, o bug relatado):
    assert.notStrictEqual(linhas.length, 1, 'o texto NÃO pode ter sido achatado numa única linha');
  });

  await teste('OCR normaliza só o espaçamento DENTRO de cada linha (múltiplos espaços/tabs), sem tocar nas quebras', async () => {
    const sb = carregarContextoPipeline();
    const textoComEspacamentoIrregular = 'DER:    10/01/2020\nDIB:\t15/05/2020';
    const arquivo = criarArquivoPdfFake('escaneado.pdf', [
      { digital: false, ocr: () => ({ texto: textoComEspacamentoIrregular, confianca: 90 }) }
    ]);
    const resultado = await sb.lerUmPdf(arquivo);
    const linhas = resultado.paginas[0].texto.split('\n');
    assert.strictEqual(linhas[0], 'DER: 10/01/2020', 'espaços múltiplos dentro da linha viram um só');
    assert.strictEqual(linhas[1], 'DIB: 15/05/2020', 'tab dentro da linha também normaliza para um espaço');
  });

  await teste('ATUALIZAÇÃO 55 — offsets estruturais (.linhas/.cabecalhos/.paragrafos) SEMPRE correspondem ao pagina.texto final, mesmo quando a normalização muda o comprimento do texto', async () => {
    // "R$450000,00" (11 caracteres) vira "R$ 450.000,00" (13 caracteres)
    // depois de normalizarMoedas — um caso real de mudança de comprimento
    // que, antes da correção, deixava os offsets de .linhas incorretos
    // porque eram calculados ANTES dessa normalização rodar.
    const sb = carregarContextoPipeline();
    const texto = [
      'CABEÇALHO DO DOCUMENTO',
      '',
      'Valor: R$450000,00',
      '',
      'Outra linha depois do valor.'
    ].join('\n');
    const arquivo = criarArquivoPdfFake('processo.pdf', [
      { digital: true, linhas: texto.split('\n') }
    ]);

    const resultado = await sb.lerUmPdf(arquivo);
    const pagina = resultado.paginas[0];

    assert.ok(pagina.texto.includes('R$ 450.000,00'), 'o valor precisa ter sido normalizado no texto final');
    assert.ok(Array.isArray(pagina.linhas) && pagina.linhas.length >= 3, 'precisa ter pelo menos 3 linhas de conteúdo mapeadas');

    // A prova direta: cada offset de .linhas, aplicado a pagina.texto via
    // slice(inicio, fim), precisa reproduzir EXATAMENTE o conteúdo daquela
    // linha no texto FINAL (já normalizado) — não um trecho deslocado por
    // causa da mudança de comprimento em uma linha anterior.
    const linhaDoValor = pagina.linhas.find(l => pagina.texto.slice(l.inicio, l.fim).includes('R$'));
    assert.ok(linhaDoValor, 'deveria existir uma linha mapeada contendo o valor');
    assert.strictEqual(pagina.texto.slice(linhaDoValor.inicio, linhaDoValor.fim), 'Valor: R$ 450.000,00');

    // E a linha SEGUINTE ao valor (que só existe depois, no texto já mais
    // longo por causa da normalização da moeda) também precisa continuar
    // com o offset certo — é justamente essa linha que ficaria deslocada
    // se os offsets tivessem sido calculados antes da normalização.
    const linhas = pagina.texto.split('\n');
    const idxValor = linhas.findIndex(l => l.includes('R$'));
    assert.strictEqual(linhas[idxValor + 1], 'Outra linha depois do valor.', 'a linha seguinte ao valor precisa estar intacta e no lugar certo');
  });

  await teste('cancelamento do usuário continua propagando normalmente (não é engolido pelo try/catch por página)', async () => {
    const sb = carregarContextoPipeline();
    const arquivo = criarArquivoPdfFake('processo.pdf', [
      { digital: true, texto: 'Página 1' },
      { digital: true, texto: 'Página 2' }
    ]);

    sb.__executarNoContexto('LEITOR_PDF_ESTADO.cancelado = true;');
    let erroCapturado = null;
    try{
      await sb.lerUmPdf(arquivo);
    }catch(erro){
      erroCapturado = erro;
    }
    assert.ok(erroCapturado, 'lerUmPdf deveria lançar ao ser cancelado');
    assert.strictEqual(erroCapturado.name, 'LeituraCanceladaError', 'o cancelamento não pode ser confundido com uma falha de página isolada');
  });

  await teste('múltiplas páginas com falha na mesma leitura são todas reportadas, sem interromper a leitura', async () => {
    const sb = carregarContextoPipeline();
    const arquivo = criarArquivoPdfFake('processo.pdf', [
      { digital: true, forcarErroLeitura: true },
      { digital: true, texto: 'Esta é a página boa que está bem no meio das duas que falham.' },
      { digital: true, forcarErroLeitura: true }
    ]);

    const resultado = await sb.lerUmPdf(arquivo);
    assert.strictEqual(resultado.paginas.length, 3);
    assert.strictEqual(resultado.paginasComErro.length, 2);
    assert.strictEqual(resultado.paginas[1].texto.includes('página boa'), true);
  });

  await teste('anexo com uma página corrompida preserva as páginas boas do mesmo anexo', async () => {
    const sb = carregarContextoPipeline();
    // Registra o anexo como um segundo "arquivo PDF fake" e referencia seu
    // conteúdo bruto no mapa de anexos do arquivo principal.
    const arquivoAnexo = criarArquivoPdfFake('anexo.pdf', [
      { digital: true, texto: 'Anexo, primeira página, lida com sucesso normalmente.' },
      { digital: true, forcarErroLeitura: 'anexo com página ilegível' },
      { digital: true, texto: 'Anexo, terceira página, também lida com sucesso.' }
    ]);
    const conteudoAnexoReal = await arquivoAnexo.arrayBuffer();

    const arquivoPrincipal = criarArquivoPdfFake('principal.pdf', [
      { digital: true, texto: 'Página do arquivo principal, sem nenhum problema.' }
    ], {
      anexos: {
        'anexo.pdf': { content: conteudoAnexoReal }
      }
    });

    const resultado = await sb.lerUmPdf(arquivoPrincipal);
    const paginasDoAnexo = resultado.paginas.filter(p => (p.arquivo || '').includes('anexo.pdf'));
    assert.strictEqual(paginasDoAnexo.length, 3, 'as 3 páginas do anexo devem chegar, mesmo com uma falhando');
    assert.strictEqual(paginasDoAnexo.some(p => p.texto.includes('primeira página')), true);
    assert.strictEqual(paginasDoAnexo.some(p => p.texto.includes('terceira página')), true);
    assert.strictEqual(paginasDoAnexo.some(p => p.erroLeitura), true);
    assert.strictEqual(resultado.anexosNaoLidos.length, 0, 'o anexo inteiro NÃO deveria ser descartado por causa de uma página só');
  });

  await teste('fallback síncrono de analisarEstruturaEmLote isola um texto ruim do lote (não derruba as demais páginas)', () => {
    const sb = carregarContextoPipeline();
    const original = sb.analisarEstrutura;
    let chamadas = 0;
    sb.analisarEstrutura = function(texto){
      chamadas++;
      if (texto === 'TEXTO_QUE_QUEBRA') throw new Error('falha simulada dentro de analisarEstrutura');
      return original(texto);
    };

    const resultados = sb._analisarEstruturaEmLoteSincrono(['texto normal', 'TEXTO_QUE_QUEBRA', 'outro texto normal']);
    assert.strictEqual(resultados.length, 3);
    assert.strictEqual(resultados[1].texto, '', 'o item que quebrou volta com estrutura vazia, não propaga o erro');
    assert.ok(resultados[0].texto.length > 0);
    assert.ok(resultados[2].texto.length > 0);
    assert.strictEqual(chamadas, 3, 'os 3 itens foram tentados — o erro num não impediu os outros');
  });

  console.log(`\n${totalTestes - totalFalhas}/${totalTestes} testes passaram.`);
  if(totalFalhas > 0) process.exit(1);
})();
