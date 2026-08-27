/* ============================================================================
   BENEFICIOS/SALARIOMATERNIDADE.JS — Salário-maternidade. Atualização 44
   — fase 2 do catálogo `beneficios/`.

   BASE LEGAL (conferida por busca antes de codificar; Lei 8.213/91, arts.
   25, III, 71 a 73):
     - Devido durante 120 dias (prazos diferentes para adoção conforme
       idade da criança, art. 71-A — não tratado aqui).
     - CARÊNCIA: o art. 25, III, Lei 8.213/91 previa 10 contribuições
       mensais para contribuinte individual/facultativa/segurada especial
       (empregada/trabalhadora avulsa/doméstica nunca precisaram) — mas o
       STF (ADIs 2.110 e 2.111, mérito julgado em 21/03/2024, com efeitos
       desde 05/04/2024) declarou essa exigência INCONSTITUCIONAL para
       TODAS as categorias, por violar isonomia. Este módulo aplica a
       regra ATUAL: SEM carência para nenhuma categoria. O histórico (10
       meses para não-empregadas) fica só documentado aqui, não
       implementado, por já estar superado.
     - RMI varia por categoria (arts. 71-B, §2º, 72 e 73):
         empregada/trabalhadora avulsa -> remuneração integral
         empregada doméstica -> último salário de contribuição
         segurada especial (economia familiar) -> 1 salário mínimo
         segurada especial que contribuiu como contribuinte individual ->
           1/12 do valor da última contribuição anual
         demais seguradas (contribuinte individual/facultativa) -> média
           dos últimos 12 salários de contribuição (apurados em até 15 meses)
     - Nunca inferior a 1 salário mínimo (art. 73, Lei 8.213/91).

   LIMITAÇÕES CONHECIDAS:
     1. Não calcula nenhuma das bases de cálculo por categoria
        (remuneração integral, último SC, média de 12 SC, valor anual/12)
        — o projeto não rastreia essas séries hoje (a "média desde
        07/1994" que o resto do app calcula não serve para nenhuma
        categoria deste benefício). Recebe `baseCalculo` já pronta,
        exceto para "especial_economia_familiar" (sempre 1 salário
        mínimo, calculado aqui).
     2. Não trata os prazos diferenciados de adoção por idade da criança
        (art. 71-A) nem a hipótese de óbito da segurada (art. 71-B).
============================================================================ */

var CATEGORIAS_SALARIO_MATERNIDADE = Object.freeze([
  'empregada_avulsa',
  'domestica',
  'especial_economia_familiar',
  'especial_contribuinte_individual',
  'demais'
]);

function _validarCategoria(categoria) {
  if (CATEGORIAS_SALARIO_MATERNIDADE.indexOf(categoria) === -1) {
    throw new Error(`categoria inválida (esperado uma de ${CATEGORIAS_SALARIO_MATERNIDADE.join(', ')}): ${categoria}`);
  }
}

/**
 * SEM carência para nenhuma categoria (regra atual pós STF, ADIs 2.110 e
 * 2.111 — ver cabeçalho do arquivo). Só verifica segurada + evento gerador.
 *
 * @param {{segurada:boolean, eventoGerador:boolean}} dados
 * @returns {{elegivel:boolean, pendencias:string[]}}
 */
function elegibilidadeSalarioMaternidade(dados) {
  var pendencias = [];
  if (dados.segurada !== true) {
    pendencias.push('qualidade de segurada não confirmada (art. 25, III, Lei 8.213/91)');
  }
  if (dados.eventoGerador !== true) {
    pendencias.push('evento gerador (parto, aborto não criminoso, adoção ou guarda judicial) não comprovado (art. 71/71-A, Lei 8.213/91)');
  }
  return { elegivel: pendencias.length === 0, pendencias: pendencias };
}

/**
 * @param {object} dados
 * @param {'empregada_avulsa'|'domestica'|'especial_economia_familiar'|
 *   'especial_contribuinte_individual'|'demais'} dados.categoria
 * @param {number} [dados.baseCalculo] - obrigatório para todas as
 *   categorias EXCETO "especial_economia_familiar".
 * @param {number} dados.salarioMinimoVigente - obrigatório (piso legal
 *   sempre aplicável, art. 73, e único valor usado para
 *   "especial_economia_familiar").
 * @param {number} [dados.tetoRGPSVigente]
 * @returns {{categoria:string, rmiAntesDoPiso:number, rmiFinal:number, aplicouPiso:boolean, aplicouTeto:boolean}}
 */
function calcularRMISalarioMaternidade(dados) {
  _validarCategoria(dados.categoria);
  if (typeof dados.salarioMinimoVigente !== 'number' || !Number.isFinite(dados.salarioMinimoVigente) || !(dados.salarioMinimoVigente > 0)) {
    throw new Error('calcularRMISalarioMaternidade: salarioMinimoVigente é obrigatório (piso legal do art. 73, Lei 8.213/91, sempre aplicável a este benefício)');
  }

  var rmiAntesDoPiso;
  if (dados.categoria === 'especial_economia_familiar') {
    rmiAntesDoPiso = dados.salarioMinimoVigente;
  } else {
    if (typeof dados.baseCalculo !== 'number' || !Number.isFinite(dados.baseCalculo) || !(dados.baseCalculo > 0)) {
      throw new Error(`calcularRMISalarioMaternidade: baseCalculo é obrigatório para a categoria "${dados.categoria}" (este módulo não calcula a base — ver limitações no cabeçalho do arquivo)`);
    }
    rmiAntesDoPiso = dados.baseCalculo;
  }

  // Correção (achado da perícia de software): mesma validação cruzada
  // piso/teto das demais espécies — rejeita entrada inconsistente em vez
  // de aplicar o teto por cima do piso silenciosamente.
  if (typeof dados.tetoRGPSVigente === 'number' && dados.salarioMinimoVigente > dados.tetoRGPSVigente) {
    throw new Error(`salarioMinimoVigente (${dados.salarioMinimoVigente}) não pode ser maior que tetoRGPSVigente (${dados.tetoRGPSVigente}) — entrada inconsistente`);
  }

  var rmiFinal = rmiAntesDoPiso;
  var aplicouPiso = false;
  var aplicouTeto = false;
  if (rmiFinal < dados.salarioMinimoVigente) {
    rmiFinal = dados.salarioMinimoVigente;
    aplicouPiso = true;
  }
  if (typeof dados.tetoRGPSVigente === 'number' && rmiFinal > dados.tetoRGPSVigente) {
    rmiFinal = dados.tetoRGPSVigente;
    aplicouTeto = true;
  }

  return {
    categoria: dados.categoria,
    rmiAntesDoPiso: rmiAntesDoPiso,
    rmiFinal: rmiFinal,
    aplicouPiso: aplicouPiso,
    aplicouTeto: aplicouTeto
  };
}

var BeneficioSalarioMaternidade = {
  CATEGORIAS_SALARIO_MATERNIDADE,
  elegibilidadeSalarioMaternidade,
  calcularRMISalarioMaternidade
};
