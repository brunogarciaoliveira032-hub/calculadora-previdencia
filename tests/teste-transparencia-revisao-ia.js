/* ============================================================================
   TESTE-TRANSPARENCIA-REVISAO-IA.JS — cobre o item 2 do checklist de
   melhorias ("Transparência e Auditoria das Sugestões da IA Revisora"):
   _prevUiRenderizarEvidenciasDetalhe() (js/domains/previdenciario/ui/
   painelPrevidenciario.js) precisa mostrar, de forma visível (nunca só
   num tooltip), o trecho exato do documento que embasou o valor decidido,
   o "De-Para" de qualquer fonte concorrente descartada, a justificativa
   mecânica de decisorCampos.js e — quando houver — o veredito/confiança/
   justificativa da revisão por IA, num bloco destacado.

   Testado só com o mock mínimo de `document` (para o módulo carregar sem
   erro) — a função em si é pura (recebe uma decisão, devolve uma string
   HTML), não toca o DOM.

   Roda com: node tests/teste-transparencia-revisao-ia.js
============================================================================ */

const assert = require('assert');
const path = require('path');

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

// painelPrevidenciario.js espera alguns globais de navegador só para
// REGISTRAR o listener de DOMContentLoaded no carregamento do módulo
// (nunca disparado aqui) e para as funções internas que vamos chamar
// diretamente (escaparHtml). Stub mínimo, só o suficiente para o
// require() não lançar erro.
global.document = { addEventListener(){}, getElementById(){ return null; } };
global.escaparHtml = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

// _prevUiRenderizarEvidenciasDetalhe vive em painelPrevidenciarioConferencia.js
// desde o split do antigo painelPrevidenciario.js único (ver cabeçalho de
// painelPrevidenciarioEstado.js) — só esse arquivo precisa ser importado aqui.
const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'ui', 'painelPrevidenciarioConferencia.js');
const mod = require(caminho);

(() => {
  console.log('== TRANSPARÊNCIA/AUDITORIA DA REVISÃO POR IA (item 2 do checklist) ==');

  teste('decisão simples (sem conflito, sem revisão IA) mostra o trecho exato de origem', () => {
    const decisao = {
      valor: '10/03/2020',
      confianca: 0.9,
      pagina: { numero: 3, arquivo: 'requerimento.pdf' },
      trecho: 'Data de Entrada do Requerimento: 10/03/2020',
      conflitos: [],
      emConflito: false,
      justificativa: null
    };
    const html = mod._prevUiRenderizarEvidenciasDetalhe(decisao);
    assert.ok(html.includes('Trecho que embasa o valor atual'), 'precisa rotular claramente o trecho');
    assert.ok(html.includes('Data de Entrada do Requerimento: 10/03/2020'), 'o texto exato do documento precisa aparecer, não só um resumo');
    assert.ok(html.includes('p. 3'), 'precisa citar a página de origem');
    assert.ok(html.includes('requerimento.pdf'), 'precisa citar o arquivo de origem');
    assert.ok(!html.includes('De → Para'), 'sem conflito não deveria mostrar bloco de De-Para');
    assert.ok(!html.includes('Revisão por IA'), 'sem statusRevisao não deveria mostrar bloco de revisão de IA');
  });

  teste('decisão em conflito mostra o "De-Para" com o trecho de CADA fonte concorrente descartada', () => {
    const decisao = {
      valor: 'Auxílio-Doença',
      confianca: 0.5,
      pagina: { numero: 2, arquivo: 'carta-concessao.pdf' },
      trecho: 'Espécie do benefício concedido: Auxílio-Doença (31)',
      emConflito: true,
      conflitos: [
        {
          tipo: 'candidato_concorrente',
          valor: 'Aposentadoria por Invalidez',
          vezes: 1,
          pagina: 5,
          arquivo: 'decisao-recurso.pdf',
          trecho: 'A Junta de Recursos reforma a decisão para conceder Aposentadoria por Invalidez.',
          mensagem: 'Outro valor encontrado 1x com confiança semelhante.'
        }
      ],
      justificativa: 'optou-se por "Auxílio-Doença" (pág. 2) em vez de "Aposentadoria por Invalidez" (pág. 5)'
    };
    const html = mod._prevUiRenderizarEvidenciasDetalhe(decisao);
    assert.ok(html.includes('De → Para'), 'precisa ter o bloco de De-Para quando há conflito');
    assert.ok(html.includes('Aposentadoria por Invalidez'), 'o valor concorrente descartado precisa aparecer');
    assert.ok(html.includes('A Junta de Recursos reforma a decisão'), 'o trecho EXATO da fonte concorrente precisa aparecer, não só o valor');
    assert.ok(html.includes('decisao-recurso.pdf'), 'precisa citar de onde veio a fonte concorrente');
    assert.ok(html.includes('Por que este valor'), 'a justificativa mecânica do decisorCampos.js precisa aparecer');
  });

  teste('decisão revisada por IA mostra um bloco DESTACADO (não um tooltip) com veredito, confiança e justificativa', () => {
    const decisao = {
      valor: '15/06/2021',
      confianca: 0.6,
      pagina: { numero: 4, arquivo: 'decisao-administrativa.pdf' },
      trecho: 'DIB fixada em 15/06/2021.',
      emConflito: true,
      conflitos: [{ valor: '20/06/2021', vezes: 1, pagina: 1, arquivo: 'requerimento.pdf', trecho: 'Requerido em 20/06/2021.' }],
      justificativa: 'optou-se por "15/06/2021" (pág. 4) em vez de "20/06/2021" (pág. 1)',
      statusRevisao: 'confirmado',
      confiancaRevisao: 92,
      observacao: 'Revisão por IA: confirmou (confiança da IA: 92%) — o trecho cita explicitamente a DIB fixada na decisão administrativa.'
    };
    const html = mod._prevUiRenderizarEvidenciasDetalhe(decisao);
    assert.ok(html.includes('prev-revisao-ia'), 'precisa ter a classe CSS do bloco destacado de revisão por IA');
    assert.ok(html.includes('confirmado'), 'o veredito precisa aparecer explicitamente no corpo, não só num atributo title');
    assert.ok(html.includes('92%'), 'a confiança numérica da IA precisa aparecer');
    assert.ok(html.includes('cita explicitamente a DIB'), 'a justificativa da IA precisa aparecer por extenso no corpo visível');
    assert.ok(!html.includes('title="Revisão por IA'), 'a justificativa não pode estar escondida só num atributo title (teria que abrir por hover)');
  });

  teste('veredito "rejeitado" da IA usa a classe visual de alerta correspondente (nunca neutra)', () => {
    const decisao = {
      valor: '01/01/2020', confianca: 0.4, pagina: null, trecho: 'algum trecho',
      emConflito: true, conflitos: [], justificativa: null,
      statusRevisao: 'rejeitado', confiancaRevisao: 80, observacao: 'Revisão por IA: rejeitou — o trecho não menciona essa data.'
    };
    const html = mod._prevUiRenderizarEvidenciasDetalhe(decisao);
    assert.ok(html.includes('prev-revisao-ia rejeitado'), 'a classe CSS precisa refletir o veredito de rejeição, para o alerta visual correto');
  });

  teste('nunca inventa trecho/justificativa: campo sem nenhuma evidência real não aparenta ter uma', () => {
    const decisao = { valor: 'X', confianca: 0.5, pagina: null, trecho: '', emConflito: false, conflitos: [], justificativa: null };
    const html = mod._prevUiRenderizarEvidenciasDetalhe(decisao);
    assert.ok(html.includes('Nenhum trecho de origem registrado'), 'ausência de trecho precisa ser dita explicitamente, nunca escondida ou preenchida com algo genérico');
  });

  console.log(`\n${totalTestes - totalFalhas}/${totalTestes} testes passaram.`);
  if (totalFalhas > 0) process.exit(1);
})();
