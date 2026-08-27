/* ============================================================================
   REGRAS/TRANSICAO/PONTOS.JS — Regra de transição por PONTOS (EC 103/2019,
   art. 15). Atualização 38.

   ESCOPO DESTA ENTREGA: a primeira das 4 regras de transição da reforma
   (pontos, idade mínima progressiva, pedágio 50%, pedágio 100%) a ser
   implementada — escolhida pelo usuário para começar. As outras 3 NÃO
   estão implementadas aqui, cada uma tem fórmula própria e fica para
   entrega futura, se necessário.

   BASE LEGAL (referência, não substitui análise jurídica do caso concreto):
     - EC 103/2019, art. 15, caput: regra de transição por pontos, para
       quem já era filiado ao RGPS em 13/11/2019 (data de vigência da
       reforma) e ainda não tinha cumprido os requisitos da aposentadoria
       por tempo de contribuição das regras anteriores à reforma.
     - Tempo mínimo de contribuição: 35 anos (homem) / 30 anos (mulher) —
       o mesmo mínimo da antiga aposentadoria por tempo de contribuição.
       NÃO é o mesmo mínimo de 20/15 anos da regra permanente do art. 26
       (ver motorRMI.js) — são regras distintas com tempos mínimos
       distintos.
     - Carência: 180 contribuições mensais (Lei 8.213/91, art. 25, II —
       mesmo valor da regra permanente; reaproveitado de MotorRMI em vez
       de duplicado).
     - Pontuação exigida (soma de idade + tempo de contribuição, na data
       de entrada do requerimento, sem considerar fração de mês): 96
       pontos (homem) / 86 pontos (mulher) em 2019, subindo 1 ponto a
       cada ano seguinte até estabilizar em 105 (homem, a partir de 2028)
       / 100 (mulher, a partir de 2033).
     - RMI: EC 103/2019, art. 15, §5º c/c art. 26, §2º — mesma fórmula de
       cálculo da regra permanente (60% do salário de benefício + 2
       pontos percentuais para cada ano que exceder o tempo mínimo), mas
       usando o tempo mínimo de 35/30 anos desta regra — não o de 20/15
       da regra permanente.

   DEPENDE de: MotorRMI (motorRMI.js) já carregado no mesmo escopo global
   — reaproveita MotorRMI.CARENCIA_MINIMA_MESES (mesmo valor legal, não
   duplicado à toa) e segue a mesma convenção de anos fracionários já
   usada em motorRMI.js/motorTempoContribuicao.js.

   LIMITAÇÃO CONHECIDA (documentada, não escondida): este módulo NÃO
   verifica se o segurado estava de fato filiado ao RGPS em 13/11/2019,
   que é pressuposto legal de toda regra de transição — o projeto ainda
   não modela "data de filiação" como campo separado do tempo de
   contribuição calculado. Quem chama esta função é responsável por só
   usá-la quando esse pressuposto já foi confirmado no caso concreto.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('regras/transicao/pontos.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var TEMPO_MINIMO_CONTRIBUICAO_PONTOS_ANOS = Object.freeze({ homem: 35, mulher: 30 });
var PONTOS_BASE_2019 = Object.freeze({ homem: 96, mulher: 86 });
var PONTOS_MAXIMO = Object.freeze({ homem: 105, mulher: 100 });
var ANO_MAXIMO_PONTOS = Object.freeze({ homem: 2028, mulher: 2033 });
var ANO_VIGENCIA_EC103 = 2019;

function validarSexoPontos(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

// Mesma convenção de anos fracionários já usada em motorRMI.js — duplicada
// aqui (função pura, sem estado) em vez de importada, porque motorRMI.js
// não expõe essa função no objeto MotorRMI (só o resultado final).
function paraAnosFracionariosPontos(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

// Aceita dados.anoReferencia (número) OU dados.dataReferencia (Date ou
// string ISO "AAAA-MM-DD") — o ano do requerimento/DER, necessário porque
// a pontuação mínima exigida muda ano a ano. Nenhum valor é assumido por
// padrão (ex.: "ano atual") para não mascarar caso o chamador esqueça de
// informar a data do requerimento real.
function anoDaReferencia(dados) {
  if (typeof dados.anoReferencia === 'number') return dados.anoReferencia;
  if (dados.dataReferencia) {
    const d = dados.dataReferencia instanceof Date ? dados.dataReferencia : new Date(dados.dataReferencia);
    if (isNaN(d.getTime())) {
      throw new Error('dataReferencia inválida (esperado Date ou string ISO "AAAA-MM-DD")');
    }
    return d.getUTCFullYear();
  }
  throw new Error('é preciso informar dados.anoReferencia (número) ou dados.dataReferencia (Date/ISO) — ano do requerimento/DER, necessário para saber a pontuação mínima exigida naquele ano');
}

/**
 * Pontuação mínima exigida (idade + tempo de contribuição) no ano dado.
 *
 * @param {number} ano
 * @param {'homem'|'mulher'} sexo
 * @returns {number}
 */
function pontuacaoMinimaExigida(ano, sexo) {
  validarSexoPontos(sexo);
  if (typeof ano !== 'number' || !Number.isFinite(ano)) {
    throw new Error(`ano inválido: ${ano}`);
  }
  if (ano < ANO_VIGENCIA_EC103) {
    throw new Error(`regra de transição por pontos (EC 103/2019, art. 15) não existia antes de ${ANO_VIGENCIA_EC103} — ano informado: ${ano}`);
  }
  const anosDesde2019 = Math.floor(ano) - ANO_VIGENCIA_EC103;
  return Math.min(PONTOS_BASE_2019[sexo] + anosDesde2019, PONTOS_MAXIMO[sexo]);
}

/**
 * Verifica se os requisitos da regra de transição por PONTOS estão
 * cumpridos. Não calcula RMI — só elegibilidade.
 *
 * @param {{idadeAnos:number, tempoContribuicao:{anos,meses,dias}|number,
 *   carenciaMeses:number, sexo:'homem'|'mulher', anoReferencia?:number,
 *   dataReferencia?:Date|string}} dados
 * @returns {{elegivel:boolean, pendencias:string[], pontuacaoAtingida:number,
 *   pontuacaoExigida:number, tempoMinimoExigidoAnos:number, anoReferencia:number}}
 */
function elegibilidadeRegraPontos(dados) {
  validarSexoPontos(dados.sexo);
  const ano = anoDaReferencia(dados);
  const pontuacaoExigida = pontuacaoMinimaExigida(ano, dados.sexo);
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_CONTRIBUICAO_PONTOS_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionariosPontos(dados.tempoContribuicao);
  const carenciaMinima = MotorRMI.CARENCIA_MINIMA_MESES;

  const pendencias = [];
  if (typeof dados.idadeAnos !== 'number') {
    pendencias.push('idade não informada');
  }
  const pontuacaoAtingida = (typeof dados.idadeAnos === 'number' ? dados.idadeAnos : 0) + tempoAnos;

  if (tempoAnos < tempoMinimoExigidoAnos) {
    pendencias.push(`tempo de contribuição mínimo não atingido (exige ${tempoMinimoExigidoAnos} anos)`);
  }
  if (pontuacaoAtingida < pontuacaoExigida) {
    pendencias.push(`pontuação (idade + tempo de contribuição) não atingida: ${pontuacaoAtingida.toFixed(2)} de ${pontuacaoExigida} pontos exigidos em ${ano}`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < carenciaMinima) {
    pendencias.push(`carência mínima não atingida (exige ${carenciaMinima} contribuições)`);
  }

  return {
    elegivel: pendencias.length === 0,
    pendencias,
    pontuacaoAtingida,
    pontuacaoExigida,
    tempoMinimoExigidoAnos,
    anoReferencia: ano
  };
}

/**
 * Calcula a RMI pela regra de transição por PONTOS — mesma fórmula da
 * regra permanente (60% + 2% por ano excedente), mas com o tempo mínimo
 * de 35/30 anos desta regra (EC 103/2019, art. 15, §5º c/c art. 26, §2º).
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - média já calculada dos salários
 *   de contribuição atualizados (este módulo NÃO calcula essa média).
 * @param {{anos,meses,dias}|number} dados.tempoContribuicao
 * @param {'homem'|'mulher'} dados.sexo
 * @param {number} [dados.salarioMinimoVigente] - se informado, aplica piso.
 * @param {number} [dados.tetoRGPSVigente] - se informado, aplica teto.
 * @returns {{
 *   percentualAplicado:number, anosExcedentesConsiderados:number,
 *   tempoMinimoExigidoAnos:number, rmiAntesDoPisoTeto:number,
 *   rmiFinal:number, aplicouPiso:boolean, aplicouTeto:boolean
 * }}
 */
function calcularRMIRegraPontos(dados) {
  validarSexoPontos(dados.sexo);
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIRegraPontos: salarioBeneficio precisa ser um número maior que zero');
  }
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_CONTRIBUICAO_PONTOS_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionariosPontos(dados.tempoContribuicao);

  // Mesma convenção do art. 26 (motorRMI.js): só anos COMPLETOS excedentes
  // contam o adicional de 2 pontos percentuais.
  const anosExcedentesConsiderados = Math.max(0, Math.floor(tempoAnos - tempoMinimoExigidoAnos));
  const percentualAplicado = 0.60 + 0.02 * anosExcedentesConsiderados;
  const rmiAntesDoPisoTeto = dados.salarioBeneficio * percentualAplicado;

  let rmiFinal = rmiAntesDoPisoTeto;
  let aplicouPiso = false;
  let aplicouTeto = false;
  // Correção (achado da perícia de software): antes, se quem chamava
  // informasse piso > teto por engano (entrada inconsistente), o teto
  // vencia silenciosamente e o resultado saía abaixo do próprio piso legal,
  // sem nenhum aviso. Agora essa inconsistência é rejeitada explicitamente.
  if (typeof dados.salarioMinimoVigente === 'number' && typeof dados.tetoRGPSVigente === 'number'
      && dados.salarioMinimoVigente > dados.tetoRGPSVigente) {
    throw new Error(`salarioMinimoVigente (${dados.salarioMinimoVigente}) não pode ser maior que tetoRGPSVigente (${dados.tetoRGPSVigente}) — entrada inconsistente`);
  }
  if (typeof dados.salarioMinimoVigente === 'number' && rmiFinal < dados.salarioMinimoVigente) {
    rmiFinal = dados.salarioMinimoVigente;
    aplicouPiso = true;
  }
  if (typeof dados.tetoRGPSVigente === 'number' && rmiFinal > dados.tetoRGPSVigente) {
    rmiFinal = dados.tetoRGPSVigente;
    aplicouTeto = true;
  }

  return {
    percentualAplicado,
    anosExcedentesConsiderados,
    tempoMinimoExigidoAnos,
    rmiAntesDoPisoTeto,
    rmiFinal,
    aplicouPiso,
    aplicouTeto
  };
}

var RegraTransicaoPontos = {
  TEMPO_MINIMO_CONTRIBUICAO_PONTOS_ANOS,
  PONTOS_BASE_2019,
  PONTOS_MAXIMO,
  ANO_MAXIMO_PONTOS,
  ANO_VIGENCIA_EC103,
  pontuacaoMinimaExigida,
  elegibilidadeRegraPontos,
  calcularRMIRegraPontos
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. Não verifica filiação ao RGPS anterior a 13/11/2019 (pressuposto
        legal de toda regra de transição) — ver nota acima.
     2. Não calcula "salário de benefício" — mesma limitação de
        motorRMI.js, recebe esse valor já pronto do chamador.
     3. Ainda não existe motorElegibilidadePrevidenciaria.js comparando
        esta regra com a regra permanente (motorRMI.js) e apontando qual
        é mais vantajosa para o segurado — decisão do usuário adiada até
        as demais regras de transição estarem prontas.
     4. As outras 3 regras de transição da EC 103/2019 (idade mínima
        progressiva, pedágio 50%, pedágio 100%) continuam não
        implementadas.
     5. Não valida nenhuma regra especial (professor, PCD, atividade
        especial, rural) combinada com a regra de pontos — cada uma tem
        pontuação/tempo mínimo próprios, fora do escopo desta entrega.
---------------------------------------------------------------------- */
