/* ============================================================================
   TESTE-COMPARADOR-REGRAS-PREVIDENCIARIAS.JS — cobre
   js/domains/previdenciario/comparador/comparadorRegrasPrevidenciarias.js
   (Atualização 50).

   Roda sem dependências externas: `node tests/teste-comparador-regras-previdenciarias.js`.
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
  const caminho = path.join(__dirname, '..', 'js', 'domains', 'previdenciario', 'comparador', 'comparadorRegrasPrevidenciarias.js');
  const codigo = fs.readFileSync(caminho, 'utf-8');
  new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  return sandbox.ComparadorRegrasPrevidenciarias;
}

function semRealm(valor) { return JSON.parse(JSON.stringify(valor)); }

function elegivelCom(rmiFinal) {
  return { elegibilidade: { elegivel: true, pendencias: [] }, rmi: { rmiFinal: rmiFinal } };
}
function naoElegivel() {
  return { elegibilidade: { elegivel: false, pendencias: ['algo faltando'] }, rmi: { rmiFinal: 999 } };
}

(() => {
  console.log('== COMPARADOR/COMPARADORREGRASPREVIDENCIARIAS.JS ==');
  const C = carregarModulo();

  /* -------------------- CENÁRIO DO EXEMPLO DO USUÁRIO -------------------- */

  teste('cenário com as 4 regras elegíveis: ranking ordenado do maior pro menor RMI, melhor regra é o topo', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] },
      rmiTeorica: { rmiFinal: 2800 },
      regraPontos: elegivelCom(3050),
      regraPedagio50: elegivelCom(2920),
      regraPedagio100: elegivelCom(3210)
      // idade progressiva não avaliada neste caso
    };
    const r = C.compararRegrasPrevidenciarias(resultado);

    assert.strictEqual(r.regras.length, 4); // permanente, pontos, pedágio 50, pedágio 100 (idade progressiva não entra, não avaliada)
    assert.strictEqual(r.ranking.length, 4);
    assert.strictEqual(r.ranking[0].nome, 'Pedágio 100%');
    assert.strictEqual(r.ranking[0].rmiFinal, 3210);
    assert.strictEqual(r.ranking[1].nome, 'Pontos');
    assert.strictEqual(r.ranking[2].nome, 'Pedágio 50%');
    assert.strictEqual(r.ranking[3].nome, 'Regra permanente');
    assert.strictEqual(r.melhorRegra.nome, 'Pedágio 100%');
    assert.strictEqual(r.melhorRegra.rmiFinal, 3210);
    assert.strictEqual(r.motivoSemMelhorRegra, null);
  });

  /* -------------------- REGRAS NÃO AVALIADAS FICAM DE FORA -------------------- */

  teste('regra não avaliada (ausente do resultado) nem aparece na lista de regras', () => {
    const resultado = { elegibilidade: { elegivel: true, pendencias: [] }, rmiTeorica: { rmiFinal: 2000 } };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.regras.length, 1);
    assert.strictEqual(r.regras[0].nome, 'Regra permanente');
  });

  teste('nenhuma regra avaliada: regras/ranking vazios, melhorRegra null, motivo explícito', () => {
    const r = C.compararRegrasPrevidenciarias({});
    assert.deepStrictEqual(semRealm(r.regras), []);
    assert.deepStrictEqual(semRealm(r.ranking), []);
    assert.strictEqual(r.melhorRegra, null);
    assert.ok(r.motivoSemMelhorRegra.includes('Nenhuma regra foi avaliada'));
  });

  /* -------------------- REGRA INELEGÍVEL NUNCA VENCE -------------------- */

  teste('regra inelegível com RMI alta NUNCA aparece no ranking nem vence, mesmo com número maior', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] },
      rmiTeorica: { rmiFinal: 2000 },
      regraPontos: naoElegivel() // rmiFinal 999 só pra provar que não teria "vencido" mesmo se fosse maior
    };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.ranking.length, 1);
    assert.strictEqual(r.ranking[0].nome, 'Regra permanente');
    assert.strictEqual(r.melhorRegra.nome, 'Regra permanente');

    const regraPontosNaLista = r.regras.find(x => x.nome === 'Pontos');
    assert.strictEqual(regraPontosNaLista.podeConcorrer, false);
    assert.strictEqual(regraPontosNaLista.elegivel, false);
    assert.ok(regraPontosNaLista.motivoForaDoRanking.includes('não elegível'));
  });

  teste('todas inelegíveis: ranking vazio, melhorRegra null com motivo específico (diferente de "nenhuma avaliada")', () => {
    const resultado = { elegibilidade: { elegivel: false, pendencias: ['x'] }, rmiTeorica: { rmiFinal: 100 } };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.melhorRegra, null);
    assert.ok(r.motivoSemMelhorRegra.includes('Nenhuma das regras avaliadas está elegível'));
  });

  /* -------------------- ELEGÍVEL MAS SEM RMI (ex.: pedágio 50% sem fator previdenciário) -------------------- */

  teste('regra elegível mas SEM RMI calculada fica fora do ranking, com motivo próprio', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] },
      rmiTeorica: { rmiFinal: 2000 },
      regraPedagio50: { elegibilidade: { elegivel: true, pendencias: [] }, rmi: undefined } // fator previdenciário não informado
    };
    const r = C.compararRegrasPrevidenciarias(resultado);
    const pedagio50 = r.regras.find(x => x.nome === 'Pedágio 50%');
    assert.strictEqual(pedagio50.elegivel, true);
    assert.strictEqual(pedagio50.podeConcorrer, false);
    assert.strictEqual(pedagio50.rmiFinal, null);
    assert.ok(pedagio50.motivoForaDoRanking.includes('RMI não calculada'));
    assert.strictEqual(r.ranking.length, 1); // só a permanente
  });

  /* -------------------- EMPATE -------------------- */

  teste('empate de RMI entre duas regras elegíveis: preserva a ordem de entrada, ambas aparecem', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] },
      rmiTeorica: { rmiFinal: 3000 },
      regraPontos: elegivelCom(3000)
    };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.ranking.length, 2);
    assert.strictEqual(r.ranking[0].rmiFinal, 3000);
    assert.strictEqual(r.ranking[1].rmiFinal, 3000);
    assert.strictEqual(r.ranking[0].nome, 'Regra permanente'); // ordem de entrada preservada
  });

  /* -------------------- TODAS AS 5 REGRAS -------------------- */

  teste('as 5 regras avaliadas simultaneamente aparecem todas na lista, na ordem certa de nome', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] }, rmiTeorica: { rmiFinal: 1000 },
      regraPontos: elegivelCom(1100),
      regraIdadeMinimaProgressiva: elegivelCom(1200),
      regraPedagio50: elegivelCom(1300),
      regraPedagio100: elegivelCom(1400)
    };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.regras.length, 5);
    assert.deepStrictEqual(semRealm(r.regras.map(x => x.nome)), ['Regra permanente', 'Pontos', 'Idade mínima progressiva', 'Pedágio 50%', 'Pedágio 100%']);
    assert.strictEqual(r.melhorRegra.nome, 'Pedágio 100%');
  });

  teste('direito adquirido pode ganhar do resto quando tem a maior RMI', () => {
    const resultado = {
      elegibilidade: { elegivel: true, pendencias: [] },
      rmiTeorica: { rmiFinal: 2000 },
      regraPontos: elegivelCom(2200),
      direitoAdquiridoTempoContribuicao: elegivelCom(2500)
    };
    const r = C.compararRegrasPrevidenciarias(resultado);
    assert.strictEqual(r.regras.length, 3);
    assert.strictEqual(r.regras[0].nome, 'Direito adquirido (tempo de contribuição)');
    assert.strictEqual(r.melhorRegra.nome, 'Direito adquirido (tempo de contribuição)');
    assert.strictEqual(r.melhorRegra.rmiFinal, 2500);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  if (totalFalhas > 0) process.exit(1);
})();
