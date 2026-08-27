/* ============================================================================
   TESTE-IA-REVISORA-PREVIDENCIARIA.JS — cobre
   js/domains/previdenciario/ia/iaRevisoraPrevidenciaria.js (Atualização
   26, item 7 do plano: "IA só interpretadora/revisora, nunca
   calculadora"). Só testa a lógica PURA (sem rede — ver LIMITAÇÃO HONESTA
   no cabeçalho do arquivo fonte): quais campos valem revisão, como montar
   a proposta, como aplicar um veredito já recebido — nunca a chamada real
   ao backend, que ainda não existe.

   Roda com: node tests/teste-ia-revisora-previdenciaria.js
============================================================================ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

let totalTestes = 0;
let totalFalhas = 0;

async function teste(nome, fn) {
  totalTestes++;
  try {
    await fn();
    console.log(`  OK  ${nome}`);
  } catch (erro) {
    totalFalhas++;
    console.log(`FALHA ${nome}`);
    console.log(`      ${erro.message}`);
  }
}

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    ['js', 'domains', 'previdenciario', 'dicionarioPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'index.js'],
    ['js', 'domains', 'previdenciario', 'ia', 'iaRevisoraPrevidenciaria.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(async () => {
  console.log('== IA/PREVIDENCIARIO (IA revisora — lógica pura) ==');
  const sb = carregar();

  await teste('CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO tem os 25 campos do dicionário (derivado, não transcrito)', () => {
    assert.strictEqual(Object.keys(sb.CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO).length, 25);
    assert.ok(sb.CAMPOS_REVISAVEIS_IA_PREVIDENCIARIO.dataDIB, 'deveria ter descrição de dataDIB');
  });

  const decisoesBase = {
    dataDIB: { valor: '10/01/2023', confianca: 0.9, trecho: 'DIB: 10/01/2023', pagina: { numero: 1, arquivo: 'concessao.pdf' }, emConflito: false, evidencias: [] },
    dataDER: { valor: '05/01/2023', confianca: 0.85, trecho: 'DER: 05/01/2023', pagina: { numero: 1, arquivo: 'requerimento.pdf' }, emConflito: false, evidencias: [], statusRevisao: 'confirmado' },
    numeroBeneficio: { valor: '123.456.789-0', confianca: 0.9, trecho: '', pagina: null, emConflito: false, evidencias: [] } // sem trecho — não deveria entrar
  };

  await teste('calcularCamposRevisaveisPrevidenciarios só inclui campo com trecho E ainda não revisado', () => {
    const revisaveis = sb.calcularCamposRevisaveisPrevidenciarios(decisoesBase);
    assert.ok(revisaveis.includes('dataDIB'));
    assert.ok(!revisaveis.includes('dataDER'), 'dataDER já tem statusRevisao — não deveria entrar de novo');
    assert.ok(!revisaveis.includes('numeroBeneficio'), 'numeroBeneficio não tem trecho — não deveria entrar');
  });

  await teste('calcularCamposRevisaveisPrevidenciarios devolve [] (nunca erro) com decisões ausentes', () => {
    assert.strictEqual(sb.calcularCamposRevisaveisPrevidenciarios(null).length, 0);
  });

  await teste('montarPropostasRevisaoPrevidenciarias monta a proposta com id/valorExibicao/trecho/tipoDocumento', () => {
    const propostas = sb.montarPropostasRevisaoPrevidenciarias(decisoesBase, ['dataDIB']);
    assert.strictEqual(propostas.length, 1);
    assert.strictEqual(propostas[0].id, 'dataDIB');
    assert.strictEqual(propostas[0].valorExibicao, '10/01/2023');
    assert.strictEqual(propostas[0].trecho, 'DIB: 10/01/2023');
    assert.strictEqual(propostas[0].tipoDocumento, 'concessao.pdf');
  });

  await teste('montarPropostasRevisaoPrevidenciarias inclui evidenciasConcorrentes só quando existem de verdade', () => {
    const comConcorrente = Object.assign({}, decisoesBase, {
      dataDIB: Object.assign({}, decisoesBase.dataDIB, {
        evidencias: [
          { escolhido: true, valor: '10/01/2023', trecho: 'DIB: 10/01/2023' },
          { escolhido: false, valor: '15/03/2022', trecho: 'DIB: 15/03/2022' }
        ]
      })
    });
    const propostas = sb.montarPropostasRevisaoPrevidenciarias(comConcorrente, ['dataDIB']);
    assert.strictEqual(propostas[0].evidenciasConcorrentes.length, 1);
    assert.strictEqual(propostas[0].evidenciasConcorrentes[0].valor, '15/03/2022');
  });

  await teste('aplicarVeredictosPrevidenciarios acrescenta statusRevisao/confiancaRevisao/observacao SEM tocar valor', () => {
    const revisoes = { dataDIB: { veredito: 'confirmado', confianca_numerica: 92, justificativa: 'trecho bate com o valor' } };
    const resultado = sb.aplicarVeredictosPrevidenciarios(decisoesBase, revisoes, ['dataDIB']);
    const atualizada = resultado.decisoes.dataDIB;
    assert.strictEqual(atualizada.valor, '10/01/2023', 'valor NUNCA deveria mudar');
    assert.strictEqual(atualizada.statusRevisao, 'confirmado');
    assert.strictEqual(atualizada.confiancaRevisao, 92);
    assert.ok(atualizada.observacao.includes('confirmou'));
    assert.strictEqual(resultado.revisados, 1);
  });

  await teste('aplicarVeredictosPrevidenciarios NUNCA muta o objeto de decisões original', () => {
    const original = JSON.parse(JSON.stringify(decisoesBase.dataDIB));
    sb.aplicarVeredictosPrevidenciarios(decisoesBase, { dataDIB: { veredito: 'rejeitado' } }, ['dataDIB']);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(decisoesBase.dataDIB)), original);
  });

  await teste('aplicarVeredictosPrevidenciarios ignora veredito inválido, ou campo sem decisão, sem lançar erro', () => {
    const resultado = sb.aplicarVeredictosPrevidenciarios(decisoesBase, { dataDIB: { veredito: 'chute_qualquer' }, campoFantasma: { veredito: 'confirmado' } }, ['dataDIB', 'campoFantasma']);
    assert.strictEqual(resultado.revisados, 0);
    assert.strictEqual(resultado.decisoes.dataDIB.statusRevisao, undefined);
  });

  await teste('aplicarRevisaoIAPrevidenciaria devolve "nada_a_revisar" quando não há campo revisável', async () => {
    const resultado = await sb.aplicarRevisaoIAPrevidenciaria({});
    assert.strictEqual(resultado.usado, false);
    assert.strictEqual(resultado.motivo, 'nada_a_revisar');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
