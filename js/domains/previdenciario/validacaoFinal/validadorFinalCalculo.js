/* ============================================================================
   VALIDACAOFINAL/VALIDADORFINALCALCULO.JS — Camada de validação final,
   executada DEPOIS de todo o resto (motores + regras já decidiram tudo).
   Atualização 48, a pedido do usuário ("obrigatória antes de escritório").

   O QUE ESTE MÓDULO NÃO É: não é mais uma camada de decisão jurídica. Não
   inventa nenhuma regra nova — só INSPECIONA sinais que os motores e o
   Decision Engine já calcularam (resultado de calcularRMIDoHistorico(),
   avaliações de regras de transição/benefícios, o histórico consolidado)
   e resume isso num checklist auditável + um status geral. Mesma linha do
   item 6 desta sessão: motor jurídico decide, isto só audita e consolida
   o que já foi decidido — nunca recalcula nem resolve nada sozinho.

   STATUS POR ITEM: 'ok' (🟢) | 'ressalva' (🟡, não impede o uso mas pede
   atenção) | 'bloqueado' (🔴, problema que compromete o cálculo) |
   'nao_verificado' (dado não informado, o item simplesmente não pôde ser
   checado — tratado como ressalva no status geral, nunca como 'ok' por
   omissão).

   STATUS GERAL: 🔴 se qualquer item bloqueado; senão 🟡 se qualquer item
   em ressalva ou não verificado; senão 🟢.
============================================================================ */

function _validarCPF(cpfBruto) {
  var cpf = String(cpfBruto || '').replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // todos os dígitos iguais — inválido por definição
  function calcularDigito(base, pesoInicial) {
    var soma = 0;
    for (var i = 0; i < base.length; i++) soma += parseInt(base[i], 10) * (pesoInicial - i);
    var resto = (soma * 10) % 11;
    return resto === 10 || resto === 11 ? 0 : resto;
  }
  var d1 = calcularDigito(cpf.substring(0, 9), 10);
  if (d1 !== parseInt(cpf[9], 10)) return false;
  var d2 = calcularDigito(cpf.substring(0, 10), 11);
  if (d2 !== parseInt(cpf[10], 10)) return false;
  return true;
}

function _dataValida(iso) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  var d = new Date(iso + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

function _item(codigo, rotulo, status, detalhe) {
  return { codigo: codigo, rotulo: rotulo, status: status, detalhe: detalhe };
}

/**
 * @param {object} dados
 * @param {string} [dados.cpf]
 * @param {string} [dados.dataNascimento] - ISO "AAAA-MM-DD"
 * @param {string} [dados.dataDER] - ISO
 * @param {string} [dados.dataDIB] - ISO
 * @param {string} [dados.competenciaReferencia] - "AAAA-MM"
 * @param {object} [dados.historico] - HistoricoPrevidenciario.montarHistorico(...)
 * @param {object} [dados.resultado] - saída de calcularRMIDoHistorico(...), já com
 *   `.regraPontos`/`.regraPedagio50`/`.regraPedagio100`/`.beneficioIncapacidadePermanente`/
 *   `.auxilioIncapacidadeTemporaria`/`.auxilioAcidente`/`.pensaoPorMorte`/`.salarioMaternidade`
 *   anexados pela UI quando aplicável (mesmos campos já usados em painelPrevidenciario.js).
 * @returns {{itens: Array, statusGeral: 'validado'|'validado_com_ressalvas'|'bloqueado'}}
 */
function validarCalculoFinal(dados) {
  dados = dados || {};
  var itens = [];
  var resultado = dados.resultado || null;
  var historico = dados.historico || null;

  // 1. CPF válido
  if (!dados.cpf) {
    itens.push(_item('cpfValido', 'CPF válido', 'nao_verificado', 'CPF do segurado não informado.'));
  } else if (_validarCPF(dados.cpf)) {
    itens.push(_item('cpfValido', 'CPF válido', 'ok', 'Dígitos verificadores conferem.'));
  } else {
    itens.push(_item('cpfValido', 'CPF válido', 'bloqueado', 'CPF informado não passa na validação de dígitos verificadores.'));
  }

  // 2. Data de nascimento válida
  if (!dados.dataNascimento) {
    itens.push(_item('dataNascimentoValida', 'Data de nascimento válida', 'nao_verificado', 'Data de nascimento não informada.'));
  } else if (!_dataValida(dados.dataNascimento)) {
    itens.push(_item('dataNascimentoValida', 'Data de nascimento válida', 'bloqueado', 'Data de nascimento em formato inválido.'));
  } else {
    var hojeIso = new Date().toISOString().slice(0, 10);
    if (dados.dataNascimento > hojeIso) {
      itens.push(_item('dataNascimentoValida', 'Data de nascimento válida', 'bloqueado', 'Data de nascimento está no futuro.'));
    } else if (dados.dataNascimento < '1900-01-01') {
      itens.push(_item('dataNascimentoValida', 'Data de nascimento válida', 'bloqueado', 'Data de nascimento anterior a 1900 — provável erro de digitação.'));
    } else {
      itens.push(_item('dataNascimentoValida', 'Data de nascimento válida', 'ok', 'Data plausível.'));
    }
  }

  // 3. DER válida (a competência de referência, obrigatória pro cálculo em si, OU o campo de data completa)
  if (dados.dataDER && !_dataValida(dados.dataDER)) {
    itens.push(_item('derValida', 'DER válida', 'bloqueado', 'Campo "DER" (data completa) em formato inválido.'));
  } else if (!dados.competenciaReferencia && !dados.dataDER) {
    itens.push(_item('derValida', 'DER válida', 'bloqueado', 'Nenhuma DER informada (nem competência de referência, nem data completa) — o cálculo do salário de benefício depende dela.'));
  } else {
    itens.push(_item('derValida', 'DER válida', 'ok', 'DER informada em formato válido.'));
  }

  // 4. DIB ≤ DER
  if (!dados.dataDIB || !dados.dataDER) {
    itens.push(_item('dibAnteriorOuIgualDer', 'DIB ≤ DER', 'nao_verificado', 'Precisa das duas datas completas (DIB e DER) preenchidas para conferir.'));
  } else if (!_dataValida(dados.dataDIB) || !_dataValida(dados.dataDER)) {
    itens.push(_item('dibAnteriorOuIgualDer', 'DIB ≤ DER', 'nao_verificado', 'Uma das datas está em formato inválido — ver itens acima.'));
  } else if (dados.dataDIB > dados.dataDER) {
    itens.push(_item('dibAnteriorOuIgualDer', 'DIB ≤ DER', 'bloqueado', 'DIB (' + dados.dataDIB + ') é POSTERIOR à DER (' + dados.dataDER + ') — inconsistência que precisa ser revisada antes de prosseguir.'));
  } else {
    itens.push(_item('dibAnteriorOuIgualDer', 'DIB ≤ DER', 'ok', 'DIB não é posterior à DER.'));
  }

  // 5. Vínculos sem datas impossíveis
  var vinculos = (historico && Array.isArray(historico.vinculos)) ? historico.vinculos : [];
  if (!vinculos.length) {
    itens.push(_item('vinculosSemDatasImpossiveis', 'Vínculos sem datas impossíveis', 'nao_verificado', 'Nenhum vínculo no histórico para conferir.'));
  } else {
    var anoMaximo = new Date().getFullYear() + 1;
    var vinculosInvalidos = vinculos.filter(function (v) {
      if (!v.inicio || !v.fim) return true;
      // Correção (achado da perícia de software): antes só comparava as
      // strings de início/fim sem checar se cada uma é uma data ISO real
      // (ex.: "2020" sozinho, sem mês/dia, passava batido) — agora usa a
      // mesma _dataValida() já aplicada aos outros itens deste checklist.
      if (!_dataValida(v.inicio) || !_dataValida(v.fim)) return true;
      if (v.inicio > v.fim) return true;
      var anoInicio = parseInt(String(v.inicio).slice(0, 4), 10);
      var anoFim = parseInt(String(v.fim).slice(0, 4), 10);
      return anoInicio < 1900 || anoFim > anoMaximo;
    });
    if (vinculosInvalidos.length) {
      itens.push(_item('vinculosSemDatasImpossiveis', 'Vínculos sem datas impossíveis', 'bloqueado', vinculosInvalidos.length + ' vínculo(s) com início posterior ao fim, ou fora de uma faixa plausível de anos.'));
    } else {
      itens.push(_item('vinculosSemDatasImpossiveis', 'Vínculos sem datas impossíveis', 'ok', vinculos.length + ' vínculo(s) conferido(s), nenhuma data impossível.'));
    }
  }

  // 6. Períodos sem sobreposição indevida (ambiguidade de dado não resolvida)
  var contribuicoes = (historico && Array.isArray(historico.contribuicoes)) ? historico.contribuicoes : [];
  var ambiguas = contribuicoes.filter(function (c) { return c.ambigua; });
  if (!contribuicoes.length) {
    itens.push(_item('periodosSemSobreposicaoIndevida', 'Períodos sem sobreposição indevida', 'nao_verificado', 'Nenhuma contribuição consolidada para conferir.'));
  } else if (ambiguas.length) {
    itens.push(_item('periodosSemSobreposicaoIndevida', 'Períodos sem sobreposição indevida', 'ressalva', ambiguas.length + ' competência(s) marcada(s) como ambígua(s) (mais de um lançamento não resolvido) — revisar manualmente.'));
  } else {
    itens.push(_item('periodosSemSobreposicaoIndevida', 'Períodos sem sobreposição indevida', 'ok', 'Nenhuma ambiguidade de dado pendente.'));
  }

  // 7. Carência calculada
  var carenciaInfo = resultado && resultado.elegibilidade && resultado.elegibilidade.carencia;
  if (carenciaInfo) {
    itens.push(_item('carenciaCalculada', 'Carência calculada', 'ok', carenciaInfo.totalMeses + ' mês(es) apurado(s).'));
  } else if (resultado && resultado.tempoEcarencia) {
    itens.push(_item('carenciaCalculada', 'Carência calculada', 'ressalva', 'Carência não apurada — normalmente por falta da idade do segurado no formulário.'));
  } else {
    itens.push(_item('carenciaCalculada', 'Carência calculada', 'bloqueado', 'Carência não calculada.'));
  }

  // 8. Tempo de contribuição calculado
  var tempoInfo = resultado && resultado.tempoEcarencia && resultado.tempoEcarencia.tempoContribuicao;
  if (tempoInfo) {
    itens.push(_item('tempoCalculado', 'Tempo de contribuição calculado', 'ok', 'Tempo total apurado.'));
  } else {
    itens.push(_item('tempoCalculado', 'Tempo de contribuição calculado', 'bloqueado', 'Tempo de contribuição não pôde ser calculado (ver motivo do cálculo interrompido, se houver).'));
  }

  // 9. Salários válidos (salário de benefício)
  var salarioInfo = resultado && resultado.salarioBeneficio;
  if (salarioInfo && salarioInfo.salarioBeneficio !== null) {
    itens.push(_item('salariosValidos', 'Salários válidos', 'ok', 'Salário de benefício calculado a partir de ' + (salarioInfo.quantidadeSalarios || '—') + ' competência(s).'));
  } else {
    itens.push(_item('salariosValidos', 'Salários válidos', 'bloqueado', (salarioInfo && salarioInfo.motivo) ? salarioInfo.motivo : 'Salário de benefício não calculado.'));
  }

  // 10. INPC completo (o motor de salário de benefício já bloqueia o
  // cálculo quando falta índice — se o salário saiu, o INPC usado estava
  // completo para as competências elegíveis).
  if (salarioInfo && salarioInfo.salarioBeneficio !== null) {
    itens.push(_item('inpcCompleto', 'INPC completo para as competências usadas', 'ok', 'Nenhuma lacuna de índice bloqueou o cálculo.'));
  } else if (salarioInfo && salarioInfo.motivo && /inpc|bacen|índice/i.test(salarioInfo.motivo)) {
    itens.push(_item('inpcCompleto', 'INPC completo para as competências usadas', 'bloqueado', salarioInfo.motivo));
  } else {
    itens.push(_item('inpcCompleto', 'INPC completo para as competências usadas', 'nao_verificado', 'Não foi possível confirmar (salário de benefício não calculado por outro motivo).'));
  }

  // 11. Teto histórico do RGPS disponível (quando concomitância de salário
  // exigiu consultá-lo)
  var memoria = (salarioInfo && Array.isArray(salarioInfo.memoria)) ? salarioInfo.memoria : [];
  var itemComTetoIndisponivel = memoria.find(function (m) {
    return m.limitacaoTetoRgpsHistorico && /não pôde ser aplicado automaticamente/.test(m.limitacaoTetoRgpsHistorico);
  });
  var itemComTetoDesatualizado = memoria.find(function (m) {
    return m.limitacaoTetoRgpsHistorico && /AVISO:/.test(m.limitacaoTetoRgpsHistorico);
  });
  if (itemComTetoIndisponivel) {
    itens.push(_item('tetoHistoricoDisponivel', 'Teto histórico do RGPS disponível', 'ressalva', 'Ao menos uma competência com concomitância de salário não teve o teto do RGPS conferido automaticamente — revisar manualmente.'));
  } else if (itemComTetoDesatualizado) {
    itens.push(_item('tetoHistoricoDisponivel', 'Teto histórico do RGPS disponível', 'ressalva', 'A tabela de teto do RGPS pode estar desatualizada para alguma competência usada — conferir se já existe Portaria mais recente.'));
  } else {
    itens.push(_item('tetoHistoricoDisponivel', 'Teto histórico do RGPS disponível', 'ok', 'Nenhuma pendência de teto histórico detectada.'));
  }

  // 12/13/14. Regra previdenciária identificada / requisitos cumpridos / RMI concluído
  var regraPermanenteEleg = resultado && resultado.elegibilidade;
  var regrasAvaliadas = [
    resultado && resultado.direitoAdquiridoTempoContribuicao ? { nome: 'direito adquirido (tempo de contribuição)', elegivel: resultado.direitoAdquiridoTempoContribuicao.elegibilidade.elegivel, rmi: resultado.direitoAdquiridoTempoContribuicao.rmi } : null,
    regraPermanenteEleg ? { nome: 'permanente', elegivel: regraPermanenteEleg.elegivel, rmi: resultado.rmiTeorica } : null,
    resultado && resultado.regraPontos ? { nome: 'pontos', elegivel: resultado.regraPontos.elegibilidade.elegivel, rmi: resultado.regraPontos.rmi } : null,
    resultado && resultado.regraIdadeMinimaProgressiva ? { nome: 'idade mínima progressiva', elegivel: resultado.regraIdadeMinimaProgressiva.elegibilidade.elegivel, rmi: resultado.regraIdadeMinimaProgressiva.rmi } : null,
    resultado && resultado.regraPedagio50 ? { nome: 'pedágio 50%', elegivel: resultado.regraPedagio50.elegibilidade.elegivel, rmi: resultado.regraPedagio50.rmi } : null,
    resultado && resultado.regraPedagio100 ? { nome: 'pedágio 100%', elegivel: resultado.regraPedagio100.elegibilidade.elegivel, rmi: resultado.regraPedagio100.rmi } : null,
    resultado && resultado.beneficioIncapacidadePermanente ? { nome: 'incapacidade permanente', elegivel: resultado.beneficioIncapacidadePermanente.elegibilidade.elegivel, rmi: resultado.beneficioIncapacidadePermanente.rmi } : null,
    resultado && resultado.auxilioIncapacidadeTemporaria ? { nome: 'auxílio incapacidade temporária', elegivel: resultado.auxilioIncapacidadeTemporaria.elegibilidade.elegivel, rmi: resultado.auxilioIncapacidadeTemporaria.rmi } : null,
    resultado && resultado.auxilioAcidente ? { nome: 'auxílio-acidente', elegivel: resultado.auxilioAcidente.elegibilidade.elegivel, rmi: resultado.auxilioAcidente.rmi } : null,
    resultado && resultado.pensaoPorMorte ? { nome: 'pensão por morte', elegivel: resultado.pensaoPorMorte.elegibilidade.elegivel, rmi: resultado.pensaoPorMorte.rmi } : null,
    resultado && resultado.salarioMaternidade ? { nome: 'salário-maternidade', elegivel: resultado.salarioMaternidade.elegibilidade.elegivel, rmi: resultado.salarioMaternidade.rmi } : null
  ].filter(Boolean);

  if (!regrasAvaliadas.length) {
    itens.push(_item('regraIdentificada', 'Regra previdenciária identificada', 'bloqueado', 'Nenhuma regra (permanente, transição ou espécie de benefício) foi avaliada neste cálculo.'));
  } else {
    itens.push(_item('regraIdentificada', 'Regra previdenciária identificada', 'ok', regrasAvaliadas.length + ' regra(s) avaliada(s): ' + regrasAvaliadas.map(function (r) { return r.nome; }).join(', ') + '.'));
  }

  var algumaElegivel = regrasAvaliadas.some(function (r) { return r.elegivel === true; });
  if (!regrasAvaliadas.length) {
    itens.push(_item('requisitosCumpridos', 'Requisitos cumpridos em ao menos uma regra', 'nao_verificado', 'Nenhuma regra avaliada.'));
  } else if (algumaElegivel) {
    itens.push(_item('requisitosCumpridos', 'Requisitos cumpridos em ao menos uma regra', 'ok', regrasAvaliadas.filter(function (r) { return r.elegivel; }).map(function (r) { return r.nome; }).join(', ') + '.'));
  } else {
    itens.push(_item('requisitosCumpridos', 'Requisitos cumpridos em ao menos uma regra', 'ressalva', 'Nenhuma das regras avaliadas mostrou elegibilidade nos dados atuais — pode ser um resultado correto (segurado ainda sem direito), não necessariamente um erro do sistema.'));
  }

  var algumRmiCalculado = regrasAvaliadas.some(function (r) { return r.rmi && typeof (r.rmi.rmiFinal != null ? r.rmi.rmiFinal : r.rmi.rmiCotaFamiliar) === 'number'; });
  if (algumRmiCalculado) {
    itens.push(_item('rmiConcluido', 'Cálculo de RMI concluído', 'ok', 'Ao menos uma regra chegou a um valor de RMI.'));
  } else if (regrasAvaliadas.length) {
    itens.push(_item('rmiConcluido', 'Cálculo de RMI concluído', 'ressalva', 'Regra(s) avaliada(s), mas nenhuma chegou a calcular a RMI (provavelmente por falta de dado, ex.: salário de benefício ausente).'));
  } else {
    itens.push(_item('rmiConcluido', 'Cálculo de RMI concluído', 'bloqueado', 'Nenhuma RMI calculada.'));
  }

  // 15. Todas as fontes rastreáveis
  if (!memoria.length) {
    itens.push(_item('fontesRastreaveis', 'Todas as fontes rastreáveis', 'nao_verificado', 'Nenhuma competência na memória de cálculo para conferir.'));
  } else {
    var semFonte = memoria.filter(function (m) { return !m.fonte || !m.fonte.length; });
    if (semFonte.length) {
      itens.push(_item('fontesRastreaveis', 'Todas as fontes rastreáveis', 'ressalva', semFonte.length + ' de ' + memoria.length + ' competência(s) da memória de cálculo sem página/arquivo de origem rastreável.'));
    } else {
      itens.push(_item('fontesRastreaveis', 'Todas as fontes rastreáveis', 'ok', 'Todas as ' + memoria.length + ' competência(s) têm página/arquivo de origem.'));
    }
  }

  var temBloqueado = itens.some(function (i) { return i.status === 'bloqueado'; });
  var temRessalvaOuNaoVerificado = itens.some(function (i) { return i.status === 'ressalva' || i.status === 'nao_verificado'; });
  var statusGeral = temBloqueado ? 'bloqueado' : (temRessalvaOuNaoVerificado ? 'validado_com_ressalvas' : 'validado');

  return { itens: itens, statusGeral: statusGeral };
}

var ValidadorFinalCalculo = {
  validarCalculoFinal,
  _validarCPF // exposto só para teste direto do algoritmo de CPF
};

/* ----------------------------------------------------------------------
   LIMITAÇÕES CONHECIDAS DESTA ENTREGA:
     1. "Períodos sem sobreposição indevida" só detecta ambiguidade de
        dado (.ambigua) já sinalizada por historicoPrevidenciario.js — não
        reavalia sobreposições por conta própria.
     2. "Requisitos cumpridos" nunca bloqueia por essa razão sozinha — não
        ter direito ainda é um resultado válido do sistema, não um erro.
     3. Checagens de data (CPF, nascimento, DER/DIB) são estruturais
        (formato, ordem, faixa plausível de anos) — não substituem
        conferência documental real.
---------------------------------------------------------------------- */
