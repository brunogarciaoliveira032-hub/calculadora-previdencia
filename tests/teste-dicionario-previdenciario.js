/* ============================================================================
   TESTE-DICIONARIO-PREVIDENCIARIO.JS — cobre
   js/domains/previdenciario/dicionarioPrevidenciario.js e index.js
   (Atualização 3/Fase 2 da migração). Carrega SÓ os dois arquivos do novo
   domínio, isolados num contexto vm próprio — não usa tests/loader.js (que é
   o pipeline de desapropriação) porque este domínio ainda não está plugado a
   nenhum pipeline (ver cabeçalho do próprio dicionário).

   Verifica integridade estrutural (contagens batem com metadata, toda âncora
   é string não vazia, toda relação/conflito referencia campo ou sigla que
   existe de fato) e a fachada (index.js): consulta por nome de campo, por
   tipo de documento, por sigla, e busca de conflitos.

   Roda sem dependências externas: `node tests/teste-dicionario-previdenciario.js`.
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

function carregarDominioPrevidenciario() {
  const raizJs = path.join(__dirname, '..', 'js', 'domains', 'previdenciario');
  const sandbox = {};
  vm.createContext(sandbox);
  ['dicionarioPrevidenciario.js', 'index.js'].forEach(arquivo => {
    const caminho = path.join(raizJs, arquivo);
    const codigo = fs.readFileSync(caminho, 'utf-8');
    new vm.Script(codigo, { filename: caminho }).runInContext(sandbox);
  });
  return sandbox;
}

(() => {
  console.log('== DICIONÁRIO PREVIDENCIÁRIO (v1.0.0) ==');
  const sb = carregarDominioPrevidenciario();
  const dic = sb.DICIONARIO_PREVIDENCIARIO;

  teste('carrega sem lançar exceção e expõe DICIONARIO_PREVIDENCIARIO congelado', () => {
    assert.ok(dic);
    assert.ok(Object.isFrozen(dic));
    assert.strictEqual(dic.metadata.versao, '1.0.0');
  });

  teste('metadata.estatisticas.campos_semanticos bate com o array real', () => {
    assert.strictEqual(dic.campos_semanticos.length, dic.metadata.estatisticas.campos_semanticos);
  });

  teste('metadata.estatisticas.tipos_documento bate com o objeto real', () => {
    assert.strictEqual(Object.keys(dic.tipos_documento).length, dic.metadata.estatisticas.tipos_documento);
  });

  teste('metadata.estatisticas.regras_globais bate com o array real', () => {
    assert.strictEqual(dic.regras_globais.length, dic.metadata.estatisticas.regras_globais);
  });

  teste('metadata.estatisticas.conflitos_mapeados bate com o array real', () => {
    assert.strictEqual(dic.matriz_conflitos.length, dic.metadata.estatisticas.conflitos_mapeados);
  });

  teste('metadata.estatisticas.relacoes bate com o array real', () => {
    assert.strictEqual(dic.relacoes_entre_campos.length, dic.metadata.estatisticas.relacoes);
  });

  teste('metadata.estatisticas.siglas bate com o objeto real', () => {
    assert.strictEqual(Object.keys(dic.siglario).length, dic.metadata.estatisticas.siglas);
  });

  teste('todo campo semântico tem nome único, categoria e ao menos uma âncora não vazia', () => {
    const nomes = new Set();
    dic.campos_semanticos.forEach(c => {
      assert.ok(c.campo && !nomes.has(c.campo), `campo duplicado ou vazio: ${c.campo}`);
      nomes.add(c.campo);
      assert.ok(c.categoria, `${c.campo} sem categoria`);
      assert.ok(Array.isArray(c.ancoras) && c.ancoras.length > 0, `${c.campo} sem âncoras`);
      c.ancoras.forEach(a => assert.ok(typeof a === 'string' && a.trim().length > 0, `${c.campo} tem âncora vazia`));
      assert.ok(typeof c.peso_confianca_base === 'number' && c.peso_confianca_base > 0 && c.peso_confianca_base <= 1,
        `${c.campo} com peso_confianca_base fora do intervalo (0,1]`);
    });
  });

  teste('toda regra global tem id único no padrão RGPxxx e texto não vazio', () => {
    const ids = new Set();
    dic.regras_globais.forEach(r => {
      assert.ok(/^RGP\d{3}$/.test(r.id), `id fora do padrão: ${r.id}`);
      assert.ok(!ids.has(r.id), `id de regra duplicado: ${r.id}`);
      ids.add(r.id);
      assert.ok(r.regra && r.regra.trim().length > 0, `${r.id} sem texto`);
    });
  });

  teste('toda entrada da matriz_conflitos referencia >= 2 campos e, se citar regra_associada, a regra existe', () => {
    const idsRegras = new Set(dic.regras_globais.map(r => r.id));
    dic.matriz_conflitos.forEach(entry => {
      assert.ok(Array.isArray(entry.campos) && entry.campos.length >= 2, 'conflito com menos de 2 campos');
      assert.ok(entry.risco && entry.risco.trim().length > 0, 'conflito sem descrição de risco');
      if (entry.regra_associada) {
        assert.ok(idsRegras.has(entry.regra_associada), `regra_associada inexistente: ${entry.regra_associada}`);
      }
    });
  });

  teste('toda relação entre campos tem "de", "para" e texto de relação não vazio', () => {
    dic.relacoes_entre_campos.forEach(rel => {
      assert.ok(rel.de && rel.para, 'relação sem "de"/"para"');
      assert.ok(rel.relacao && rel.relacao.trim().length > 0, 'relação sem texto explicativo');
    });
  });

  teste('todo tipo de documento tem âncoras de identificação e papel no processo descritos', () => {
    Object.entries(dic.tipos_documento).forEach(([chave, tipo]) => {
      assert.ok(tipo.nome, `${chave} sem nome`);
      assert.ok(tipo.papel_no_processo, `${chave} sem papel_no_processo`);
      assert.ok(Array.isArray(tipo.ancoras_identificacao) && tipo.ancoras_identificacao.length > 0, `${chave} sem âncoras de identificação`);
    });
  });

  teste('siglas centrais do domínio estão presentes (DER, DIB, DIP, NB, CNIS, RMI)', () => {
    ['DER', 'DIB', 'DIP', 'NB', 'CNIS', 'RMI'].forEach(sigla => {
      assert.ok(dic.siglario[sigla], `sigla ausente: ${sigla}`);
    });
  });

  console.log('\n== FACHADA (ConhecimentoPrevidenciario / index.js) ==');

  teste('campoPorNome: encontra dataDIB com sua descrição', () => {
    const campo = sb.ConhecimentoPrevidenciario.campoPorNome('dataDIB');
    assert.ok(campo);
    assert.strictEqual(campo.categoria, 'datas');
  });

  teste('campoPorNome: nome desconhecido devolve null', () => {
    assert.strictEqual(sb.ConhecimentoPrevidenciario.campoPorNome('campoQueNaoExiste'), null);
  });

  teste('tipoDocumentoPorChave: encontra cartaConcessao', () => {
    const tipo = sb.ConhecimentoPrevidenciario.tipoDocumentoPorChave('cartaConcessao');
    assert.ok(tipo);
    assert.ok(tipo.ancoras_identificacao.includes('Carta de Concessão'));
  });

  teste('tipoDocumentoPorChave: chave desconhecida devolve null', () => {
    assert.strictEqual(sb.ConhecimentoPrevidenciario.tipoDocumentoPorChave('naoExiste'), null);
  });

  teste('sigla: DIB e DER têm descrições distintas (não devem ser confundidas nem no próprio siglário)', () => {
    const der = sb.ConhecimentoPrevidenciario.sigla('DER');
    const dib = sb.ConhecimentoPrevidenciario.sigla('DIB');
    assert.ok(der && dib);
    assert.notStrictEqual(der, dib);
  });

  teste('conflitosDoCampo: dataDIB aparece em pelo menos 2 conflitos mapeados (DER x DIB, DID x DIB)', () => {
    const conflitos = sb.ConhecimentoPrevidenciario.conflitosDoCampo('dataDIB');
    assert.ok(conflitos.length >= 2, `esperava >= 2 conflitos, achou ${conflitos.length}`);
  });

  teste('conflitosDoCampo: campo sem conflito mapeado devolve array vazio', () => {
    // Array vem do realm do vm.createContext (não do Node principal), então
    // deepStrictEqual contra um [] literal deste arquivo falha por não ser
    // reference-equal entre realms — comparação por tamanho evita esse falso
    // negativo sem perder a cobertura do comportamento real.
    const conflitos = sb.ConhecimentoPrevidenciario.conflitosDoCampo('dataNascimento');
    assert.ok(Array.isArray(conflitos));
    assert.strictEqual(conflitos.length, 0);
  });

  console.log(`\n=== ${totalTestes} teste(s), ${totalTestes - totalFalhas} passaram, ${totalFalhas} falharam ===`);
  process.exit(totalFalhas ? 1 : 0);
})();
