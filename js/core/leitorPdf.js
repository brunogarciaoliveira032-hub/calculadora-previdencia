/* ============================================================================
   LEITORPDF.JS — Importação e leitura de PDF (Fase 1 e Fase 2 do checklist)

   Responsabilidade deste arquivo: só ENTRADA e TEXTO BRUTO por página.
   - Fase 1 (Importação): botão "Anexar PDF", drag & drop, múltiplos PDFs,
     barra de progresso, cancelar leitura, histórico de arquivos.
   - Fase 2 (Leitura): leitura de PDF digital (pdf.js), OCR para páginas
     escaneadas (Tesseract.js), processamento em lotes e liberação de
     memória entre lotes, com as seguintes robustezes adicionais:
       • baixa qualidade: a imagem da página passa por conversão para
         escala de cinza + alargamento de contraste antes do OCR; se a
         confiança do OCR ainda ficar baixa, tenta de novo em resolução
         maior;
       • páginas giradas: a rotação DECLARADA no PDF (pagina.rotate) já é
         respeitada em toda renderização; se ainda assim a confiança do OCR
         ficar baixa (comum em digitalização por celular sem metadado de
         rotação), tenta as outras 3 rotações (90/180/270°) e fica com a de
         maior confiança;
       • PDFs grandes: processados em lotes, liberando memória da página e
         do canvas a cada uma — o limite de páginas (LIMITE_PAGINAS_PDF) é
         uma rede de segurança para casos extremos, não um teto normal de
         uso;
       • anexos: arquivos incorporados ao PDF (via anexo nativo do formato,
         não anexo de e-mail) são detectados; se forem PDFs, são lidos e
         suas páginas entram no pipeline junto com as do arquivo principal.

   Classificação (Fase 3), extração de campos (Fase 4) e inteligência
   jurídica (Fase 5) ficam em classificadorExtrator.js e
   inteligenciaJuridica.js. Conferência/preenchimento/relatório (Fases 6-8)
   ficam em painelConferencia.js — este arquivo só entrega o texto por
   página; quem orquestra o pipeline completo é painelConferencia.js.

   LIMITAÇÃO HONESTA SOBRE "OCR OFFLINE" (checklist pede Fase 2 offline):
   o Tesseract.js baixa o motor (wasm) e os dados de idioma ("por.traineddata")
   de uma CDN na primeira vez que roda nesta aba — igual ao jsPDF/xlsx que já
   existiam no app. Isso NÃO é OCR 100% offline "de fábrica". Como o app já é
   um PWA com service worker (sw.js), dá para colocar esses arquivos em cache
   depois da primeira leitura bem-sucedida e então funcionar sem internet nas
   próximas vezes — mas isso ainda não está feito aqui (ver observação no
   relatório da leitura, campo `avisoOffline`). Tratar como pendência real,
   não como algo já entregue.

   DEPENDE de: js/core/util.js ($, toast) e js/core/normalizadorTexto.js
   (normalizarTextoExtraido — Fase 1 do checklist: corrige erro comum de OCR,
   normaliza moeda/data e limpa espaçamento do texto de cada página antes de
   ela seguir para classificação/extração). Bibliotecas globais: pdfjsLib
   (pdf.js), Tesseract (Tesseract.js) — carregadas via <script> no index.html
   antes deste arquivo.

   PROCESSAMENTO ASSÍNCRONO (Web Workers): a análise estrutural de todas as
   páginas de um PDF (antes um forEach síncrono aqui mesmo) agora roda em
   js/core/workers/estruturaTextoWorker.js via o wrapper js/core/estruturaTextoAsync.js
   (analisarEstruturaEmLote) — ver comentários nesses dois arquivos para o
   porquê de só esta etapa ter ido para um Worker, e não o resto do pipeline.
============================================================================ */

// Limite de páginas por arquivo: rede de segurança para não travar o
// navegador em casos patológicos, não um teto de uso normal — o
// processamento em lotes já libera memória a cada página/canvas, então
// suporta PDFs bem maiores que 2.000 páginas (o antigo limite "normal").
const LIMITE_PAGINAS_PDF = 20000;
const TAMANHO_LOTE_PAGINAS = 15;       // páginas por lote antes de liberar memória/ceder a UI
const MIN_CARACTERES_TEXTO_DIGITAL = 25; // abaixo disso, a página é tratada como escaneada -> OCR
const ESCALA_OCR_PADRAO = 2;   // resolução usada na primeira tentativa de OCR de cada página
const ESCALA_OCR_ALTA = 3;     // resolução usada quando a 1ª tentativa teve confiança baixa (baixa qualidade/borrado)
const LIMIAR_CONFIANCA_OCR_RETENTATIVA = 60; // confiança do Tesseract (0-100); abaixo disso, tenta de novo

if(typeof pdfjsLib !== 'undefined'){
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* ------------------------------------------------------------------------
   1. ESTADO DA LEITURA (para permitir cancelar entre páginas/lotes)
------------------------------------------------------------------------ */
const LEITOR_PDF_ESTADO = {
  cancelado: false,
  processando: false,
  workerOcr: null // reaproveitado entre páginas/arquivos para não recriar o worker do Tesseract a cada página
};

async function obterWorkerOcr(){
  if(LEITOR_PDF_ESTADO.workerOcr) return LEITOR_PDF_ESTADO.workerOcr;
  const worker = await Tesseract.createWorker('por', 1, {
    logger: () => {} // silencioso; o progresso já é reportado pela barra própria do app
  });
  LEITOR_PDF_ESTADO.workerOcr = worker;
  return worker;
}

async function encerrarWorkerOcr(){
  if(LEITOR_PDF_ESTADO.workerOcr){
    try{ await LEITOR_PDF_ESTADO.workerOcr.terminate(); }catch(e){}
    LEITOR_PDF_ESTADO.workerOcr = null;
  }
}

/* ------------------------------------------------------------------------
   2. UI: progresso, cancelar, drag & drop
------------------------------------------------------------------------ */
function atualizarProgressoLeitura(atual, total, rotulo){
  const wrap = $('leitorProgressoWrap');
  const barra = $('leitorProgressoBarra');
  const texto = $('leitorProgressoTexto');
  wrap.style.display = 'block';
  const pct = total > 0 ? Math.min(100, Math.round((atual / total) * 100)) : 0;
  barra.style.width = pct + '%';
  texto.textContent = rotulo || (`Processando página ${atual} de ${total} (${pct}%)`);
}

function esconderProgressoLeitura(){
  $('leitorProgressoWrap').style.display = 'none';
}

function iniciarUiProcessamento(){
  LEITOR_PDF_ESTADO.processando = true;
  LEITOR_PDF_ESTADO.cancelado = false;
  $('btnCancelarLeitura').style.display = 'inline-block';
  $('btnAnexarPdf').disabled = true;
  $('inputPdf').disabled = true;
}

function encerrarUiProcessamento(){
  LEITOR_PDF_ESTADO.processando = false;
  $('btnCancelarLeitura').style.display = 'none';
  $('btnAnexarPdf').disabled = false;
  $('inputPdf').disabled = false;
}

class LeituraCanceladaError extends Error {
  constructor(){ super('Leitura cancelada pelo usuário.'); this.name = 'LeituraCanceladaError'; }
}

function verificarCancelamento(){
  if(LEITOR_PDF_ESTADO.cancelado) throw new LeituraCanceladaError();
}

// Cede o controle ao navegador entre lotes (repinta a barra de progresso,
// evita a página travar durante PDFs grandes).
function cederControleUi(){
  return new Promise(resolve => setTimeout(resolve, 0));
}

/* ------------------------------------------------------------------------
   3. HISTÓRICO DE ARQUIVOS (Fase 1)
   Guardado em localStorage só com metadados leves (nome, data, contagens) —
   NUNCA o texto extraído do processo, por volume e por prudência com dados
   sensíveis de terceiros que possam constar no PDF.
------------------------------------------------------------------------ */
const CHAVE_HISTORICO_PDF = 'da_historico_leitura_pdf';

function lerHistoricoLeituraPdf(){
  try{
    return JSON.parse(localStorage.getItem(CHAVE_HISTORICO_PDF) || '[]');
  }catch(e){ return []; }
}

function registrarHistoricoLeituraPdf(entrada){
  try{
    const lista = lerHistoricoLeituraPdf();
    lista.unshift(entrada);
    localStorage.setItem(CHAVE_HISTORICO_PDF, JSON.stringify(lista.slice(0, 20)));
  }catch(e){ /* localStorage indisponível/cheio: histórico é cosmético, não bloqueia o app */ }
  renderizarHistoricoLeituraPdf();
}

function renderizarHistoricoLeituraPdf(){
  const container = $('historicoLeituraPdf');
  const lista = lerHistoricoLeituraPdf();
  if(!lista.length){ container.innerHTML = ''; return; }
  const linhas = lista.map(it =>
    `<li><span>${escaparHtml(it.nome)} — ${it.paginas} pág.${it.truncado ? ` (truncado em ${LIMITE_PAGINAS_PDF})` : ''}</span>` +
    `<span>${it.camposEncontrados}/${it.camposTotal} campos · ${new Date(it.quando).toLocaleString('pt-BR')}</span></li>`
  ).join('');
  container.innerHTML = `<strong>Arquivos já lidos nesta instalação</strong><ul>${linhas}</ul>`;
}

function escaparHtml(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ------------------------------------------------------------------------
   4. LEITURA DE UM PDF: texto digital + OCR por página, em lotes
------------------------------------------------------------------------ */
// Devolve { nomeArquivo, paginas: [{numero, texto, fonte}], truncado, totalPaginasOriginal, tempoMs }
async function lerUmPdf(arquivo){
  const inicio = performance.now();
  const bytes = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;

  const totalPaginasOriginal = pdf.numPages;
  const truncado = totalPaginasOriginal > LIMITE_PAGINAS_PDF;
  const totalAProcessar = Math.min(totalPaginasOriginal, LIMITE_PAGINAS_PDF);

  if(truncado){
    const aviso = $('avisoTruncamento');
    aviso.style.display = 'block';
    aviso.textContent = `"${arquivo.name}" tem ${totalPaginasOriginal} páginas — apenas as primeiras ${LIMITE_PAGINAS_PDF} serão lidas (limite de processamento).`;
  }

  const paginasBrutas = []; // {numero, texto (Etapa 1 já aplicada, com quebras), fonte} — cabeçalho/rodapé repetido e página vazia só dão pra detectar depois, com o documento inteiro aqui
  const paginasComErro = []; // {numero, motivo} — páginas que falharam isoladamente (ver bloco try/catch abaixo); nunca aborta o resto do documento por causa de uma página só
  let numeroPagina = 1;

  while(numeroPagina <= totalAProcessar){
    verificarCancelamento();
    const fimDoLote = Math.min(numeroPagina + TAMANHO_LOTE_PAGINAS - 1, totalAProcessar);

    for(let n = numeroPagina; n <= fimDoLote; n++){
      verificarCancelamento();
      atualizarProgressoLeitura(n, totalAProcessar, `Lendo página ${n} de ${totalAProcessar} — "${arquivo.name}"`);

      // Cada página é isolada num try/catch próprio: um PDF corrompido ou
      // malformado numa única página (comum em digitalizações de sistemas
      // legados — layout quebrado, fonte incorporada corrompida, falha do
      // OCR numa imagem ilegível) não pode derrubar a leitura do documento
      // inteiro. A página que falhou entra com texto vazio e um motivo
      // registrado (paginasComErro) — o resto do pipeline já sabe lidar com
      // página vazia sem lançar erro (ver normalizadorTexto.js/estrutura
      // vazia acima) — e a leitura segue para a próxima página normalmente.
      try{
        const pagina = await pdf.getPage(n);
        const conteudoTexto = await pagina.getTextContent();
        // Preserva quebra de linha real (hasEOL) em vez de achatar tudo com
        // espaço — é isso que permite reconhecer parágrafo/cabeçalho reais
        // (ver js/core/estruturaTexto.js) em vez de uma janela fixa de caracteres.
        // A checagem de "tem texto digital suficiente?" usa analisarEstrutura()
        // só pela mesma métrica de sempre (texto.length já limpo de
        // espaçamento) — o resultado em si é descartado; a estrutura FINAL é
        // recalculada depois de normalizarTexto() (Etapa 1), mais abaixo.
        const textoComQuebras = juntarItensComQuebras(conteudoTexto.items);
        let textoBruto = textoComQuebras;
        let fonte = 'digital';

        if(analisarEstrutura(textoComQuebras).texto.length < MIN_CARACTERES_TEXTO_DIGITAL){
          // Página provavelmente escaneada (imagem) -> OCR
          atualizarProgressoLeitura(n, totalAProcessar, `OCR na página ${n} de ${totalAProcessar} (sem texto digital) — "${arquivo.name}"`);
          // O texto que sai do Tesseract também traz quebras de linha reais
          // (\n entre linhas, \n\n entre parágrafos).
          textoBruto = await ocrDaPagina(pagina);
          fonte = 'ocr';
        }

        // Etapa 1 do checklist (js/core/normalizadorTexto.js): limpeza
        // pré-estrutural do texto bruto (caracteres invisíveis, hifenização,
        // linha quebrada por wrap, espaços, aspas) — roda ANTES da análise de
        // parágrafo/cabeçalho, para ela trabalhar sobre texto já limpo.
        const textoLimpo = (typeof normalizarTexto === 'function') ? normalizarTexto(textoBruto) : textoBruto;

        // ATUALIZAÇÃO 55 (achado do usuário — rastreabilidade de offsets):
        // a normalização "Etapa 2" (normalizarTextoExtraido — corrige erro
        // de OCR ancorado, normaliza moeda/data/percentual/espaçamento)
        // rodava DEPOIS da análise estrutural (mais abaixo), sobre um texto
        // que JÁ tinha `.paragrafos`/`.cabecalhos`/`.linhas` calculados. Se
        // a Etapa 2 mudasse o COMPRIMENTO do texto (ex.: "R$450000" vira
        // "R$ 450.000,00", mais longo), esses offsets deixavam de
        // corresponder exatamente ao texto final — um risco real de
        // rastreabilidade, mesmo sem nenhum consumidor atual do domínio
        // previdenciário sofrer com isso na prática (só
        // classificadorExtrator.js/janelaEstrutural() usa esses offsets
        // hoje, e nenhum módulo do domínio previdenciário o chama).
        // Corrigido pela regra que o usuário propôs: normalizar
        // COMPLETAMENTE primeiro (Etapa 1 + Etapa 2), estruturar depois —
        // analisarEstrutura() (mais abaixo) agora sempre roda sobre o texto
        // já 100% normalizado, então os offsets que ela produz sempre
        // batem com `pagina.texto` final, por construção (não há mais uma
        // 2ª normalização depois de calculá-los).
        let textoTotalmenteNormalizado = textoLimpo;
        if(typeof normalizarTextoExtraido === 'function'){
          try{
            textoTotalmenteNormalizado = normalizarTextoExtraido(textoLimpo, fonte);
          }catch(erroNormalizacao){
            paginasComErro.push({ numero: n, motivo: 'falha ao normalizar o texto extraído: ' + String((erroNormalizacao && erroNormalizacao.message) || erroNormalizacao) });
          }
        }

        // Checklist mestre, Fase 1, item 3 ("não perder o texto bruto"):
        // `textoBruto` (a extração crua do pdf.js/Tesseract, ANTES de
        // qualquer limpeza/normalização) segue junto até a página final —
        // antes, só existia como variável local deste laço e era descartado
        // aqui mesmo, sem sobreviver nem em paginasBrutas. Fundamental para
        // auditoria: sem isto, não dá pra verificar depois se um erro veio da
        // leitura em si (pdf.js/OCR) ou de uma das etapas de normalização.
        paginasBrutas.push({ numero: n, texto: textoTotalmenteNormalizado, textoBruto, fonte });

        // Libera referências da página o quanto antes (páginas de PDF grandes
        // seguram recursos internos do pdf.js até o garbage collector passar).
        pagina.cleanup && pagina.cleanup();
      }catch(erroPagina){
        if(erroPagina instanceof LeituraCanceladaError) throw erroPagina; // cancelamento do usuário nunca é engolido por este catch
        const motivo = String((erroPagina && erroPagina.message) || erroPagina);
        paginasComErro.push({ numero: n, motivo });
        paginasBrutas.push({ numero: n, texto: '', textoBruto: '', fonte: 'falha', erroLeitura: motivo });
      }
    }

    numeroPagina = fimDoLote + 1;
    await cederControleUi(); // deixa a barra repintar e a UI responder antes do próximo lote
  }

  // Cabeçalho/rodapé repetido e página vazia (itens 6-8 da Etapa 1) só dão
  // pra detectar com o documento inteiro em mãos — por isso rodam aqui,
  // depois de todas as páginas lidas, não dentro do loop acima.
  const { paginas: textosProntos, paginasVazias } = (typeof normalizarDocumento === 'function')
    ? normalizarDocumento(paginasBrutas)
    : { paginas: paginasBrutas.map(p => p.texto), paginasVazias: paginasBrutas.map(() => false) };

  // Análise estrutural (parágrafo/cabeçalho/linha) de TODAS as páginas do
  // documento de uma vez. Antes rodava num forEach síncrono aqui mesmo; em
  // PDFs de dezenas de páginas isso travava a tela num bloco só de regex.
  // Agora roda num Web Worker (js/core/workers/estruturaTextoWorker.js, via o
  // wrapper js/core/estruturaTextoAsync.js) — com fallback automático e
  // silencioso para o cálculo síncrono de antes se o navegador não tiver
  // Worker ou se ele falhar por qualquer motivo (ver comentários lá).
  const estruturas = (typeof analisarEstruturaEmLote === 'function')
    ? await analisarEstruturaEmLote(textosProntos)
    : textosProntos.map(t => {
        try{ return analisarEstrutura(t); }
        catch(erroEstrutura){ return { texto: '', paragrafos: [], cabecalhos: [], linhas: [] }; }
      });

  const paginas = [];
  paginasBrutas.forEach((pb, i) => {
    const estrutura = estruturas[i];
    // ATUALIZAÇÃO 55: `estrutura.texto` já é o texto TOTALMENTE normalizado
    // (Etapa 1 + Etapa 2 rodaram antes, no laço de leitura acima) —
    // `estrutura.paragrafos`/`.cabecalhos`/`.linhas` foram calculados sobre
    // ESTE MESMO texto, então os offsets sempre correspondem exatamente ao
    // `texto` final. Nenhuma normalização adicional roda aqui (a 2ª chamada
    // de normalizarTextoExtraido() que existia neste ponto foi removida —
    // ela é quem causava o descompasso de offsets).
    const texto = estrutura.texto;
    paginas.push({
      numero: pb.numero, texto, fonte: pb.fonte,
      // Checklist mestre, Fase 1, item 3: `texto` (acima) é o texto final,
      // já normalizado em todas as etapas (Etapa 1 de normalizarTexto() +
      // Etapa 2 de normalizarTextoExtraido()) — é o que todo o resto do
      // pipeline (classificadorExtrator.js, inteligenciaJuridica.js etc.)
      // usa, e continua sendo `pagina.texto` por compatibilidade com as
      // centenas de leituras já existentes desse campo. `textoOriginal`
      // guarda o texto CRU do pdf.js/OCR, sem nenhuma normalização — para
      // auditoria: dá pra conferir depois se um valor errado veio de uma
      // leitura ruim (pdf.js/OCR) ou de alguma etapa de normalização.
      // `textoNormalizado` é só um alias do `texto` final, sob o nome que
      // bate com o vocabulário do checklist (textRaw/textNormalized) — não
      // é um terceiro texto diferente, é o mesmo valor com um nome a mais.
      textoOriginal: pb.textoBruto,
      textoNormalizado: texto,
      paragrafos: estrutura.paragrafos, cabecalhos: estrutura.cabecalhos, linhas: estrutura.linhas,
      vazia: !!paginasVazias[i],
      erroLeitura: pb.erroLeitura || null
    });
  });
  await cederControleUi();

  const { paginasExtras, anexosNaoLidos } = await lerAnexosDoPdf(pdf, arquivo.name);
  paginas.push(...paginasExtras);

  await pdf.destroy();

  const tempoMs = performance.now() - inicio;

  // Módulo 2 (js/core/indiceInvertido.js): construído automaticamente aqui, com
  // TODAS as páginas do arquivo já prontas (principal + anexos) — quem
  // consumir o resultado de lerUmPdf() já recebe o índice pronto, sem
  // precisar chamar nada manualmente para buscar um termo por página/
  // bloco/parágrafo/linha depois.
  const indiceInvertido = (typeof construirIndiceInvertido === 'function')
    ? construirIndiceInvertido(paginas)
    : null;

  return { nomeArquivo: arquivo.name, paginas, truncado, totalPaginasOriginal, tempoMs, anexosLidos: paginasExtras.length, anexosNaoLidos, paginasComErro, indiceInvertido };
}

// Renderiza a página em um canvas numa dada escala, com uma rotação
// ADICIONAL (em graus) somada à rotação já declarada no PDF (pagina.rotate).
// Rotação 0 sempre respeita o que o PDF já declara — as tentativas de
// 90/180/270 só entram quando a confiança do OCR na rotação declarada foi
// baixa (ver ocrDaPagina).
async function renderizarPaginaEmCanvas(pagina, escala, rotacaoExtra){
  const rotacaoBase = pagina.rotate || 0;
  const viewport = pagina.getViewport({ scale: escala, rotation: (rotacaoBase + rotacaoExtra + 360) % 360 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const contexto = canvas.getContext('2d');
  await pagina.render({ canvasContext: contexto, viewport }).promise;
  return canvas;
}

function liberarCanvas(canvas){
  canvas.width = 0;
  canvas.height = 0;
}

// Pré-processamento simples de imagem para ajudar o OCR em digitalizações
// de baixa qualidade: converte para escala de cinza (reduz ruído de cor de
// papel amarelado/desbotado) e alarga o contraste entre o tom mais claro e
// o mais escuro encontrados na própria página — sem isso, digitalizações
// "lavadas" (pouco contraste entre tinta e fundo) confundem bastante o
// Tesseract. Roda direto no canvas já renderizado, antes de mandar pro OCR.
function prepararCanvasParaOcr(canvas){
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const totalPixels = canvas.width * canvas.height;
  const cinza = new Uint8ClampedArray(totalPixels);
  let min = 255, max = 0;
  for(let i = 0, j = 0; i < d.length; i += 4, j++){
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    cinza[j] = g;
    if(g < min) min = g;
    if(g > max) max = g;
  }
  const alcance = Math.max(1, max - min);
  for(let i = 0, j = 0; i < d.length; i += 4, j++){
    const v = Math.round(((cinza[j] - min) / alcance) * 255);
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
}

// Tesseract.js devolve `data.text` já com quebras de linha reais (uma por
// linha detectada, linha em branco entre blocos/parágrafos) — a MESMA
// informação estrutural que js/core/estruturaTexto.js e os extratores
// previdenciários (linha a linha) dependem para funcionar. Até a
// Atualização 54, este ponto fazia `.replace(/\s+/g, ' ')`, que também
// colapsava \n em espaço — destruindo TODA quebra de linha do OCR antes
// mesmo dela chegar ao resto do pipeline. O efeito prático: qualquer
// página escaneada (a maioria dos CNIS/PPP reais impressos e digitalizados)
// perdia a principal informação que o seletor estrutural e os extratores
// usam pra separar "isto é uma linha de vínculo" de "isto é a linha
// seguinte" — tudo virava uma sopa de texto de uma linha só, e o sistema
// caía silenciosamente no comportamento antigo de janela fixa (ver
// estruturaTexto.js, linha ~39). Corrigido preservando as quebras reais:
// só o espaçamento DENTRO de cada linha é normalizado (múltiplos
// espaços/tabs viram um só), nunca a quebra em si; linhas em branco
// seguidas são limitadas a no máximo uma (separador de parágrafo), e cada
// linha é aparada nas pontas.
function normalizarTextoOcrPreservandoLinhas(textoBruto) {
  return String(textoBruto || '')
    .split('\n')
    .map(function (linha) { return linha.replace(/[ \t]+/g, ' ').trim(); })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function ocrDoCanvas(canvas){
  const worker = await obterWorkerOcr();
  const { data } = await worker.recognize(canvas);
  return {
    texto: normalizarTextoOcrPreservandoLinhas(data && data.text),
    confianca: (data && typeof data.confidence === 'number') ? data.confidence : 0
  };
}

// OCR de uma página com tentativas progressivas — cobre "baixa qualidade"
// e "páginas giradas" do checklist. A maioria das páginas (qualidade normal,
// rotação já correta) faz UMA tentativa só; o custo extra (resolução maior,
// depois rotações alternativas) só é pago quando a confiança do próprio
// Tesseract sai baixa, então PDFs bons não ficam mais lentos por isto.
async function ocrDaPagina(pagina){
  let canvas = await renderizarPaginaEmCanvas(pagina, ESCALA_OCR_PADRAO, 0);
  prepararCanvasParaOcr(canvas);
  let melhor = await ocrDoCanvas(canvas);
  liberarCanvas(canvas);

  if(melhor.confianca < LIMIAR_CONFIANCA_OCR_RETENTATIVA){
    // Provável baixa qualidade/imagem borrada: mais resolução antes de
    // gastar tentativas de rotação, que não ajudariam nesse caso.
    canvas = await renderizarPaginaEmCanvas(pagina, ESCALA_OCR_ALTA, 0);
    prepararCanvasParaOcr(canvas);
    const tentativaAltaRes = await ocrDoCanvas(canvas);
    liberarCanvas(canvas);
    if(tentativaAltaRes.confianca > melhor.confianca) melhor = tentativaAltaRes;
  }

  if(melhor.confianca < LIMIAR_CONFIANCA_OCR_RETENTATIVA){
    // Ainda ruim — pode ser página girada sem o PDF declarar isso nos
    // metadados (comum em digitalização por celular). Testa as outras 3
    // rotações e fica com a de maior confiança do próprio OCR.
    for(const graus of [90, 180, 270]){
      canvas = await renderizarPaginaEmCanvas(pagina, ESCALA_OCR_PADRAO, graus);
      prepararCanvasParaOcr(canvas);
      const tentativa = await ocrDoCanvas(canvas);
      liberarCanvas(canvas);
      if(tentativa.confianca > melhor.confianca) melhor = tentativa;
    }
  }

  return melhor.texto;
}

/* ------------------------------------------------------------------------
   4.1 ANEXOS INCORPORADOS AO PDF
   PDFs podem ter arquivos incorporados nativamente (não confundir com
   "anexo de e-mail"): pericias, plantas, comprovantes anexados pelo
   cartório/sistema do tribunal. pdf.js expõe isso via pdf.getAttachments().
   Se o anexo for outro PDF, ele é lido e suas páginas entram no pipeline
   junto com as do arquivo principal, identificadas por
   "<arquivo principal> → anexo: <nome>". Anexos que não são PDF (imagem,
   docx etc.) não são lidos automaticamente — ficam listados no relatório
   para o advogado abrir manualmente se for relevante.
------------------------------------------------------------------------ */
async function lerAnexosDoPdf(pdf, nomeArquivoPrincipal){
  const paginasExtras = [];
  const anexosNaoLidos = [];
  let anexos = null;
  try{ anexos = await pdf.getAttachments(); }catch(e){ anexos = null; }
  if(!anexos) return { paginasExtras, anexosNaoLidos };

  const nomes = Object.keys(anexos);
  for(const nomeAnexo of nomes){
    verificarCancelamento();
    const anexo = anexos[nomeAnexo];
    const conteudo = anexo && anexo.content;
    if(!conteudo || !conteudo.length) continue;

    const assinaturaPdf = conteudo.length > 4 && conteudo[0] === 0x25 && conteudo[1] === 0x50 && conteudo[2] === 0x44 && conteudo[3] === 0x46; // "%PDF"
    const pareceSerPdf = /\.pdf$/i.test(nomeAnexo) || assinaturaPdf;

    if(!pareceSerPdf){
      anexosNaoLidos.push({ nome: nomeAnexo, motivo: 'tipo de arquivo não suportado para leitura automática (só anexos em PDF são lidos)' });
      continue;
    }

    try{
      const pdfAnexo = await pdfjsLib.getDocument({ data: conteudo }).promise;
      const totalAnexo = Math.min(pdfAnexo.numPages, LIMITE_PAGINAS_PDF);
      const paginasBrutasAnexo = []; // cada anexo é tratado como documento próprio (cabeçalho/rodapé repetido não se mistura com o arquivo principal nem com outro anexo)
      for(let n = 1; n <= totalAnexo; n++){
        verificarCancelamento();
        atualizarProgressoLeitura(n, totalAnexo, `Lendo anexo "${nomeAnexo}" (pág. ${n} de ${totalAnexo}) — "${nomeArquivoPrincipal}"`);
        // Mesmo isolamento por página do documento principal (ver 4. LEITURA
        // DE UM PDF acima): uma página só do anexo com falha não descarta as
        // demais páginas do mesmo anexo já lidas com sucesso.
        try{
          const paginaAnexo = await pdfAnexo.getPage(n);
          const conteudoTexto = await paginaAnexo.getTextContent();
          const textoComQuebras = juntarItensComQuebras(conteudoTexto.items);
          let textoBruto = textoComQuebras;
          let fonte = 'digital';
          if(analisarEstrutura(textoComQuebras).texto.length < MIN_CARACTERES_TEXTO_DIGITAL){
            textoBruto = await ocrDaPagina(paginaAnexo);
            fonte = 'ocr';
          }
          const textoLimpo = (typeof normalizarTexto === 'function') ? normalizarTexto(textoBruto) : textoBruto;
          // ATUALIZAÇÃO 55 (mesma correção do documento principal, ver
          // acima): normaliza TUDO (Etapa 1 + Etapa 2) antes de calcular
          // qualquer offset estrutural, pra `.paragrafos`/`.cabecalhos`/
          // `.linhas` sempre corresponderem exatamente ao texto final.
          let textoTotalmenteNormalizado = textoLimpo;
          if(typeof normalizarTextoExtraido === 'function'){
            try{ textoTotalmenteNormalizado = normalizarTextoExtraido(textoLimpo, fonte); }
            catch(erroNormalizacaoAnexo){ /* mantém o texto já normalizado até aqui; falha isolada não descarta a página */ }
          }
          // Checklist mestre, Fase 1, item 3 — mesma correção do documento
          // principal, aplicada aqui também: anexos passavam pelo mesmo
          // descarte do texto cru.
          paginasBrutasAnexo.push({ numero: n, texto: textoTotalmenteNormalizado, textoBruto, fonte });
          paginaAnexo.cleanup && paginaAnexo.cleanup();
        }catch(erroPaginaAnexo){
          if(erroPaginaAnexo instanceof LeituraCanceladaError) throw erroPaginaAnexo;
          paginasBrutasAnexo.push({ numero: n, texto: '', textoBruto: '', fonte: 'falha', erroLeitura: String((erroPaginaAnexo && erroPaginaAnexo.message) || erroPaginaAnexo) });
        }
      }
      await pdfAnexo.destroy();

      const { paginas: textosProntosAnexo, paginasVazias: vaziasAnexo } = (typeof normalizarDocumento === 'function')
        ? normalizarDocumento(paginasBrutasAnexo)
        : { paginas: paginasBrutasAnexo.map(p => p.texto), paginasVazias: paginasBrutasAnexo.map(() => false) };

      // Mesmo motivo do trecho equivalente para o documento principal, mais
      // acima: lote inteiro num Worker em vez de forEach síncrono.
      const estruturasAnexo = (typeof analisarEstruturaEmLote === 'function')
        ? await analisarEstruturaEmLote(textosProntosAnexo)
        : textosProntosAnexo.map(t => {
            try{ return analisarEstrutura(t); }
            catch(erroEstruturaAnexo){ return { texto: '', paragrafos: [], cabecalhos: [], linhas: [] }; }
          });

      paginasBrutasAnexo.forEach((pb, i) => {
        const estrutura = estruturasAnexo[i];
        // ATUALIZAÇÃO 55: `estrutura.texto` já é o texto totalmente
        // normalizado (Etapa 1 + Etapa 2 rodaram antes) — sem 2ª
        // normalização aqui, offsets sempre batem com o texto final.
        const texto = estrutura.texto;
        paginasExtras.push({
          numero: pb.numero, texto, fonte: pb.fonte,
          textoOriginal: pb.textoBruto, textoNormalizado: texto,
          paragrafos: estrutura.paragrafos, cabecalhos: estrutura.cabecalhos, linhas: estrutura.linhas,
          vazia: !!vaziasAnexo[i],
          arquivo: `${nomeArquivoPrincipal} → anexo: ${nomeAnexo}`,
          erroLeitura: pb.erroLeitura || null
        });
      });
    }catch(e){
      if(e instanceof LeituraCanceladaError) throw e;
      anexosNaoLidos.push({ nome: nomeAnexo, motivo: 'falha ao abrir o anexo como PDF (pode estar corrompido)' });
    }
  }
  return { paginasExtras, anexosNaoLidos };
}

/* ------------------------------------------------------------------------
   5. ORQUESTRAÇÃO: múltiplos arquivos anexados de uma vez
------------------------------------------------------------------------ */
// Devolve um array de resultados de lerUmPdf(), um por arquivo, na ordem em
// que foram anexados. Interrompe tudo (com toast, sem travar o app) se o
// usuário cancelar ou se algum PDF falhar ao abrir.
async function processarArquivosPdf(arquivos){
  if(!arquivos || !arquivos.length) return [];
  if(LEITOR_PDF_ESTADO.processando){
    toast('Já há uma leitura de PDF em andamento.', true);
    return [];
  }

  iniciarUiProcessamento();
  $('avisoTruncamento').style.display = 'none';
  const resultados = [];

  try{
    for(const arquivo of arquivos){
      verificarCancelamento();
      if(arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')){
        toast(`"${arquivo.name}" ignorado (não é um PDF).`, true);
        continue;
      }
      const resultado = await lerUmPdf(arquivo);
      resultados.push(resultado);
    }
    return resultados;
  }catch(erro){
    if(erro instanceof LeituraCanceladaError){
      toast('Leitura cancelada.');
    }else{
      console.error(erro);
      toast('Erro ao ler o PDF: ' + erro.message, true);
    }
    return resultados; // devolve o que já foi processado até o cancelamento/erro
  }finally{
    encerrarUiProcessamento();
    esconderProgressoLeitura();
    await encerrarWorkerOcr(); // não deixa o worker do Tesseract vivo consumindo memória entre leituras
  }
}

/* ------------------------------------------------------------------------
   6. LIGAÇÃO COM A UI (botão, input file, drag & drop, cancelar)
   O disparo do pipeline completo (ler -> classificar -> extrair ->
   inteligência jurídica -> conferência) é feito por
   iniciarPipelineLeituraPdf(arquivos), definido em painelConferencia.js.
------------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', function(){
  const zona = $('zonaDropPdf');
  const input = $('inputPdf');

  $('btnAnexarPdf').addEventListener('click', () => input.click());
  zona.addEventListener('click', () => input.click());
  zona.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') input.click(); });

  input.addEventListener('change', () => {
    if(input.files && input.files.length){
      const arquivos = Array.from(input.files);
      input.value = ''; // permite reanexar o mesmo arquivo depois
      if(typeof iniciarPipelineLeituraPdf === 'function') iniciarPipelineLeituraPdf(arquivos);
    }
  });

  ['dragenter', 'dragover'].forEach(evento => {
    zona.addEventListener(evento, e => { e.preventDefault(); zona.classList.add('arrastando'); });
  });
  ['dragleave', 'drop'].forEach(evento => {
    zona.addEventListener(evento, e => { e.preventDefault(); zona.classList.remove('arrastando'); });
  });
  zona.addEventListener('drop', e => {
    const arquivos = Array.from(e.dataTransfer.files || []);
    if(arquivos.length && typeof iniciarPipelineLeituraPdf === 'function') iniciarPipelineLeituraPdf(arquivos);
  });

  $('btnCancelarLeitura').addEventListener('click', () => {
    LEITOR_PDF_ESTADO.cancelado = true;
  });

  renderizarHistoricoLeituraPdf();
});
