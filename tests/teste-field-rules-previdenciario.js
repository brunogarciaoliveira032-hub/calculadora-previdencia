/* ============================================================================
   TESTE-FIELD-RULES-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/field-rules/{vinculos,contribuicoes,campos,index}.js
   (Atualização 23, item 3 do plano: "field-rules completas"). Mesmo padrão
   dos demais testes do domínio: sandbox `vm`, sem dependência externa.

   Roda com: node tests/teste-field-rules-previdenciario.js
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
    ['js', 'domains', 'previdenciario', 'field-rules', 'index.js']
  ].map(partes => path.join(__dirname, '..', ...partes));

  arquivos.forEach(caminho => {
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== FIELD-RULES/PREVIDENCIARIO (campo -> melhor fonte) ==');
  const sb = carregar();

  teste('catálogo agregado tem os 2 campos estruturais + 4 campos semânticos catalogados', () => {
    const campos = sb.todosOsCamposComRegraDeFontePrevidenciario();
    assert.strictEqual(campos.length, 6);
    ['vinculo', 'remuneracao', 'dataDER', 'dataDIB', 'especieBeneficio', 'motivoIndeferimento']
      .forEach(f => assert.ok(campos.includes(f), `deveria conter "${f}"`));
  });

  teste('validarFieldRulesPrevidenciario não acusa nenhum problema (schema completo, sources reais, sem duplicata)', () => {
    const problemas = sb.validarFieldRulesPrevidenciario();
    assert.strictEqual(problemas.length, 0, `problemas encontrados: ${JSON.stringify(problemas)}`);
  });

  teste('fonteRecomendadaParaPrevidenciario("dataDER") é o requerimento administrativo', () => {
    assert.strictEqual(sb.fonteRecomendadaParaPrevidenciario('dataDER'), 'requerimentoAdministrativo');
  });

  teste('fontesElegiveisParaPrevidenciario("dataDIB") inclui as 3 fontes concorrentes', () => {
    const fontes = sb.fontesElegiveisParaPrevidenciario('dataDIB');
    assert.strictEqual(fontes.length, 3);
    ['cartaConcessao', 'decisaoAdministrativa', 'processoJudicial'].forEach(f => assert.ok(fontes.includes(f)));
  });

  teste('acaoConflitoParaPrevidenciario é sempre "review" nos campos de datas/espécie (nunca decide sozinho)', () => {
    assert.strictEqual(sb.acaoConflitoParaPrevidenciario('dataDIB'), 'review');
    assert.strictEqual(sb.acaoConflitoParaPrevidenciario('especieBeneficio'), 'review');
    assert.strictEqual(sb.acaoConflitoParaPrevidenciario('motivoIndeferimento'), 'review');
  });

  teste('campo não catalogado (fonte única, ex.: numeroBeneficio) devolve null/[] sem lançar erro', () => {
    assert.strictEqual(sb.fonteRecomendadaParaPrevidenciario('numeroBeneficio'), null);
    assert.strictEqual(sb.fontesElegiveisParaPrevidenciario('numeroBeneficio').length, 0);
    assert.strictEqual(sb.acaoConflitoParaPrevidenciario('numeroBeneficio'), null);
  });

  teste('regraPreferenciaFontePrevidenciaria dá o bônus só ao candidato da fonte preferencial', () => {
    const regra = sb.regraPreferenciaFontePrevidenciaria('dataDER');
    const candidatos = [
      { valor: 'A', confianca: 0.5, tipoDocumento: 'requerimentoAdministrativo' },
      { valor: 'B', confianca: 0.5, tipoDocumento: 'cartaIndeferimento' }
    ];
    const ajustados = regra(candidatos);
    assert.ok(ajustados[0].confianca > 0.5, 'candidato da fonte preferencial deveria ganhar bônus');
    assert.strictEqual(ajustados[1].confianca, 0.5, 'candidato de outra fonte elegível não ganha bônus');
  });

  teste('regraPreferenciaFontePrevidenciaria é inerte (não lança, não altera) para campo sem regra catalogada', () => {
    const regra = sb.regraPreferenciaFontePrevidenciaria('numeroBeneficio');
    const candidatos = [{ valor: 'A', confianca: 0.5, tipoDocumento: 'cartaConcessao' }];
    assert.deepStrictEqual(regra(candidatos).map(c => c.confianca), [0.5]);
  });

  teste('field-rules estruturais pré-existentes (vinculo/remuneracao — Atualização 14-15) continuam intactos no agregado', () => {
    assert.strictEqual(sb.fonteRecomendadaParaPrevidenciario('vinculo'), 'cnis');
    assert.strictEqual(sb.fonteRecomendadaParaPrevidenciario('remuneracao'), 'cnis');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
