/* ============================================================================
   TESTE-VALIDADOR-FINAL-CALCULO.JS — cobre
   js/domains/previdenciario/validacaoFinal/validadorFinalCalculo.js
   (Atualização 48).

   Roda sem dependências externas: `node tests/teste-validador-final-calculo.js`.
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

function carregarModulo() {
  const sandbox = {};
  vm.createContext(sandbox);
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'validacaoFinal', 'validadorFinalCalculo.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox.ValidadorFinalCalculo;
}

function resultadoCompletoOk() {
  return {
    tempoEcarencia: { tempoContribuicao: { tempoTotal: { anos: 20, meses: 0, dias: 0 } } },
    elegibilidade: { elegivel: true, pendencias: [], carencia: { totalMeses: 180 } },
    rmiTeorica: { rmiFinal: 1800, percentualAplicado: 0.6 },
    salarioBeneficio: {
      salarioBeneficio: 3000, quantidadeSalarios: 12,
      memoria: [
        { competencia: '2020-01', fonte: [{ arquivo: 'cnis.pdf', pagina: 1 }] },
        { competencia: '2020-02', fonte: [{ arquivo: 'cnis.pdf', pagina: 1 }] }
      ]
    }
  };
}

function historicoOk() {
  return {
    vinculos: [{ inicio: '2000-01-01', fim: '2020-01-01', tipo: 'comum' }],
    contribuicoes: [{ competencia: '2020-01', valor: 1000, ambigua: false }]
  };
}

(() => {
  console.log('== VALIDACAOFINAL/VALIDADORFINALCALCULO.JS ==');
  const V = carregarModulo();

  /* -------------------- CPF -------------------- */

  teste('CPF real válido (dígitos verificadores corretos) passa', () => {
    assert.strictEqual(V._validarCPF('111.444.777-35'), true); // CPF de teste conhecido, válido
  });

  teste('CPF com dígito verificador errado falha', () => {
    assert.strictEqual(V._validarCPF('111.444.777-36'), false);
  });

  teste('CPF com todos os dígitos iguais é sempre inválido', () => {
    assert.strictEqual(V._validarCPF('111.111.111-11'), false);
  });

  teste('CPF com quantidade errada de dígitos é inválido', () => {
    assert.strictEqual(V._validarCPF('123'), false);
  });

  /* -------------------- CENÁRIO COMPLETO OK -------------------- */

  teste('cenário completo e consistente: statusGeral "validado" (tudo 🟢)', () => {
    const r = V.validarCalculoFinal({
      cpf: '111.444.777-35',
      dataNascimento: '1970-05-10',
      dataDER: '2020-06-01',
      dataDIB: '2020-05-15',
      competenciaReferencia: '2020-06',
      historico: historicoOk(),
      resultado: resultadoCompletoOk()
    });
    assert.strictEqual(r.statusGeral, 'validado');
    r.itens.forEach(i => assert.strictEqual(i.status, 'ok', `esperava ok em ${i.codigo}, veio ${i.status}`));
  });

  teste('cenário mínimo (sem CPF/nascimento/DIB): statusGeral "validado_com_ressalvas", nunca bloqueado só por dado ausente opcional', () => {
    const r = V.validarCalculoFinal({
      competenciaReferencia: '2020-06',
      historico: historicoOk(),
      resultado: resultadoCompletoOk()
    });
    assert.strictEqual(r.statusGeral, 'validado_com_ressalvas');
    const bloqueados = r.itens.filter(i => i.status === 'bloqueado');
    assert.strictEqual(bloqueados.length, 0);
  });

  /* -------------------- BLOQUEIOS REAIS -------------------- */

  teste('DIB posterior à DER bloqueia', () => {
    const r = V.validarCalculoFinal({
      dataDER: '2020-01-01', dataDIB: '2020-06-01',
      competenciaReferencia: '2020-06', historico: historicoOk(), resultado: resultadoCompletoOk()
    });
    const item = r.itens.find(i => i.codigo === 'dibAnteriorOuIgualDer');
    assert.strictEqual(item.status, 'bloqueado');
    assert.strictEqual(r.statusGeral, 'bloqueado');
  });

  teste('DIB igual à DER passa (≤, não só <)', () => {
    const r = V.validarCalculoFinal({
      dataDER: '2020-06-01', dataDIB: '2020-06-01',
      competenciaReferencia: '2020-06', historico: historicoOk(), resultado: resultadoCompletoOk()
    });
    const item = r.itens.find(i => i.codigo === 'dibAnteriorOuIgualDer');
    assert.strictEqual(item.status, 'ok');
  });

  teste('CPF inválido bloqueia', () => {
    const r = V.validarCalculoFinal({
      cpf: '111.444.777-36',
      competenciaReferencia: '2020-06', historico: historicoOk(), resultado: resultadoCompletoOk()
    });
    assert.strictEqual(r.itens.find(i => i.codigo === 'cpfValido').status, 'bloqueado');
    assert.strictEqual(r.statusGeral, 'bloqueado');
  });

  teste('vínculo com início posterior ao fim bloqueia', () => {
    const r = V.validarCalculoFinal({
      competenciaReferencia: '2020-06',
      historico: { vinculos: [{ inicio: '2020-06-01', fim: '2020-01-01', tipo: 'comum' }], contribuicoes: [] },
      resultado: resultadoCompletoOk()
    });
    assert.strictEqual(r.itens.find(i => i.codigo === 'vinculosSemDatasImpossiveis').status, 'bloqueado');
    assert.strictEqual(r.statusGeral, 'bloqueado');
  });

  teste('sem DER nem competência de referência, bloqueia (o cálculo depende disso)', () => {
    const r = V.validarCalculoFinal({ historico: historicoOk(), resultado: resultadoCompletoOk() });
    assert.strictEqual(r.itens.find(i => i.codigo === 'derValida').status, 'bloqueado');
  });

  teste('salário de benefício não calculado bloqueia (item 9 e reflete no INPC, item 10)', () => {
    const resultado = resultadoCompletoOk();
    resultado.salarioBeneficio = { salarioBeneficio: null, motivo: 'índice INPC ausente para competência 2020-05 (API do Bacen indisponível)' };
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    assert.strictEqual(r.itens.find(i => i.codigo === 'salariosValidos').status, 'bloqueado');
    assert.strictEqual(r.itens.find(i => i.codigo === 'inpcCompleto').status, 'bloqueado');
    assert.strictEqual(r.statusGeral, 'bloqueado');
  });

  teste('nenhuma regra avaliada bloqueia (regraIdentificada) e implica rmiConcluido bloqueado também', () => {
    const resultado = resultadoCompletoOk();
    delete resultado.elegibilidade;
    delete resultado.rmiTeorica;
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    assert.strictEqual(r.itens.find(i => i.codigo === 'regraIdentificada').status, 'bloqueado');
    assert.strictEqual(r.itens.find(i => i.codigo === 'rmiConcluido').status, 'bloqueado');
  });

  /* -------------------- RESSALVAS (não bloqueiam) -------------------- */

  teste('nenhuma regra avaliada mostra elegibilidade: ressalva, NUNCA bloqueia por si só', () => {
    const resultado = resultadoCompletoOk();
    resultado.elegibilidade = { elegivel: false, pendencias: ['idade mínima não atingida'], carencia: { totalMeses: 180 } };
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    const item = r.itens.find(i => i.codigo === 'requisitosCumpridos');
    assert.strictEqual(item.status, 'ressalva');
    // não deveria bloquear o statusGeral só por isso (assumindo o resto ok)
    assert.notStrictEqual(r.statusGeral, 'bloqueado');
  });

  teste('competência de contribuição ambígua vira ressalva, não bloqueio', () => {
    const historico = historicoOk();
    historico.contribuicoes[0].ambigua = true;
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico, resultado: resultadoCompletoOk() });
    const item = r.itens.find(i => i.codigo === 'periodosSemSobreposicaoIndevida');
    assert.strictEqual(item.status, 'ressalva');
  });

  teste('memória de cálculo sem fonte em alguma competência vira ressalva em fontesRastreaveis', () => {
    const resultado = resultadoCompletoOk();
    resultado.salarioBeneficio.memoria[0].fonte = [];
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    assert.strictEqual(r.itens.find(i => i.codigo === 'fontesRastreaveis').status, 'ressalva');
  });

  teste('concomitância com teto não aplicado automaticamente vira ressalva em tetoHistoricoDisponivel', () => {
    const resultado = resultadoCompletoOk();
    resultado.salarioBeneficio.memoria[0].limitacaoTetoRgpsHistorico = 'soma de 2 salário(s) concomitante(s) — teto do RGPS vigente NA COMPETÊNCIA não pôde ser aplicado automaticamente (...)';
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    assert.strictEqual(r.itens.find(i => i.codigo === 'tetoHistoricoDisponivel').status, 'ressalva');
  });

  teste('regra avaliada mas sem RMI calculada vira ressalva em rmiConcluido (não bloqueia sozinho)', () => {
    const resultado = resultadoCompletoOk();
    resultado.rmiTeorica = null;
    const r = V.validarCalculoFinal({ competenciaReferencia: '2020-06', historico: historicoOk(), resultado });
    assert.strictEqual(r.itens.find(i => i.codigo === 'rmiConcluido').status, 'ressalva');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
