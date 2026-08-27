/* ============================================================================
   TESTE-SEMANTIC-MAPPER-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/semantics/*.js (Atualização 22, item 1 do
   plano: "conectar semantic mapper ao previdenciário"). Mesmo padrão dos
   demais testes do domínio: sandbox `vm`, sem dependência externa.

   Roda com: node tests/teste-semantic-mapper-previdenciario.js

   Atualização 23: agora carrega field-rules/{vinculos,contribuicoes,campos,
   index}.js no sandbox — os testes de isPreferredSource/isEligibleSource
   deixaram de testar só a degradação honesta (item 1) e passaram a provar
   também a resolução real (item 3 fechou o loop, ver field-rules/index.js).
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
    ['js', 'domains', 'previdenciario', 'semantics', 'mapeamentoIndex.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== SEMANTICS/PREVIDENCIARIO (semantic mapper conectado ao domínio) ==');
  const sb = carregar();

  teste('TERMOS_PREVIDENCIARIOS tem 25 entradas, uma por campo semântico do dicionário', () => {
    assert.strictEqual(sb.TERMOS_PREVIDENCIARIOS.length, 25);
  });

  teste('validarTermosPrevidenciarios não acusa canonical duplicado nem entrada sem variants', () => {
    const problemas = sb.validarTermosPrevidenciarios();
    const graves = problemas.filter(p => p.includes('duplicado') || p.includes('sem field') || p.includes('sem category') || p.includes('sem nenhuma variant'));
    assert.strictEqual(graves.length, 0, `problemas graves encontrados: ${JSON.stringify(graves)}`);
  });

  teste('identificarTermoPrevidenciario reconhece "DER" pela âncora do dicionário', () => {
    const termo = sb.identificarTermoPrevidenciario('Data de Entrada do Requerimento: 10/01/2023');
    assert.ok(termo, 'deveria reconhecer');
    assert.strictEqual(termo.field, 'dataDER');
  });

  teste('identificarTermoPrevidenciario reconhece "NB" (número do benefício)', () => {
    const termo = sb.identificarTermoPrevidenciario('NB: 123.456.789-0');
    assert.ok(termo, 'deveria reconhecer');
    assert.strictEqual(termo.field, 'numeroBeneficio');
  });

  teste('identificarTermoPrevidenciario devolve null para texto sem nenhum conceito conhecido', () => {
    assert.strictEqual(sb.identificarTermoPrevidenciario('texto qualquer sem relação com o domínio'), null);
  });

  teste('localizarConceitosPrevidenciarios acha vários conceitos na mesma página', () => {
    const texto = 'NB: 123.456.789-0. Espécie: 42. DIB: 10/01/2023. Segurado(a): Fulano de Tal.';
    const encontrados = sb.localizarConceitosPrevidenciarios(texto);
    assert.ok(encontrados.includes('numeroBeneficio'));
    assert.ok(encontrados.includes('especieBeneficio'));
    assert.ok(encontrados.includes('dataDIB'));
    assert.ok(encontrados.includes('nomeSegurado'));
  });

  teste('mapearTrechoPrevidenciario extrai o valor monetário do RMI', () => {
    const r = sb.mapearTrechoPrevidenciario('Renda Mensal Inicial: R$ 2.500,00');
    assert.ok(r, 'deveria mapear');
    assert.strictEqual(r.field, 'rendaMensalInicial');
    assert.strictEqual(r.valueType, 'monetario');
  });

  teste('mapearTrechoPrevidenciario extrai a data da DIB', () => {
    const r = sb.mapearTrechoPrevidenciario('DIB: 15/03/2022');
    assert.ok(r, 'deveria mapear');
    assert.strictEqual(r.field, 'dataDIB');
    assert.strictEqual(r.valueType, 'data');
  });

  teste('mapearTrechoPrevidenciario classifica o tipo documental a partir do texto de contexto', () => {
    const contexto = 'CARTA DE CONCESSÃO\nConcessão de Benefício\nNB: 123.456.789-0';
    const r = sb.mapearTrechoPrevidenciario('NB: 123.456.789-0', { textoContexto: contexto });
    assert.ok(r, 'deveria mapear');
    assert.strictEqual(r.documentType, 'cartaConcessao');
  });

  teste('isPreferredSource ainda é false pra campo de fonte única não catalogado em field-rules (numeroBeneficio) — nunca inventa resposta', () => {
    const r = sb.mapearTrechoPrevidenciario('NB: 123.456.789-0', { tipoDocumento: 'cartaConcessao' });
    assert.strictEqual(r.isPreferredSource, false);
    assert.strictEqual(r.isEligibleSource, false);
  });

  teste('isPreferredSource resolve de verdade agora que field-rules existe (Atualização 23): dataDIB vindo da cartaConcessao é a fonte preferencial', () => {
    const r = sb.mapearTrechoPrevidenciario('DIB: 15/03/2022', { tipoDocumento: 'cartaConcessao' });
    assert.strictEqual(r.isPreferredSource, true);
    assert.strictEqual(r.isEligibleSource, true);
  });

  teste('isPreferredSource é false (mas isEligibleSource true) quando a fonte é elegível mas não a preferencial: dataDIB vinda de processoJudicial', () => {
    const r = sb.mapearTrechoPrevidenciario('DIB: 15/03/2022', { tipoDocumento: 'processoJudicial' });
    assert.strictEqual(r.isPreferredSource, false);
    assert.strictEqual(r.isEligibleSource, true);
  });

  teste('mapearTrechoPrevidenciario devolve null para trecho sem conceito conhecido (nunca lança erro)', () => {
    assert.strictEqual(sb.mapearTrechoPrevidenciario('nada relevante aqui'), null);
    assert.strictEqual(sb.mapearTrechoPrevidenciario(''), null);
    assert.strictEqual(sb.mapearTrechoPrevidenciario(null), null);
  });

  teste('mapearCandidatoPrevidenciario anexa campos semânticos a um candidato real, sem sobrescrever valor/confianca originais', () => {
    const candidato = { valor: '15/03/2022', confianca: 0.7, pagina: 1, trecho: 'DIB: 15/03/2022' };
    const r = sb.mapearCandidatoPrevidenciario(candidato);
    assert.strictEqual(r.valor, '15/03/2022');
    assert.strictEqual(r.confianca, 0.7);
    assert.strictEqual(r.campoSemantico, 'dataDIB');
    assert.strictEqual(r.conceitoSemantico, 'dataDIB');
  });

  teste('mapearCandidatoPrevidenciario nunca descarta o candidato quando o trecho não bate em nada', () => {
    const candidato = { valor: 'x', confianca: 0.5, pagina: 1, trecho: 'nada relevante aqui' };
    const r = sb.mapearCandidatoPrevidenciario(candidato);
    assert.strictEqual(r.valor, 'x');
    assert.strictEqual(r.campoSemantico, undefined);
  });

  teste('mapearCandidatoPrevidenciario(null) devolve null sem lançar erro', () => {
    assert.strictEqual(sb.mapearCandidatoPrevidenciario(null), null);
  });

  teste('mapearCandidatosPrevidenciarios aplica a uma lista inteira', () => {
    const lista = [
      { valor: 'a', confianca: 0.5, trecho: 'DIB: 15/03/2022' },
      { valor: 'b', confianca: 0.5, trecho: 'NB: 123.456.789-0' }
    ];
    const r = sb.mapearCandidatosPrevidenciarios(lista);
    assert.strictEqual(r.length, 2);
    assert.strictEqual(r[0].campoSemantico, 'dataDIB');
    assert.strictEqual(r[1].campoSemantico, 'numeroBeneficio');
  });

  teste('mapearPaginaPrevidenciaria varre uma página inteira e devolve todos os conceitos mapeados', () => {
    const pagina = 'CARTA DE CONCESSÃO. NB: 123.456.789-0. Espécie: 42. DIB: 10/01/2023.';
    const resultados = sb.mapearPaginaPrevidenciaria(pagina);
    const campos = resultados.map(r => r.field);
    assert.ok(campos.includes('numeroBeneficio'));
    assert.ok(campos.includes('especieBeneficio'));
    assert.ok(campos.includes('dataDIB'));
    resultados.forEach(r => assert.strictEqual(r.documentType, 'cartaConcessao'));
  });

  teste('mapearPaginaPrevidenciaria devolve [] para texto vazio, nunca lança erro', () => {
    assert.strictEqual(sb.mapearPaginaPrevidenciaria('').length, 0);
    assert.strictEqual(sb.mapearPaginaPrevidenciaria(null).length, 0);
  });

  teste('SemanticMapperPrevidenciario expõe a fachada única do módulo', () => {
    assert.strictEqual(typeof sb.SemanticMapperPrevidenciario.mapearTrecho, 'function');
    assert.strictEqual(typeof sb.SemanticMapperPrevidenciario.mapearCandidato, 'function');
    assert.strictEqual(typeof sb.SemanticMapperPrevidenciario.mapearCandidatos, 'function');
    assert.strictEqual(typeof sb.SemanticMapperPrevidenciario.mapearPagina, 'function');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
