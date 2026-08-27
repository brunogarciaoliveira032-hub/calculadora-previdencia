/* ============================================================================
   REGRAS/DIREITOADQUIRIDO/APOSENTADORIATEMPOCONTRIBUICAO.JS — Direito
   adquirido à aposentadoria por tempo de contribuição, regras vigentes
   ANTES da EC 103/2019 (13/11/2019). Atualização 51, a pedido do usuário.

   POR QUE ISTO É UMA PASTA/CAMADA PRÓPRIA (regras/direitoAdquirido/, não
   regras/transicao/): direito adquirido NÃO é uma regra de transição — é
   a aplicação da lei ANTIGA, intocável pela reforma, para quem já tinha
   completado todos os requisitos ANTES de 13/11/2019 (art. 5º, XXXVI,
   CF/88 c/c art. 3º, EC 103/2019). Segurado com direito adquirido nem
   precisa da EC 103/2019 — o benefício é regido pela Lei 8.213/91 na
   redação vigente até 12/11/2019.

   BASE LEGAL (referência, não substitui análise jurídica do caso
   concreto; conferida por busca antes de codificar):
     - EC 103/2019, art. 3º, §§1º e 2º: para quem completou os requisitos
       de concessão ATÉ 13/11/2019, o benefício (inclusive o VALOR/RMI)
       é apurado pela legislação vigente na época em que os requisitos
       foram atendidos — mesmo que o requerimento seja posterior.
     - Lei 8.213/91, art. 53 (redação pré-EC 103, dada pela Lei 9.876/99):
       aposentadoria por tempo de contribuição integral — 35 anos de
       contribuição (homem) / 30 anos (mulher), SEM idade mínima,
       carência de 180 contribuições (art. 25, II).
     - Lei 8.213/91, art. 29-C (incluído pela Lei 13.183/2015 — "regra
       85/95 progressiva"): se a SOMA de idade + tempo de contribuição
       atingir a pontuação exigida NO ANO EM QUE OS REQUISITOS FORAM
       PREENCHIDOS, o segurado fica DISPENSADO do Fator Previdenciário —
       RMI = 100% do salário de benefício. A tabela é progressiva desde
       2015 (85/95) e sobe com o tempo; em 2019 — o ano relevante para
       direito adquirido, já que precisa estar cumprido até 13/11/2019 —
       a pontuação exigida era 86 (mulher) / 96 (homem) (conferido por
       busca; não é um "patamar final" da tabela, é o valor específico de
       2019). Sem atingir essa pontuação em 2019, o Fator Previdenciário
       é OBRIGATÓRIO (Lei 9.876/99).
     - Salário de benefício (regra ANTIGA, art. 29, I, Lei 8.213/91, na
       redação anterior à EC 103/2019): média aritmética simples dos 80%
       MAIORES salários de contribuição desde 07/1994 — DIFERENTE da
       regra pós-reforma (100% dos salários, sem descarte), que é o que
       js/domains/previdenciario/motorSalarioBeneficio.js deste projeto
       calcula. Ver LIMITAÇÃO 1 abaixo — importante, não é um detalhe
       menor.

   DEPENDE de: MotorRMI (motorRMI.js) já carregado — reaproveita só
   CARENCIA_MINIMA_MESES (mesmo valor de sempre, 180), não a fórmula de
   RMI (que é inteiramente diferente aqui).

   LIMITAÇÕES CONHECIDAS (documentadas com destaque, não escondidas):
     1. *** IMPORTANTE *** — este módulo recebe `salarioBeneficio` pronto,
        como todos os outros, mas o valor legalmente correto para direito
        adquirido usa a média dos 80% MAIORES salários (com descarte dos
        20% menores) — NÃO o valor que motorSalarioBeneficio.js deste
        projeto calcula (que é sempre 100% dos salários, regra pós-
        reforma). Usar o salário de benefício "pós-reforma" aqui produz
        um valor DIFERENTE do legalmente devido (tende a ser MENOR, já
        que inclui competências que seriam descartadas). Sinalizado
        também na UI, não é um detalhe só de código.
     2. Não calcula o Fator Previdenciário (mesma limitação já registrada
        em regras/transicao/pedagio50.js — depende da tábua do IBGE) —
        recebido pronto, só quando a pontuação 96/86 NÃO foi atingida.
     3. A pontuação de dispensa do fator (art. 29-C) é tratada como fixa
        em 96 (homem) / 86 (mulher) — o valor da tabela progressiva
        vigente em 2019 (o único ano relevante para direito adquirido até
        13/11/2019). NÃO implementa os patamares de anos anteriores
        (85/95 entre 17/06/2015 e 31/12/2018) — só é usada aqui quando o
        segurado atingiu tempo mínimo + carência especificamente em 2019;
        quem completou os requisitos entre 2015-2018 pode ter direito a
        um patamar diferente, não coberto por este módulo.
     4. Não verifica se o segurado de fato tinha os requisitos completos
        ANTES de 13/11/2019 além do que os campos de entrada informam —
        `tempoContribuicaoEm13112019`/`idadeEm13112019Anos` precisam
        refletir a apuração real até essa data, feita por quem chama.
============================================================================ */

if (typeof MotorRMI === 'undefined') {
  throw new Error('regras/direitoAdquirido/aposentadoriaTempoContribuicao.js depende de MotorRMI (motorRMI.js) já carregado no mesmo escopo global');
}

var TEMPO_MINIMO_DIREITO_ADQUIRIDO_ANOS = Object.freeze({ homem: 35, mulher: 30 });
var PONTUACAO_DISPENSA_FATOR_PREVIDENCIARIO = Object.freeze({ homem: 96, mulher: 86 }); // Lei 8.213/91, art. 29-C — pontuação exigida em 2019 (ano relevante para direito adquirido até 13/11/2019), tabela progressiva desde 2015

function validarSexoDireitoAdquirido(sexo) {
  if (sexo !== 'homem' && sexo !== 'mulher') {
    throw new Error(`sexo inválido (esperado "homem" ou "mulher"): ${sexo}`);
  }
}

function paraAnosFracionariosDireitoAdquirido(tempo) {
  if (typeof tempo === 'number') return tempo;
  const { anos = 0, meses = 0, dias = 0 } = tempo || {};
  return anos + meses / 12 + dias / 360;
}

/**
 * Verifica se os requisitos do DIREITO ADQUIRIDO à aposentadoria por
 * tempo de contribuição (regras pré-EC 103/2019) estão cumpridos, e se a
 * pontuação do art. 29-C dispensa o Fator Previdenciário.
 *
 * @param {{tempoContribuicaoEm13112019:{anos,meses,dias}|number,
 *   idadeEm13112019Anos:number, carenciaMeses:number,
 *   sexo:'homem'|'mulher'}} dados
 * @returns {{elegivel:boolean, pendencias:string[], tempoMinimoExigidoAnos:number,
 *   pontuacaoAtingida:number, pontuacaoExigidaParaDispensarFator:number,
 *   dispensaFatorPrevidenciario:boolean}}
 */
function elegibilidadeDireitoAdquiridoTempoContribuicao(dados) {
  validarSexoDireitoAdquirido(dados.sexo);
  const tempoMinimoExigidoAnos = TEMPO_MINIMO_DIREITO_ADQUIRIDO_ANOS[dados.sexo];
  const tempoAnos = paraAnosFracionariosDireitoAdquirido(dados.tempoContribuicaoEm13112019);
  const carenciaMinima = MotorRMI.CARENCIA_MINIMA_MESES;
  const idadeAnos = typeof dados.idadeEm13112019Anos === 'number' ? dados.idadeEm13112019Anos : 0;
  const pontuacaoAtingida = idadeAnos + tempoAnos;
  const pontuacaoExigida = PONTUACAO_DISPENSA_FATOR_PREVIDENCIARIO[dados.sexo];
  const dispensaFatorPrevidenciario = pontuacaoAtingida >= pontuacaoExigida;

  const pendencias = [];
  if (tempoAnos < tempoMinimoExigidoAnos) {
    pendencias.push(`tempo de contribuição até 13/11/2019 abaixo do mínimo (exige ${tempoMinimoExigidoAnos} anos, art. 53, Lei 8.213/91)`);
  }
  if (typeof dados.carenciaMeses !== 'number' || dados.carenciaMeses < carenciaMinima) {
    pendencias.push(`carência mínima não atingida (exige ${carenciaMinima} contribuições, art. 25, II, Lei 8.213/91)`);
  }
  if (typeof dados.idadeEm13112019Anos !== 'number') {
    pendencias.push('idade em 13/11/2019 não informada — necessária para verificar a dispensa do fator previdenciário (art. 29-C)');
  }

  return {
    elegivel: pendencias.length === 0,
    pendencias,
    tempoMinimoExigidoAnos,
    pontuacaoAtingida,
    pontuacaoExigidaParaDispensarFator: pontuacaoExigida,
    dispensaFatorPrevidenciario
  };
}

/**
 * Calcula a RMI do direito adquirido — 100% do salário de benefício se a
 * pontuação do art. 29-C foi atingida (dispensa o fator); caso contrário,
 * EXIGE o Fator Previdenciário já calculado (este módulo não o calcula).
 *
 * @param {object} dados
 * @param {number} dados.salarioBeneficio - ver LIMITAÇÃO 1 no cabeçalho:
 *   idealmente calculado pela média dos 80% maiores salários, não pela
 *   regra pós-reforma que o resto do projeto usa.
 * @param {boolean} dados.dispensaFatorPrevidenciario - resultado de
 *   elegibilidadeDireitoAdquiridoTempoContribuicao(...).
 * @param {number} [dados.fatorPrevidenciario] - obrigatório quando
 *   dispensaFatorPrevidenciario é false.
 * @param {number} [dados.salarioMinimoVigente]
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{percentualOuFatorAplicado:number, rmiAntesDoPisoTeto:number,
 *   rmiFinal:number, aplicouPiso:boolean, aplicouTeto:boolean,
 *   dispensouFatorPrevidenciario:boolean}}
 */
function calcularRMIDireitoAdquiridoTempoContribuicao(dados) {
  if (typeof dados.salarioBeneficio !== 'number' || !Number.isFinite(dados.salarioBeneficio) || !(dados.salarioBeneficio > 0)) {
    throw new Error('calcularRMIDireitoAdquiridoTempoContribuicao: salarioBeneficio precisa ser um número maior que zero');
  }

  var percentualOuFatorAplicado;
  if (dados.dispensaFatorPrevidenciario === true) {
    percentualOuFatorAplicado = 1.0; // 100% do salário de benefício, sem fator (art. 29-C)
  } else {
    if (typeof dados.fatorPrevidenciario !== 'number' || !(dados.fatorPrevidenciario > 0)) {
      throw new Error('calcularRMIDireitoAdquiridoTempoContribuicao: fatorPrevidenciario é obrigatório quando a pontuação do art. 29-C não dispensa o fator — este módulo não o calcula, ver limitação no cabeçalho do arquivo');
    }
    percentualOuFatorAplicado = dados.fatorPrevidenciario;
  }

  var rmiAntesDoPisoTeto = dados.salarioBeneficio * percentualOuFatorAplicado;
  var rmiFinal = rmiAntesDoPisoTeto;
  var aplicouPiso = false;
  var aplicouTeto = false;
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
    percentualOuFatorAplicado,
    rmiAntesDoPisoTeto,
    rmiFinal,
    aplicouPiso,
    aplicouTeto,
    dispensouFatorPrevidenciario: dados.dispensaFatorPrevidenciario === true
  };
}

var RegraDireitoAdquiridoTempoContribuicao = {
  TEMPO_MINIMO_DIREITO_ADQUIRIDO_ANOS,
  PONTUACAO_DISPENSA_FATOR_PREVIDENCIARIO,
  elegibilidadeDireitoAdquiridoTempoContribuicao,
  calcularRMIDireitoAdquiridoTempoContribuicao
};

/* ----------------------------------------------------------------------
   Ver LIMITAÇÕES no cabeçalho do arquivo (destacadas, não repetidas aqui
   pra não diluir a mais importante: item 1, sobre o salário de benefício
   80% maiores × 100%).
---------------------------------------------------------------------- */
