/* ============================================================================
   CALCULOPERIODOS.JS — Mecanismo GENÉRICO de aritmética de períodos/datas.

   Criado na Atualização 12 (migração previdenciário, Fase 3/Atualização 4 —
   primeira entrega do motor de cálculo). Mesmo padrão de separação já usado
   no projeto (ex.: js/core/motorValidacao.js): este arquivo não conhece
   nenhum termo de nenhum domínio (não sabe o que é "vínculo empregatício",
   "tempo especial" ou "carência") — só sabe somar/mesclar/comparar
   intervalos de datas. Quem dá sentido jurídico a isso é o arquivo de
   domínio (js/domains/previdenciario/motorTempoContribuicao.js).

   CONTRATO DE ENTRADA: datas sempre como string ISO 'AAAA-MM-DD'. Este
   módulo não faz parsing de data em português/formato BR — isso já é
   responsabilidade da camada de extração (core/classificadorExtrator.js),
   que entrega datas já normalizadas para ISO antes de chegar aqui.

   CONVENÇÃO ADOTADA (documentada por ser uma escolha, não uma verdade
   universal): a contagem de duração de UM período usa datas de calendário
   reais (mês de fevereiro tem seus dias reais, etc. — método de subtração
   com "empréstimo", o mesmo usado manualmente em contagem de tempo de
   contribuição). Já a SOMA de várias durações já calculadas usa a convenção
   de 30 dias por mês / 12 meses por ano para "vira-mês"/"vira-ano" do
   resultado agregado — é a convenção usual de calculadoras previdenciárias
   ao somar tempos de vínculos distintos (ver `somarDuracoes`).

   DEPENDE de: nada.
============================================================================ */

/* ------------------------------------------------------------------------
   1. HELPERS DE DATA (Date sempre em UTC, para nunca sofrer de fuso-horário)
------------------------------------------------------------------------ */

function validarIso(iso, rotulo) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`${rotulo || 'data'} inválida (esperado AAAA-MM-DD): ${iso}`);
  }
  // Correção (achado da perícia de software): o regex acima só confere o
  // FORMATO — não impedia datas com mês/dia calendariamente inexistentes
  // (ex.: "2020-13-01", "2020-02-30") de passar batido e contaminar o
  // cálculo silenciosamente (Date.UTC "rola" datas inválidas em vez de
  // rejeitar). Agora confere também se a data existe de verdade.
  const { ano, mes, dia } = paraPartes(iso);
  if (mes < 1 || mes > 12) {
    throw new Error(`${rotulo || 'data'} inválida (mês ${mes} não existe): ${iso}`);
  }
  if (dia < 1 || dia > diasNoMes(ano, mes)) {
    throw new Error(`${rotulo || 'data'} inválida (dia ${dia} não existe no mês ${mes}/${ano}): ${iso}`);
  }
}

function paraPartes(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano, mes, dia };
}

function diasNoMes(ano, mes) {
  // dia 0 do mês seguinte = último dia do mês pedido
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function somarDias(iso, quantidade) {
  validarIso(iso, 'data');
  const { ano, mes, dia } = paraPartes(iso);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  d.setUTCDate(d.getUTCDate() + quantidade);
  return d.toISOString().slice(0, 10);
}

function compararIso(a, b) {
  validarIso(a, 'data'); validarIso(b, 'data');
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/* ------------------------------------------------------------------------
   2. DURAÇÃO DE UM ÚNICO PERÍODO (calendário real, contagem inclusiva)
------------------------------------------------------------------------ */

// Duração entre inicioIso e fimIso, com fim INCLUSIVO por padrão (o dia de
// término conta como tempo trabalhado/contribuído — convenção previdenciária
// usual; passe { incluirUltimoDia: false } para contagem exclusiva).
function diferencaCalendario(inicioIso, fimIso, opcoes = {}) {
  validarIso(inicioIso, 'início'); validarIso(fimIso, 'fim');
  if (compararIso(inicioIso, fimIso) > 0) {
    throw new Error(`período inválido: início (${inicioIso}) posterior ao fim (${fimIso})`);
  }
  const incluirUltimoDia = opcoes.incluirUltimoDia !== false;
  const fimAjustado = incluirUltimoDia ? somarDias(fimIso, 1) : fimIso;

  const ini = paraPartes(inicioIso);
  const fim = paraPartes(fimAjustado);

  let dias = fim.dia - ini.dia;
  let meses = fim.mes - ini.mes;
  let anos = fim.ano - ini.ano;

  if (dias < 0) {
    meses -= 1;
    const mesAnterior = fim.mes === 1 ? 12 : fim.mes - 1;
    const anoDoMesAnterior = fim.mes === 1 ? fim.ano - 1 : fim.ano;
    dias += diasNoMes(anoDoMesAnterior, mesAnterior);
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  return { anos, meses, dias };
}

// Total de dias corridos de um período (fim inclusivo por padrão) — útil
// para conversões que multiplicam por um fator (não faz sentido multiplicar
// {anos,meses,dias} calendário diretamente por um fator não-inteiro).
function totalDiasCorridos(inicioIso, fimIso, opcoes = {}) {
  validarIso(inicioIso, 'início'); validarIso(fimIso, 'fim');
  const incluirUltimoDia = opcoes.incluirUltimoDia !== false;
  const fimAjustado = incluirUltimoDia ? somarDias(fimIso, 1) : fimIso;
  const msPorDia = 24 * 60 * 60 * 1000;
  const { ano: a1, mes: m1, dia: d1 } = paraPartes(inicioIso);
  const { ano: a2, mes: m2, dia: d2 } = paraPartes(fimAjustado);
  const t1 = Date.UTC(a1, m1 - 1, d1);
  const t2 = Date.UTC(a2, m2 - 1, d2);
  return Math.round((t2 - t1) / msPorDia);
}

// Converte uma quantidade de dias corridos em {anos, meses, dias} pela
// convenção 30 dias/mês, 360 dias/ano — convenção declarada (não é
// calendário real), usada especificamente para reexpressar dias resultantes
// de multiplicação por fator (ex.: conversão de tempo especial em comum),
// onde não há mais uma data de calendário real por trás do número.
function diasParaDuracaoConvencional(totalDias) {
  const negativo = totalDias < 0;
  let d = Math.round(Math.abs(totalDias));
  const anos = Math.floor(d / 360);
  d -= anos * 360;
  const meses = Math.floor(d / 30);
  d -= meses * 30;
  const sinal = negativo ? -1 : 1;
  return { anos: sinal * anos, meses: sinal * meses, dias: sinal * d };
}

/* ------------------------------------------------------------------------
   3. MESCLA DE PERÍODOS (evita contar duas vezes tempo de vínculos
   concorrentes/sobrepostos — regra geral de contagem de tempo de
   contribuição: tempo simultâneo em mais de um vínculo não dobra o tempo)
------------------------------------------------------------------------ */

// periodos: [{ inicio: iso, fim: iso, ...quaisquer outros campos são
// preservados só no primeiro item de cada grupo mesclado, em `origem`}]
function mesclarPeriodos(periodos) {
  if (!Array.isArray(periodos) || periodos.length === 0) return [];
  const ordenados = periodos
    .map(p => { validarIso(p.inicio, 'início'); validarIso(p.fim, 'fim'); return p; })
    .slice()
    .sort((a, b) => compararIso(a.inicio, b.inicio));

  const mesclados = [{ inicio: ordenados[0].inicio, fim: ordenados[0].fim, origem: [ordenados[0]] }];
  for (let i = 1; i < ordenados.length; i++) {
    const atual = ordenados[i];
    const ultimo = mesclados[mesclados.length - 1];
    // adjacente (dia seguinte) também mescla, não só sobreposto
    const proximoDiaAposUltimo = somarDias(ultimo.fim, 1);
    if (compararIso(atual.inicio, proximoDiaAposUltimo) <= 0) {
      if (compararIso(atual.fim, ultimo.fim) > 0) ultimo.fim = atual.fim;
      ultimo.origem.push(atual);
    } else {
      mesclados.push({ inicio: atual.inicio, fim: atual.fim, origem: [atual] });
    }
  }
  return mesclados;
}

/* ------------------------------------------------------------------------
   4. SOMA DE DURAÇÕES JÁ CALCULADAS (convenção 30/12 para o "vira-mês"/
   "vira-ano" do agregado — convenção usual ao somar tempos de vínculos
   distintos; a duração de CADA período individual continua vindo do
   calendário real, via diferencaCalendario)
------------------------------------------------------------------------ */

function somarDuracoes(...duracoes) {
  let totalDias = 0, totalMeses = 0, totalAnos = 0;
  for (const d of duracoes) {
    totalAnos += d.anos || 0;
    totalMeses += d.meses || 0;
    totalDias += d.dias || 0;
  }
  if (totalDias >= 30) { totalMeses += Math.floor(totalDias / 30); totalDias %= 30; }
  if (totalMeses >= 12) { totalAnos += Math.floor(totalMeses / 12); totalMeses %= 12; }
  return { anos: totalAnos, meses: totalMeses, dias: totalDias };
}

// Duração total de uma lista de períodos, já mesclando sobreposições antes
// de somar (evita contar tempo concorrente duas vezes).
function tempoTotalDePeriodos(periodos, opcoes = {}) {
  const mesclados = mesclarPeriodos(periodos);
  const duracoes = mesclados.map(p => diferencaCalendario(p.inicio, p.fim, opcoes));
  return { total: somarDuracoes(...duracoes), periodosMesclados: mesclados };
}

/* ------------------------------------------------------------------------
   5. COMPETÊNCIAS (mês/ano) TOCADAS POR UM PERÍODO — base para carência
------------------------------------------------------------------------ */

// Lista de competências 'AAAA-MM' que um período toca (qualquer
// sobreposição com o mês conta a competência inteira).
function competenciasDoPeriodo(inicioIso, fimIso) {
  validarIso(inicioIso, 'início'); validarIso(fimIso, 'fim');
  const ini = paraPartes(inicioIso);
  const fim = paraPartes(fimIso);
  const lista = [];
  let ano = ini.ano, mes = ini.mes;
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    lista.push(`${ano}-${String(mes).padStart(2, '0')}`);
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return lista;
}

var CalculoPeriodos = {
  validarIso,
  somarDias,
  compararIso,
  diferencaCalendario,
  totalDiasCorridos,
  diasParaDuracaoConvencional,
  mesclarPeriodos,
  somarDuracoes,
  tempoTotalDePeriodos,
  competenciasDoPeriodo
};
