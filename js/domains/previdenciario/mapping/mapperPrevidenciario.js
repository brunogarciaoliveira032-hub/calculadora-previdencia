/* ============================================================================
   MAPPERPREVIDENCIARIO.JS — última peça do pipeline desta entrega:

     candidatos de vínculo (extratorVinculosCNIS.js)
       -> vinculosParaMotorTempoContribuicao()
       -> formato aceito por MotorTempoContribuicao.calcularTempoContribuicao()
          ({inicio, fim, tipo, anosExposicao?})

   NÃO decide sozinho nada que exija revisão humana: por padrão só usa
   candidatos com `status === 'validado'` (ver PREV_LIMIAR_CONFIANCA_VALIDADO
   em extratorVinculosCNIS.js); candidatos 'requer_revisao' voltam em
   `.ignorados`, nunca somem silenciosamente. `opcoes.incluirRequerRevisao:
   true` inclui todos mesmo assim, para uso explícito de quem já revisou.

   TIPO 'comum' x 'especial': o CNIS por si só não informa se um vínculo é
   atividade especial (isso vem de PPP/laudo técnico — extrator de PPP
   continua fora de escopo, ver field-rules/vinculos.js). Por padrão todo
   vínculo mapeado aqui sai como `tipo: 'comum'` (`opcoes.tipo`/
   `opcoes.anosExposicao`, se informados, aplicam-se a TODOS os vínculos —
   mantido por compatibilidade).

   CLASSIFICAÇÃO POR VÍNCULO (Atualização 21): como a advogada/o advogado
   pode SABER, por outra prova já em mãos (PPP em papel, laudo, sentença
   trabalhista), que um vínculo específico é especial — sem que o app
   precise ler esse documento — cada candidato pode carregar
   `.tipoManual` ('comum'|'especial') e, se especial,
   `.anosExposicaoManual` (15|20|25), preenchidos pela UI (nunca
   inferidos pelo extrator de texto, que continua cego a isso). Quando
   presentes, têm prioridade sobre `opcoes.tipo`/`opcoes.anosExposicao`
   PARA AQUELE VÍNCULO apenas — os demais continuam no padrão. Uma marca
   `.tipoManual === 'especial'` sem `.anosExposicaoManual` válido (15/20/25)
   NUNCA é aceita como especial silenciosamente: o vínculo sai como
   `tipo: 'comum'` e ganha `.avisoTipo` explicando o motivo, para a UI
   avisar em vez de calcular um tempo convertido errado.

   VÍNCULO EM ABERTO (`.aberto === true`, sem `.fim`): MotorTempoContribuicao
   exige `fim` ISO — este mapper usa `opcoes.dataReferencia` (obrigatória
   quando há algum vínculo em aberto na lista; sem ela, o vínculo aberto vai
   para `.ignorados` em vez de inventar uma data) como data de corte, e
   marca o vínculo resultante com `.aberto: true` para quem for exibir na
   UI saber que aquele "fim" é só a data de referência do cálculo, não uma
   data real do documento.

   DEPENDE de (opcional, checado defensivamente): nenhuma — funciona
   isolado; só produz o formato que MotorTempoContribuicao espera.
============================================================================ */

/**
 * @param {Array<object>} candidatosVinculo — saída de extrairVinculosDoTexto()/extrairVinculosDoDocumento()
 * @param {{incluirRequerRevisao?:boolean, dataReferencia?:string, tipo?:'comum'|'especial'}} [opcoes]
 * @returns {{vinculos:Array<{inicio:string,fim:string,tipo:string,aberto:boolean,_origem:object}>,
 *            ignorados:Array<{candidato:object, motivo:string}>}}
 */
function vinculosParaMotorTempoContribuicao(candidatosVinculo, opcoes) {
  opcoes = opcoes || {};
  var incluirRequerRevisao = !!opcoes.incluirRequerRevisao;
  var tipoPadrao = opcoes.tipo === 'especial' ? 'especial' : 'comum';

  var vinculos = [];
  var ignorados = [];

  (Array.isArray(candidatosVinculo) ? candidatosVinculo : []).forEach(function (candidato) {
    if (!candidato || candidato.tipo !== 'vinculo') return;

    if (!incluirRequerRevisao && candidato.status !== 'validado') {
      ignorados.push({ candidato: candidato, motivo: 'status "' + candidato.status + '" (não validado) — use opcoes.incluirRequerRevisao para incluir mesmo assim' });
      return;
    }
    if (!candidato.inicio) {
      ignorados.push({ candidato: candidato, motivo: 'sem data de início' });
      return;
    }

    var fim = candidato.fim;
    if (candidato.aberto && !fim) {
      if (!opcoes.dataReferencia) {
        ignorados.push({ candidato: candidato, motivo: 'vínculo em aberto sem opcoes.dataReferencia para servir de data de corte' });
        return;
      }
      fim = opcoes.dataReferencia;
    }
    if (!fim) {
      ignorados.push({ candidato: candidato, motivo: 'sem data de fim e não marcado como em aberto' });
      return;
    }

    var tipoFinal = tipoPadrao;
    var anosExposicaoFinal = (tipoPadrao === 'especial' && opcoes.anosExposicao) ? opcoes.anosExposicao : undefined;
    var avisoTipo = null;

    if (candidato.tipoManual === 'especial') {
      if ([15, 20, 25].indexOf(candidato.anosExposicaoManual) !== -1) {
        tipoFinal = 'especial';
        anosExposicaoFinal = candidato.anosExposicaoManual;
      } else {
        tipoFinal = 'comum';
        anosExposicaoFinal = undefined;
        avisoTipo = 'marcado como atividade especial, mas sem anos de exposição válido (15, 20 ou 25) — tratado como comum para não converter tempo com fator incerto';
      }
    } else if (candidato.tipoManual === 'comum') {
      tipoFinal = 'comum';
      anosExposicaoFinal = undefined;
    }

    var vinculo = { inicio: candidato.inicio, fim: fim, tipo: tipoFinal, aberto: !!candidato.aberto, _origem: candidato };
    if (tipoFinal === 'especial' && anosExposicaoFinal) vinculo.anosExposicao = anosExposicaoFinal;
    if (avisoTipo) vinculo.avisoTipo = avisoTipo;
    vinculos.push(vinculo);
  });

  return { vinculos: vinculos, ignorados: ignorados };
}

/**
 * Atalho: extrai vínculos de candidatos + já entrega o resultado de
 * MotorTempoContribuicao.calcularTempoContribuicao() (quando carregado),
 * junto com `.ignorados` (candidatos não usados) e `.vinculosUsados` (o
 * que efetivamente entrou no cálculo, para a UI poder mostrar
 * proveniência linha a linha, como no exemplo do roadmap do produto).
 */
function calcularTempoContribuicaoDeCandidatos(candidatosVinculo, opcoes) {
  opcoes = opcoes || {};
  var mapeado = vinculosParaMotorTempoContribuicao(candidatosVinculo, opcoes);
  if (mapeado.vinculos.length === 0) {
    return Object.assign({ resultado: null }, mapeado);
  }
  if (typeof MotorTempoContribuicao === 'undefined') {
    return Object.assign({ resultado: null, erro: 'MotorTempoContribuicao não carregado' }, mapeado);
  }
  var vinculosParaMotor = mapeado.vinculos.map(function (v) {
    return { inicio: v.inicio, fim: v.fim, tipo: v.tipo, anosExposicao: v.anosExposicao };
  });
  var resultado = MotorTempoContribuicao.calcularTempoContribuicao(vinculosParaMotor, opcoes);
  return { resultado: resultado, vinculosUsados: mapeado.vinculos, ignorados: mapeado.ignorados };
}

var MapperPrevidenciario = {
  versaoModulo: '1.1.0',
  vinculosParaMotorTempoContribuicao: vinculosParaMotorTempoContribuicao,
  calcularTempoContribuicaoDeCandidatos: calcularTempoContribuicaoDeCandidatos
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MapperPrevidenciario,
    vinculosParaMotorTempoContribuicao, calcularTempoContribuicaoDeCandidatos
  };
}
