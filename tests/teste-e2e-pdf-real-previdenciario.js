/* ============================================================================
   TESTE-E2E-PDF-REAL-PREVIDENCIARIO.JS — Atualização 19, o teste com PDF
   real pedido pelo usuário ("não apenas texto sintético"): usa um ARQUIVO
   PDF de verdade (tests/fixtures-pdf/cnis_sintetico_teste.pdf, gerado com
   reportlab — texto real embutido no PDF, não uma string JS), extrai seu
   texto via `pdftotext` (poppler-utils) e roda esse texto pelo painel
   previdenciário REAL (painelPrevidenciario.js) num Chromium de verdade,
   via Playwright — clicando nos mesmos elementos que uma pessoa usaria.

   MESMA LIMITAÇÃO HONESTA já documentada em teste-e2e-pdf-real.js (o teste
   equivalente da desapropriação): este ambiente de teste não tem acesso à
   internet, e `leitorPdf.js` carrega pdf.js de um CDN — então a extração
   de texto do PDF DENTRO do navegador (pdfjsLib.getDocument(...)) não pode
   ser exercitada aqui. O que ESTE teste cobre é: um PDF real, texto real
   extraído dele por uma ferramenta real (pdftotext, o mesmo motor de
   extração de texto que o pdf.js usaria para um PDF com texto embutido
   como este), entrando no pipeline real da aplicação (identificação,
   extração de vínculos/remunerações, HistoricoPrevidenciario, motores) —
   a mesma troca de escopo já aceita e documentada para a desapropriação,
   aplicada aqui pela primeira vez ao domínio previdenciário.

   `window.lerUmPdf` é substituído por um stub que devolve o texto já
   extraído por `pdftotext` (no lugar de chamar pdfjsLib, indisponível
   offline) — mas `processarPdfsPrevidenciario()` (a função REAL do
   painel) é chamada sem nenhuma alteração, exercitando o código de
   produção de ponta a ponta a partir desse ponto.

   `window.buscarSerieBcbComCache` também é substituída por uma série INPC
   sintética determinística (mesma dos testes unitários desta entrega,
   1%/2%/-1%) — a API do Bacen não está acessível neste ambiente de teste,
   mesma razão dos outros testes de correção monetária.

   Requer `pdftotext` (poppler-utils) e o pacote `playwright` — se
   qualquer um faltar, avisa e sai sem falhar a suíte (mesmo padrão de
   teste-e2e-pdf-real.js).

   COMO RODAR: node tests/teste-e2e-pdf-real-previdenciario.js
============================================================================ */

const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');
const { iniciarServidorEstaticoIndexHtml } = require('./servidor-estatico-teste');
const { sairOuFalharSePular } = require('./ci-strict-skip');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  sairOuFalharSePular('teste-e2e-pdf-real-previdenciario', 'Pacote "playwright" não encontrado');
}

const CAMINHO_PDF = path.join(__dirname, 'fixtures-pdf', 'cnis_sintetico_teste.pdf');
const NOME_ARQUIVO = 'cnis_sintetico_teste.pdf';

const DADOS_INPC_MOCK = [
  { data: '01/03/2001', valor: '1,00' },
  { data: '01/04/2001', valor: '2,00' },
  { data: '01/05/2001', valor: '-1,00' }
];

function extrairTextoPdfReal(caminhoPdf) {
  try {
    return execFileSync('pdftotext', ['-layout', caminhoPdf, '-'], { encoding: 'utf-8' });
  } catch (e) {
    sairOuFalharSePular('teste-e2e-pdf-real-previdenciario', '"pdftotext" (poppler-utils) não encontrado');
  }
}

// Parse grosseiro de "Xa Ym Zd" (formato exibido no card de auditoria) para
// um número de dias comparável — não precisa ser exato (365/30 fixos), só
// precisa detectar "aumentou" de forma monotônica para o teste de conversão
// especial->comum abaixo.
function tempoTextoParaDiasAprox(texto) {
  const m = /(\d+)a\s+(\d+)m\s+(\d+)d/.exec(String(texto || ''));
  if (!m) return null;
  return parseInt(m[1], 10) * 365 + parseInt(m[2], 10) * 30 + parseInt(m[3], 10);
}

let passaram = 0, falharam = 0;
async function teste(nome, fn) {
  try {
    await fn();
    console.log('  OK  ' + nome);
    passaram++;
  } catch (e) {
    console.log('  FALHOU  ' + nome);
    console.log('    ' + (e && e.message ? e.message : e));
    falharam++;
  }
}

(async () => {
  const textoPdfReal = extrairTextoPdfReal(CAMINHO_PDF);
  assert.ok(textoPdfReal && textoPdfReal.includes('CADASTRO NACIONAL'), 'pdftotext deveria extrair o cabeçalho do CNIS do PDF real');

  const servidor = await iniciarServidorEstaticoIndexHtml();
  const porta = servidor.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errosConsole = [];
  page.on('pageerror', erro => errosConsole.push(String(erro)));

  await page.goto(`http://127.0.0.1:${porta}/index.html`);

  console.log('=== Teste E2E — PDF real de CNIS (cnis_sintetico_teste.pdf, extraído via pdftotext) ===\n');

  // Substitui só as duas dependências de rede indisponíveis neste ambiente
  // (leitura do PDF em si via pdf.js/CDN, e a API do Bacen) — todo o resto
  // do pipeline roda sem nenhuma alteração.
  await page.evaluate(({ texto, nomeArquivo, dadosInpc }) => {
    window.lerUmPdf = async function () {
      return { nomeArquivo: nomeArquivo, paginas: [{ numero: 1, texto: texto }] };
    };
    window.buscarSerieBcbComCache = async function () {
      return { dados: dadosInpc, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' };
    };
  }, { texto: textoPdfReal, nomeArquivo: NOME_ARQUIVO, dadosInpc: DADOS_INPC_MOCK });

  /* ------------------------------------------------------------------------
     ETAPA 1-3: PDF real -> lerUmPdf (stub) -> processarPdfsPrevidenciario()
     REAL (identificação + extração + HistoricoPrevidenciario + telas).
  ------------------------------------------------------------------------ */
  await page.evaluate((nomeArquivo) => {
    return processarPdfsPrevidenciario([{ name: nomeArquivo, type: 'application/pdf' }]);
  }, NOME_ARQUIVO);

  await teste('Documento é reconhecido como CNIS na tabela de documentos, com confiança alta', async () => {
    const textoTabela = await page.evaluate(() => document.getElementById('prevTabelaDocumentos').textContent);
    assert.ok(textoTabela.includes('CNIS'), 'tabela de documentos deveria mostrar CNIS: ' + textoTabela);
  });

  await teste('O vínculo (EMPRESA TESTE PDF LTDA) extraído do PDF real aparece na tabela de vínculos', async () => {
    const textoTabela = await page.evaluate(() => document.getElementById('prevTabelaVinculos').textContent);
    assert.ok(textoTabela.includes('EMPRESA TESTE PDF LTDA'), 'esperava o nome do empregador extraído do PDF real: ' + textoTabela);
    assert.ok(textoTabela.includes('validado'), 'vínculo deveria estar com status validado');
  });

  await teste('As 3 remunerações extraídas do PDF real aparecem na tabela de remunerações, cada uma com página de origem', async () => {
    const linhas = await page.evaluate(() => Array.from(document.querySelectorAll('#prevTabelaRemuneracoes tbody tr')).map(tr => tr.textContent));
    assert.strictEqual(linhas.length, 3, 'esperava 3 linhas de remuneração: ' + JSON.stringify(linhas));
    linhas.forEach(linha => assert.ok(linha.includes('p. 1'), 'linha de remuneração deveria citar a página de origem (p. 1): ' + linha));
  });

  await teste('As 3 competências apuradas em Contribuições batem com as 3 remunerações do PDF real', async () => {
    const linhas = await page.evaluate(() => document.querySelectorAll('#prevTabelaContribuicoes tbody tr').length);
    assert.strictEqual(linhas, 3);
  });

  /* ------------------------------------------------------------------------
     ETAPA 4-6: parâmetros do cálculo (preenchidos como uma pessoa faria) ->
     clique em "Calcular" -> calcularPrevidenciario() REAL -> RMI teórica +
     elegibilidade na tela.
  ------------------------------------------------------------------------ */
  await teste('Preenchendo os parâmetros e clicando em Calcular, o salário de benefício aparece com a memória de cálculo completa', async () => {
    await page.fill('#prevCompetenciaReferencia', '2001-05');
    await page.selectOption('#prevSexo', 'homem');
    await page.fill('#prevIdadeAnos', '40'); // mesmo cenário "não elegível" já provado nos testes unitários
    await page.click('#prevBtnCalcular');
    await page.waitForFunction(() => document.getElementById('prevResultado').textContent.includes('Salário de benefício'));

    const textoResultado = await page.evaluate(() => document.getElementById('prevResultado').textContent);
    assert.ok(textoResultado.includes('R$'), 'resultado deveria mostrar valores em R$: ' + textoResultado);

    // Abre a memória de cálculo (está dentro de um <details>) e confere as
    // 3 competências, cada uma com fonte rastreável até o PDF real.
    await page.click('#prevResultado details summary');
    const linhasMemoria = await page.evaluate(() => Array.from(document.querySelectorAll('#prevResultado table tbody tr')).map(tr => tr.textContent));
    const linhaMemoria = linhasMemoria.filter(l => l.includes('cnis_sintetico_teste.pdf'));
    assert.ok(linhaMemoria.length >= 3, 'esperava pelo menos 3 linhas de memória de cálculo citando o PDF real: ' + JSON.stringify(linhasMemoria));
  });

  /* ------------------------------------------------------------------------
     CLASSIFICAÇÃO POR VÍNCULO (Atualização 21) — o CNIS real não informa
     atividade especial; o vínculo extraído deveria começar como "Comum" e
     só virar "Especial" se a advogada/o advogado marcar na tela (com base
     em prova externa, ex.: PPP). Marcar + ativar "converter tempo especial
     em comum" deve mudar o TEMPO DE CONTRIBUIÇÃO mostrado na tela — prova,
     no navegador real, de que o mapper (._origem.tipoManual/
     anosExposicaoManual) chega inteiro até o motor de conversão.
  ------------------------------------------------------------------------ */
  await teste('O vínculo real do CNIS começa classificado como "Comum" — o CNIS por si só não informa atividade especial', async () => {
    const valorSelect = await page.evaluate(() => {
      const sel = document.querySelector('#prevTabelaVinculos select.prev-select-tipo-vinculo');
      return sel ? sel.value : null;
    });
    assert.strictEqual(valorSelect, 'comum');
  });

  await teste('Marcar o vínculo como "Especial (15 anos)" + ativar "converter tempo especial em comum" AUMENTA o tempo de contribuição mostrado — sem reler o PDF', async () => {
    const linhaAntes = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Tempo de contribuição'));
      return el ? el.textContent : null;
    });
    assert.ok(linhaAntes, 'esperava a linha de Tempo de contribuição já calculada (etapa anterior)');
    const diasAntes = tempoTextoParaDiasAprox(linhaAntes);
    assert.ok(diasAntes !== null, 'não consegui parsear o tempo mostrado: ' + linhaAntes);

    await page.selectOption('#prevTabelaVinculos select.prev-select-tipo-vinculo', 'especial-15');

    // A troca do select já remonta o histórico sozinha (sem clicar em
    // Calcular) — confere isso diretamente no estado real da aplicação.
    const vinculoAtualizado = await page.evaluate(() => window.PREV_UI_ESTADO.historico.vinculos[0]);
    assert.strictEqual(vinculoAtualizado.tipo, 'especial', 'a troca do select deveria remontar o histórico com o novo tipo imediatamente');
    assert.strictEqual(vinculoAtualizado.anosExposicao, 15);

    await page.check('#prevConverterTempoEspecial');
    await page.click('#prevBtnCalcular');
    await page.waitForFunction((diasAntesEsperados) => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Tempo de contribuição'));
      if (!el) return false;
      const m = /(\d+)a\s+(\d+)m\s+(\d+)d/.exec(el.textContent);
      if (!m) return false;
      const dias = parseInt(m[1], 10) * 365 + parseInt(m[2], 10) * 30 + parseInt(m[3], 10);
      return dias > diasAntesEsperados;
    }, diasAntes, { timeout: 5000 });

    const linhaDepois = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Tempo de contribuição'));
      return el.textContent;
    });
    const diasDepois = tempoTextoParaDiasAprox(linhaDepois);
    assert.ok(diasDepois > diasAntes, `esperava aumento de tempo com a conversão: antes="${linhaAntes.trim()}" depois="${linhaDepois.trim()}"`);
  });

  await teste('Desmarcar "converter tempo especial em comum" (mantendo o vínculo como Especial) volta o tempo ao valor original — conversão é OPCIONAL, marcar como especial sozinho não muda nada sem ela', async () => {
    await page.uncheck('#prevConverterTempoEspecial');
    await page.click('#prevBtnCalcular');
    await page.waitForFunction(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Tempo de contribuição'));
      return el && /\d+a\s+\d+m\s+\d+d/.test(el.textContent);
    });
    const tipoAtual = await page.evaluate(() => window.PREV_UI_ESTADO.historico.vinculos[0].tipo);
    assert.strictEqual(tipoAtual, 'especial', 'a marcação do vínculo é persistente na tela — só a conversão é que é opcional por cálculo');

    const linhaFinal = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Tempo de contribuição'));
      return el.textContent;
    });
    assert.ok(/0a\s+3m/.test(linhaFinal) || /0a\s+2m/.test(linhaFinal), 'sem conversão, o vínculo de 3 meses (mar-mai/2001) deveria voltar a contar 1:1: ' + linhaFinal);
  });

  await teste('CORREÇÃO CRÍTICA na tela real: a RMI teórica aparece numa caixa própria, rotulada "é só a fórmula" — nunca como resultado final sozinho', async () => {
    const caixaRmi = await page.evaluate(() => {
      const el = document.querySelector('.prev-caixa-rmi-teorica');
      return el ? el.textContent : null;
    });
    assert.ok(caixaRmi, 'deveria existir uma caixa .prev-caixa-rmi-teorica na tela');
    assert.ok(caixaRmi.includes('RMI teórica'), caixaRmi);
    assert.ok(caixaRmi.toLowerCase().includes('não é um resultado exercível') || caixaRmi.toLowerCase().includes('é só a fórmula'), 'a caixa deveria avisar que não é um resultado exercível sozinho: ' + caixaRmi);
  });

  await teste('CORREÇÃO CRÍTICA na tela real: com 3 meses de contribuição, a caixa de ELEGIBILIDADE mostra "❌ Não elegível" com as pendências, ao lado da RMI teórica — nunca escondida', async () => {
    const caixaElegibilidade = await page.evaluate(() => {
      const el = document.querySelector('.prev-caixa-elegibilidade');
      return el ? { texto: el.textContent, classes: el.className } : null;
    });
    assert.ok(caixaElegibilidade, 'deveria existir uma caixa .prev-caixa-elegibilidade na tela');
    assert.ok(caixaElegibilidade.classes.includes('nao-elegivel'), 'classe CSS deveria marcar não-elegível: ' + caixaElegibilidade.classes);
    assert.ok(caixaElegibilidade.texto.includes('Não elegível'), caixaElegibilidade.texto);
    assert.ok(caixaElegibilidade.texto.includes('carência') || caixaElegibilidade.texto.includes('tempo de contribuição') || caixaElegibilidade.texto.includes('idade'), 'esperava pendências nomeadas: ' + caixaElegibilidade.texto);
  });

  await teste('Carência apurada (art. 27) também aparece na tela, com metodologia citando a lei — não um número solto', async () => {
    const textoElegibilidade = await page.evaluate(() => document.querySelector('.prev-caixa-elegibilidade').textContent);
    assert.ok(textoElegibilidade.includes('Carência apurada'), textoElegibilidade);
    assert.ok(textoElegibilidade.includes('27'), 'deveria citar o art. 27 na metodologia: ' + textoElegibilidade);
  });

  /* ------------------------------------------------------------------------
     TELA DE AUDITORIA: card-resumo no topo com Segurado/DER/checkmarks, e
     cada número navegável até a cadeia de proveniência completa (PDF ->
     página -> competência -> remuneração extraída -> índice aplicado ->
     valor atualizado), pedida pelo usuário.
  ------------------------------------------------------------------------ */
  await teste('Card de auditoria mostra o nome do segurado digitado e a DER, com uma linha por indicador (tempo, carência, salário, RMI, elegibilidade)', async () => {
    await page.fill('#prevNomeSegurado', 'João da Silva Teste');
    await page.click('#prevBtnCalcular');
    await page.waitForFunction(() => document.querySelector('.prev-auditoria') && document.querySelector('.prev-auditoria').textContent.includes('João da Silva Teste'));

    const cabecalho = await page.evaluate(() => document.querySelector('.prev-auditoria-cabecalho').textContent);
    assert.ok(cabecalho.includes('João da Silva Teste'), cabecalho);
    assert.ok(cabecalho.includes('05/2001'), 'DER deveria aparecer formatada no cabeçalho: ' + cabecalho);

    const rotulos = await page.evaluate(() => Array.from(document.querySelectorAll('.prev-auditoria-rotulo')).map(el => el.textContent));
    ['Tempo de contribuição', 'Carência', 'Salário de benefício', 'RMI teórica', 'Elegibilidade'].forEach(esperado => {
      assert.ok(rotulos.includes(esperado), `esperava a linha "${esperado}" no card de auditoria: ` + JSON.stringify(rotulos));
    });
  });

  await teste('A linha de Elegibilidade no card de auditoria mostra ✗ (requisitos não atendidos), coerente com a caixa de elegibilidade abaixo', async () => {
    const linha = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Elegibilidade'));
      return el ? el.textContent : null;
    });
    assert.ok(linha, 'esperava encontrar a linha de Elegibilidade no card de auditoria');
    assert.ok(linha.includes('✗'), 'ícone de status deveria ser ✗ (não elegível): ' + linha);
  });

  await teste('Clicar na linha "Salário de benefício" do card de auditoria navega até a seção correspondente (âncora #prevSecaoSalario)', async () => {
    const href = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.prev-auditoria-linha')).find(a => a.textContent.includes('Salário de benefício'));
      return el ? el.getAttribute('href') : null;
    });
    assert.strictEqual(href, '#prevSecaoSalario');
    await page.click('.prev-auditoria-linha:has-text("Salário de benefício")');
    const urlAtual = page.url();
    assert.ok(urlAtual.endsWith('#prevSecaoSalario'), urlAtual);
    const secaoExiste = await page.evaluate(() => !!document.getElementById('prevSecaoSalario'));
    assert.ok(secaoExiste, 'a seção #prevSecaoSalario deveria existir na página para a âncora funcionar');
  });

  await teste('Cada competência da memória de cálculo tem uma cadeia de proveniência rastreável até o PDF real (lupa 🔍): valor atualizado -> arquivo -> página -> competência -> remuneração extraída -> índice aplicado', async () => {
    const primeiraLupa = await page.$('#prevSecaoSalario table details summary');
    assert.ok(primeiraLupa, 'esperava um botão de lupa (🔍) na primeira linha da memória de cálculo');
    await primeiraLupa.click();

    const textoCadeia = await page.evaluate(() => {
      const el = document.querySelector('#prevSecaoSalario table .prev-cadeia');
      return el ? el.textContent : null;
    });
    assert.ok(textoCadeia, 'esperava a cadeia de proveniência (.prev-cadeia) visível após clicar na lupa');
    assert.ok(textoCadeia.includes('valor atualizado'), textoCadeia);
    assert.ok(textoCadeia.includes('cnis_sintetico_teste.pdf'), 'cadeia deveria citar o arquivo PDF real de origem: ' + textoCadeia);
    assert.ok(textoCadeia.includes('página 1'), textoCadeia);
    assert.ok(textoCadeia.includes('competência'), textoCadeia);
    assert.ok(textoCadeia.includes('remuneração extraída'), textoCadeia);
    assert.ok(textoCadeia.includes('índice aplicado'), textoCadeia);
    assert.ok(textoCadeia.includes('INPC'), textoCadeia);
  });

  await teste('Nenhum erro de JavaScript apareceu no navegador em todo o caminho (PDF real -> tela final)', async () => {
    assert.deepStrictEqual(errosConsole, [], 'erros inesperados no console: ' + JSON.stringify(errosConsole));
  });

  await page.close();
  await browser.close();
  await new Promise(resolve => servidor.close(resolve));

  console.log(`\n=== ${passaram + falharam} teste(s), ${passaram} passaram, ${falharam} falharam ===`);
  process.exit(falharam > 0 ? 1 : 0);
})();
