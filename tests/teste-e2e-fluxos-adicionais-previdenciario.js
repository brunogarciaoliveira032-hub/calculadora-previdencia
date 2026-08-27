/* ============================================================================
   TESTE-E2E-FLUXOS-ADICIONAIS-PREVIDENCIARIO.JS — testes E2E novos
   (Chromium real via Playwright, servidor estático real, mesma disciplina
   de teste-e2e-pdf-real-previdenciario.js), cobrindo fluxos da tela que
   AINDA não tinham nenhum teste de navegador real:

     A) Conflito real de campo entre dois documentos -> resolução manual
        ("Usar esta sugestão") -> preenchimento do <input type="date"> real
        -> registro de auditoria.
     B) Auto-fill de campo SEM conflito (documento único) -> preenchimento
        do <input type="date"> real.
     C) Revisão por IA (mock só do fetch ao backend, endpoint real do app
        chamado de verdade — aplicarRevisaoIAPrevidenciaria()/
        chamarBackendRevisarCamposPrevidenciario() nunca tinham sido
        exercitados com rede real nem mockada, ver LIMITAÇÃO HONESTA no
        cabeçalho de iaRevisoraPrevidenciaria.js).
     D) Upload de arquivo que não é PDF -> erro tratado, sem travar a tela.
     E) Múltiplos benefícios (Fase 2) avaliados na mesma tela a partir do
        mesmo histórico real (CNIS de fixture) — cada caixa aparece
        separada, nunca uma sobrescrevendo a outra.
     F) Salário-maternidade sozinho (não depende de PDF nenhum).
     G) Comparador de regras de transição com mais de uma regra avaliada
        na mesma tela real (nunca clicado num navegador de verdade até
        aqui).
     H) Tema escuro persiste depois de um reload de página (localStorage).

   Usa o MESMO PDF de fixture e a MESMA técnica de stub de
   teste-e2e-pdf-real-previdenciario.js (lerUmPdf/buscarSerieBcbComCache
   substituídos — CDN/Bacen indisponíveis neste ambiente de teste; todo o
   resto roda com o código de produção real, sem mock).

   Requer `playwright` — se faltar, avisa e sai sem falhar a suíte (mesmo
   padrão dos demais testes E2E deste projeto).

   COMO RODAR: node tests/teste-e2e-fluxos-adicionais-previdenciario.js
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
  sairOuFalharSePular('teste-e2e-fluxos-adicionais-previdenciario', 'Pacote "playwright" não encontrado');
}

const CAMINHO_PDF = path.join(__dirname, 'fixtures-pdf', 'cnis_sintetico_teste.pdf');
const NOME_ARQUIVO_CNIS = 'cnis_sintetico_teste.pdf';

const DADOS_INPC_MOCK = [
  { data: '01/03/2001', valor: '1,00' },
  { data: '01/04/2001', valor: '2,00' },
  { data: '01/05/2001', valor: '-1,00' }
];

function extrairTextoPdfReal(caminhoPdf) {
  try {
    return execFileSync('pdftotext', ['-layout', caminhoPdf, '-'], { encoding: 'utf-8' });
  } catch (e) {
    sairOuFalharSePular('teste-e2e-fluxos-adicionais-previdenciario', '"pdftotext" (poppler-utils) não encontrado');
  }
}

let passaram = 0, falharam = 0;
async function teste(nome, fn) {
  try {
    await fn();
    console.log('  OK  ' + nome);
    passaram++;
  } catch (e) {
    console.log('  FALHOU  ' + nome);
    console.log('    ' + (e && e.stack ? e.stack : e));
    falharam++;
  }
}

(async () => {
  const textoCnisReal = extrairTextoPdfReal(CAMINHO_PDF);
  const servidor = await iniciarServidorEstaticoIndexHtml();
  const porta = servidor.address().port;
  const browser = await chromium.launch();
  const errosConsole = [];

  // Cada cenário roda numa aba nova (estado da tela isolado entre
  // cenários — PREV_UI_ESTADO é global por página), com os mesmos dois
  // stubs de rede indisponível neste ambiente (CDN do pdf.js e API do
  // Bacen) já usados em teste-e2e-pdf-real-previdenciario.js. `mapaTextos`
  // é {nomeArquivo: texto} — permite simular vários PDFs numa mesma aba.
  async function novaPagina(mapaTextos) {
    const page = await browser.newPage();
    page.on('pageerror', erro => errosConsole.push(String(erro)));
    await page.goto(`http://127.0.0.1:${porta}/index.html`);
    await page.evaluate(({ mapa, dadosInpc }) => {
      window.lerUmPdf = async function (arquivo) {
        const texto = mapa[arquivo.name];
        if (texto === undefined) throw new Error('stub sem texto para ' + arquivo.name);
        return { nomeArquivo: arquivo.name, paginas: [{ numero: 1, texto: texto }] };
      };
      window.buscarSerieBcbComCache = async function () {
        return { dados: dadosInpc, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' };
      };
    }, { mapa: mapaTextos || {}, dadosInpc: DADOS_INPC_MOCK });
    return page;
  }

  console.log('=== Testes E2E adicionais — fluxos reais ainda não cobertos por navegador ===\n');

  /* ==========================================================================
     A) CONFLITO REAL ENTRE DOIS DOCUMENTOS -> RESOLUÇÃO MANUAL -> AUDITORIA
     Mesmo par de textos já provado (nível decision engine) em
     teste-evidencia-previdenciaria.js/teste-decision-engine-previdenciario.js:
     duas fontes reais de dataDIB divergentes.
  ========================================================================== */
  {
    const pageA = await novaPagina({
      'concessao.pdf': 'CARTA DE CONCESSÃO. Concessão de Benefício. DIB: 10/01/2023.',
      'recurso.pdf': 'JUNTA DE RECURSOS DA PREVIDÊNCIA SOCIAL. Recurso Administrativo. Reforma a decisão. DIB: 15/03/2022.'
    });

    await pageA.evaluate(() => processarPdfsPrevidenciario([
      { name: 'concessao.pdf', type: 'application/pdf' },
      { name: 'recurso.pdf', type: 'application/pdf' }
    ]));

    await teste('A1) dataDIB entra em conflito real na tabela de campos do processo (duas fontes divergentes)', async () => {
      const textoTabela = await pageA.evaluate(() => document.getElementById('prevTabelaCampos').textContent);
      assert.ok(textoTabela.includes('dataDIB'), 'esperava a linha dataDIB na tabela: ' + textoTabela);
      assert.ok(textoTabela.includes('conflito'), 'esperava o badge de conflito: ' + textoTabela);
    });

    await teste('A2) o campo #prevDataDIB (input type=date real) NÃO é preenchido sozinho enquanto o conflito não é resolvido', async () => {
      const valor = await pageA.evaluate(() => document.getElementById('prevDataDIB').value);
      assert.strictEqual(valor, '', 'campo em conflito não deveria ter sido preenchido automaticamente: ' + valor);
    });

    await teste('A3) clicar em "Usar" o valor do documento concorrente resolve o conflito e PREENCHE de verdade o <input type="date"> (o Semantic Mapper já normaliza a data BR do trecho para ISO antes da decisão — data-valor do botão já vem "2022-03-15")', async () => {
      await pageA.fill('#prevConfirmadoPor', 'Dra. Fulana de Tal');
      const botao = pageA.locator('.prev-btn-usar-valor[data-valor="2022-03-15"]');
      await botao.click();

      const valorDom = await pageA.evaluate(() => document.getElementById('prevDataDIB').value);
      assert.strictEqual(valorDom, '2022-03-15', 'o <input type="date"> deveria mostrar 2022-03-15 (ISO) depois da confirmação manual: ' + JSON.stringify(valorDom));
    });

    await teste('A4) tabela de campos deixa de mostrar conflito para dataDIB e passa a mostrar "confirmado manualmente"', async () => {
      const textoTabela = await pageA.evaluate(() => document.getElementById('prevTabelaCampos').textContent);
      assert.ok(textoTabela.includes('confirmado manualmente') || textoTabela.includes('manual'), 'esperava indicação de confirmação manual: ' + textoTabela);
    });

    await teste('A5) histórico de confirmações manuais (auditoria) registra quem confirmou, o valor escolhido e a alternativa descartada', async () => {
      const textoAuditoria = await pageA.evaluate(() => document.getElementById('prevAuditoriaConfirmacoes').textContent);
      assert.ok(textoAuditoria.includes('Dra. Fulana de Tal'), 'esperava o nome de quem confirmou: ' + textoAuditoria);
      assert.ok(textoAuditoria.includes('2022-03-15'), 'esperava o valor escolhido: ' + textoAuditoria);
      await pageA.click('#prevAuditoriaConfirmacoes details summary');
      const textoDetalhe = await pageA.evaluate(() => document.getElementById('prevAuditoriaConfirmacoes').textContent);
      assert.ok(textoDetalhe.includes('2023-01-10'), 'esperava a alternativa descartada (2023-01-10) registrada, não escondida: ' + textoDetalhe);
    });

    await pageA.close();
  }

  /* ==========================================================================
     B) AUTO-FILL SEM CONFLITO (documento único) -> <input type="date"> real
  ========================================================================== */
  {
    const pageB = await novaPagina({
      'requerimento.pdf': 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/2023.'
    });
    await pageB.evaluate(() => processarPdfsPrevidenciario([{ name: 'requerimento.pdf', type: 'application/pdf' }]));

    await teste('B1) dataDER sem nenhuma fonte concorrente é decidida SEM conflito', async () => {
      const textoTabela = await pageB.evaluate(() => document.getElementById('prevTabelaCampos').textContent);
      assert.ok(textoTabela.includes('dataDER'), textoTabela);
      assert.ok(textoTabela.includes('preenchido automaticamente'), 'esperava "preenchido automaticamente" (sem conflito): ' + textoTabela);
    });

    await teste('B2) o auto-fill preenche de verdade o <input type="date"> real #prevDataDER (nunca testado em navegador real até esta entrega) — o Semantic Mapper normaliza a data BR do trecho ("DER: 10/01/2023") para ISO antes de chegar no DOM', async () => {
      const valorDom = await pageB.evaluate(() => document.getElementById('prevDataDER').value);
      assert.strictEqual(valorDom, '2023-01-10', 'esperava 2023-01-10 (ISO) no campo de data auto-preenchido a partir de "DER: 10/01/2023" (BR): ' + JSON.stringify(valorDom));
    });

    await pageB.close();
  }

  /* ==========================================================================
     C) REVISÃO POR IA — mock só do fetch ao backend (endpoint real do app,
     nunca exercitado com rede real/mockada antes desta entrega).
  ========================================================================== */
  {
    const pageC = await novaPagina({
      'req1.pdf': 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/2023.',
      'req2.pdf': 'REQUERIMENTO ADMINISTRATIVO. DER: 05/06/2023.'
    });

    let corpoRecebidoPeloBackend = null;
    await pageC.route('**/api/previdenciario/ia-revisar-campos', async (route) => {
      corpoRecebidoPeloBackend = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          revisoes: {
            dataDER: { veredito: 'confirmado', confianca_numerica: 88, justificativa: 'trecho cita DER de forma inequívoca' }
          }
        })
      });
    });

    await pageC.evaluate(() => processarPdfsPrevidenciario([
      { name: 'req1.pdf', type: 'application/pdf' },
      { name: 'req2.pdf', type: 'application/pdf' }
    ]));

    await teste('C1) dataDER entra em conflito (dois requerimentos com DER diferente) e o botão "Revisar campos em conflito com IA" aparece, junto do checkbox de consentimento LGPD', async () => {
      const existeBotao = await pageC.evaluate(() => !!document.getElementById('prevBtnRevisarConflitosIA'));
      assert.ok(existeBotao, 'esperava o botão de revisão por IA visível com conflito pendente');
      const existeCheckbox = await pageC.evaluate(() => !!document.getElementById('prevConsentimentoIA'));
      assert.ok(existeCheckbox, 'esperava o checkbox de consentimento LGPD junto do botão de revisão por IA');
      const desmarcadoPorPadrao = await pageC.evaluate(() => document.getElementById('prevConsentimentoIA').checked);
      assert.strictEqual(desmarcadoPorPadrao, false, 'o checkbox de consentimento não deveria vir marcado por padrão');
    });

    await teste('C1b) clicar em "Revisar com IA" SEM marcar o consentimento não chama o backend (LGPD: nenhum trecho de documento sai sem autorização explícita)', async () => {
      await pageC.click('#prevBtnRevisarConflitosIA');
      await pageC.waitForTimeout(150); // tempo suficiente pro fetch teria disparado, se fosse disparar
      assert.strictEqual(corpoRecebidoPeloBackend, null, 'o backend NÃO deveria ter sido chamado sem o consentimento marcado: ' + JSON.stringify(corpoRecebidoPeloBackend));
      const textoToast = await pageC.evaluate(() => document.getElementById('toast').textContent);
      assert.ok(/consentimento|ciência|autoriza/i.test(textoToast), 'esperava um toast pedindo o consentimento antes de enviar: ' + textoToast);
    });

    await teste('C2) marcar o consentimento e clicar em "Revisar com IA" chama o endpoint real do app (POST /api/previdenciario/ia-revisar-campos) com a proposta correta', async () => {
      await pageC.check('#prevConsentimentoIA');
      await pageC.click('#prevBtnRevisarConflitosIA');
      await pageC.waitForFunction(() => {
        const btn = document.getElementById('prevBtnRevisarConflitosIA');
        return !btn || !btn.disabled;
      }, { timeout: 5000 });

      assert.ok(corpoRecebidoPeloBackend, 'o backend deveria ter recebido uma chamada');
      assert.ok(Array.isArray(corpoRecebidoPeloBackend.propostas), 'corpo deveria ter "propostas": ' + JSON.stringify(corpoRecebidoPeloBackend));
      const propostaDER = corpoRecebidoPeloBackend.propostas.find(p => p.id === 'dataDER');
      assert.ok(propostaDER, 'esperava uma proposta para dataDER: ' + JSON.stringify(corpoRecebidoPeloBackend));
      assert.strictEqual(propostaDER.valorExibicao, '2023-01-10');
      assert.ok(propostaDER.trecho, 'proposta deveria incluir o trecho de evidência');
    });

    await teste('C3) o veredito da IA aparece na tela (status + confiança) e o VALOR do campo continua o mesmo — a IA só julga, nunca decide um valor novo', async () => {
      const textoTabela = await pageC.evaluate(() => document.getElementById('prevTabelaCampos').textContent);
      assert.ok(textoTabela.includes('88'), 'esperava a confiança da IA (88%) na tela: ' + textoTabela);

      const valorAindaConflito = await pageC.evaluate(() => document.getElementById('prevDataDER').value);
      assert.strictEqual(valorAindaConflito, '', 'a revisão por IA NUNCA deveria preencher o campo sozinha (só julga, quem decide é o operador clicando "Usar")');
    });

    await pageC.close();
  }

  /* ==========================================================================
     D) UPLOAD DE ARQUIVO QUE NÃO É PDF — erro tratado, sem travar a tela.
  ========================================================================== */
  {
    const pageD = await novaPagina({});
    await teste('D1) anexar um arquivo que não é PDF gera um aviso de erro visível e NÃO trava/quebra a tela (CORREÇÃO: antes, quando TODOS os arquivos eram inválidos, o toast() de rejeição era sobrescrito de forma síncrona pelo toast() de resumo final, sem nenhum "await" real entre os dois — o navegador nunca chegava a pintar o aviso, e o usuário só via "0 vínculo(s) reconhecidos" sem saber por quê)', async () => {
      await pageD.evaluate(() => processarPdfsPrevidenciario([{ name: 'nota-fiscal.txt', type: 'text/plain' }]));
      const toastInfo = await pageD.evaluate(() => {
        const el = document.getElementById('toast');
        return { texto: el.textContent, classe: el.className };
      });
      assert.ok(toastInfo.classe.includes('err'), 'esperava toast de erro: ' + JSON.stringify(toastInfo));
      assert.ok(toastInfo.texto.includes('nota-fiscal.txt'), 'esperava o nome do arquivo rejeitado no aviso (não deveria ter sido sobrescrito pelo toast de resumo): ' + toastInfo.texto);

      const totalDocumentos = await pageD.evaluate(() => document.querySelectorAll('#prevTabelaDocumentos tbody tr').length);
      assert.strictEqual(totalDocumentos, 0, 'nenhum documento deveria ter sido adicionado à tabela');

      // A tela continua funcional depois do erro — prova real (não só
      // "não lançou exceção"): consegue processar um PDF de verdade logo em seguida.
      await pageD.evaluate(({ texto }) => {
        window.lerUmPdf = async function (arquivo) { return { nomeArquivo: arquivo.name, paginas: [{ numero: 1, texto: texto }] }; };
        return processarPdfsPrevidenciario([{ name: 'requerimento.pdf', type: 'application/pdf' }]);
      }, { texto: 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/2023.' });
      const textoTabelaDepois = await pageD.evaluate(() => document.getElementById('prevTabelaDocumentos').textContent);
      assert.ok(!textoTabelaDepois.includes('Nenhum PDF importado'), 'a tela deveria continuar aceitando PDFs normalmente depois do arquivo inválido: ' + textoTabelaDepois);
    });
    await pageD.close();
  }

  /* ==========================================================================
     E) MÚLTIPLOS BENEFÍCIOS (FASE 2) NA MESMA TELA, A PARTIR DO MESMO
     HISTÓRICO REAL (CNIS de fixture) — cada caixa aparece separada.
  ========================================================================== */
  {
    const pageE = await novaPagina({ [NOME_ARQUIVO_CNIS]: textoCnisReal });
    await pageE.evaluate((nomeArquivo) => processarPdfsPrevidenciario([{ name: nomeArquivo, type: 'application/pdf' }]), NOME_ARQUIVO_CNIS);

    await pageE.fill('#prevCompetenciaReferencia', '2001-05');
    await pageE.selectOption('#prevSexo', 'homem');
    await pageE.fill('#prevIdadeAnos', '40');

    // Ativa as 4 espécies novas (Fase 2) simultaneamente, cada uma com
    // dispensa de carência/atestado marcado — o objetivo aqui NÃO é
    // reprovar a fórmula de cada uma (já coberto pelos testes unitários),
    // é provar que a TELA REAL consegue mostrar as 4 ao mesmo tempo, cada
    // uma na sua caixa própria, sem uma pisar na outra.
    await pageE.check('#prevAvaliarIncapacidadePermanente');
    await pageE.check('#prevIncapacidadeAtestada');
    await pageE.check('#prevDispensaCarencia');

    await pageE.check('#prevAvaliarAuxilioIncapacidadeTemp');
    await pageE.check('#prevAuxTempIncapacidadeAtestada');
    await pageE.check('#prevAuxTempDispensaCarencia');

    await pageE.check('#prevAvaliarAuxilioAcidente');
    await pageE.check('#prevSequelaAtestada');

    await pageE.check('#prevAvaliarPensaoPorMorte');
    await pageE.check('#prevPensaoQualidadeSegurado');
    await pageE.check('#prevPensaoDependenteReconhecido');
    await pageE.fill('#prevPensaoNumeroDependentes', '2');

    await pageE.click('#prevBtnCalcular');
    await pageE.waitForFunction(() => document.getElementById('prevResultado').textContent.includes('PENSÃO POR MORTE'));

    await teste('E1) Aposentadoria por INCAPACIDADE PERMANENTE aparece em caixa própria, elegível (dispensa de carência marcada)', async () => {
      const rmi = await pageE.evaluate(() => document.getElementById('prevSecaoRmiIncapacidadePermanente').textContent);
      const eleg = await pageE.evaluate(() => document.querySelector('#prevSecaoElegibilidadeIncapacidadePermanente').className);
      assert.ok(rmi.includes('R$'), rmi);
      assert.ok(eleg.includes('elegivel') && !eleg.includes('nao-elegivel'), eleg);
    });

    await teste('E2) Auxílio por INCAPACIDADE TEMPORÁRIA aparece em caixa própria, elegível, com RMI DIFERENTE da incapacidade permanente (91% x fórmula por tempo)', async () => {
      const rmiTemp = await pageE.evaluate(() => document.getElementById('prevSecaoAuxTempRmi').textContent);
      const rmiPerm = await pageE.evaluate(() => document.getElementById('prevSecaoRmiIncapacidadePermanente').textContent);
      const eleg = await pageE.evaluate(() => document.querySelector('#prevSecaoAuxTempElegibilidade').className);
      assert.ok(rmiTemp.includes('R$'), rmiTemp);
      assert.ok(eleg.includes('elegivel') && !eleg.includes('nao-elegivel'), eleg);
      assert.notStrictEqual(rmiTemp, rmiPerm, 'as duas espécies deveriam ter caixas de RMI independentes, com textos diferentes');
    });

    await teste('E3) AUXÍLIO-ACIDENTE aparece em caixa própria, elegível (sequela atestada, sem exigir carência)', async () => {
      const eleg = await pageE.evaluate(() => document.querySelector('#prevSecaoAuxAcidenteElegibilidade').className);
      const rmi = await pageE.evaluate(() => document.getElementById('prevSecaoAuxAcidenteRmi').textContent);
      assert.ok(eleg.includes('elegivel') && !eleg.includes('nao-elegivel'), eleg);
      assert.ok(rmi.includes('50%'), 'esperava a explicação de 50% do salário de benefício: ' + rmi);
    });

    await teste('E4) PENSÃO POR MORTE aparece em caixa própria, elegível, com valor base calculado automaticamente (segurado não informou aposentadoria prévia) e cota para 2 dependentes', async () => {
      const eleg = await pageE.evaluate(() => document.querySelector('#prevSecaoPensaoMorteElegibilidade').className);
      const rmi = await pageE.evaluate(() => document.getElementById('prevSecaoPensaoMorteRmi').textContent);
      assert.ok(eleg.includes('elegivel') && !eleg.includes('nao-elegivel'), eleg);
      assert.ok(rmi.includes('calculado automaticamente'), 'esperava a explicação de que o valor base foi calculado automaticamente (art. 75): ' + rmi);
    });

    await teste('E5) as 4 caixas de RMI ficam todas visíveis ao mesmo tempo na tela (nenhuma sobrescreve a outra)', async () => {
      const idsPresentes = await pageE.evaluate(() => [
        'prevSecaoRmiIncapacidadePermanente', 'prevSecaoAuxTempRmi', 'prevSecaoAuxAcidenteRmi', 'prevSecaoPensaoMorteRmi'
      ].map(id => !!document.getElementById(id)));
      assert.deepStrictEqual(idsPresentes, [true, true, true, true]);
    });

    await teste('E6) número de dependentes digitado como fracionário ("2.5") NÃO é truncado silenciosamente para 2 — o cálculo avisa por toast e trata como não informado (CORREÇÃO: antes, parseInt("2.5",10) virava 2 sem aviso nenhum). Usa "2.5" (ponto) em vez de "2,5" (vírgula) porque o <input type="number"> do navegador nem deixa digitar vírgula — mas ponto ele aceita, mesmo com step="1", e parseInt truncava mesmo assim.', async () => {
      // <input type="number"> não é preenchível por .fill() com valor "inválido"
      // pro parser DE NÚMERO do navegador (ex.: vírgula) — mas "2.5" (ponto) É um
      // número válido pro <input>, só não é um INTEIRO (a checagem que falta,
      // e que o browser não faz sozinho sem submeter o <form>). setInputValue via
      // JS (não .fill()) para simular exatamente esse caso real.
      await pageE.evaluate(() => {
        const el = document.getElementById('prevPensaoNumeroDependentes');
        el.value = '2.5';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await pageE.click('#prevBtnCalcular');
      await pageE.waitForFunction(() => {
        const el = document.getElementById('toast');
        return el && el.classList.contains('show');
      }, { timeout: 5000 });
      const textoToast = await pageE.evaluate(() => document.getElementById('toast').textContent);
      assert.ok(/número de dependentes/i.test(textoToast), 'esperava o toast citando o campo inválido: ' + textoToast);
      assert.ok(textoToast.includes('2.5'), 'esperava o toast citando o valor digitado ("2.5") pra facilitar a correção: ' + textoToast);
    });

    await pageE.close();
  }

  /* ==========================================================================
     F) SALÁRIO-MATERNIDADE SOZINHO — não depende de PDF nenhum (única
     espécie da Fase 2 que não usa resultado.salarioBeneficio).
  ========================================================================== */
  {
    const pageF = await novaPagina({});

    await pageF.fill('#prevSalarioMinimo', '1412,00');
    await pageF.check('#prevAvaliarSalarioMaternidade');
    await pageF.check('#prevMaternidadeSegurada');
    await pageF.check('#prevMaternidadeEventoGerador');
    await pageF.selectOption('#prevMaternidadeCategoria', 'empregada_avulsa');
    await pageF.fill('#prevMaternidadeBaseCalculo', '2500,00');

    await pageF.click('#prevBtnCalcular');
    await pageF.waitForFunction(() => document.getElementById('prevResultado').textContent.includes('SALÁRIO-MATERNIDADE'));

    await teste('F1) Salário-maternidade calcula e mostra elegibilidade SEM nenhum PDF/histórico importado', async () => {
      const eleg = await pageF.evaluate(() => document.querySelector('#prevSecaoMaternidadeElegibilidade').className);
      const rmi = await pageF.evaluate(() => document.getElementById('prevSecaoMaternidadeRmi').textContent);
      assert.ok(eleg.includes('elegivel') && !eleg.includes('nao-elegivel'), eleg);
      assert.ok(rmi.includes('R$ 2.500,00') || rmi.includes('2.500,00'), 'categoria empregada/avulsa usa a remuneração integral informada: ' + rmi);
    });

    await teste('F2) trocar a categoria para "segurada especial (economia familiar)" ignora a base de cálculo informada e usa 1 salário mínimo (a regra desta categoria, não decidida pela UI)', async () => {
      await pageF.selectOption('#prevMaternidadeCategoria', 'especial_economia_familiar');
      await pageF.click('#prevBtnCalcular');
      await pageF.waitForFunction(() => document.getElementById('prevSecaoMaternidadeRmi').textContent.includes('economia familiar') || document.getElementById('prevSecaoMaternidadeRmi').textContent.includes('especial'));
      const rmi = await pageF.evaluate(() => document.getElementById('prevSecaoMaternidadeRmi').textContent);
      assert.ok(rmi.includes('1.412,00'), 'esperava o valor do salário mínimo informado (categoria economia familiar sempre paga 1 SM): ' + rmi);
    });

    await pageF.close();
  }

  /* ==========================================================================
     G) COMPARADOR DE REGRAS DE TRANSIÇÃO — mais de uma regra avaliada na
     tela real ao mesmo tempo (nunca aberto num navegador de verdade até
     esta entrega).
  ========================================================================== */
  {
    // As regras de transição (pontos/idade mínima progressiva) só existem
    // a partir da EC 103/2019 — usar a competência de referência de 2001
    // do fixture de CNIS (como no teste E2E principal) faria essas duas
    // regras lançarem exceção esperada ("regra ainda não existia no ano
    // informado") e ficarem de fora do comparador, o que não prova nada
    // sobre a TELA. Por isso este cenário injeta um histórico sintético
    // (mesmo formato de tests/teste-motor-rmi-do-historico.js) com DER em
    // 2020 e tempo de contribuição de sobra — o objetivo aqui é a TELA
    // REAL conseguir mostrar várias regras ao mesmo tempo, não reprovar a
    // matemática de cada uma (já coberta pelos testes unitários de cada
    // regra).
    const pageG = await novaPagina({});
    await pageG.evaluate(({ dadosInpc }) => {
      window.buscarSerieBcbComCache = async function () { return { dados: dadosInpc, origem: 'api', obtidoEm: '2026-08-11T00:00:00Z' }; };
      window.PREV_UI_ESTADO.historico = {
        vinculos: [{ id: 'v1', inicio: '1975-01-01', fim: '2020-01-31', tipo: 'comum', aberto: false }],
        contribuicoes: [{ id: 'c1', competencia: '2020-01', valor: 3000, vinculoId: 'v1', ambigua: false, remuneracaoIds: ['r1'] }],
        remuneracoes: [{ id: 'r1', competencia: '2020-01', valor: 3000, fonte: { documento: 'sintetico-teste.pdf', pagina: 1 } }]
      };
    }, { dadosInpc: [{ data: '01/01/2020', valor: '0,00' }] });

    await pageG.fill('#prevCompetenciaReferencia', '2020-01');
    await pageG.selectOption('#prevSexo', 'homem');
    await pageG.fill('#prevIdadeAnos', '65');
    await pageG.fill('#prevTempoContribuicaoEm13112019', '40');

    await pageG.click('#prevBtnCalcular');
    await pageG.waitForFunction(() => document.getElementById('prevSecaoComparadorRegras') !== null);

    await teste('G1) o comparador aparece na tela real com uma linha por regra avaliada (permanente, pontos, idade mínima progressiva, pedágio 50%, pedágio 100%) — nunca aberto num navegador de verdade até esta entrega', async () => {
      const linhas = await pageG.evaluate(() => Array.from(document.querySelectorAll('#prevSecaoComparadorRegras table tbody tr')).map(tr => tr.textContent));
      ['Regra permanente', 'Pontos', 'Idade mínima progressiva', 'Pedágio 50%', 'Pedágio 100%'].forEach(nomeEsperado => {
        assert.ok(linhas.some(l => l.includes(nomeEsperado)), `esperava uma linha "${nomeEsperado}" no comparador: ` + JSON.stringify(linhas));
      });
    });

    await teste('G2) o "🏆 melhor resultado" mostrado na tela é exatamente o MAIOR RMI entre as linhas marcadas elegíveis (SIM) na própria tabela — cross-check da renderização real contra o próprio conteúdo da tela, sem hardcodar limiares legais', async () => {
      const dados = await pageG.evaluate(() => {
        const linhas = Array.from(document.querySelectorAll('#prevSecaoComparadorRegras table tbody tr')).map(tr => {
          const celulas = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
          return { nome: celulas[0], rmiTexto: celulas[1], elegivelTexto: celulas[2] };
        });
        const melhorBox = document.querySelector('#prevSecaoComparadorRegras .prev-caixa-valor');
        return { linhas, melhorBoxTexto: melhorBox ? melhorBox.textContent.trim() : null };
      });

      const paraNumero = (txt) => {
        if (!txt || txt === '—') return null;
        return parseFloat(txt.replace('R$', '').replace(/\./g, '').replace(',', '.').trim());
      };
      const elegiveisComRmi = dados.linhas.filter(l => l.elegivelTexto === 'SIM' && paraNumero(l.rmiTexto) !== null);

      if (elegiveisComRmi.length === 0) {
        assert.strictEqual(dados.melhorBoxTexto, null, 'sem nenhuma linha elegível com RMI, não deveria haver caixa de "melhor resultado": ' + JSON.stringify(dados));
        return;
      }
      const maiorRmi = Math.max(...elegiveisComRmi.map(l => paraNumero(l.rmiTexto)));
      assert.ok(dados.melhorBoxTexto, 'esperava a caixa "🏆 melhor resultado" visível, já que há ao menos uma regra elegível com RMI: ' + JSON.stringify(dados));
      assert.strictEqual(paraNumero(dados.melhorBoxTexto), maiorRmi, 'o valor da caixa "melhor resultado" deveria ser exatamente o maior RMI elegível da tabela: ' + JSON.stringify(dados));
    });

    // Confere que cada regra de transição também abriu sua PRÓPRIA seção
    // detalhada (RMI + elegibilidade), não só a linha resumida do comparador.
    await teste('G3) cada regra de transição comparada também tem sua própria seção detalhada de RMI teórica + elegibilidade na tela', async () => {
      const idsEsperados = [
        'prevSecaoRmiPontos', 'prevSecaoElegibilidadePontos',
        'prevSecaoRmiIdadeProgressiva', 'prevSecaoElegibilidadeIdadeProgressiva',
        'prevSecaoRmiPedagio100', 'prevSecaoElegibilidadePedagio100'
      ];
      const presentes = await pageG.evaluate((ids) => ids.map(id => !!document.getElementById(id)), idsEsperados);
      assert.deepStrictEqual(presentes, idsEsperados.map(() => true), JSON.stringify(presentes));
    });

    await pageG.close();
  }

  /* ==========================================================================
     H) TEMA ESCURO PERSISTE APÓS RELOAD (localStorage) — nunca testado em
     navegador real até esta entrega.
  ========================================================================== */
  {
    const pageH = await novaPagina({});
    await teste('H1) alternar para tema escuro persiste depois de um reload real da página', async () => {
      const temaInicial = await pageH.evaluate(() => document.documentElement.getAttribute('data-theme'));
      assert.notStrictEqual(temaInicial, 'dark', 'esperava iniciar em tema claro (padrão)');

      await pageH.click('#themeToggle');
      const temaAposClique = await pageH.evaluate(() => document.documentElement.getAttribute('data-theme'));
      assert.strictEqual(temaAposClique, 'dark');

      await pageH.reload();
      await pageH.waitForFunction(() => document.getElementById('themeIcon') !== null);
      const temaAposReload = await pageH.evaluate(() => document.documentElement.getAttribute('data-theme'));
      assert.strictEqual(temaAposReload, 'dark', 'o tema escuro deveria persistir (localStorage) depois do reload: ' + temaAposReload);

      const iconeELabel = await pageH.evaluate(() => ({ icone: document.getElementById('themeIcon').textContent, rotulo: document.getElementById('themeLabel').textContent }));
      assert.strictEqual(iconeELabel.icone, '☀️', 'ícone deveria indicar a ação de voltar pro claro, já que está no escuro');
      assert.ok(iconeELabel.rotulo.toLowerCase().includes('claro'), iconeELabel.rotulo);
    });
    await pageH.close();
  }

  /* ==========================================================================
     I) CORREÇÃO DE BUG — data extraída com ANO DE 2 DÍGITOS (ex.: "10/01/23",
     plausível em documento antigo/anotação manual) nunca preenche um
     <input type="date"> corretamente: parseDataBRParaIso() (classificador
     Extrator.js) exige ano de 4 dígitos e devolve null pra "10/01/23", e o
     Semantic Mapper cai no fallback do valor BRUTO ("10/01/23", ainda em
     formato BR) — esse valor nunca foi validado antes de chegar em
     `elemento.value` num <input type="date"> real, que REJEITA
     SILENCIOSAMENTE qualquer valor fora do formato ISO yyyy-mm-dd (fica
     vazio, sem erro/exceção). Antes da correção, o campo ficava vazio E
     a tabela ainda assim dizia "preenchido automaticamente" — sucesso
     falso. Só um navegador real (Chromium/Playwright) expõe isso; os
     testes com DOM simulado (tests/teste-preenchimento-automatico-
     previdenciario.js e outros) usam elementos fake sem validação de
     formato e nunca pegariam este caso.
  ========================================================================== */
  {
    const pageI = await novaPagina({
      'requerimento-antigo.pdf': 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/23.'
    });
    await pageI.evaluate(() => processarPdfsPrevidenciario([{ name: 'requerimento-antigo.pdf', type: 'application/pdf' }]));

    await teste('I1) dataDER com ano de 2 dígitos é decidida sem conflito, mas NÃO pode ser marcada como "preenchido automaticamente" com o campo de verdade vazio', async () => {
      const decisao = await pageI.evaluate(() => window.PREV_UI_ESTADO.decisoesCampos.porCampo.dataDER);
      assert.strictEqual(decisao.valor, '10/01/23', 'pré-condição do cenário: parseDataBRParaIso não deveria converter ano de 2 dígitos (comportamento existente, não mudado por esta correção): ' + JSON.stringify(decisao));

      const valorDom = await pageI.evaluate(() => document.getElementById('prevDataDER').value);
      assert.strictEqual(valorDom, '', 'o <input type="date"> não pode aceitar "10/01/23" (fora do formato ISO) — continua vazio, mas isso NÃO pode ser anunciado como sucesso na tabela (ver próxima asserção)');

      const textoTabela = await pageI.evaluate(() => document.getElementById('prevTabelaCampos').textContent);
      assert.ok(!textoTabela.includes('preenchido automaticamente'), 'CORREÇÃO: a tabela não deveria mais afirmar "preenchido automaticamente" para um campo cujo <input type="date"> real ficou vazio — isso era um falso positivo: ' + textoTabela);
      assert.ok(textoTabela.includes('preencha manualmente'), 'esperava um aviso claro pedindo preenchimento manual (formato inesperado): ' + textoTabela);
    });

    await pageI.close();
  }

  await teste('J) Nenhum erro de JavaScript apareceu no console do navegador em nenhum dos cenários acima', async () => {
    assert.deepStrictEqual(errosConsole, [], 'erros inesperados no console: ' + JSON.stringify(errosConsole));
  });

  await browser.close();
  await new Promise(resolve => servidor.close(resolve));

  console.log(`\n=== ${passaram + falharam} teste(s), ${passaram} passaram, ${falharam} falharam ===`);
  process.exit(falharam > 0 ? 1 : 0);
})();
