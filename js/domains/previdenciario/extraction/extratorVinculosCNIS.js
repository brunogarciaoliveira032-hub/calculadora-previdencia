/* ============================================================================
   EXTRATORVINCULOSCNIS.JS — extrai VÍNCULOS (empregador + período) de um
   texto de CNIS já lido (js/core/leitorPdf.js). Primeira peça do pipeline
   descrito no roadmap do produto:

     PDF -> leitorPdf.js -> identificarTipoDocumentoPrevidenciario() ->
     "cnis" -> extrairVinculosDoTexto() -> candidatos estruturados ->
     (Atualização futura: candidateSelection previdenciário + field-rules) ->
     mapperPrevidenciario.js -> MotorTempoContribuicao

   CADA VÍNCULO ENCONTRADO NÃO É UM PAR DE CAMPOS SOLTOS — é um objeto
   estruturado com proveniência e confiança, no formato pedido:
     { tipo: 'vinculo', empregador, inicio, fim, fonte: {documento,pagina},
       confianca, status }
   (`status` é 'validado' quando a confiança atinge o limiar e não há
   nenhum conflito detectado; 'requer_revisao' caso contrário — NUNCA
   descartado silenciosamente, mesmo quando a extração encontra algo
   estranho, ex.: datas invertidas.)

   PADRÃO SUPORTADO NESTA ENTREGA (v1.0.0): linha "tabular" de extrato —
   DATA (a|até|-) DATA [separador] EMPREGADOR, com a data de fim podendo
   ser substituída por um marcador de vínculo em aberto ("atual", "em
   aberto", "não informada"). NÃO cobre (registrado como limitação
   consciente, mesmo padrão do resto do projeto):
     - formato "rotulado" em várias linhas (ex.: "Empregador: X" numa
       linha e "Admissão:"/"Saída:" em linhas seguintes) — comum em CTPS,
       fora de escopo desta entrega (só CNIS);
     - remuneração mês a mês, código de ocorrência, indicador de
       contribuinte individual/facultativo;
     - correção de erro de OCR no nome do empregador (maiúsculas trocadas
       por minúsculas etc. — mesma limitação já registrada em
       js/core/leitorPdf.js para outros domínios).

   DEPENDE de (opcional, checado defensivamente): js/core/
   classificadorExtrator.js (parseDataBRParaIso) — sem ele, este arquivo
   usa sua própria conversão de data equivalente, para poder rodar isolado
   em teste unitário sem carregar o core inteiro.
============================================================================ */

var PREV_LIMIAR_CONFIANCA_VALIDADO = 0.8;

// Marcadores de vínculo em aberto (fim ainda não anotado no CNIS) — não é
// o mesmo que "não encontrei a data": aqui o próprio documento diz que o
// vínculo continua.
var PREV_REGEX_FIM_EM_ABERTO = /^(atual|em\s+aberto|em\s+curso|n[ãa]o\s+informad[ao]|indeterminad[ao])$/i;

var PREV_REGEX_DATA = /(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/;

// Linha de vínculo CNIS: DATA (a|até|-|–|—) (DATA|marcador-em-aberto)
// [separador opcional] EMPREGADOR (resto da linha).
var PREV_REGEX_LINHA_VINCULO = new RegExp(
  '^\\s*' +
  '(\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{4})' +          // grupo 1: data início
  '\\s*(?:a|até|-|–|—)\\s*' +
  '(\\d{1,2}[\\/.]\\d{1,2}[\\/.]\\d{4}|atual|em\\s+aberto|em\\s+curso|n[ãa]o\\s+informad[ao]|indeterminad[ao])' + // grupo 2: data fim ou marcador
  '\\s*(?:[-–—:]\\s*)?' +
  '(.+?)\\s*$',                                     // grupo 3: empregador (resto da linha)
  'i'
);

// Ruído comum depois do nome do empregador na mesma linha de um extrato
// real (CNPJ, matrícula, categoria do segurado) — cortado do nome antes de
// virar `empregador`, nunca incluído nele.
var PREV_REGEX_RUIDO_APOS_EMPREGADOR = /\s{2,}(CNPJ|CBO|Matr[íi]cula|Categoria|NIT)\b.*$/i;

function _prevDiasNoMesReal(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function _prevParseDataIso(strData) {
  if (typeof parseDataBRParaIso === 'function') return parseDataBRParaIso(strData);
  var m = PREV_REGEX_DATA.exec(String(strData || ''));
  if (!m) return null;
  var dia = m[1].padStart(2, '0'), mes = m[2].padStart(2, '0'), ano = m[3];
  // Correção (achado da perícia de software): antes só conferia 1-31,
  // aceitando datas calendariamente inexistentes (ex.: 31/02) — agora usa
  // o número real de dias do mês/ano informado.
  if (+mes < 1 || +mes > 12 || +dia < 1 || +dia > _prevDiasNoMesReal(+ano, +mes)) return null;
  return ano + '-' + mes + '-' + dia;
}

function _prevLimparEmpregador(bruto) {
  return String(bruto || '')
    .replace(PREV_REGEX_RUIDO_APOS_EMPREGADOR, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:\s]+$/, '')
    .trim();
}

/**
 * Extrai os vínculos de UMA linha de texto já isolada (sem quebras). Não
 * lança erro para entrada vazia/sem match — devolve `null`. Uso interno de
 * extrairVinculosDoTexto(); exposta porque é útil isoladamente em teste.
 *
 * @returns {{tipo:'vinculo', empregador:string, inicio:string, fim:string|null,
 *            aberto:boolean, confianca:number, status:'validado'|'requer_revisao',
 *            conflitos:string[], trecho:string}|null}
 */
function extrairVinculoDeLinha(linha) {
  var texto = String(linha || '');
  var m = PREV_REGEX_LINHA_VINCULO.exec(texto);
  if (!m) return null;

  var inicioIso = _prevParseDataIso(m[1]);
  var fimBruto = m[2];
  var aberto = PREV_REGEX_FIM_EM_ABERTO.test(fimBruto.trim());
  var fimIso = aberto ? null : _prevParseDataIso(fimBruto);
  var empregador = _prevLimparEmpregador(m[3]);

  if (!inicioIso) return null;          // sem data de início válida não há vínculo a extrair
  if (!aberto && !fimIso) return null;  // fim não é marcador de aberto nem data válida

  var conflitos = [];
  var confianca = 0.9;

  if (empregador.length < 3 || !/[a-zà-ú]/i.test(empregador)) {
    conflitos.push('nome do empregador vazio ou sem conteúdo textual reconhecível');
    confianca -= 0.35;
  }
  if (!aberto && fimIso && inicioIso > fimIso) {
    conflitos.push('data de início posterior à data de fim (possível inversão de colunas)');
    confianca -= 0.4;
  }
  if (aberto) confianca -= 0.03; // vínculo em aberto é uma leitura levemente menos certa que um período fechado

  confianca = Math.max(0.05, Math.min(0.98, confianca));
  var status = (confianca >= PREV_LIMIAR_CONFIANCA_VALIDADO && conflitos.length === 0) ? 'validado' : 'requer_revisao';

  return {
    tipo: 'vinculo',
    empregador: empregador || null,
    inicio: inicioIso,
    fim: fimIso,
    aberto: aberto,
    confianca: Math.round(confianca * 100) / 100,
    status: status,
    conflitos: conflitos,
    trecho: texto.trim()
  };
}

/**
 * Extrai todos os vínculos de um texto de CNIS (várias linhas), anexando
 * `.fonte.documento` ('CNIS') e `.fonte.pagina` (de `pagina.numero`, se
 * fornecida) a cada candidato. Nunca lança erro: texto sem nenhum vínculo
 * reconhecível devolve array vazio.
 *
 * Roda em DUAS PASSADAS, cada uma só nas linhas que a anterior não
 * aproveitou: 1ª — padrão de uma linha só (alta confiança); 2ª —
 * reconstrução por tokenização (extraction/
 * reconstrucaoTabelaPrevidenciaria.js, Atualização 53), que tolera ruído
 * entre a data e o nome do empregador, separadores fora do padrão
 * esperado etc.
 *
 * @param {string} texto
 * @param {{numero?:number, arquivo?:string}} [pagina]
 * @returns {Array<object>} candidatos de vínculo, um por linha reconhecida
 */
function extrairVinculosDoTexto(texto, pagina) {
  var linhas = String(texto || '').split(/\r?\n/);
  var candidatos = [];
  var linhaAproveitada = new Array(linhas.length).fill(false);

  function anexarFonte(candidato) {
    candidato.fonte = {
      documento: 'CNIS',
      pagina: (pagina && pagina.numero != null) ? pagina.numero : null,
      arquivo: (pagina && pagina.arquivo) || null
    };
    return candidato;
  }

  // 1ª passada — padrão de uma linha só.
  linhas.forEach(function (linha, i) {
    var vinculo = extrairVinculoDeLinha(linha);
    if (!vinculo) return;
    linhaAproveitada[i] = true;
    candidatos.push(anexarFonte(vinculo));
  });

  // 2ª passada — reconstrução por tokenização, só nas linhas que sobraram
  // (defensiva: só roda se o módulo estiver carregado no mesmo escopo).
  if (typeof ReconstrucaoTabelaPrevidenciaria !== 'undefined') {
    linhas.forEach(function (linha, i) {
      if (linhaAproveitada[i]) return;
      var reconstruido = ReconstrucaoTabelaPrevidenciaria.reconstruirCandidatoVinculo(linha);
      if (!reconstruido) return;
      linhaAproveitada[i] = true;
      candidatos.push(anexarFonte(reconstruido));
    });
  }

  return candidatos;
}

/**
 * Aplica extrairVinculosDoTexto() a uma lista de páginas já lidas
 * (js/core/leitorPdf.js), mas só nas páginas que identificarTipoDocumento
 * Previdenciario() reconhece como CNIS (quando a função está carregada —
 * sem ela, aplica em todas as páginas, defensivamente).
 *
 * Cada página é isolada num try/catch próprio: uma página com texto
 * atípico que faça a extração falhar não deve descartar os vínculos já
 * encontrados nas demais páginas do mesmo documento — a página problemática
 * é só reportada em `.paginasComErro` do retorno.
 *
 * @param {Array<{numero:number, texto:string, arquivo?:string}>} paginas
 * @param {{limiarClassificacao?:number}} [opcoes]
 * @returns {Array<object>} candidatos de vínculo (compatibilidade com a
 *   assinatura anterior — use extrairVinculosDoDocumentoComRelatorio() para
 *   também receber as páginas que falharam)
 */
function extrairVinculosDoDocumento(paginas, opcoes) {
  return extrairVinculosDoDocumentoComRelatorio(paginas, opcoes).candidatos;
}

/**
 * Mesma extração de extrairVinculosDoDocumento(), mas devolvendo também
 * `paginasComErro` (nunca lança erro; página com falha isolada só é
 * reportada, as demais seguem extraídas normalmente).
 *
 * @returns {{candidatos: Array<object>, paginasComErro: Array<{numero:number|null, arquivo:string|null, motivo:string}>}}
 */
function extrairVinculosDoDocumentoComRelatorio(paginas, opcoes) {
  opcoes = opcoes || {};
  var lista = Array.isArray(paginas) ? paginas : [];
  var candidatos = [];
  var paginasComErro = [];
  lista.forEach(function (pagina) {
    try {
      if (typeof identificarTipoDocumentoPrevidenciario === 'function') {
        var tipo = identificarTipoDocumentoPrevidenciario(pagina && pagina.texto, {
          limiarMinimo: opcoes.limiarClassificacao
        });
        if (!tipo || tipo.id !== 'cnis') return;
      }
      candidatos = candidatos.concat(extrairVinculosDoTexto(pagina && pagina.texto, pagina));
    } catch (erro) {
      paginasComErro.push({
        numero: (pagina && pagina.numero != null) ? pagina.numero : null,
        arquivo: (pagina && pagina.arquivo) || null,
        motivo: String((erro && erro.message) || erro)
      });
    }
  });
  return { candidatos: candidatos, paginasComErro: paginasComErro };
}

var ExtratorPrevidenciario = {
  versaoModulo: '1.0.0',
  LIMIAR_CONFIANCA_VALIDADO: PREV_LIMIAR_CONFIANCA_VALIDADO,
  extrairVinculoDeLinha: extrairVinculoDeLinha,
  extrairVinculosDoTexto: extrairVinculosDoTexto,
  extrairVinculosDoDocumento: extrairVinculosDoDocumento,
  extrairVinculosDoDocumentoComRelatorio: extrairVinculosDoDocumentoComRelatorio
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExtratorPrevidenciario,
    extrairVinculoDeLinha, extrairVinculosDoTexto, extrairVinculosDoDocumento, extrairVinculosDoDocumentoComRelatorio
  };
}
