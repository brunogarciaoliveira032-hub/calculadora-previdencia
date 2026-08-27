/* ============================================================================
   TESTE-MOTOR-TEMPO-CONTRIBUICAO.JS — cobre js/core/calculoPeriodos.js
   (mecanismo genérico) e js/domains/previdenciario/motorTempoContribuicao.js
   (Atualização 12 — primeira entrega do motor de cálculo previdenciário).

   Carrega os dois arquivos isolados num contexto vm próprio, no mesmo
   padrão de tests/teste-dicionario-previdenciario.js — este domínio ainda
   não está plugado a nenhum pipeline de extração.

   Roda sem dependências externas: `node tests/teste-motor-tempo-contribuicao.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

// Os módulos rodam num contexto vm separado (Realm diferente): objetos e
// arrays que voltam de lá têm um Object/Array.prototype distinto do deste
// arquivo, e assert.deepStrictEqual falha por causa disso mesmo quando o
// CONTEÚDO é idêntico. Como todo retorno aqui é dado plano (números/
// strings/arrays), um round-trip por JSON remove essa diferença de Realm
// sem mascarar nenhuma divergência de valor real.
function semRealm(valor) { return JSON.parse(JSON.stringify(valor)); }

function teste(nome, fn) {
  totalTestes++;
  try {
    fn();
    console.log(`  OK  ${nome}`);
  } catch (erro) {
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.message}`);
  }
}

function carregarMotor() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    path.join(__dirname, '..', 'js', 'core', 'calculoPeriodos.js'),
    path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorTempoContribuicao.js')
  ];
  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== CALCULOPERIODOS.JS (mecanismo genérico) ==');
  const sb = carregarMotor();
  const CP = sb.CalculoPeriodos;

  teste('diferencaCalendario conta 1 dia único como 1 dia (fim inclusivo)', () => {
    const d = CP.diferencaCalendario('2020-01-01', '2020-01-01');
    assert.deepStrictEqual(semRealm(d), { anos: 0, meses: 0, dias: 1 });
  });

  teste('diferencaCalendario: de 1º/jan a 31/dez do mesmo ano bissexto fecha exatamente 1 ano', () => {
    // 2020 é bissexto: 1º/jan a 31/dez (inclusive) é o ano inteiro, sem sobra de mês/dia
    const d = CP.diferencaCalendario('2020-01-01', '2020-12-31');
    assert.deepStrictEqual(semRealm(d), { anos: 1, meses: 0, dias: 0 });
  });

  teste('diferencaCalendario: exatamente 1 ano incluindo o dia final', () => {
    const d = CP.diferencaCalendario('2020-01-01', '2021-01-01');
    assert.deepStrictEqual(semRealm(d), { anos: 1, meses: 0, dias: 1 });
  });

  teste('diferencaCalendario respeita fevereiro em ano bissexto (mês de calendário inteiro)', () => {
    // 2020 é bissexto (fevereiro tem 29 dias): 2020-02-01 até 2020-02-29 (inclusive)
    // é o mês de fevereiro inteiro, ou seja, exatamente 1 mês de calendário.
    const d = CP.diferencaCalendario('2020-02-01', '2020-02-29');
    assert.deepStrictEqual(semRealm(d), { anos: 0, meses: 1, dias: 0 });
  });

  teste('diferencaCalendario rejeita início posterior ao fim', () => {
    assert.throws(() => CP.diferencaCalendario('2020-05-01', '2020-01-01'));
  });

  teste('diferencaCalendario rejeita data fora do formato ISO', () => {
    assert.throws(() => CP.diferencaCalendario('01/05/2020', '2020-05-01'));
  });

  teste('totalDiasCorridos conta 1 dia único como 1 (fim inclusivo)', () => {
    assert.strictEqual(CP.totalDiasCorridos('2020-01-01', '2020-01-01'), 1);
  });

  teste('totalDiasCorridos de janeiro inteiro (31 dias)', () => {
    assert.strictEqual(CP.totalDiasCorridos('2020-01-01', '2020-01-31'), 31);
  });

  teste('mesclarPeriodos une períodos sobrepostos', () => {
    const m = CP.mesclarPeriodos([
      { inicio: '2020-01-01', fim: '2020-06-30' },
      { inicio: '2020-04-01', fim: '2020-09-30' }
    ]);
    assert.strictEqual(m.length, 1);
    assert.strictEqual(m[0].inicio, '2020-01-01');
    assert.strictEqual(m[0].fim, '2020-09-30');
  });

  teste('mesclarPeriodos une períodos adjacentes (sem lacuna)', () => {
    const m = CP.mesclarPeriodos([
      { inicio: '2020-01-01', fim: '2020-01-31' },
      { inicio: '2020-02-01', fim: '2020-02-29' }
    ]);
    assert.strictEqual(m.length, 1);
  });

  teste('mesclarPeriodos NÃO une períodos com lacuna real', () => {
    const m = CP.mesclarPeriodos([
      { inicio: '2020-01-01', fim: '2020-01-31' },
      { inicio: '2020-03-01', fim: '2020-03-31' }
    ]);
    assert.strictEqual(m.length, 2);
  });

  teste('somarDuracoes reporta vira-mês/vira-ano pela convenção 30/12', () => {
    const s = CP.somarDuracoes({ anos: 0, meses: 0, dias: 20 }, { anos: 0, meses: 0, dias: 15 });
    assert.deepStrictEqual(semRealm(s), { anos: 0, meses: 1, dias: 5 });
  });

  teste('tempoTotalDePeriodos não conta em dobro tempo concorrente', () => {
    const { total } = CP.tempoTotalDePeriodos([
      { inicio: '2020-01-01', fim: '2020-12-31' }, // vínculo A: 1 ano inteiro
      { inicio: '2020-06-01', fim: '2020-06-30' }  // vínculo B: concorrente, dentro de A
    ]);
    // 2020 é bissexto: 1º/jan a 31/dez inclusive fecha exatamente 1 ano
    assert.deepStrictEqual(semRealm(total), { anos: 1, meses: 0, dias: 0 });
  });

  teste('competenciasDoPeriodo lista mês/ano tocados, incluindo meses parciais', () => {
    const c = CP.competenciasDoPeriodo('2020-01-15', '2020-03-05');
    assert.deepStrictEqual(semRealm(c), ['2020-01', '2020-02', '2020-03']);
  });

  console.log('\n== MOTORTEMPOCONTRIBUICAO.JS (domínio previdenciário) ==');
  const MTC = sb.MotorTempoContribuicao;

  teste('calcularTempoContribuicao soma vínculo comum único corretamente', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2019-12-31', tipo: 'comum' }
    ]);
    assert.deepStrictEqual(semRealm(r.tempoTotal), { anos: 10, meses: 0, dias: 0 });
  });

  teste('calcularTempoContribuicao não dobra tempo de vínculos concorrentes', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2015-12-31', tipo: 'comum' },
      { inicio: '2012-01-01', fim: '2012-12-31', tipo: 'comum' } // concomitante
    ]);
    assert.deepStrictEqual(semRealm(r.tempoTotal), { anos: 6, meses: 0, dias: 0 });
  });

  teste('vínculo especial sem pedir conversão conta 1:1 como tempo comum', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2015-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: false });
    assert.deepStrictEqual(semRealm(r.tempoTotal), { anos: 6, meses: 0, dias: 0 });
    assert.deepStrictEqual(semRealm(r.tempoConvertidoAdicional), { anos: 0, meses: 0, dias: 0 });
  });

  teste('vínculo especial (25 anos, homem) convertido antes do limite legal aplica fator 1,40', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2000-01-01', fim: '2009-12-31', tipo: 'especial', anosExposicao: 25 } // 10 anos, todo anterior a 2019-11-13
    ], { converterTempoEspecial: true, sexo: 'homem' });
    // 10 anos * 1,40 = 14 anos convertidos; acréscimo = 4 anos
    assert.strictEqual(r.tempoTotal.anos, 14);
    assert.strictEqual(r.tempoConvertidoAdicional.anos, 4);
  });

  teste('vínculo especial (25 anos, mulher) usa fator 1,20 (meta 30 anos)', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2000-01-01', fim: '2009-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: true, sexo: 'mulher' });
    assert.strictEqual(r.tempoTotal.anos, 12);
    assert.strictEqual(r.tempoConvertidoAdicional.anos, 2);
  });

  teste('conversão é bloqueada (fator 1:1) para a parte do vínculo posterior a 13/11/2019 (EC 103/2019)', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2019-01-01', fim: '2019-12-31', tipo: 'especial', anosExposicao: 25 } // metade antes, metade depois do limite
    ], { converterTempoEspecial: true, sexo: 'homem' });
    // sem o corte, 1 ano * 1,4 = 1,4 ano (acréscimo 0,4 ano ~ 144 dias);
    // com o corte, só ~317 dias (até 13/11) convertem — acréscimo bem menor que 144 dias
    assert.ok(r.tempoConvertidoAdicional.anos === 0);
    assert.ok(r.tempoConvertidoAdicional.meses < 5, 'acréscimo deve ser bem menor que o de um ano inteiro convertido');
  });

  teste('vínculo especial inteiramente posterior ao limite nunca converte', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2020-01-01', fim: '2020-12-31', tipo: 'especial', anosExposicao: 15 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.deepStrictEqual(semRealm(r.tempoConvertidoAdicional), { anos: 0, meses: 0, dias: 0 });
    assert.deepStrictEqual(semRealm(r.tempoTotal), { anos: 1, meses: 0, dias: 0 });
  });

  teste('calcularTempoContribuicao rejeita lista vazia', () => {
    assert.throws(() => MTC.calcularTempoContribuicao([]));
  });

  teste('calcularTempoContribuicao rejeita vínculo especial sem anosExposicao válido', () => {
    assert.throws(() => MTC.calcularTempoContribuicao([
      { inicio: '2020-01-01', fim: '2020-12-31', tipo: 'especial', anosExposicao: 18 }
    ]));
  });

  /* -------------------- CONCOMITÂNCIA DE ATIVIDADE ESPECIAL (Atualização 45) -------------------- */

  teste('SEM concomitância: dois vínculos especiais NÃO sobrepostos somam o incremento de cada um normalmente (intercalados)', () => {
    // Especial (25 anos, fator 1,40) de 1 ano, comum de 1 ano no meio, especial (25 anos) de 1 ano de novo.
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 },
      { inicio: '2011-01-01', fim: '2011-12-31', tipo: 'comum' },
      { inicio: '2012-01-01', fim: '2012-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.strictEqual(r.houveConcomitanciaEspecial, false);
    // 3 anos "sem conversão" (1:1) + acréscimo de 0,4 ano por cada um dos 2 anos especiais = +0,8 ano
    assert.strictEqual(r.tempoSemConversao.anos, 3);
    assert.strictEqual(r.tempoConvertidoAdicional.anos, 0);
    assert.ok(r.tempoConvertidoAdicional.meses >= 9, 'esperado ~9,6 meses de acréscimo (0,8 ano)');
  });

  teste('COM concomitância: dois vínculos especiais SOBREPOSTOS no mesmo período NÃO duplicam o acréscimo de conversão', () => {
    // Dois vínculos especiais (25 anos, fator 1,40) cobrindo o MESMO ano inteiro (dois empregos simultâneos).
    const semSobreposicao = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: true, sexo: 'homem' });

    const comSobreposicao = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 },
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: true, sexo: 'homem' });

    assert.strictEqual(comSobreposicao.houveConcomitanciaEspecial, true);
    // O acréscimo de conversão NÃO pode dobrar mesmo com 2 vínculos cobrindo o mesmo ano —
    // continua o mesmo de um único vínculo (comportamento ANTIGO, antes desta correção, dobraria).
    assert.deepStrictEqual(semRealm(comSobreposicao.tempoConvertidoAdicional), semRealm(semSobreposicao.tempoConvertidoAdicional));
  });

  teste('concomitância com fatores DIFERENTES usa o mais vantajoso (menor anosExposicao) para os dias sobrepostos', () => {
    // Um vínculo de 25 anos (fator 1,40) sobreposto com outro de 15 anos (fator 2,33) no mesmo ano.
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 },
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 15 }
    ], { converterTempoEspecial: true, sexo: 'homem' });

    const soComFatorMelhor = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 15 }
    ], { converterTempoEspecial: true, sexo: 'homem' });

    assert.strictEqual(r.houveConcomitanciaEspecial, true);
    assert.deepStrictEqual(semRealm(r.tempoConvertidoAdicional), semRealm(soComFatorMelhor.tempoConvertidoAdicional));
  });

  teste('concomitância PARCIAL: só os dias realmente sobrepostos usam o fator único, o resto de cada vínculo mantém o próprio fator', () => {
    // Vínculo A: ano inteiro de 2010, 25 anos (fator 1,40).
    // Vínculo B: só o 2º semestre de 2010, 15 anos (fator 2,33) — sobreposição só no 2º semestre.
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 },
      { inicio: '2010-07-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 15 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.strictEqual(r.houveConcomitanciaEspecial, true);

    // 1º semestre: só vínculo A ativo (fator 1,40). 2º semestre: os dois ativos, usa o melhor (fator 2,33).
    // O acréscimo total precisa ser MAIOR que se todo o ano usasse só o fator 1,40 (25 anos sozinho)...
    const soFatorA = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 25 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.ok(
      (r.tempoConvertidoAdicional.anos * 360 + r.tempoConvertidoAdicional.meses * 30 + r.tempoConvertidoAdicional.dias) >
      (soFatorA.tempoConvertidoAdicional.anos * 360 + soFatorA.tempoConvertidoAdicional.meses * 30 + soFatorA.tempoConvertidoAdicional.dias),
      'o 2º semestre com o fator melhor precisa aumentar o acréscimo total em relação a usar só o fator 1,40 o ano inteiro'
    );
    // ...mas MENOR que se o ano inteiro usasse o fator 2,33 (15 anos) sozinho, já que só metade do ano tem o fator melhor.
    const soFatorB = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 15 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.ok(
      (r.tempoConvertidoAdicional.anos * 360 + r.tempoConvertidoAdicional.meses * 30 + r.tempoConvertidoAdicional.dias) <
      (soFatorB.tempoConvertidoAdicional.anos * 360 + soFatorB.tempoConvertidoAdicional.meses * 30 + soFatorB.tempoConvertidoAdicional.dias)
    );
  });

  teste('sem NENHUMA sobreposição entre vínculos comuns e especiais, houveConcomitanciaEspecial permanece false', () => {
    const r = MTC.calcularTempoContribuicao([
      { inicio: '2010-01-01', fim: '2010-06-30', tipo: 'comum' },
      { inicio: '2010-07-01', fim: '2010-12-31', tipo: 'especial', anosExposicao: 20 }
    ], { converterTempoEspecial: true, sexo: 'homem' });
    assert.strictEqual(r.houveConcomitanciaEspecial, false);
  });

  teste('calcularCarencia conta competências distintas de um vínculo contínuo', () => {
    const r = MTC.calcularCarencia([{ inicio: '2020-01-15', fim: '2020-04-10' }]);
    assert.strictEqual(r.totalMeses, 4);
    assert.deepStrictEqual(semRealm(r.competencias), ['2020-01', '2020-02', '2020-03', '2020-04']);
  });

  teste('calcularCarencia não duplica competência coberta por dois vínculos no mesmo mês', () => {
    const r = MTC.calcularCarencia([
      { inicio: '2020-01-01', fim: '2020-01-10' },
      { inicio: '2020-01-20', fim: '2020-02-15' }
    ]);
    assert.strictEqual(r.totalMeses, 2);
  });

  teste('calcularCarencia rejeita lista vazia', () => {
    assert.throws(() => MTC.calcularCarencia([]));
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
