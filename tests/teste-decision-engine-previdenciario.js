/* ============================================================================
   TESTE-DECISION-ENGINE-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/decision/decisionEnginePrevidenciario.js
   (Atualização 26, item 6 do plano: "Decision Engine"). Mesmo padrão dos
   demais testes do domínio: sandbox `vm`, sem dependência externa.

   Roda com: node tests/teste-decision-engine-previdenciario.js
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

function carregar() {
  const sandbox = {};
  vm.createContext(sandbox);
  const arquivos = [
    ['js', 'core', 'decisorCampos.js'],
    ['js', 'domains', 'previdenciario', 'dicionarioPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'index.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'cnis.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'ctps.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'requerimentoAdministrativo.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'cartaConcessao.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'cartaIndeferimento.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'decisaoAdministrativa.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'processoJudicial.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'laudoPericial.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'ppp.js'],
    ['js', 'domains', 'previdenciario', 'document-types', 'index.js'],
    ['js', 'domains', 'previdenciario', 'field-rules', 'vinculos.js'],
    ['js', 'domains', 'previdenciario', 'field-rules', 'contribuicoes.js'],
    ['js', 'domains', 'previdenciario', 'field-rules', 'campos.js'],
    ['js', 'domains', 'previdenciario', 'field-rules', 'index.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'termosPrevidenciarios.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'termos-index.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'conceptResolverPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'normalizadorTrechoPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'semanticMapperPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'semantics', 'mapeamentoIndex.js'],
    ['js', 'domains', 'previdenciario', 'evidence', 'evidenciaPrevidenciaria.js'],
    ['js', 'domains', 'previdenciario', 'candidates', 'candidatePoolPrevidenciario.js'],
    ['js', 'domains', 'previdenciario', 'decision', 'decisionEnginePrevidenciario.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== DECISION/PREVIDENCIARIO (decision engine) ==');
  const sb = carregar();

  const documentosSemDivergencia = [
    { documento: 'requerimento.pdf', pagina: 1, texto: 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/2023.' },
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. NB: 123.456.789-0. DIB: 10/01/2023.' }
  ];

  teste('decidirCamposPrevidenciarios decide todos os campos do pool sem conflito nenhum', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    const decisoes = sb.decidirCamposPrevidenciarios(pool);

    assert.ok(decisoes.campos.includes('dataDER'));
    assert.ok(decisoes.campos.includes('dataDIB'));
    assert.strictEqual(decisoes.porCampo.dataDER.valor, '10/01/2023');
    assert.strictEqual(decisoes.porCampo.dataDER.emConflito, false);
  });

  const documentosComDivergencia = [
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. DIB: 10/01/2023.' },
    { documento: 'recurso.pdf', pagina: 2, texto: 'JUNTA DE RECURSOS DA PREVIDÊNCIA SOCIAL. Recurso Administrativo. Reforma a decisão. DIB: 15/03/2022.' }
  ];

  teste('decidirCamposPrevidenciarios reporta conflito real (nunca escolhe silenciosamente)', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    const decisoes = sb.decidirCamposPrevidenciarios(pool);

    const decisaoDIB = decisoes.porCampo.dataDIB;
    assert.ok(decisaoDIB, 'deveria ter decidido dataDIB mesmo em conflito');
    assert.strictEqual(decisaoDIB.emConflito, true);
    assert.strictEqual(decisaoDIB.conflitos.length, 1);
  });

  teste('decidirCamposPrevidenciarios prioriza a fonte preferencial (item 3) quando a diferença de confiança é pequena', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    const decisoes = sb.decidirCamposPrevidenciarios(pool);
    // cartaConcessao é a fonte preferencial de dataDIB (field-rules/campos.js) —
    // mesmo em conflito, o valor vencedor deveria ser o dela.
    assert.strictEqual(decisoes.porCampo.dataDIB.valor, '10/01/2023');
  });

  teste('decidirCampoPrevidenciario devolve null (nunca lança erro) pra lista de candidatos vazia', () => {
    assert.strictEqual(sb.decidirCampoPrevidenciario('dataDIB', []), null);
  });

  teste('opcoesPorCampo permite desligar sempreConflito campo a campo', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    const decisoes = sb.decidirCamposPrevidenciarios(pool, { dataDIB: { sempreConflito: false, margemConflito: 0 } });
    assert.strictEqual(decisoes.porCampo.dataDIB.emConflito, false);
  });

  teste('decidirCamposPrevidenciarios nunca lança erro com pool ausente/vazio', () => {
    assert.strictEqual(sb.decidirCamposPrevidenciarios(null).campos.length, 0);
    assert.strictEqual(sb.decidirCamposPrevidenciarios({ porCampo: {}, campos: [] }).campos.length, 0);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
