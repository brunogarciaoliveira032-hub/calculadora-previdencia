/* ============================================================================
   ESTRUTURATEXTO.JS — resolve a pendência do checklist "considerar o
   parágrafo inteiro" e "considerar títulos e cabeçalhos".

   PROBLEMA que este arquivo resolve: classificadorExtrator.js/
   inteligenciaJuridica.js sempre procuraram o valor associado a uma âncora
   ("oferta administrativa", "depósito judicial"...) dentro de uma JANELA DE
   CARACTERES fixa (ex.: 100, 120) a partir do fim da âncora. Isso tem dois
   problemas opostos:
     1) se o valor está mais longe que a janela (mas ainda no mesmo
        parágrafo), a busca falha por completo — mesmo com o dado presente;
     2) se o parágrafo acaba antes da janela e o texto seguinte já é de
        OUTRO assunto (ou um título/cabeçalho de outra seção), a janela
        pode "vazar" para lá e associar um valor errado à âncora.

   SOLUÇÃO: em vez de "andar N caracteres", andamos até o fim do parágrafo
   real que contém a âncora, mas nunca além do próximo título/cabeçalho —
   com um teto de segurança para não devorar a página inteira se a
   detecção de estrutura falhar.

   ENTRADA necessária: texto com quebras de linha PRESERVADAS (uma âncora
   real do fim de linha, não espaço). Isso é o que muda na arquitetura:
   leitorPdf.js deixou de achatar tudo em uma única string com
   `.join(' ')` ANTES de analisar a página — agora preserva `hasEOL` do
   pdf.js (texto digital) e as quebras reais do próprio Tesseract (OCR)
   até este módulo processar, e só então devolve a versão achatada (que
   classificarPaginas()/extrairCampos() continuam recebendo exatamente como
   antes, em p.texto).

   LIMITAÇÃO HONESTA (mesmo espírito de confiança do resto do projeto): sem
   coordenadas de posição (x/y) de cada item — que o pdf.js expõe mas que
   não valia a pena consumir aqui —, "parágrafo" e "cabeçalho" são
   detectados por heurística textual (linha em branco = novo parágrafo;
   linha curta/toda em caixa alta/numerada = cabeçalho), não por layout
   real. Funciona bem para o padrão de petições/sentenças/laudos em
   português, mas não é infalível — por isso o teto de segurança
   (JANELA_SEGURANCA_MAXIMA) sempre se aplica, e páginas SEM nenhuma quebra
   de linha detectável (ex.: texto que já chegou achatado) não acionam a
   heurística nova: caem no comportamento antigo (janela fixa), em vez de
   fingir uma estrutura que não existe.
============================================================================ */

// Teto de segurança: mesmo dentro do "mesmo parágrafo", a janela nunca
// cresce alem disso a partir da âncora. Bem maior que qualquer janela fixa
// usada hoje (40 a 120 caracteres) para de fato permitir "o parágrafo
// inteiro", mas limitado para não varrer a página toda se a detecção de
// parágrafo falhar (ex.: PDF sem nenhuma linha em branco real).
const JANELA_SEGURANCA_MAXIMA = 800;

// Junta os itens de conteudoTexto.getTextContent() do pdf.js preservando
// quebra de linha real (it.hasEOL) em vez de sempre juntar com espaço.
// Sem hasEOL (ex.: mocks de teste antigos, com um único item por página),
// o resultado é idêntico ao `.join(' ')` de antes.
function juntarItensComQuebras(itens){
  let texto = '';
  (itens || []).forEach((it, i) => {
    texto += it.str || '';
    if(it.hasEOL) texto += '\n';
    else if(i < itens.length - 1) texto += ' ';
  });
  return texto;
}

// Heurística de "isto parece um título/cabeçalho de seção", não uma frase
// de corpo de texto. Pensada para o padrão de peças jurídicas brasileiras:
// "DOS JUROS COMPENSATÓRIOS", "II - DOS FATOS", "3. DO MÉRITO",
// "Capítulo III", "Da tutela de urgência".
function pareceCabecalho(linha){
  if(!linha || linha.length > 90) return false;
  if(/[,;]$/.test(linha)) return false; // termina em vírgula/ponto-e-vírgula: continua na próxima linha, não é título

  const letras = linha.replace(/[^a-zà-üA-ZÀ-Ü]/g, '');
  if(letras.length < 3) return false;
  const maiusculas = letras.replace(/[^A-ZÀ-Ü]/g, '');
  const todaCaixaAlta = maiusculas.length === letras.length;

  if(todaCaixaAlta && letras.length <= 60) return true; // "DOS JUROS COMPENSATÓRIOS"

  const numeracaoSecao = /^(?:[IVXLCDM]{1,6}|\d{1,3})\s*[-–.)ºª]+\s*(?:d[oa]s?\s+)?[A-ZÀ-Ü]/;
  if(numeracaoSecao.test(linha) && linha.length <= 60) return true; // "II - DOS FATOS", "3. DO MÉRITO"

  const palavraSecao = /^(cap[íi]tulo|se[çc][ãa]o|subse[çc][ãa]o|t[íi]tulo|anexo)\b/i;
  if(palavraSecao.test(linha) && linha.length <= 60) return true; // "Capítulo III", "Seção 2"

  const rotuloDoDa = /^d[oa]s?\s+[a-zà-üA-ZÀ-Ü ]{3,55}$/i;
  if(rotuloDoDa.test(linha) && linha.split(' ').length <= 8) return true; // "Da tutela de urgência"

  return false;
}

// Recebe texto COM quebras de linha (ver juntarItensComQuebras / saída
// crua do OCR) e devolve:
//   texto       — versão achatada (mesmo resultado de antes: uma linha só,
//                 espaçamento normalizado) — é isto que continua indo para
//                 p.texto, sem mudar nenhum outro consumidor existente.
//   paragrafos  — [{inicio, fim}] em índices de `texto`, um por parágrafo
//                 de corpo (cabeçalhos não contam como parágrafo).
//   cabecalhos  — [{inicio, fim}] em índices de `texto`.
//   linhas      — [{inicio, fim}] em índices de `texto`, uma por linha não
//                 vazia do documento original (cabeçalhos incluídos, já que
//                 uma linha de cabeçalho também é "uma linha" do texto).
//
// ATUALIZAÇÃO 54 (achado do usuário, crítico): até esta entrega, `texto`
// juntava as linhas com ESPAÇO (" "), não com quebra de linha — ou seja,
// mesmo textos COM quebras de linha reais (`bruto.indexOf('\n') !== -1`,
// o branch que deveria preservar estrutura) saíam achatados numa única
// "linha lógica" no campo que leitorPdf.js usa como `pagina.texto` — o
// MESMO campo que os extratores previdenciários (extratorVinculosCNIS.js/
// extratorRemuneracoesCNIS.js, que dependem de `texto.split(/\r?\n/)`)
// consomem. Na prática, todo texto — digital OU OCR, mesmo depois da
// correção do achatamento em ocrDoCanvas() — chegava aos extratores como
// um único bloco sem quebra de linha nenhuma, o que também inutilizava
// silenciosamente a camada de reconstrução tokenizada
// (reconstrucaoTabelaPrevidenciaria.js): ela encontraria só o PRIMEIRO
// token de cada tipo na página inteira, não um candidato por linha.
// Corrigido juntando as linhas com quebra de linha real — nenhum
// consumidor hoje depende do formato antigo (conferido: só este arquivo e
// leitorPdf.js leem `.paragrafos`/`.cabecalhos`/`.linhas`, e nenhum dos
// dois faz suposição sobre o separador usado dentro de `texto`).
function analisarEstrutura(textoComQuebras){
  const bruto = String(textoComQuebras || '');

  if(bruto.indexOf('\n') === -1){
    // Sem nenhuma quebra de linha real: não há evidência de estrutura.
    // Mantém o comportamento anterior (só limpa espaçamento) em vez de
    // inventar um único "parágrafo" do tamanho da página inteira.
    return { texto: bruto.replace(/[ \t]+/g, ' ').trim(), paragrafos: [], cabecalhos: [], linhas: [] };
  }

  let normalizado = bruto.replace(/\r\n|\r/g, '\n');
  // desfaz hifenização de quebra de linha ANTES de separar em linhas, para
  // não tratar "indeniza-" / "ção" como duas linhas distintas na heurística
  normalizado = normalizado.replace(/([a-zà-ÿ])-\s*\n\s*([a-zà-ÿ])/gi, '$1$2');
  normalizado = normalizado.replace(/([a-zà-ÿ])-[ \t]+([a-zà-ÿ])/g, '$1$2');

  const linhasBrutas = normalizado.split('\n');
  let texto = '';
  const paragrafos = [];
  const cabecalhos = [];
  // Uma entrada por linha NÃO VAZIA do documento original, em índices de
  // `texto` — linhas em branco não entram aqui (elas só marcam fim de
  // parágrafo, não são uma linha de conteúdo).
  const linhas = [];
  let inicioParagrafoAtual = 0;
  let temConteudoNoParagrafo = false;

  const fecharParagrafo = fimOffset => {
    if(temConteudoNoParagrafo && fimOffset > inicioParagrafoAtual){
      paragrafos.push({ inicio: inicioParagrafoAtual, fim: fimOffset });
    }
    temConteudoNoParagrafo = false;
  };

  linhasBrutas.forEach(linhaBruta => {
    const linha = linhaBruta.replace(/[ \t]+/g, ' ').trim();

    if(linha === ''){
      // linha em branco = fim de parágrafo (sinal mais forte que existe
      // sem coordenadas de layout) — preservada como quebra dupla em
      // `texto` (marca visualmente o fim de parágrafo pra quem lê o texto
      // final, sem duplicar caso já haja uma quebra pendente).
      fecharParagrafo(texto.length);
      inicioParagrafoAtual = texto.length;
      if(texto.length > 0 && !texto.endsWith('\n')) texto += '\n';
      return;
    }

    if(texto.length > 0 && !texto.endsWith('\n')) texto += '\n';
    const inicioLinha = texto.length;
    texto += linha;
    const fimLinha = texto.length;
    linhas.push({ inicio: inicioLinha, fim: fimLinha });

    if(pareceCabecalho(linha)){
      // cabeçalho fecha o parágrafo anterior e não é, ele mesmo, corpo de parágrafo
      fecharParagrafo(inicioLinha);
      cabecalhos.push({ inicio: inicioLinha, fim: fimLinha });
      inicioParagrafoAtual = fimLinha;
    } else {
      temConteudoNoParagrafo = true;
    }
  });
  fecharParagrafo(texto.length);

  return { texto: texto.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim(), paragrafos, cabecalhos, linhas };
}

// Substitui "andar `janelaBase` caracteres" por "andar até o fim do
// parágrafo que contém `inicio`, sem nunca atravessar o próximo
// cabeçalho, com teto de segurança". `pagina` é o objeto de página
// (precisa ter .paragrafos/.cabecalhos, do jeito que leitorPdf.js agora
// preenche); sem isso (página sem estrutura detectada, ou chamada antiga
// sem passar `pagina`), devolve exatamente `inicio + janelaBase` — o
// comportamento de sempre.
function janelaEstrutural(pagina, inicio, janelaBase){
  const fimPadrao = inicio + janelaBase;
  if(!pagina || !Array.isArray(pagina.paragrafos) || pagina.paragrafos.length === 0){
    return fimPadrao;
  }

  const paragrafo = pagina.paragrafos.find(pg => pg.inicio <= inicio && pg.fim > inicio);
  const fimParagrafo = paragrafo ? paragrafo.fim : Math.min(fimPadrao, inicio + JANELA_SEGURANCA_MAXIMA);

  const cabecalhos = Array.isArray(pagina.cabecalhos) ? pagina.cabecalhos : [];
  let inicioProxCabecalho = Infinity;
  cabecalhos.forEach(c => { if(c.inicio > inicio && c.inicio < inicioProxCabecalho) inicioProxCabecalho = c.inicio; });

  const fim = Math.min(fimParagrafo, inicioProxCabecalho, inicio + JANELA_SEGURANCA_MAXIMA);
  return Math.max(fim, inicio);
}
