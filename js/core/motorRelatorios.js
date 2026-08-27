/* ============================================================================
   MOTORRELATORIOS.JS — mecanismo genérico de geração de relatórios (PDF via
   jsPDF/jsPDF-AutoTable e planilha via SheetJS/XLSX), separado de
   js/exportarPDF.js e js/exportarExcel.js (Atualização "exportarPDF.js/
   exportarExcel.js" do roteiro de migração — ver
   docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md).

   MESMO PADRÃO DE js/core/motorValidacao.js: este arquivo NÃO sabe nada de
   desapropriação — nenhum nome de campo (expropriante/oferta/sentença),
   nenhuma regra jurídica, nenhum rótulo de tela. É layout/mecânica pura de
   PDF e planilha: cabeçalho com timbre, tabela com auto-quebra de página,
   bloco de texto colorido por "nível" (útil pra qualquer lista de
   auditoria/alerta, de qualquer domínio), selo/assinatura com QR opcional,
   e os helpers de célula/formato/aba do lado do Excel. Um domínio "monta" o
   conteúdo (quais linhas, quais valores, em que ordem) e entrega pronto pra
   este motor desenhar.

   DEPENDE de: js/core/util.js (fmt/fmtData/hashDocumento/
   formatarCodigoVerificacao — já genéricos, não precisam ser reembrulhados
   aqui) precisa estar carregado ANTES deste arquivo pros helpers de selo
   funcionarem; bibliotecas de terceiro window.jspdf.jsPDF, window.QRCode
   (opcional) e window.XLSX, exatamente como antes.
============================================================================ */

/* ---------------------------------------------------------------------------
   LADO PDF
--------------------------------------------------------------------------- */

// Cria o documento jsPDF e devolve as medidas de página já calculadas —
// todo desenho subsequente parte desses valores em vez de números soltos.
function iniciarPdf(opcoes){
  const formato = (opcoes && opcoes.formato) || 'a4';
  const unidade = (opcoes && opcoes.unidade) || 'mm';
  const margin = (opcoes && opcoes.margin) != null ? opcoes.margin : 16;
  if(!window.jspdf || !window.jspdf.jsPDF) throw new Error('Biblioteca de PDF não carregada (verifique sua conexão com a internet).');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: unidade, format: formato });
  // a4 em mm: 210x297 — outros formatos poderiam mudar isso, mas nenhum
  // domínio deste app usa outro formato hoje; mantém explícito por clareza.
  return { doc, margin, pageWidth: 210, pageHeight: 297 };
}

// Helper de paginação repetido várias vezes no arquivo original: se `y`
// estourou o limite da página, abre página nova e volta pra margem.
function avancarSeEstourarPagina(doc, y, limite, margin){
  if(y > limite){ doc.addPage(); return margin; }
  return y;
}

// Imprime um array de linhas de texto já formatadas (uma por item), cada uma
// com quebra automática dentro da largura útil da página. Devolve o novo y.
function desenharLinhasDeTexto(doc, linhas, x, y, larguraMax, alturaLinha){
  (linhas || []).filter(Boolean).forEach(linha => {
    const linhasQuebradas = doc.splitTextToSize(linha, larguraMax);
    doc.text(linhasQuebradas, x, y);
    y += (alturaLinha || 5.5) * linhasQuebradas.length;
  });
  return y;
}

// Envolve doc.autoTable com os defaults já usados no relatório original
// (fillColor do cabeçalho/rodapé, fontSize) — quem chama só passa o que
// muda de fato (head/body/foot/columnStyles/didParseCell). Devolve o y logo
// abaixo da tabela desenhada.
function desenharTabelaAuto(doc, opcoes){
  doc.autoTable(Object.assign({
    headStyles: { fillColor: [22,35,63] },
    styles: { fontSize: 9.5, overflow: 'linebreak' }
  }, opcoes));
  return doc.lastAutoTable.finalY;
}

// Bloco de texto colorido por "nível" (erro/alerta/ok/info por padrão) —
// genérico, não sabe o que é auditoria nem de qual domínio:
// só recebe {nivel, msg} e um mapa nivel->[cor, prefixo]. Cuida de paginação
// linha a linha (cada item pode estourar a página sozinho). Devolve o novo y.
const NIVEIS_PADRAO = {
  erro:   { cor: [138,51,36],  prefixo: '[ERRO] ' },
  alerta: { cor: [138,109,29], prefixo: '[ALERTA] ' },
  ok:     { cor: [46,107,79],  prefixo: '[OK] ' },
  info:   { cor: [91,100,114], prefixo: '[INFO] ' }
};
function desenharListaComNiveis(doc, itens, opcoes){
  const margin = opcoes.margin, pageWidth = opcoes.pageWidth, pageHeight = opcoes.pageHeight;
  const niveis = opcoes.niveis || NIVEIS_PADRAO;
  const limiteInferior = opcoes.limiteInferior != null ? opcoes.limiteInferior : (pageHeight - 20);
  let y = opcoes.y;
  (itens || []).forEach(item => {
    const def = niveis[item.nivel] || niveis.info;
    doc.setTextColor(def.cor[0], def.cor[1], def.cor[2]);
    const linhasItem = doc.splitTextToSize(def.prefixo + item.msg, pageWidth - margin*2);
    y = avancarSeEstourarPagina(doc, y, limiteInferior, margin);
    doc.text(linhasItem, margin, y);
    y += linhasItem.length * 4 + 2;
  });
  doc.setTextColor(0,0,0);
  return y;
}

// Bloco de assinatura/selo de verificação com QR opcional. `payloadSelo` é o
// objeto que vira o hash (o CONTEÚDO do payload é decisão do domínio — este
// motor só chama hashDocumento/formatarCodigoVerificacao, já genéricos em
// core/util.js). `linhas` são as linhas de texto já formatadas pelo domínio
// (nome do responsável, data de geração, etc.); a última linha com o código
// de verificação é adicionada automaticamente por este motor. Async por
// causa do QR Code (opcional — falha silenciosa se a lib não carregar).
async function desenharSeloVerificacao(doc, opcoes){
  const margin = opcoes.margin, pageWidth = opcoes.pageWidth;
  let y = opcoes.y;
  const codigoVerificacao = formatarCodigoVerificacao(hashDocumento(JSON.stringify(opcoes.payloadSelo)));

  const qrSize = opcoes.qrSize || 26;
  const temQrLib = !!(window.QRCode && typeof window.QRCode.toDataURL === 'function');
  const larguraTexto = temQrLib ? (pageWidth - margin*2 - qrSize - 6) : (pageWidth - margin*2);

  doc.setFont('helvetica','normal'); doc.setFontSize(9.5);
  doc.setTextColor(22,35,63);
  const yInicioAssinatura = y;
  const linhasAssinatura = (opcoes.linhas || []).concat(['Código de verificação: ' + codigoVerificacao]);
  linhasAssinatura.filter(Boolean).forEach(linha => { doc.text(linha, margin, y); y += 5; });

  if(opcoes.nota){
    doc.setFont('helvetica','italic'); doc.setFontSize(7.6);
    doc.setTextColor(91,100,114);
    const notaLinhas = doc.splitTextToSize(opcoes.nota, larguraTexto);
    doc.text(notaLinhas, margin, y);
    y += notaLinhas.length * 3.4;
    doc.setTextColor(0,0,0);
  }

  if(temQrLib){
    try{
      const conteudoQr = typeof opcoes.conteudoQr === 'function' ? opcoes.conteudoQr(codigoVerificacao) : opcoes.conteudoQr;
      const qrDataUrl = await window.QRCode.toDataURL(conteudoQr, { margin: 1, width: 200 });
      doc.addImage(qrDataUrl, 'PNG', pageWidth - margin - qrSize, yInicioAssinatura - 4, qrSize, qrSize);
      doc.setFont('helvetica','normal'); doc.setFontSize(6.8);
      doc.setTextColor(91,100,114);
      doc.text('Escaneie para validar', pageWidth - margin - qrSize, yInicioAssinatura - 4 + qrSize + 3.5, { align: 'left' });
      doc.setTextColor(0,0,0);
    }catch(errQr){
      // Sem QR Code disponível (ex.: sem internet para carregar a biblioteca):
      // o relatório segue válido apenas com o código de verificação textual.
    }
  }

  return { y, codigoVerificacao };
}

/* ---------------------------------------------------------------------------
   LADO EXCEL
--------------------------------------------------------------------------- */

// Formatos numéricos reutilizados em qualquer planilha exportada pelo app
// (moeda em reais, percentual com 4 casas, fator com 6 casas).
const XLSX_FMT_MOEDA = '"R$" #,##0.00;[Red]\\-"R$" #,##0.00';
const XLSX_FMT_PCT   = '0.0000"%"';
const XLSX_FMT_FATOR = '0.000000';

// Aplica negrito (quando o gerador de xlsx suportar escrita de estilos) sem
// quebrar a planilha nos casos em que o recurso não é suportado — apenas o
// valor e o formato numérico continuam garantidos em qualquer situação.
function xlsxCelula(ws, endereco, valor, opcoes){
  const cel = { v: valor, t: typeof valor === 'number' ? 'n' : 's' };
  if(opcoes && opcoes.z) cel.z = opcoes.z;
  if(opcoes && opcoes.bold) cel.s = { font:{ bold:true } };
  ws[endereco] = cel;
  return cel;
}

// Aplica um formato numérico (.z) numa coluna, por um intervalo de linhas
// (0-based, inclusive) — usado nas colunas de moeda/percentual/fator das
// planilhas de memória de cálculo de qualquer domínio.
function xlsxAplicarFormatoColuna(ws, coluna, linhaInicio, linhaFim, formato){
  for(let r = linhaInicio; r <= linhaFim; r++){
    const addr = XLSX.utils.encode_cell({ r, c: coluna });
    if(ws[addr]) ws[addr].z = formato;
  }
}

// Aplica negrito num conjunto de endereços de célula já resolvidos (ex.:
// ['A3','A4']) — usado nos rótulos de linha das planilhas de identificação/
// parâmetros de qualquer domínio.
function xlsxAplicarNegritoEnderecos(ws, enderecos){
  (enderecos || []).forEach(addr => {
    if(ws[addr]) ws[addr].s = { font:{ bold:true } };
  });
}

// Converte índice de coluna 0-based para letra(s) de planilha (0->A, 25->Z,
// 26->AA...) sem depender de XLSX.utils.encode_col (que nem todo mock/versão
// do SheetJS expõe) — usado só para montar a referência do autofiltro.
function xlsxLetraColuna(indice){
  let letra = '';
  let n = indice;
  while(n >= 0){
    letra = String.fromCharCode(65 + (n % 26)) + letra;
    n = Math.floor(n / 26) - 1;
  }
  return letra;
}

// Constrói uma aba "tabular" genérica: uma linha de cabeçalho em negrito +
// linhas de dados, com largura de coluna, congelamento de painel (freeze) e
// autofiltro opcionais, e um formato numérico por coluna quando informado
// (mapa índice de coluna -> formato .z). Genérico o suficiente para
// qualquer domínio que precise do mesmo formato de exportação (memória de
// cálculo, revisão técnica/auditoria etc.).
function xlsxCriarAbaTabular(header, linhas, opcoes){
  const ws = XLSX.utils.aoa_to_sheet([header, ...linhas]);
  if(opcoes && opcoes.colsWidths) ws['!cols'] = opcoes.colsWidths;
  if(opcoes && opcoes.freeze) ws['!freeze'] = { xSplit:0, ySplit:1, topLeftCell:'A2', activePane:'bottomLeft', state:'frozen' };
  if(opcoes && opcoes.autofilter) ws['!autofilter'] = { ref: 'A1:' + xlsxLetraColuna(header.length - 1) + (linhas.length + 1) };
  header.forEach((_, colIdx) => {
    const addr = XLSX.utils.encode_cell({ r:0, c:colIdx });
    if(ws[addr]) ws[addr].s = { font:{ bold:true } };
  });
  if(opcoes && opcoes.formatosColuna){
    Object.entries(opcoes.formatosColuna).forEach(([coluna, formato]) => {
      xlsxAplicarFormatoColuna(ws, Number(coluna), 1, linhas.length, formato);
    });
  }
  if(opcoes && typeof opcoes.decorarLinha === 'function'){
    linhas.forEach((_, i) => opcoes.decorarLinha(ws, i + 1, i));
  }
  return ws;
}

// Constrói uma aba "de título" genérica (linha 0 = título mesclado em
// negrito sobre as duas primeiras colunas + o restante das linhas como
// array-de-arrays cru) — genérico; quem chama decide o conteúdo, este
// helper só cuida do título mesclado + largura de coluna.
function xlsxCriarAbaComTitulo(linhasAoa, opcoes){
  const ws = XLSX.utils.aoa_to_sheet(linhasAoa);
  if(opcoes && opcoes.colsWidths) ws['!cols'] = opcoes.colsWidths;
  ws['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:1} }];
  xlsxCelula(ws, 'A1', linhasAoa[0][0], { bold:true });
  return ws;
}

// Monta o workbook a partir de {nome, ws} e salva o arquivo.
function xlsxMontarESalvar(abas, props, nomeArquivo){
  const wb = XLSX.utils.book_new();
  wb.Props = props;
  abas.forEach(aba => XLSX.utils.book_append_sheet(wb, aba.ws, aba.nome));
  XLSX.writeFile(wb, nomeArquivo, { cellStyles: true });
}

var MotorRelatorios = {
  // PDF
  iniciarPdf, avancarSeEstourarPagina, desenharLinhasDeTexto,
  desenharTabelaAuto, desenharListaComNiveis, desenharSeloVerificacao,
  // Excel
  XLSX_FMT_MOEDA, XLSX_FMT_PCT, XLSX_FMT_FATOR,
  xlsxCelula, xlsxAplicarFormatoColuna, xlsxAplicarNegritoEnderecos,
  xlsxCriarAbaTabular, xlsxCriarAbaComTitulo, xlsxMontarESalvar
};
