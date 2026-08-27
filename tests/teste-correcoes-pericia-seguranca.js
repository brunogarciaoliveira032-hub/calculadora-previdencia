/* ============================================================================
   TESTE-CORRECOES-PERICIA-SEGURANCA.JS — Atualização 52. Cobre as 5
   correções aplicadas depois de uma perícia de software independente
   (teste extremo de ponta a ponta, sem usar nenhum teste já existente no
   projeto na hora de encontrar os achados):

     1. js/core/calculoPeriodos.js — validarIso() só conferia o FORMATO
        AAAA-MM-DD por regex, não se a data existia de verdade. Datas
        calendariamente impossíveis (mês 13, mês 00, 30 de fevereiro, dia
        32...) passavam batido e contaminavam o cálculo de tempo de
        contribuição/carência silenciosamente, porque Date.UTC "rola"
        datas inválidas em vez de rejeitar.
     2. Vários motores de RMI (motorRMI.js e os que reaproveitam o mesmo
        padrão: regras de transição + benefícios) aceitavam
        salarioBeneficio/valorBaseAposentadoria/fatorPrevidenciario =
        Infinity (typeof 'number' e > 0, mas não finito) e produziam RMI
        infinita em vez de rejeitar.
     3. Os mesmos motores, quando salarioMinimoVigente (piso) >
        tetoRGPSVigente (teto) — entrada inconsistente, provável erro de
        digitação de quem chama — aplicavam o teto por cima do piso
        silenciosamente e devolviam um valor ABAIXO do piso mínimo legal.
        Agora essa combinação é rejeitada explicitamente.
     4. beneficios/pensaoPorMorte.js aceitava numeroDependentes
        fracionário (ex.: 2.5), que não corresponde a uma quantidade real
        de dependentes. Agora exige inteiro >= 1.
     5. Comentários desatualizados em historicoPrevidenciario.js e
        motorSalarioBeneficio.js ainda diziam que o teto histórico do
        RGPS "não é aplicado automaticamente" na concomitância de
        salário — desatualizado desde a Atualização 42, que passou a
        aplicá-lo automaticamente. Só documentação, sem impacto de
        cálculo, mas corrigido para não induzir a erro quem ler o código.

   E mais 2 achados de uma segunda rodada de perícia nos módulos de
   extração/OCR e validação final (mesmo dia, Atualização 52):

     6. O mesmo bug do item 1 existia de forma DUPLICADA (código
        independente, não reaproveitado) em js/core/classificadorExtrator.js
        (parseDataBRParaIso/parseDataExtensoParaIso — usada para ler datas
        de vínculo em CNIS/CTPS reais) e mais duas cópias em
        extratorVinculosCNIS.js e reconstrucaoTabelaPrevidenciaria.js. Uma
        data OCR como "31/02/2020" virava candidato de vínculo "validado"
        (alta confiança, sem conflito sinalizado) em vez de cair para
        revisão manual — e, depois da correção do item 1, isso passou a
        derrubar o cálculo inteiro com um erro genérico lá na frente em
        vez de ser isolado na extração. Todas as cópias agora fazem a
        mesma checagem de calendário real.
     7. validacaoFinal/validadorFinalCalculo.js, item "Vínculos sem datas
        impossíveis": usava só parseInt(slice(0,4)) e comparação de string
        para inspecionar início/fim, sem chamar a mesma _dataValida() já
        usada nos outros itens do checklist — um vínculo malformado como
        {inicio:"2020"} (sem mês/dia) passava como "ok". Agora usa
        _dataValida() aqui também.
     8. MAIS GRAVE que os anteriores: parseValorMoedaBR (classificadorEx
        trator.js) e as 2 cópias em extratorRemuneracoesCNIS.js/
        reconstrucaoTabelaPrevidenciaria.js só removiam o separador de
        milhar quando ele claramente terminava em 2 dígitos decimais, sem
        checar se os separadores de milhar RESTANTES formavam grupos de
        exatamente 3 dígitos. Um valor malformado (erro de OCR/digitação,
        ex.: "R$ 1.23,45" faltando um dígito em vez de "R$ 1.230,45")
        sobrava com um ponto solto no meio, parseFloat truncava ali, e o
        candidato de remuneração saía "validado" (alta confiança, SEM
        nenhum conflito sinalizado) com um valor até 100x-1000x MENOR que
        o real — silenciosamente alimentando o salário de benefício e a
        RMI. Agora valida a forma inteira do número antes de converter.

   Roda sem dependências externas: `node tests/teste-correcoes-pericia-seguranca.js`.
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

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

function carregarContexto() {
  const sandbox = {};
  vm.createContext(sandbox);
  const RAIZ_JS = path.join(__dirname, '..', 'js');
  [
    'core/calculoPeriodos.js',
    'domains/previdenciario/motorTempoContribuicao.js',
    'domains/previdenciario/motorRMI.js',
    'domains/previdenciario/dados-historicos/tetoRgps.js',
    'domains/previdenciario/regras/transicao/pontos.js',
    'domains/previdenciario/regras/transicao/pedagio50.js',
    'domains/previdenciario/regras/transicao/pedagio100.js',
    'domains/previdenciario/regras/transicao/idadeMinimaProgressiva.js',
    'domains/previdenciario/regras/direitoAdquirido/aposentadoriaTempoContribuicao.js',
    'domains/previdenciario/beneficios/incapacidadePermanente.js',
    'domains/previdenciario/beneficios/auxilioIncapacidadeTemporaria.js',
    'domains/previdenciario/beneficios/auxilioAcidente.js',
    'domains/previdenciario/beneficios/pensaoPorMorte.js',
    'domains/previdenciario/beneficios/salarioMaternidade.js',
    'core/classificadorExtrator.js',
    'domains/previdenciario/extraction/extratorVinculosCNIS.js',
    'domains/previdenciario/extraction/extratorRemuneracoesCNIS.js',
    'domains/previdenciario/extraction/reconstrucaoTabelaPrevidenciaria.js',
    'domains/previdenciario/validacaoFinal/validadorFinalCalculo.js',
  ].forEach(rel => {
    const caminho = path.join(RAIZ_JS, rel);
    new vm.Script(fs.readFileSync(caminho, 'utf-8'), { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(function main() {
  const S = carregarContexto();
  const CP = S.CalculoPeriodos;
  const MRMI = S.MotorRMI;

  console.log('== CORREÇÃO 1 — CalculoPeriodos.validarIso rejeita datas calendariamente inexistentes ==');

  teste('rejeita mês 13', () => {
    assert.throws(() => CP.validarIso('2020-13-01', 'data'), /mês 13 não existe/);
  });
  teste('rejeita mês 00', () => {
    assert.throws(() => CP.validarIso('2020-00-01', 'data'), /mês 0 não existe/);
  });
  teste('rejeita 30 de fevereiro', () => {
    assert.throws(() => CP.validarIso('2020-02-30', 'data'), /dia 30 não existe/);
  });
  teste('rejeita dia 32', () => {
    assert.throws(() => CP.validarIso('2020-01-32', 'data'), /dia 32 não existe/);
  });
  teste('rejeita 31 de abril (mês de 30 dias)', () => {
    assert.throws(() => CP.validarIso('2020-04-31', 'data'));
  });
  teste('rejeita 29/fev em ano NÃO bissexto (2021)', () => {
    assert.throws(() => CP.validarIso('2021-02-29', 'data'));
  });
  teste('rejeita 29/fev em ano de século não-bissexto (1900, div. por 100 mas não por 400)', () => {
    assert.throws(() => CP.validarIso('1900-02-29', 'data'));
  });
  teste('aceita 29/fev em ano bissexto comum (2020)', () => {
    assert.doesNotThrow(() => CP.validarIso('2020-02-29', 'data'));
  });
  teste('aceita 29/fev em ano bissexto de século (2000, div. por 400)', () => {
    assert.doesNotThrow(() => CP.validarIso('2000-02-29', 'data'));
  });
  teste('aceita datas comuns válidas normalmente', () => {
    assert.doesNotThrow(() => CP.validarIso('2020-12-31', 'data'));
    assert.doesNotThrow(() => CP.validarIso('1994-07-01', 'data'));
  });
  teste('a rejeição se propaga para diferencaCalendario (downstream)', () => {
    assert.throws(() => CP.diferencaCalendario('2020-01-01', '2020-13-01'));
  });
  teste('a rejeição se propaga para calcularTempoContribuicao (MotorTempoContribuicao)', () => {
    assert.throws(() => S.MotorTempoContribuicao.calcularTempoContribuicao(
      [{ inicio: '2020-01-01', fim: '2020-02-30', tipo: 'comum' }], {}
    ));
  });

  console.log('\n== CORREÇÃO 2 — valores monetários não-finitos (Infinity) rejeitados ==');

  teste('MotorRMI.calcularRMI rejeita salarioBeneficio=Infinity', () => {
    assert.throws(() => MRMI.calcularRMI({ salarioBeneficio: Infinity, tempoContribuicao: 20, sexo: 'homem' }));
  });
  teste('MotorRMI.calcularRMI rejeita salarioBeneficio=-Infinity', () => {
    assert.throws(() => MRMI.calcularRMI({ salarioBeneficio: -Infinity, tempoContribuicao: 20, sexo: 'homem' }));
  });
  teste('MotorRMI.calcularRMI continua aceitando valores normais', () => {
    const r = MRMI.calcularRMI({ salarioBeneficio: 3000, tempoContribuicao: 20, sexo: 'homem' });
    assert.strictEqual(r.rmiFinal, 1800);
  });
  teste('RegraTransicaoPedagio50.calcularRMIRegraPedagio50 rejeita fatorPrevidenciario=Infinity', () => {
    assert.throws(() => S.RegraTransicaoPedagio50.calcularRMIRegraPedagio50({ salarioBeneficio: 3000, fatorPrevidenciario: Infinity }));
  });
  teste('BeneficioIncapacidadePermanente.calcularRMIIncapacidadePermanente rejeita salarioBeneficio=Infinity', () => {
    assert.throws(() => S.BeneficioIncapacidadePermanente.calcularRMIIncapacidadePermanente({ salarioBeneficio: Infinity, causaAcidentaria: true }));
  });
  teste('BeneficioSalarioMaternidade.calcularRMISalarioMaternidade rejeita baseCalculo=Infinity', () => {
    assert.throws(() => S.BeneficioSalarioMaternidade.calcularRMISalarioMaternidade({ categoria: 'demais', baseCalculo: Infinity, salarioMinimoVigente: 1518 }));
  });

  console.log('\n== CORREÇÃO 3 — piso > teto (entrada inconsistente) rejeitado em vez de aplicado silenciosamente ==');

  teste('MotorRMI.calcularRMI rejeita piso(1518) > teto(1000)', () => {
    assert.throws(
      () => MRMI.calcularRMI({ salarioBeneficio: 100, tempoContribuicao: 20, sexo: 'homem', salarioMinimoVigente: 1518, tetoRGPSVigente: 1000 }),
      /não pode ser maior que/
    );
  });
  teste('MotorRMI.calcularRMI continua aplicando piso/teto normalmente quando consistentes', () => {
    const r = MRMI.calcularRMI({ salarioBeneficio: 100, tempoContribuicao: 20, sexo: 'homem', salarioMinimoVigente: 1518, tetoRGPSVigente: 8475.55 });
    assert.strictEqual(r.rmiFinal, 1518);
    assert.strictEqual(r.aplicouPiso, true);
  });
  teste('RegraTransicaoPedagio100 rejeita piso > teto', () => {
    assert.throws(() => S.RegraTransicaoPedagio100.calcularRMIRegraPedagio100({ salarioBeneficio: 1000, salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });
  teste('RegraTransicaoIdadeMinimaProgressiva rejeita piso > teto', () => {
    assert.throws(() => S.RegraTransicaoIdadeMinimaProgressiva.calcularRMIIdadeMinimaProgressiva({ salarioBeneficio: 1000, tempoContribuicao: 35, sexo: 'homem', salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });
  teste('BeneficioAuxilioAcidente rejeita piso > teto', () => {
    assert.throws(() => S.BeneficioAuxilioAcidente.calcularRMIAuxilioAcidente({ salarioBeneficio: 1000, salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });
  teste('BeneficioAuxilioIncapacidadeTemporaria rejeita piso > teto', () => {
    assert.throws(() => S.BeneficioAuxilioIncapacidadeTemporaria.calcularRMIAuxilioIncapacidadeTemporaria({ salarioBeneficio: 1000, salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });
  teste('BeneficioIncapacidadePermanente (ramo acidentário) rejeita piso > teto', () => {
    assert.throws(() => S.BeneficioIncapacidadePermanente.calcularRMIIncapacidadePermanente({ salarioBeneficio: 1000, causaAcidentaria: true, salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });
  teste('BeneficioSalarioMaternidade rejeita piso > teto', () => {
    assert.throws(() => S.BeneficioSalarioMaternidade.calcularRMISalarioMaternidade({ categoria: 'domestica', baseCalculo: 1000, salarioMinimoVigente: 2000, tetoRGPSVigente: 1500 }));
  });

  console.log('\n== CORREÇÃO 4 — numeroDependentes precisa ser inteiro >= 1 (pensaoPorMorte.js) ==');

  teste('rejeita numeroDependentes fracionário (2.5)', () => {
    assert.throws(() => S.BeneficioPensaoPorMorte.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 2.5 }));
  });
  teste('rejeita numeroDependentes fracionário abaixo de 1 (0.9)', () => {
    assert.throws(() => S.BeneficioPensaoPorMorte.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 0.9 }));
  });
  teste('continua aceitando inteiros normalmente', () => {
    const r = S.BeneficioPensaoPorMorte.calcularRMIPensaoPorMorte({ valorBaseAposentadoria: 2000, numeroDependentes: 3 });
    assert.strictEqual(r.percentualCotaFamiliar, 0.8);
  });

  console.log('\n== CORREÇÃO 5 — comentários desatualizados sobre o teto histórico automático ==');

  teste('historicoPrevidenciario.js não afirma mais que nenhum teto é aplicado automaticamente', () => {
    const conteudo = fs.readFileSync(path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'historico', 'historicoPrevidenciario.js'), 'utf-8');
    assert.ok(!/NENHUM teto é aplicado\s*\n\s*automaticamente aqui/.test(conteudo));
  });
  teste('motorSalarioBeneficio.js não afirma mais que o teto não é aplicado automaticamente', () => {
    const conteudo = fs.readFileSync(path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'motorSalarioBeneficio.js'), 'utf-8');
    assert.ok(!/não é aplicado automaticamente\s*\n\s*\(falta série histórica/.test(conteudo));
  });

  console.log('\n== CORREÇÃO 6 — parseDataBRParaIso e cópias rejeitam datas calendariamente inexistentes ==');

  teste('classificadorExtrator.parseDataBRParaIso rejeita 31/02/2020', () => {
    assert.strictEqual(S.parseDataBRParaIso('31/02/2020'), null);
  });
  teste('classificadorExtrator.parseDataBRParaIso rejeita 30/02/2021', () => {
    assert.strictEqual(S.parseDataBRParaIso('30/02/2021'), null);
  });
  teste('classificadorExtrator.parseDataBRParaIso rejeita 31/04/2020 (abril tem 30 dias)', () => {
    assert.strictEqual(S.parseDataBRParaIso('31/04/2020'), null);
  });
  teste('classificadorExtrator.parseDataBRParaIso aceita 29/02/2020 (bissexto)', () => {
    assert.strictEqual(S.parseDataBRParaIso('29/02/2020'), '2020-02-29');
  });
  teste('classificadorExtrator.parseDataExtensoParaIso rejeita "31 de fevereiro de 2020"', () => {
    assert.strictEqual(S.parseDataExtensoParaIso('31 de fevereiro de 2020'), null);
  });
  teste('extrairVinculoDeLinha rejeita linha com data 31/02/2020 em vez de aceitar como "validado"', () => {
    const r = S.extrairVinculoDeLinha('01/01/2018 a 31/02/2020 EMPRESA TESTE LTDA');
    // sem parseDataBRParaIso carregado nesta ordem de arquivos ele já está —
    // então cai no fallback correto do próprio classificadorExtrator.js
    assert.strictEqual(r, null); // fim inválido -> nenhum vínculo extraído (não "validado" com data errada)
  });

  console.log('\n== CORREÇÃO 7 — validadorFinalCalculo usa _dataValida() também para vínculos ==');

  teste('sinaliza vínculo malformado sem mês/dia ("2020") como bloqueado', () => {
    const r = S.ValidadorFinalCalculo.validarCalculoFinal({ historico: { vinculos: [{ inicio: '2020', fim: '2020-01-01' }] } });
    const item = r.itens.find(i => i.codigo === 'vinculosSemDatasImpossiveis');
    assert.strictEqual(item.status, 'bloqueado');
  });
  teste('continua aprovando vínculo normal', () => {
    const r = S.ValidadorFinalCalculo.validarCalculoFinal({ historico: { vinculos: [{ inicio: '2020-01-01', fim: '2020-12-31' }] } });
    const item = r.itens.find(i => i.codigo === 'vinculosSemDatasImpossiveis');
    assert.strictEqual(item.status, 'ok');
  });

  console.log('\n== CORREÇÃO 8 — parseValorMoedaBR e cópias rejeitam agrupamento de milhar malformado ==');

  teste('classificadorExtrator.parseValorMoedaBR rejeita "1.23,45" (dígito faltando no milhar)', () => {
    assert.strictEqual(S.parseValorMoedaBR('1.23,45'), null);
  });
  teste('classificadorExtrator.parseValorMoedaBR rejeita "1.2.345,67" (agrupamento quebrado)', () => {
    assert.strictEqual(S.parseValorMoedaBR('1.2.345,67'), null);
  });
  teste('classificadorExtrator.parseValorMoedaBR aceita "12.345,67" (milhar bem-formado)', () => {
    assert.strictEqual(S.parseValorMoedaBR('12.345,67'), 12345.67);
  });
  teste('classificadorExtrator.parseValorMoedaBR aceita "1234,56" (sem separador de milhar)', () => {
    assert.strictEqual(S.parseValorMoedaBR('1234,56'), 1234.56);
  });
  teste('classificadorExtrator.parseValorMoedaBR aceita "0,00"', () => {
    assert.strictEqual(S.parseValorMoedaBR('0,00'), 0);
  });
  teste('extrairRemuneracaoDeLinha rejeita valor com milhar malformado em vez de "validado" com valor errado', () => {
    const r = S.extrairRemuneracaoDeLinha('01/2020 R$ 1.23,45');
    assert.strictEqual(r, null);
  });
  teste('extrairRemuneracaoDeLinha continua aceitando valor bem-formado normalmente', () => {
    const r = S.extrairRemuneracaoDeLinha('01/2020 R$ 12.345,67');
    assert.strictEqual(r.valor, 12345.67);
    assert.strictEqual(r.status, 'validado');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
