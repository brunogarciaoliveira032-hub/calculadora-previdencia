/* ============================================================================
   TESTE-CANDIDATE-POOL-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/candidates/candidatePoolPrevidenciario.js
   (Atualização 25, item 5 do plano: "Candidate Pool"). Mesmo padrão dos
   demais testes do domínio: sandbox `vm`, sem dependência externa.

   Roda com: node tests/teste-candidate-pool-previdenciario.js
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
    ['js', 'domains', 'previdenciario', 'candidates', 'candidatePoolPrevidenciario.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== CANDIDATES/PREVIDENCIARIO (candidate pool) ==');
  const sb = carregar();

  teste('evidenciaParaCandidatoPrevidenciario converte pro formato exato que decisorCampos.js espera', () => {
    const evidencia = {
      campo: 'dataDIB', valor: '2023-01-10', valorBruto: '10/01/2023',
      documento: 'concessao.pdf', pagina: 1, tipoDocumento: 'cartaConcessao',
      confiancaSemantica: 0.93, isFontePreferencial: true, isFonteElegivel: true
    };
    const c = sb.evidenciaParaCandidatoPrevidenciario(evidencia);
    assert.strictEqual(c.valor, '2023-01-10');
    assert.strictEqual(c.confianca, 0.93);
    assert.deepStrictEqual({ numero: c.pagina.numero, arquivo: c.pagina.arquivo }, { numero: 1, arquivo: 'concessao.pdf' });
    assert.strictEqual(c.trecho, '10/01/2023');
  });

  teste('evidenciaParaCandidatoPrevidenciario(null) devolve null sem lançar erro', () => {
    assert.strictEqual(sb.evidenciaParaCandidatoPrevidenciario(null), null);
  });

  const documentosSemDivergencia = [
    { documento: 'requerimento.pdf', pagina: 1, texto: 'REQUERIMENTO ADMINISTRATIVO. DER: 10/01/2023.' },
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. DIB: 10/01/2023.' }
  ];

  teste('montarPoolDeCandidatosPrevidenciario monta o pool a partir do ledger de evidências (item 4)', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    assert.ok(pool.campos.includes('dataDER'));
    assert.ok(pool.campos.includes('dataDIB'));
    assert.strictEqual(pool.porCampo.dataDER.length, 1);
    assert.strictEqual(pool.porCampo.dataDER[0].pagina.arquivo, 'requerimento.pdf');
  });

  teste('candidatosDoCampoPrevidenciario devolve [] (nunca erro) pra campo sem pool', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    assert.strictEqual(sb.candidatosDoCampoPrevidenciario(pool, 'campoInexistente').length, 0);
  });

  teste('montarPoolDeCandidatosPrevidenciario nunca lança erro com ledger ausente/malformado', () => {
    assert.strictEqual(sb.montarPoolDeCandidatosPrevidenciario(null).campos.length, 0);
    assert.strictEqual(sb.montarPoolDeCandidatosPrevidenciario({}).campos.length, 0);
  });

  // ---- Prova de ponta a ponta: evidência -> pool -> decisorCampos.js (core,
  // genérico, reaproveitado sem duplicar) decide de verdade, aplicando a
  // regra de fonte preferencial do item 3 via field-rules/index.js. ----
  const documentosComDivergencia = [
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. DIB: 10/01/2023.' },
    { documento: 'recurso.pdf', pagina: 2, texto: 'JUNTA DE RECURSOS DA PREVIDÊNCIA SOCIAL. Recurso Administrativo. Reforma a decisão. DIB: 15/03/2022.' }
  ];

  teste('pool de um campo com divergência alimenta decidirCampo() do core e produz uma decisão com conflito reportado', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    const pool = sb.montarPoolDeCandidatosPrevidenciario(ledger);
    const candidatos = sb.candidatosDoCampoPrevidenciario(pool, 'dataDIB');
    assert.strictEqual(candidatos.length, 2);

    const regra = sb.regraPreferenciaFontePrevidenciaria('dataDIB');
    const decisao = sb.decidirCampo(candidatos, { regras: [regra], sempreConflito: true });

    assert.ok(decisao, 'decisorCampos.js deveria produzir uma decisão');
    assert.strictEqual(decisao.emConflito, true, 'a divergência real deveria virar conflito reportado');
    assert.strictEqual(decisao.conflitos.length, 1);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
