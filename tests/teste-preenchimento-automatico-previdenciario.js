/* ============================================================================
   TESTE-PREENCHIMENTO-AUTOMATICO-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/preenchimento/preenchimentoAutomaticoPrevidenciario.js
   (Atualização 26, item 8 do plano: "auto-fill real dos campos", último da
   fase; Atualização 36: os 24 campos que faltavam ganharam input em
   index.html e entraram no mapa). `planoDePreenchimentoPrevidenciario` é
   testado puro (sem DOM); `aplicarPreenchimentoNoDOMPrevidenciario` é
   testado com um mock mínimo de elemento (`{value: ''}`) no lugar do DOM
   real do browser.

   Roda com: node tests/teste-preenchimento-automatico-previdenciario.js
============================================================================ */

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Fonte da verdade dos 25 campos_semanticos: o próprio dicionário — evita
// hardcodar a lista aqui (e ela cairia dessincronizada se o dicionário
// mudasse sem que o teste percebesse).
const caminhoDicionario = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'dicionarioPrevidenciario.js');
const ctxDicionario = {};
vm.createContext(ctxDicionario);
vm.runInContext(fs.readFileSync(caminhoDicionario, 'utf8'), ctxDicionario);
const CAMPOS_SEMANTICOS = ctxDicionario.DICIONARIO_PREVIDENCIARIO.campos_semanticos.map(c => c.campo);

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

// Carregado via require() direto (não vm sandbox) — o arquivo já expõe
// module.exports e não depende de nenhum outro global deste domínio,
// então não precisa da bateria de arquivos que os outros testes carregam.
const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'preenchimento', 'preenchimentoAutomaticoPrevidenciario.js');
const mod = require(caminho);

(() => {
  console.log('== PREENCHIMENTO/PREVIDENCIARIO (auto-fill) ==');

  teste('MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO cobre hoje os 25 campos_semanticos do dicionário (Atualização 36)', () => {
    const mapeados = Object.keys(mod.MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO).sort();
    assert.deepStrictEqual(mapeados, [...CAMPOS_SEMANTICOS].sort());
    assert.strictEqual(mod.MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO.nomeSegurado, 'prevNomeSegurado');
    assert.strictEqual(mod.MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO.dataDIB, 'prevDataDIB');
    assert.strictEqual(mod.MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO.numeroBeneficio, 'prevNumeroBeneficio');
  });

  teste('todo id mapeado existe de fato como input em index.html', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    Object.values(mod.MAPA_CAMPO_PARA_DOM_PREVIDENCIARIO).forEach((id) => {
      assert.ok(new RegExp(`id="${id}"`).test(html), `id ${id} não encontrado em index.html`);
    });
  });

  const decisoes = {
    nomeSegurado: { valor: 'Fulano de Tal', emConflito: false },
    dataDIB: { valor: '10/01/2023', emConflito: false }
  };

  teste('planoDePreenchimentoPrevidenciario coloca campo mapeado e sem conflito em "preencher"', () => {
    const plano = mod.planoDePreenchimentoPrevidenciario(decisoes);
    assert.strictEqual(plano.preencher.length, 2);
    const nomeEntry = plano.preencher.find((e) => e.campo === 'nomeSegurado');
    assert.strictEqual(nomeEntry.idDom, 'prevNomeSegurado');
    assert.strictEqual(nomeEntry.valor, 'Fulano de Tal');
    const dibEntry = plano.preencher.find((e) => e.campo === 'dataDIB');
    assert.strictEqual(dibEntry.idDom, 'prevDataDIB');
  });

  teste('planoDePreenchimentoPrevidenciario reporta em "semMapeamentoDom" um campo decidido sem input correspondente (campo hipotético fora do dicionário)', () => {
    const plano = mod.planoDePreenchimentoPrevidenciario({
      campoFuturoAindaSemInput: { valor: 'x', emConflito: false }
    });
    assert.ok(plano.semMapeamentoDom.includes('campoFuturoAindaSemInput'));
  });

  teste('planoDePreenchimentoPrevidenciario NUNCA coloca campo em conflito em "preencher" — vai pra requeremConfirmacao', () => {
    const comConflito = { nomeSegurado: { valor: 'Fulano de Tal', emConflito: true } };
    const plano = mod.planoDePreenchimentoPrevidenciario(comConflito);
    assert.strictEqual(plano.preencher.length, 0);
    assert.strictEqual(plano.requeremConfirmacao.length, 1);
    assert.strictEqual(plano.requeremConfirmacao[0].motivo, 'emConflito');
  });

  teste('planoDePreenchimentoPrevidenciario reporta em semDecisao um campo mapeado que não foi decidido neste caso', () => {
    const plano = mod.planoDePreenchimentoPrevidenciario({});
    assert.ok(plano.semDecisao.includes('nomeSegurado'));
  });

  teste('planoDePreenchimentoPrevidenciario nunca lança erro com decisões ausentes/malformadas', () => {
    assert.strictEqual(mod.planoDePreenchimentoPrevidenciario(null).preencher.length, 0);
    assert.strictEqual(mod.planoDePreenchimentoPrevidenciario(undefined).preencher.length, 0);
  });

  teste('aplicarPreenchimentoNoDOMPrevidenciario escreve .value no elemento mockado e reporta o campo aplicado', () => {
    const elementoMock = { value: '' };
    const buscarMock = (id) => (id === 'prevNomeSegurado' ? elementoMock : null);
    const plano = mod.planoDePreenchimentoPrevidenciario(decisoes);
    // injeta o buscador via global $ (mesmo padrão do arquivo fonte)
    global.$ = buscarMock;
    const resultado = mod.aplicarPreenchimentoNoDOMPrevidenciario(plano);
    delete global.$;

    assert.strictEqual(elementoMock.value, 'Fulano de Tal');
    assert.deepStrictEqual(resultado.aplicados, ['nomeSegurado']);
  });

  teste('aplicarPreenchimentoNoDOMPrevidenciario reporta elementoAusente sem lançar erro quando o elemento não existe', () => {
    const plano = mod.planoDePreenchimentoPrevidenciario(decisoes);
    global.$ = () => null;
    const resultado = mod.aplicarPreenchimentoNoDOMPrevidenciario(plano);
    delete global.$;

    assert.deepStrictEqual(resultado.aplicados, []);
    assert.deepStrictEqual(resultado.elementoAusente.sort(), ['dataDIB', 'nomeSegurado']);
  });

  teste('aplicarPreenchimentoNoDOMPrevidenciario NUNCA toca elementos de campos em requeremConfirmacao', () => {
    const comConflito = { nomeSegurado: { valor: 'Fulano de Tal', emConflito: true } };
    const plano = mod.planoDePreenchimentoPrevidenciario(comConflito);
    const elementoMock = { value: 'valor original' };
    global.$ = () => elementoMock;
    mod.aplicarPreenchimentoNoDOMPrevidenciario(plano);
    delete global.$;

    assert.strictEqual(elementoMock.value, 'valor original', 'campo em conflito não deveria ser preenchido automaticamente');
  });

  teste('preencherFormularioAutomaticoPrevidenciario monta plano e aplica num só passo', () => {
    const elementoMock = { value: '' };
    global.$ = (id) => (id === 'prevNomeSegurado' ? elementoMock : null);
    const resultado = mod.preencherFormularioAutomaticoPrevidenciario(decisoes);
    delete global.$;

    assert.strictEqual(elementoMock.value, 'Fulano de Tal');
    assert.deepStrictEqual(resultado.aplicados, ['nomeSegurado']);
    assert.ok(resultado.plano, 'deveria devolver o plano junto do resultado da aplicação');
  });

  console.log(`TOTAL: ${totalTestes}/${totalTestes} rodados, ${totalTestes - totalFalhas} OK, ${totalFalhas} falharam`);
  if (totalFalhas > 0) process.exit(1);
})();
