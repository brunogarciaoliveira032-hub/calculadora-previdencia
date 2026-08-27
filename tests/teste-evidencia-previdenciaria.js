/* ============================================================================
   TESTE-EVIDENCIA-PREVIDENCIARIA.JS — cobre
   js/domains/previdenciario/evidence/evidenciaPrevidenciaria.js
   (Atualização 24, item 4 do plano: "Evidence Layer"). Mesmo padrão dos
   demais testes do domínio: sandbox `vm`, sem dependência externa.

   Roda com: node tests/teste-evidencia-previdenciaria.js
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
    ['js', 'domains', 'previdenciario', 'evidence', 'evidenciaPrevidenciaria.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== EVIDENCE/PREVIDENCIARIO (evidence layer) ==');
  const sb = carregar();

  // Um caso sintético com 3 páginas de documentos diferentes, sem
  // divergência: requerimento (DER), carta de concessão (DIB/espécie/RMI),
  // laudo pericial (DID) — nenhum campo se repete com valor diferente.
  const documentosSemDivergencia = [
    { documento: 'requerimento.pdf', pagina: 1, texto: 'REQUERIMENTO ADMINISTRATIVO. Data de Entrada do Requerimento: 10/01/2023. DER: 10/01/2023.' },
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. NB: 123.456.789-0. Espécie: 42. DIB: 10/01/2023. Renda Mensal Inicial: R$ 2.500,00.' },
    { documento: 'laudo.pdf', pagina: 1, texto: 'LAUDO PERICIAL. Perito: Dr. Fulano. Quesitos. Data de Início da Incapacidade: 05/06/2021.' }
  ];

  teste('montarEvidenciasPrevidenciarias coleta evidências das 3 páginas com proveniência completa', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    assert.ok(ledger.todas.length > 0, 'deveria ter coletado ao menos 1 evidência');
    ledger.todas.forEach(ev => {
      assert.ok(ev.documento, 'toda evidência deveria ter documento');
      assert.ok(ev.pagina != null, 'toda evidência deveria ter página');
      assert.ok(ev.campo, 'toda evidência deveria ter campo');
    });
  });

  teste('porCampo agrupa corretamente por campo semântico', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    assert.ok(ledger.campos.includes('dataDER'));
    assert.ok(ledger.campos.includes('dataDIB'));
    assert.ok(ledger.campos.includes('numeroBeneficio'));
    assert.ok(ledger.campos.includes('dataDID'));
    assert.strictEqual(ledger.porCampo.dataDER.length, 1);
    assert.strictEqual(ledger.porCampo.dataDER[0].documento, 'requerimento.pdf');
  });

  teste('sem divergência nenhuma quando cada campo só aparece 1 vez com valor consistente', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    assert.strictEqual(ledger.divergencias.length, 0);
  });

  teste('evidência de campo catalogado em field-rules já vem com isFontePreferencial resolvido (fecha o loop com os itens 1 e 3)', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    const evDIB = ledger.porCampo.dataDIB[0];
    assert.strictEqual(evDIB.tipoDocumento, 'cartaConcessao');
    assert.strictEqual(evDIB.isFontePreferencial, true);
  });

  // Caso COM divergência real: DIB de 10/01/2023 na concessão original,
  // mas uma decisão administrativa de recurso fixa uma DIB diferente.
  const documentosComDivergencia = [
    { documento: 'concessao.pdf', pagina: 1, texto: 'CARTA DE CONCESSÃO. Concessão de Benefício. DIB: 10/01/2023.' },
    { documento: 'recurso.pdf', pagina: 1, texto: 'JUNTA DE RECURSOS DA PREVIDÊNCIA SOCIAL. Recurso Administrativo. Reforma a decisão. DIB: 15/03/2022.' }
  ];

  teste('divergencias detecta quando o mesmo campo tem valores diferentes entre documentos, sem escolher um vencedor', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    assert.ok(ledger.divergencias.includes('dataDIB'), 'deveria reportar divergência em dataDIB');
    assert.strictEqual(ledger.porCampo.dataDIB.length, 2, 'as 2 evidências continuam preservadas, nenhuma descartada');
  });

  teste('evidenciasDoCampoPrevidenciario devolve [] (nunca erro) pra campo que não apareceu em nenhuma página', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosSemDivergencia);
    assert.strictEqual(sb.evidenciasDoCampoPrevidenciario(ledger, 'campoInexistente').length, 0);
  });

  teste('evidenciasPreferenciaisPrevidenciarias filtra só as evidências de fonte preferencial', () => {
    const ledger = sb.montarEvidenciasPrevidenciarias(documentosComDivergencia);
    const preferenciais = sb.evidenciasPreferenciaisPrevidenciarias(ledger, 'dataDIB');
    assert.strictEqual(preferenciais.length, 1);
    assert.strictEqual(preferenciais[0].documento, 'concessao.pdf');
  });

  teste('montarEvidenciasPrevidenciarias nunca lança erro com entrada vazia/inválida', () => {
    assert.strictEqual(sb.montarEvidenciasPrevidenciarias([]).todas.length, 0);
    assert.strictEqual(sb.montarEvidenciasPrevidenciarias(null).todas.length, 0);
    const comLixo = sb.montarEvidenciasPrevidenciarias([null, {}, { documento: 'x', pagina: 1 }, { texto: '' }]);
    assert.strictEqual(comLixo.todas.length, 0);
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
