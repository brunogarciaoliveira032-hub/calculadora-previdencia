/* ============================================================================
   EXTRATORREMUNERACOESCNIS.JS — extrai REMUNERAÇÕES MENSAIS (competência +
   valor) de um texto de CNIS já lido. Mesmo espírito de
   extratorVinculosCNIS.js (Atualização 14), agora para a 2ª ramificação do
   diagrama do produto:

     CNIS -> vínculos (extratorVinculosCNIS.js)
          -> salários/remunerações (ESTE ARQUIVO)
          -> competências (derivadas de ambos em historicoPrevidenciario.js)

   CADA REMUNERAÇÃO ENCONTRADA é um candidato estruturado, nunca um valor
   solto:
     { tipo:'remuneracao', competencia:'AAAA-MM', valor:number,
       valorZerado:boolean, fonte:{documento,pagina}, confianca, status,
       trecho }

   PADRÃO SUPORTADO NESTA ENTREGA (v1.0.0): linha "tabular" de extrato —
   MM/AAAA seguido (mesma linha, com ou sem rótulo "Competência:"/
   "Remuneração:") de um valor R$. NÃO cobre (limitação consciente, mesmo
   padrão do resto do projeto):
     - código de ocorrência anexado ao valor (ex.: indicativo de
       afastamento/licença) — capturado quando presente entre parênteses,
       mas não interpretado (`.codigoOcorrencia` fica só como dado bruto,
       nenhuma regra decide o que ele significa);
     - approvisionamento de competências para contribuinte individual/
       facultativo (recolhimento em atraso, gerando mais de um valor para a
       mesma competência) — cada linha reconhecida vira um candidato
       independente; decidir qual prevalece quando há mais de uma
       remuneração para a MESMA competência é responsabilidade de quem
       consome (ver `agruparRemuneracoesPorCompetencia()` no fim do
       arquivo, que reporta a duplicidade em vez de escolher sozinha).

   REMUNERAÇÃO ZERADA (R$ 0,00): extraída normalmente, com `.valorZerado:
   true` — NUNCA tratada como ausência de contribuição por conta própria
   (ver risco já registrado em DICIONARIO_PREVIDENCIARIO.tipos_documento.
   cnis.riscos_comuns: "remuneração zerada num mês não é o mesmo que
   ausência de contribuição... não descartar o mês sem checar o código de
   ocorrência").

   DEPENDE de: nada em tempo de carregamento (mesma filosofia de
   extratorVinculosCNIS.js — roda isolado em teste unitário).
============================================================================ */

var PREV_LIMIAR_CONFIANCA_VALIDADO_REM = 0.8;

// Linha de remuneração CNIS: MM/AAAA [rótulo opcional] R$ valor [código
// de ocorrência opcional entre parênteses].
var PREV_REGEX_LINHA_REMUNERACAO = new RegExp(
  '^\\s*(?:compet[êe]ncia:?\\s*)?' +
  '(\\d{2})\\/(\\d{4})' +                              // grupo 1: mês, grupo 2: ano
  '\\s*(?:[-–—:]|remunera[çc][ãa]o:?)?\\s*' +
  'r\\$\\s?([\\d.]{1,12},\\d{2})' +                     // grupo 3: valor bruto (pt-BR)
  '(?:\\s*\\(([^)]{1,40})\\))?' +                       // grupo 4: código de ocorrência (opcional)
  '\\s*$',
  'i'
);

/* ------------------------------------------------------------------------
   FALLBACK DE DUPLA CHECAGEM (Atualização 52, a pedido do usuário) — CNIS
   digitalizado/escaneado frequentemente quebra uma linha tabular em duas
   quando extraído para texto puro (a competência numa linha, o valor R$
   sozinho na linha seguinte, por causa de colunas que não se alinham na
   extração de texto do PDF). O regex acima, ancorado numa linha só
   (^...$), IGNORA esses dois fragmentos — nem um nem outro batem sozinhos
   — o que produz um "falso vazio": a competência existe no documento, mas
   nada é extraído pra ela.

   Este fallback roda numa SEGUNDA PASSADA, só sobre as linhas que a
   primeira passada não aproveitou: se uma linha só tem a competência
   (MM/AAAA sozinho) e a linha seguinte só tem o valor (R$ sozinho), os
   dois são unidos num candidato — SEMPRE com confiança mais baixa que o
   padrão de uma linha só (a extração é mais arriscada, pode juntar coisas
   que não deveriam ir juntas) e SEMPRE marcado
   `.extraidoPorFallbackMultilinha:true`, pra nunca ser confundido com uma
   leitura direta de alta confiança. Continua sem inventar nenhum valor —
   só tolera uma quebra de linha real que o padrão principal não cobria.
------------------------------------------------------------------------ */
var PREV_LIMIAR_CONFIANCA_FALLBACK_MULTILINHA = 0.5; // sempre abaixo do limiar "validado" — vai pra revisão humana
var PREV_REGEX_LINHA_APENAS_COMPETENCIA = /^\s*(?:compet[êe]ncia:?\s*)?(\d{2})\/(\d{4})\s*$/i;
var PREV_REGEX_LINHA_APENAS_VALOR = /^\s*r\$\s?([\d.]{1,12},\d{2})\s*(?:\(([^)]{1,40})\))?\s*$/i;

function _prevParseValorMoedaBR(strValor) {
  var limpo = String(strValor || '').replace(/[^\d.,]/g, '');
  // Correção (achado da perícia de software, mesma classe de bug já
  // corrigida em classificadorExtrator.js): antes um separador de milhar
  // malformado (ex.: "1.23,45" com um dígito faltando) sobrava no meio da
  // string e parseFloat truncava ali, devolvendo um valor silenciosamente
  // muito menor que o real. Agora valida a forma inteira antes de converter.
  var m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(limpo);
  if (!m) return null;
  var parteInteira = m[1].replace(/\./g, '');
  var parteDecimal = (m[2] || '0');
  while (parteDecimal.length < 2) parteDecimal += '0';
  var n = parseFloat(parteInteira + '.' + parteDecimal);
  return isFinite(n) ? n : null;
}

/**
 * Extrai a remuneração de UMA linha já isolada. Não lança erro para
 * entrada vazia/sem match — devolve `null`.
 *
 * @returns {{tipo:'remuneracao', competencia:string, valor:number,
 *            valorZerado:boolean, codigoOcorrencia:string|null,
 *            confianca:number, status:'validado'|'requer_revisao',
 *            conflitos:string[], trecho:string}|null}
 */
function extrairRemuneracaoDeLinha(linha) {
  var texto = String(linha || '');
  var m = PREV_REGEX_LINHA_REMUNERACAO.exec(texto);
  if (!m) return null;

  var mes = m[1], ano = m[2];
  if (+mes < 1 || +mes > 12) return null;

  var valor = _prevParseValorMoedaBR(m[3]);
  if (valor === null) return null;

  var conflitos = [];
  var confianca = 0.92;
  var valorZerado = valor === 0;
  if (valorZerado) {
    conflitos.push('remuneração zerada — não presumir ausência de contribuição sem checar o código de ocorrência');
    confianca -= 0.12;
  }

  confianca = Math.max(0.05, Math.min(0.98, confianca));
  var status = (confianca >= PREV_LIMIAR_CONFIANCA_VALIDADO_REM) ? 'validado' : 'requer_revisao';

  return {
    tipo: 'remuneracao',
    competencia: ano + '-' + mes,
    valor: valor,
    valorZerado: valorZerado,
    codigoOcorrencia: m[4] || null,
    confianca: Math.round(confianca * 100) / 100,
    status: status,
    conflitos: conflitos,
    trecho: texto.trim()
  };
}

/**
 * Tenta o fallback de duas linhas: `linhaCompetencia` só tem MM/AAAA,
 * `linhaValor` só tem R$ valor (nessa ordem). Devolve `null` se qualquer
 * uma das duas não bater no padrão isolado — nunca força um casamento.
 *
 * @returns {object|null} mesmo formato de extrairRemuneracaoDeLinha(),
 *   com confiança rebaixada e `.extraidoPorFallbackMultilinha:true`.
 */
function extrairRemuneracaoDeParDeLinhas(linhaCompetencia, linhaValor) {
  var mComp = PREV_REGEX_LINHA_APENAS_COMPETENCIA.exec(String(linhaCompetencia || ''));
  if (!mComp) return null;
  var mValor = PREV_REGEX_LINHA_APENAS_VALOR.exec(String(linhaValor || ''));
  if (!mValor) return null;

  var mes = mComp[1], ano = mComp[2];
  if (+mes < 1 || +mes > 12) return null;

  var valor = _prevParseValorMoedaBR(mValor[1]);
  if (valor === null) return null;

  var conflitos = ['extraído por fallback de duas linhas (competência e valor separados por quebra de linha) — confira o trecho original antes de confirmar'];
  var valorZerado = valor === 0;
  if (valorZerado) {
    conflitos.push('remuneração zerada — não presumir ausência de contribuição sem checar o código de ocorrência');
  }

  return {
    tipo: 'remuneracao',
    competencia: ano + '-' + mes,
    valor: valor,
    valorZerado: valorZerado,
    codigoOcorrencia: mValor[2] || null,
    confianca: PREV_LIMIAR_CONFIANCA_FALLBACK_MULTILINHA,
    status: 'requer_revisao', // fallback NUNCA sai como "validado" sozinho, sempre precisa de revisão humana
    conflitos: conflitos,
    trecho: String(linhaCompetencia).trim() + ' / ' + String(linhaValor).trim(),
    extraidoPorFallbackMultilinha: true
  };
}

/**
 * Extrai todas as remunerações de um texto de CNIS (várias linhas),
 * anexando `.fonte.documento`/`.fonte.pagina`/`.fonte.arquivo` a cada
 * candidato. Nunca lança erro: texto sem nenhuma remuneração reconhecível
 * devolve array vazio.
 *
 * Roda em TRÊS PASSADAS, cada uma só nas linhas que a anterior não
 * aproveitou: 1ª — padrão de uma linha só (alta confiança); 2ª — fallback
 * de duas linhas (competência + valor quebrados por quebra de linha); 3ª
 * — reconstrução por tokenização (extraction/
 * reconstrucaoTabelaPrevidenciaria.js, Atualização 53), que tolera código
 * no meio da linha e ordem trocada dentro de uma única linha. As 3
 * camadas juntas cobrem os casos mais comuns de CNIS real que a regex de
 * linha inteira sozinha rejeitaria.
 */
function extrairRemuneracoesDoTexto(texto, pagina) {
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
    var remuneracao = extrairRemuneracaoDeLinha(linha);
    if (!remuneracao) return;
    linhaAproveitada[i] = true;
    candidatos.push(anexarFonte(remuneracao));
  });

  // 2ª passada — fallback de duas linhas, só onde a 1ª não achou nada.
  for (var i = 0; i < linhas.length - 1; i++) {
    if (linhaAproveitada[i] || linhaAproveitada[i + 1]) continue;
    var fallback = extrairRemuneracaoDeParDeLinhas(linhas[i], linhas[i + 1]);
    if (!fallback) continue;
    linhaAproveitada[i] = true;
    linhaAproveitada[i + 1] = true;
    candidatos.push(anexarFonte(fallback));
  }

  // 3ª passada — reconstrução por tokenização, só nas linhas que sobraram
  // (defensiva: só roda se o módulo estiver carregado no mesmo escopo).
  if (typeof ReconstrucaoTabelaPrevidenciaria !== 'undefined') {
    linhas.forEach(function (linha, i) {
      if (linhaAproveitada[i]) return;
      var reconstruido = ReconstrucaoTabelaPrevidenciaria.reconstruirCandidatoRemuneracao(linha);
      if (!reconstruido) return;
      linhaAproveitada[i] = true;
      candidatos.push(anexarFonte(reconstruido));
    });
  }

  return candidatos;
}

/**
 * Igual a extrairVinculosDoDocumento() (extratorVinculosCNIS.js): só
 * processa páginas que identificarTipoDocumentoPrevidenciario() reconhece
 * como CNIS (quando a função está carregada; sem ela, aplica em todas as
 * páginas, defensivamente). Cada página é isolada num try/catch próprio —
 * uma página com falha não descarta as remunerações já extraídas das
 * demais (use extrairRemuneracoesDoDocumentoComRelatorio() para também
 * receber as páginas que falharam).
 */
function extrairRemuneracoesDoDocumento(paginas, opcoes) {
  return extrairRemuneracoesDoDocumentoComRelatorio(paginas, opcoes).candidatos;
}

/**
 * Mesma extração de extrairRemuneracoesDoDocumento(), mas devolvendo também
 * `paginasComErro` (nunca lança erro; página com falha isolada só é
 * reportada, as demais seguem extraídas normalmente).
 *
 * @returns {{candidatos: Array<object>, paginasComErro: Array<{numero:number|null, arquivo:string|null, motivo:string}>}}
 */
function extrairRemuneracoesDoDocumentoComRelatorio(paginas, opcoes) {
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
      candidatos = candidatos.concat(extrairRemuneracoesDoTexto(pagina && pagina.texto, pagina));
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

/**
 * Agrupa candidatos de remuneração por competência, reportando quando MAIS
 * DE UM candidato cai na mesma competência (ex.: recolhimento retificado,
 * ou duas leituras da mesma linha) — nunca escolhe um sozinho, só expõe
 * `.duplicadas` para quem consome decidir.
 *
 * @returns {{porCompetencia: Map<string, object[]>, duplicadas: string[]}}
 */
function agruparRemuneracoesPorCompetencia(candidatosRemuneracao) {
  var porCompetencia = new Map();
  (Array.isArray(candidatosRemuneracao) ? candidatosRemuneracao : []).forEach(function (c) {
    if (!c || c.tipo !== 'remuneracao' || !c.competencia) return;
    if (!porCompetencia.has(c.competencia)) porCompetencia.set(c.competencia, []);
    porCompetencia.get(c.competencia).push(c);
  });
  var duplicadas = [];
  porCompetencia.forEach(function (lista, competencia) {
    if (lista.length > 1) duplicadas.push(competencia);
  });
  return { porCompetencia: porCompetencia, duplicadas: duplicadas };
}

var ExtratorRemuneracoesPrevidenciario = {
  versaoModulo: '1.1.0',
  LIMIAR_CONFIANCA_VALIDADO: PREV_LIMIAR_CONFIANCA_VALIDADO_REM,
  LIMIAR_CONFIANCA_FALLBACK_MULTILINHA: PREV_LIMIAR_CONFIANCA_FALLBACK_MULTILINHA,
  extrairRemuneracaoDeLinha: extrairRemuneracaoDeLinha,
  extrairRemuneracaoDeParDeLinhas: extrairRemuneracaoDeParDeLinhas,
  extrairRemuneracoesDoTexto: extrairRemuneracoesDoTexto,
  extrairRemuneracoesDoDocumento: extrairRemuneracoesDoDocumento,
  extrairRemuneracoesDoDocumentoComRelatorio: extrairRemuneracoesDoDocumentoComRelatorio,
  agruparRemuneracoesPorCompetencia: agruparRemuneracoesPorCompetencia
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ExtratorRemuneracoesPrevidenciario,
    extrairRemuneracaoDeLinha, extrairRemuneracaoDeParDeLinhas, extrairRemuneracoesDoTexto,
    extrairRemuneracoesDoDocumento, extrairRemuneracoesDoDocumentoComRelatorio,
    agruparRemuneracoesPorCompetencia
  };
}
