/* ============================================================================
   CLASSIFICADOREXTRATOR.JS (core) — mecanismo genérico de extração de
   campos por âncora textual: parsing pt-BR (moeda/data/percentual), busca
   do primeiro/todos os valores próximos de uma âncora, formato padronizado
   de "campo extraído" e os utilitários de trecho/contexto/parágrafo.
   Extraído de js/classificadorExtrator.js (último item do roteiro de
   migração — ver docs/historico/ARQUITETURA-MIGRACAO-PREVIDENCIARIO.md).

   Este arquivo não sabe o que é um "expropriante" nem uma "matrícula de
   imóvel" — não tem NENHUM termo de desapropriação. Um domínio futuro
   (previdenciário, por exemplo) que precise achar "o primeiro valor
   monetário depois da âncora X" ou montar um campo no mesmo formato
   padronizado (valor/confiança/página/trecho/tipoPeca/método/evidências/
   conflitos) usa exatamente estas mesmas funções.

   O QUE FICOU NO ARQUIVO DE DOMÍNIO (js/classificadorExtrator.js): a
   classificação de peças processuais (PALAVRAS_CLASSIFICACAO — vocabulário
   de petição/contestação/laudo/sentença/depósito/matrícula), o corte por
   rótulo de parte (ROTULOS_LIMITE_PARTE — expropriante/expropriado/autor/
   réu...), a regex de área de imóvel e a função gigante extrairCampos()
   (a extração propriamente dita, campo a campo, específica de
   desapropriação).

   DEPENDE de: js/core/estruturaTexto.js (janelaEstrutural),
   js/core/interpretadorEstrutural.js (obterContextoCompleto — OPCIONAL,
   usado defensivamente) e, em tempo de EXECUÇÃO (não de carregamento,
   graças ao escopo global compartilhado), de `tipoPecaDe` e
   `identificarTodasExpressoesDeRisco`, que o domínio (js/classificadorExtrator.js
   e js/dicionarioSemantico.js) precisa fornecer antes de qualquer uma
   destas funções ser efetivamente CHAMADA — ambas checadas defensivamente
   (`typeof ... === 'function'`), então nenhuma delas é um requisito rígido
   de carregamento.
============================================================================ */

/* ------------------------------------------------------------------------
   1. FORMATO PADRONIZADO DE CADA CAMPO — ver comentário completo original
   em js/classificadorExtrator.js (seção "1b"): todo campo extraído guarda
   sempre as mesmas 8 informações públicas (valor/confiança/página/arquivo/
   trecho/tipoPeca/método/evidências/conflitos) + proveniência estrutural
   opcional (bloco/parágrafo/linha/posição, via interpretadorEstrutural.js)
   + `_paginaRef` (uso interno).
------------------------------------------------------------------------ */
function construirCampo({ valor, confianca, pagina, trecho, metodo, evidencias, conflitos, indiceValor, indiceFim, ...extras }){
  if(valor === null || valor === undefined || valor === '') return null;
  let origemEstrutural = { bloco: null, paragrafo: null, linha: null, posicao: null };
  if(pagina && indiceValor != null && typeof obterContextoCompleto === 'function'){
    try{
      const info = obterContextoCompleto(pagina, indiceValor, indiceFim);
      origemEstrutural = { bloco: info.bloco, paragrafo: info.paragrafo, linha: info.linha, posicao: info.posicao };
    }catch(e){ /* proveniência estrutural é um extra, nunca um requisito — qualquer falha aqui não pode derrubar a extração do valor em si */ }
  }
  return {
    valor,
    confianca,
    pagina: pagina && pagina.numero != null ? pagina.numero : null,
    arquivo: pagina ? (pagina.arquivo || null) : null,
    trecho: trecho || '',
    tipoPeca: (typeof tipoPecaDe === 'function') ? tipoPecaDe(pagina) : null,
    metodo: metodo || null,
    evidencias: evidencias || [],
    conflitos: conflitos || [],
    ...origemEstrutural,
    ...extras,
    _paginaRef: pagina || null
  };
}

/* ------------------------------------------------------------------------
   2. HELPERS DE PARSING (moeda, data, percentual em pt-BR)
------------------------------------------------------------------------ */
function parseValorMoedaBR(str){
  if(!str) return null;
  const limpo = String(str).replace(/[^\d.,]/g, '');
  // Correção (achado da perícia de software): antes só removia o separador
  // de milhar quando o ÚLTIMO ponto/vírgula era claramente decimal, sem
  // verificar se os separadores de milhar RESTANTES estavam bem-formados
  // (grupos de exatamente 3 dígitos). Um valor malformado por erro de
  // OCR/digitação — ex.: "1.23,45" em vez de "1.230,45", um dígito faltando
  // — sobrava com um ponto solto no meio, e parseFloat parava nele,
  // devolvendo silenciosamente um valor MUITO menor (1,23 em vez de
  // 1.230,45), sem sinalizar nada. Agora valida a forma inteira antes de
  // converter: só aceita dígitos puros, ou milhar em blocos de exatamente
  // 3 dígitos separados por ponto, com no máximo 2 casas decimais no fim.
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:[.,](\d{1,2}))?$/.exec(limpo);
  if(!m) return null;
  const parteInteira = m[1].replace(/\./g, '');
  const parteDecimal = (m[2] || '0').padEnd(2, '0');
  const n = parseFloat(`${parteInteira}.${parteDecimal}`);
  return isFinite(n) ? n : null;
}

// Espelha parseValorMoedaBR, mas para percentuais (ex.: "6,5" ou "6.5" -> 6.5).
function parsePercentualBR(str){
  if(!str) return null;
  const n = parseFloat(String(str).replace(',', '.'));
  return isFinite(n) ? n : null;
}

function formatarValorParaCampoMoeda(n){
  return (isFinite(n) ? n : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Correção (achado da perícia de software, mesma classe de bug já corrigida
// em js/core/calculoPeriodos.js): dias-no-mês real, para não aceitar datas
// calendariamente inexistentes (ex.: 31/02, 30/02, 29/02 em ano não
// bissexto) só porque bateram num regex de formato. Duplicada aqui (não
// importada de calculoPeriodos.js) porque este arquivo roda isolado no
// pipeline de leitura/classificação, sem depender do domínio previdenciário.
function _diasNoMesReal(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function parseDataBRParaIso(str){
  const m = String(str).match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if(!m) return null;
  const [, d, mes, a] = m;
  const dia = d.padStart(2, '0'), mesN = mes.padStart(2, '0');
  if(+mesN < 1 || +mesN > 12 || +dia < 1 || +dia > _diasNoMesReal(+a, +mesN)) return null;
  return `${a}-${mesN}-${dia}`;
}

const MESES_PT = {
  janeiro: '01', fevereiro: '02', março: '03', marco: '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12'
};
function parseDataExtensoParaIso(str){
  const m = String(str).match(/(\d{1,2})\s*(?:de)?\s*([a-zçãéô]+)\s*(?:de)?\s*(\d{4})/i);
  if(!m) return null;
  const [, d, mesNome, a] = m;
  const mesN = MESES_PT[mesNome.toLowerCase()];
  if(!mesN) return null;
  const dia = d.padStart(2, '0');
  if(+dia < 1 || +dia > _diasNoMesReal(+a, +mesN)) return null;
  return `${a}-${mesN}-${dia}`;
}

function formatarDataIsoParaBR(iso){
  if(!iso) return '';
  const [a, m, d] = String(iso).split('-');
  return (a && m && d) ? `${d}/${m}/${a}` : String(iso);
}

/* ------------------------------------------------------------------------
   3. REGEX DE VALOR ISOLADO (não dependem de âncora textual) — moeda,
   percentual, data numérica/por extenso, percentual com período.
------------------------------------------------------------------------ */
const REGEX_NUMERO_PROCESSO = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;
const REGEX_VALOR_RS = /R\$\s?([\d.]{1,15},\d{2})/;
const REGEX_PERCENTUAL = /(\d{1,3}(?:,\d{1,4})?)\s?%/;
const REGEX_DATA = /(\d{1,2}[\/.]\d{1,2}[\/.]\d{4})/;
// Data por extenso ("15 de maio de 2026") — 2ª tentativa em
// extrairDataProxima() quando o formato numérico não bate perto da âncora.
const REGEX_DATA_EXTENSO = /(\d{1,2}\s*(?:de)?\s*[a-zçãéô]+\s*(?:de)?\s*\d{4})/i;

// Captura valor percentual E a unidade/periodicidade juntos (mês/ano/dia,
// abreviada ou por extenso) em três grupos mutuamente exclusivos — tolera
// um parêntese com o valor por extenso entre o "%" e o período (comum em
// decisões judiciais: "6% (seis por cento) ao ano").
const REGEX_PERCENTUAL_COM_PERIODO =
  /(\d{1,3}(?:,\d{1,4})?)\s?%\s*(?:\([^)]{0,40}\)\s*)?(?:(a\.\s?m\.?|ao\s+m[êe]s)|(a\.\s?a\.?|ao\s+ano)|(a\.\s?d\.?|ao\s+dia))/i;

// Rótulo de exibição por período — "1,00% a.m." em vez de só "1,00".
const ROTULO_PERIODO_JUROS = { am: '% a.m.', aa: '% a.a.', ad: '% a.d.' };

// Cabeçalhos de seção comuns a peças judiciais brasileiras (sentença,
// acórdão, decisão) — usado para cortar um valor capturado antes que ele
// atravesse pro início da próxima seção do documento. Não é específico de
// nenhuma matéria (desapropriação, previdenciário ou qualquer outra).
const REGEX_CABECALHO_MAIUSCULO = /\b(?:SENTENÇA|RELAT[ÓO]RIO|FUNDAMENTA[ÇC][ÃA]O|DISPOSITIVO|AC[ÓO]RD[ÃA]O|DECIS[ÃA]O|VOTO|EMENTA|CONCLUS[ÃA]O|VISTOS)\b/;
function cortarAntesDeCabecalhoMaiusculo(valorBruto){
  const m = REGEX_CABECALHO_MAIUSCULO.exec(valorBruto);
  return m ? valorBruto.slice(0, m.index) : valorBruto;
}

// Corta um valor capturado (ex.: nome de comarca) antes de uma menção a
// "vara" — comum em cabeçalhos de processo brasileiros ("Comarca de X, 3ª
// Vara Cível") em qualquer matéria. Pula deliberadamente o 1º caractere do
// valor antes de buscar: a âncora que iniciou a captura pode ela mesma ser
// "vara <tipo>", e sem esse pulo a função cortaria nela mesma.
function cortarAntesDeNovaVara(valorBruto){
  if(valorBruto.length < 2) return valorBruto;
  const m = /\bvara\b/i.exec(valorBruto.slice(1));
  if(!m) return valorBruto;
  let corte = m.index + 1;
  // Se houver um ordinal solto (dígitos + º/ª) logo antes do ponto de
  // corte, empurra o corte pra antes dele também (evita "SÃO PAULO 45ª"
  // pendurado quando o correto é só "SÃO PAULO").
  const precedente = /\d+[ºª]\s*$/.exec(valorBruto.slice(0, corte));
  if(precedente) corte = precedente.index;
  return valorBruto.slice(0, corte);
}

/* ------------------------------------------------------------------------
   4. BUSCA POR PROXIMIDADE (âncora -> valor numa janela de texto)
------------------------------------------------------------------------ */

// Procura o primeiro casamento de `regexValor` dentro de uma janela de
// `janela` caracteres a partir do fim de QUALQUER casamento de `regexAncora`
// no texto — não só o primeiro (a mesma âncora pode aparecer antes, num
// trecho narrativo sem valor por perto, e de novo mais adiante já
// associada ao valor real).
function buscarProximo(texto, regexAncora, regexValor, janela, pagina){
  const global = new RegExp(regexAncora.source, regexAncora.flags.includes('g') ? regexAncora.flags : regexAncora.flags + 'g');
  let ma;
  while((ma = global.exec(texto)) !== null){
    const inicio = ma.index + ma[0].length;
    // considera o parágrafo inteiro (não só `janela` caracteres), mas
    // nunca atravessa um título/cabeçalho — ver js/core/estruturaTexto.js
    const trecho = texto.slice(inicio, janelaEstrutural(pagina, inicio, janela));
    const mv = regexValor.exec(trecho);
    if(mv){
      // `indiceValor`/`indiceAncora`: offsets ABSOLUTOS em `texto` (não em
      // `trecho`) — usados por quem precisa localizar o parágrafo/bloco de
      // origem via interpretadorEstrutural.js.
      return {
        valorBruto: mv[1] !== undefined ? mv[1] : mv[0],
        trecho: (ma[0] + trecho.slice(0, mv.index + mv[0].length)).slice(-160),
        indiceAncora: ma.index,
        indiceValor: inicio + mv.index
      };
    }
    if(ma.index === global.lastIndex) global.lastIndex++; // evita loop infinito em casamento de tamanho zero
  }
  return null;
}

// Igual a buscarProximo(), mas específica para taxas de juros/percentuais
// com período: além do valor percentual, exige achar a unidade/período
// (% a.m., % a.a., % a.d.) na mesma janela de busca, e devolve os dois
// juntos. Se não achar nenhum período identificável, devolve null — quem
// chama decide o que fazer (nunca preenche o valor como se a unidade
// fosse conhecida).
function buscarPercentualComPeriodo(texto, regexAncora, janela, pagina){
  const global = new RegExp(regexAncora.source, regexAncora.flags.includes('g') ? regexAncora.flags : regexAncora.flags + 'g');
  let ma;
  while((ma = global.exec(texto)) !== null){
    const inicio = ma.index + ma[0].length;
    const trecho = texto.slice(inicio, janelaEstrutural(pagina, inicio, janela));
    const mv = REGEX_PERCENTUAL_COM_PERIODO.exec(trecho);
    if(mv){
      const periodo = mv[2] ? 'am' : (mv[3] ? 'aa' : (mv[4] ? 'ad' : null));
      if(periodo){
        return {
          valorBruto: mv[1], periodo,
          trecho: (ma[0] + trecho.slice(0, mv.index + mv[0].length)).slice(-160),
          indiceAncora: ma.index,
          indiceValor: inicio + mv.index
        };
      }
    }
    if(ma.index === global.lastIndex) global.lastIndex++; // evita loop infinito em casamento de tamanho zero
  }
  return null;
}

// Igual a buscarProximo(), mas devolve TODAS as ocorrências (não só a
// primeira) — usado por quem precisa saber se o mesmo padrão aparece com
// valores diferentes em páginas diferentes (detecção de duplicidade/
// divergência), não só o primeiro valor achado.
function buscarTodosProximos(texto, regexAncora, regexValor, janela, pagina){
  const resultados = [];
  const global = new RegExp(regexAncora.source, regexAncora.flags.includes('g') ? regexAncora.flags : regexAncora.flags + 'g');
  let ma;
  while((ma = global.exec(texto)) !== null){
    const inicio = ma.index + ma[0].length;
    const trecho = texto.slice(inicio, janelaEstrutural(pagina, inicio, janela));
    const mv = regexValor.exec(trecho);
    if(mv){
      resultados.push({
        valorBruto: mv[1] !== undefined ? mv[1] : mv[0],
        trecho: (ma[0] + trecho.slice(0, mv.index + mv[0].length)).slice(-160),
        indiceAncora: ma.index,
        indiceValor: inicio + mv.index,
        expressaoAncora: ma[0]
      });
    }
    if(ma.index === global.lastIndex) global.lastIndex++; // evita loop infinito em casamento de tamanho zero
  }
  return resultados;
}

// Detecta páginas com conteúdo praticamente idêntico entre os PDFs
// anexados nesta leva — sinal de que o mesmo arquivo foi anexado duas
// vezes por engano, ou que duas cópias do mesmo documento foram incluídas.
// Páginas muito curtas (capa, ficha de protocolo) são ignoradas.
function detectarPaginasDuplicadas(paginas){
  const normalizar = texto => (texto || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vistos = new Map(); // texto normalizado -> primeira página que teve esse texto
  const grupos = [];
  paginas.forEach(p => {
    const norm = normalizar(p.texto);
    if(norm.length < 200) return;
    if(vistos.has(norm)){
      const original = vistos.get(norm);
      let grupo = grupos.find(g => g.original === original);
      if(!grupo){ grupo = { original, duplicadas: [] }; grupos.push(grupo); }
      grupo.duplicadas.push(p);
    } else {
      vistos.set(norm, p);
    }
  });
  return grupos;
}

/* ------------------------------------------------------------------------
   5. FILTRO DE RISCO SEMÂNTICO — usa identificarTodasExpressoesDeRisco()
   defensivamente (função exposta por um dicionário semântico carregado,
   ex.: js/dicionarioSemantico.js) para saber se uma ocorrência está perto
   de uma expressão que restringe aquele campo específico. Sem dicionário
   carregado, sempre devolve false (nenhuma restrição aplicada).
------------------------------------------------------------------------ */
function ocorrenciaRestritaPorRisco(texto, indiceAncora, indiceValor, campoId){
  if(typeof identificarTodasExpressoesDeRisco !== 'function') return false;
  if(!texto || indiceAncora === undefined || indiceAncora === null) return false;
  const inicio = Math.max(0, indiceAncora - 80);
  const fim = Math.min(texto.length, (indiceValor != null ? indiceValor : indiceAncora) + 40);
  const trecho = texto.slice(inicio, fim);
  return identificarTodasExpressoesDeRisco(trecho).some(risco => Array.isArray(risco.campos_restritos) && risco.campos_restritos.includes(campoId));
}

// Busca uma data próxima de `regexAncora` em qualquer página, tentando
// primeiro o formato numérico (DD/MM/AAAA) em todas as páginas e, se nada
// for encontrado, o formato por extenso como 2ª passada (nunca substitui
// um candidato numérico já válido). `campoId` (opcional) aciona o filtro
// de risco semântico acima antes de aceitar um candidato.
function extrairDataProxima(paginas, regexAncora, confiancaBase, metodo, campoId){
  for(const p of paginas){
    const candidatos = buscarTodosProximos(p.texto || '', regexAncora, REGEX_DATA, 80, p);
    for(const r of candidatos){
      if(campoId && ocorrenciaRestritaPorRisco(p.texto || '', r.indiceAncora, r.indiceValor, campoId)) continue;
      const iso = parseDataBRParaIso(r.valorBruto);
      if(iso) return { valor: iso, confianca: confiancaBase, pagina: p, trecho: r.trecho, metodo, indiceValor: r.indiceValor };
    }
  }
  for(const p of paginas){
    const candidatosExtenso = buscarTodosProximos(p.texto || '', regexAncora, REGEX_DATA_EXTENSO, 80, p);
    for(const r of candidatosExtenso){
      if(campoId && ocorrenciaRestritaPorRisco(p.texto || '', r.indiceAncora, r.indiceValor, campoId)) continue;
      const iso = parseDataExtensoParaIso(r.valorBruto);
      if(iso) return { valor: iso, confianca: confiancaBase, pagina: p, trecho: r.trecho, metodo: metodo + ' (data por extenso)', indiceValor: r.indiceValor };
    }
  }
  return null;
}

/* ------------------------------------------------------------------------
   6. TRECHO / CONTEXTO / PARÁGRAFO
------------------------------------------------------------------------ */

// Número do parágrafo (1-based) que contém o offset `indiceAbsoluto` dentro
// de `pagina.texto`, ou null quando não dá para determinar
// (interpretadorEstrutural.js não carregado, offset fora de qualquer
// parágrafo detectado, ou qualquer erro de análise estrutural). Nunca
// lança: é usado para enriquecer histórico de evidências, não é uma
// dependência que pode derrubar a extração se falhar.
function paragrafoDe(pagina, indiceAbsoluto){
  if(!pagina || indiceAbsoluto === undefined || indiceAbsoluto === null) return null;
  if(typeof obterContextoCompleto !== 'function') return null;
  try{
    const info = obterContextoCompleto(pagina, indiceAbsoluto);
    return (info && info.paragrafo !== null && info.paragrafo !== undefined) ? info.paragrafo + 1 : null;
  } catch(e){
    return null;
  }
}

function contexto(texto, indice, raio){
  if(!texto) return '';
  const ini = Math.max(0, indice - raio);
  const fim = Math.min(texto.length, indice + raio);
  return (ini > 0 ? '…' : '') + texto.slice(ini, fim).trim() + (fim < texto.length ? '…' : '');
}
