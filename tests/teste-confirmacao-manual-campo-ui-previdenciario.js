/* ============================================================================
   TESTE-CONFIRMACAO-MANUAL-CAMPO-UI-PREVIDENCIARIO.JS — cobre a
   confirmação manual de campo em conflito ("Usar esta sugestão",
   Atualização 47) em painelPrevidenciario.js:

     1. _prevUiConfirmarCampoManualmente() resolve a decisão (emConflito
        vira false, valor atualizado), registra auditoria completa (quem,
        quando, valor escolhido, alternativas descartadas, fonte) e
        preenche o DOM quando há mapeamento.
     2. renderizarCamposDecididosPrev() mostra os botões "Usar" só para
        campo ainda em conflito, some com eles após confirmado, e mostra
        o badge "confirmado manualmente".
     3. renderizarAuditoriaConfirmacoesPrev() lista o histórico completo.

   Roda sem dependências externas: `node tests/teste-confirmacao-manual-campo-ui-previdenciario.js`.
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
    console.log(`      ${erro.stack || erro.message}`);
  }
}

function criarElementoFake(id) {
  return {
    id, style: {}, classList: { add() {}, remove() {}, contains() { return false; } },
    textContent: '', innerHTML: '', value: '', disabled: false, checked: false,
    addEventListener() {}, removeEventListener() {}
  };
}

function carregarPainel() {
  const elementos = {};
  const documentoFake = {
    getElementById(id) { if (!elementos[id]) elementos[id] = criarElementoFake(id); return elementos[id]; },
    addEventListener() {},
    createElement() { return criarElementoFake('anon'); }
  };
  const sandbox = {
    document: documentoFake, window: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    console, setTimeout, clearTimeout
  };
  sandbox.window.iniciarPipelineLeituraPdf = undefined;
  vm.createContext(sandbox);

  const arquivos = [
    'core/util.js',
    'core/leitorPdf.js',
    'domains/previdenciario/preenchimento/preenchimentoAutomaticoPrevidenciario.js',
    'domains/previdenciario/ui/painelPrevidenciarioEstado.js',
    'domains/previdenciario/ui/painelPrevidenciarioConferencia.js',
    'domains/previdenciario/ui/painelPrevidenciarioCalculo.js',
    'domains/previdenciario/ui/painelPrevidenciarioResultado.js',
    'domains/previdenciario/ui/painelPrevidenciarioWiring.js'
  ];
  arquivos.forEach(rel => {
    const caminho = path.join(__dirname, '..', 'js', rel);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    try {
      new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
    } catch (erro) { /* ver mesmo comentário nos outros testes de UI */ }
  });
  if (typeof sandbox.escaparHtml !== 'function') {
    throw new Error('escaparHtml não ficou definida no sandbox');
  }
  return { sandbox, elementos };
}

function decisoesCampoDIBEmConflito() {
  return {
    campos: ['dataDIB'],
    porCampo: {
      dataDIB: {
        valor: '01/01/2020',
        confianca: 72,
        emConflito: true,
        trecho: 'DIB fixada em 01/01/2020 conforme carta de concessão anexa',
        pagina: { numero: 3, arquivo: 'carta-concessao.pdf' },
        justificativa: 'fonte preferencial: carta de concessão',
        conflitos: [
          { valor: '15/12/2019', trecho: 'A sentença fixa a DIB em 15/12/2019', pagina: 7, arquivo: 'sentenca.pdf', vezes: 1 }
        ]
      }
    }
  };
}

(() => {
  console.log('== CONFIRMAÇÃO MANUAL DE CAMPO EM CONFLITO — "Usar esta sugestão" (Atualização 47) ==');

  teste('_prevUiConfirmarCampoManualmente resolve a decisão: emConflito vira false, valor atualizado', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox.document.getElementById('prevConfirmadoPor').value = 'Dra. Fulana';

    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '15/12/2019', { descricao: 'p. 7 · sentenca.pdf', trecho: 'A sentença fixa a DIB em 15/12/2019' }, 'conflito:0');

    const decisao = sandbox.PREV_UI_ESTADO.decisoesCampos.porCampo.dataDIB;
    assert.strictEqual(decisao.valor, '15/12/2019');
    assert.strictEqual(decisao.emConflito, false);
    assert.ok(decisao.confirmacaoManual);
  });

  teste('_prevUiConfirmarCampoManualmente registra auditoria completa: quem, quando, valor, fonte, alternativa descartada', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox.document.getElementById('prevConfirmadoPor').value = 'Dra. Fulana';

    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '15/12/2019', { descricao: 'p. 7 · sentenca.pdf', trecho: 'A sentença fixa a DIB em 15/12/2019' }, 'conflito:0');

    const auditoria = sandbox.PREV_UI_ESTADO.auditoriaConfirmacoes;
    assert.strictEqual(auditoria.length, 1);
    const registro = auditoria[0];
    assert.strictEqual(registro.campo, 'dataDIB');
    assert.strictEqual(registro.confirmadoPor, 'Dra. Fulana');
    assert.strictEqual(registro.valorEscolhido, '15/12/2019');
    assert.ok(registro.quando);
    assert.strictEqual(registro.alternativasDescartadas.length, 1);
    assert.strictEqual(registro.alternativasDescartadas[0].valor, '01/01/2020');
  });

  teste('sem "confirmado por" preenchido, registra "não informado" (nunca inventa um nome)', () => {
    const { sandbox } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    // prevConfirmadoPor fica vazio de propósito

    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '01/01/2020', { descricao: 'p. 3 · carta-concessao.pdf' }, 'valor_atual');

    assert.strictEqual(sandbox.PREV_UI_ESTADO.auditoriaConfirmacoes[0].confirmadoPor, 'não informado');
  });

  teste('confirmar o VALOR ATUAL (não o concorrente) ainda registra a alternativa do conflito como descartada', () => {
    const { sandbox } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();

    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '01/01/2020', { descricao: 'p. 3 · carta-concessao.pdf' }, 'valor_atual');

    const registro = sandbox.PREV_UI_ESTADO.auditoriaConfirmacoes[0];
    assert.strictEqual(registro.alternativasDescartadas.length, 1);
    assert.strictEqual(registro.alternativasDescartadas[0].valor, '15/12/2019');
  });

  teste('valor editado manualmente (fora dos candidatos) também registra as DUAS alternativas como descartadas', () => {
    const { sandbox } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();

    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '20/01/2020', { descricao: 'editado manualmente' }, 'manual');

    const decisao = sandbox.PREV_UI_ESTADO.decisoesCampos.porCampo.dataDIB;
    assert.strictEqual(decisao.valor, '20/01/2020');
    const registro = sandbox.PREV_UI_ESTADO.auditoriaConfirmacoes[0];
    assert.strictEqual(registro.alternativasDescartadas.length, 2);
  });

  teste('renderizarCamposDecididosPrev mostra os botões "Usar" enquanto o campo está em conflito', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox.PREV_UI_ESTADO.planoPreenchimento = { preencher: [], requeremConfirmacao: [], semMapeamentoDom: [], semDecisao: [] };
    sandbox.renderizarCamposDecididosPrev();
    const html = elementos['prevTabelaCampos'].innerHTML;
    assert.ok(html.includes('prev-btn-usar-valor'));
    assert.ok(html.includes('Usar "01/01/2020"'));
    assert.ok(html.includes('Usar "15/12/2019"'));
    assert.ok(html.includes('prev-btn-confirmar-manual'));
  });

  teste('renderizarCamposDecididosPrev NÃO mostra os botões "Usar" depois de confirmado — mostra o badge', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox.PREV_UI_ESTADO.planoPreenchimento = { preencher: [], requeremConfirmacao: [], semMapeamentoDom: [], semDecisao: [] };
    sandbox.document.getElementById('prevConfirmadoPor').value = 'Dra. Fulana';
    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '15/12/2019', { descricao: 'p. 7 · sentenca.pdf' }, 'conflito:0');

    const html = elementos['prevTabelaCampos'].innerHTML;
    assert.ok(!html.includes('prev-btn-usar-valor'));
    assert.ok(html.includes('confirmado manualmente'));
  });

  teste('renderizarAuditoriaConfirmacoesPrev lista o histórico com campo, valor, fonte, quem e quando', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox.document.getElementById('prevConfirmadoPor').value = 'Dra. Fulana';
    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '15/12/2019', { descricao: 'p. 7 · sentenca.pdf' }, 'conflito:0');

    const html = elementos['prevAuditoriaConfirmacoes'].innerHTML;
    assert.ok(html.includes('Histórico de confirmações manuais'));
    assert.ok(html.includes('dataDIB'));
    assert.ok(html.includes('15/12/2019'));
    assert.ok(html.includes('Dra. Fulana'));
  });

  teste('_prevUiConfirmarCampoManualmente preenche o DOM quando o campo tem mapeamento (dataDIB -> prevDataDIB)', () => {
    const { sandbox, elementos } = carregarPainel();
    sandbox.PREV_UI_ESTADO.decisoesCampos = decisoesCampoDIBEmConflito();
    sandbox._prevUiConfirmarCampoManualmente('dataDIB', '15/12/2019', { descricao: 'p. 7 · sentenca.pdf' }, 'conflito:0');
    assert.strictEqual(elementos['prevDataDIB'].value, '15/12/2019');
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
