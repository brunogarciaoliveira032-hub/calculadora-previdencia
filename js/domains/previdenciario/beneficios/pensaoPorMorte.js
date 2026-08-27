/* ============================================================================
   BENEFICIOS/PENSAOPORMORTE.JS — Pensão por morte. Atualização 44 — fase
   2 do catálogo `beneficios/`.

   BASE LEGAL (conferida por busca antes de codificar; Lei 8.213/91, arts.
   16, 74-78, com redação da Lei 13.135/2015 e EC 103/2019):
     - Dependentes reconhecidos (art. 16): Classe I (cônjuge/companheiro,
       filho não emancipado menor de 21 anos ou inválido/com deficiência),
       Classe II (pais), Classe III (irmão nas mesmas condições do filho).
       Classes excludentes entre si (a existência de dependente de uma
       classe exclui as posteriores).
     - Em regra, independe de carência — EXCEÇÃO (art. 77, §2º-A, cônjuge/
       companheiro): se o óbito ocorrer antes de o segurado completar 18
       contribuições mensais OU antes de 2 anos do início do casamento/
       união estável, a pensão do cônjuge/companheiro dura só 4 meses (em
       vez do prazo normal por idade) — DISPENSADA essa exigência se o
       óbito decorrer de acidente de qualquer natureza ou doença
       profissional/do trabalho.
     - RMI (art. 75, redação pós EC 103/2019): cota familiar de 50% do
       valor da aposentadoria que o segurado recebia ou teria direito se
       estivesse aposentado por incapacidade permanente na data do óbito,
       ACRESCIDA de 10 pontos percentuais por dependente, até 100% (5
       dependentes ou mais).
     - Havendo mais de um pensionista, o valor é rateado em cotas iguais
       entre eles (art. 77, caput).

   LIMITAÇÕES CONHECIDAS (documentadas, não escondidas):
     1. Não calcula a DURAÇÃO do benefício (tabela de anos por idade do
        dependente na data do óbito, art. 77, §2º, "c") — só elegibilidade
        e valor mensal (RMI), não por quanto tempo é devido.
     2. Não classifica dependentes por classe nem aplica a exclusão entre
        classes — recebe `numeroDependentes` já apurado pelo chamador.
     3. Não verifica qualidade de segurado do falecido — recebida como
        fato já verificado (mesma limitação de outras espécies).
     4. Não calcula "o valor da aposentadoria que o segurado recebia ou
        teria direito" — recebido pronto como `valorBaseAposentadoria`
        (pode vir de beneficios/incapacidadePermanente.js quando o
        segurado ainda não era aposentado, calculado à parte pelo
        chamador; este módulo não orquestra essa chamada sozinho).
============================================================================ */

var PERCENTUAL_COTA_FAMILIAR_BASE = 0.50; // art. 75
var PERCENTUAL_COTA_POR_DEPENDENTE = 0.10; // art. 75
var PERCENTUAL_COTA_FAMILIAR_MAXIMO = 1.00; // art. 75 (teto de 100%, a partir de 5 dependentes)
var CONTRIBUICOES_MINIMAS_CONJUGE_PRAZO_INTEGRAL = 18; // art. 77, §2º-A
var ANOS_MINIMOS_UNIAO_CONJUGE_PRAZO_INTEGRAL = 2; // art. 77, §2º-A

/**
 * @param {{qualidadeSeguradoFalecido:boolean, dependenteReconhecido:boolean}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadePensaoPorMorte(dados) {
  var pendencias = [];
  if (dados.qualidadeSeguradoFalecido !== true) {
    pendencias.push('qualidade de segurado do falecido na data do óbito não confirmada (art. 74, Lei 8.213/91)');
  }
  if (dados.dependenteReconhecido !== true) {
    pendencias.push('dependente não reconhecido dentre as classes do art. 16, Lei 8.213/91 (cônjuge/companheiro e filho; pais; irmão, nas condições legais)');
  }
  return { elegivel: pendencias.length === 0, pendencias: pendencias };
}

/**
 * Verifica se o cônjuge/companheiro atende à regra de prazo integral
 * (18 contribuições do segurado + 2 anos de união) — puramente
 * informativo aqui, já que este módulo não calcula duração; só sinaliza
 * se caberia a redução para 4 meses.
 *
 * @param {{contribuicoesDoFalecido:number, anosDeUniao:number, causaAcidentaria:boolean}} dados
 * @returns {boolean} true = prazo integral por idade; false = restrito a 4 meses
 */
function regraConjugeAtendePrazoIntegral(dados) {
  if (dados.causaAcidentaria === true) return true; // dispensa (art. 77, §2º-A)
  var contribuicoesOk = typeof dados.contribuicoesDoFalecido === 'number' && dados.contribuicoesDoFalecido >= CONTRIBUICOES_MINIMAS_CONJUGE_PRAZO_INTEGRAL;
  var uniaoOk = typeof dados.anosDeUniao === 'number' && dados.anosDeUniao >= ANOS_MINIMOS_UNIAO_CONJUGE_PRAZO_INTEGRAL;
  return contribuicoesOk && uniaoOk;
}

/**
 * @param {object} dados
 * @param {number} dados.valorBaseAposentadoria - valor que o segurado
 *   recebia, ou teria direito se aposentado por incapacidade permanente
 *   na data do óbito (já calculado — não computado aqui).
 * @param {number} dados.numeroDependentes - quantidade de dependentes
 *   habilitados (para fins da cota familiar, não da divisão por cotas
 *   individuais).
 * @returns {{percentualCotaFamiliar:number, rmiCotaFamiliar:number,
 *   rmiCotaPorDependente:number}}
 */
function calcularRMIPensaoPorMorte(dados) {
  if (typeof dados.valorBaseAposentadoria !== 'number' || !Number.isFinite(dados.valorBaseAposentadoria) || !(dados.valorBaseAposentadoria > 0)) {
    throw new Error('calcularRMIPensaoPorMorte: valorBaseAposentadoria precisa ser um número maior que zero');
  }
  // Correção (achado da perícia de software): antes aceitava qualquer
  // número >= 1, inclusive fracionário (ex.: 2.5), o que não corresponde a
  // uma quantidade real de dependentes — agora exige inteiro.
  if (typeof dados.numeroDependentes !== 'number' || !Number.isInteger(dados.numeroDependentes) || dados.numeroDependentes < 1) {
    throw new Error('calcularRMIPensaoPorMorte: numeroDependentes precisa ser um número inteiro maior ou igual a 1');
  }
  var percentualCotaFamiliar = Math.min(
    PERCENTUAL_COTA_FAMILIAR_BASE + PERCENTUAL_COTA_POR_DEPENDENTE * dados.numeroDependentes,
    PERCENTUAL_COTA_FAMILIAR_MAXIMO
  );
  var rmiCotaFamiliar = Math.round(dados.valorBaseAposentadoria * percentualCotaFamiliar * 100) / 100;
  var rmiCotaPorDependente = Math.round((rmiCotaFamiliar / dados.numeroDependentes) * 100) / 100;

  return {
    percentualCotaFamiliar: percentualCotaFamiliar,
    rmiCotaFamiliar: rmiCotaFamiliar,
    rmiCotaPorDependente: rmiCotaPorDependente
  };
}

var BeneficioPensaoPorMorte = {
  PERCENTUAL_COTA_FAMILIAR_BASE,
  PERCENTUAL_COTA_POR_DEPENDENTE,
  PERCENTUAL_COTA_FAMILIAR_MAXIMO,
  CONTRIBUICOES_MINIMAS_CONJUGE_PRAZO_INTEGRAL,
  ANOS_MINIMOS_UNIAO_CONJUGE_PRAZO_INTEGRAL,
  elegibilidadePensaoPorMorte,
  regraConjugeAtendePrazoIntegral,
  calcularRMIPensaoPorMorte
};
