/* ============================================================================
   TESTE-SANIDADE-CARGA.JS — guarda de regressão para dois defeitos que NENHUM
   teste em Node pegava, porque só existem quando os arquivos js/ são
   carregados juntos, como <script> globais, num navegador de verdade.

   1. COLISÃO DE IDENTIFICADOR GLOBAL. Em Node cada arquivo tem escopo de
      módulo próprio, então dois arquivos podem declarar `const X` sem
      conflito e todos os testes passam. No navegador todos compartilham o
      escopo global: o segundo arquivo estoura "Identifier 'X' has already
      been declared" na hora do parse e NÃO EXECUTA NENHUMA LINHA — o módulo
      inteiro some do app em silêncio. Foi exatamente o que aconteceu com
      CAMPOS_MONETARIOS (validacao.js x grafoRelacoes.js): grafoRelacoes.js
      ficou morto no navegador enquanto 200+ testes seguiam verdes.

   2. PRECACHE INCOMPLETO DO SERVICE WORKER. sw.js precisa listar todo script
      que o index.html carrega. Faltando algum, o app instalado como PWA e
      aberto sem rede sobe pela metade — parte dos módulos vem do cache, o
      resto falha, e a quebra só aparece na mão do usuário.

   Este teste é puro Node (sem navegador), rápido, e roda junto da suíte
   normal — é a rede de proteção barata que impede os dois problemas de
   voltarem entre uma rodada de E2E e outra.

   COMO RODAR: node tests/teste-sanidade-carga.js
============================================================================ */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const RAIZ = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf-8');

// Todo <script src="js/..."> do index.html, na ordem em que o navegador
// carrega — a ordem importa para saber quem "ganha" numa colisão.
const SCRIPTS = [...html.matchAll(/<script src="(js\/[^"]+)"/g)].map(m => m[1]);

let passaram = 0, falharam = 0;
function teste(nome, fn) {
  try {
    fn();
    console.log('  OK  ' + nome);
    passaram++;
  } catch (e) {
    console.log('  FALHOU  ' + nome);
    console.log('    ' + (e && e.message ? e.message : e));
    falharam++;
  }
}

// Declarações de topo de arquivo (coluna 0) — as únicas que caem no escopo
// global do navegador. Declarações indentadas estão dentro de função/bloco e
// não colidem, por isso a âncora de início de linha sem espaço.
function declaracoesGlobais(codigo) {
  const nomes = [];
  const re = /^(?:const|let|var|class|function)\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(codigo))) nomes.push(m[1]);
  return nomes;
}

console.log('=== Teste de sanidade da carga (escopo global compartilhado + precache do PWA) ===\n');

teste('Todo <script src="js/..."> do index.html existe no disco', () => {
  const ausentes = SCRIPTS.filter(s => !fs.existsSync(path.join(RAIZ, s)));
  assert.deepStrictEqual(ausentes, [], 'scripts referenciados e inexistentes: ' + ausentes.join(', '));
});

teste('O index.html carrega pelo menos os módulos centrais do app', () => {
  ['js/core/util.js', 'js/core/leitorPdf.js', 'js/core/decisorCampos.js', 'js/domains/previdenciario/index.js', 'js/domains/previdenciario/ui/painelPrevidenciarioEstado.js', 'js/domains/previdenciario/ui/painelPrevidenciarioWiring.js']
    .forEach(esperado => assert.ok(SCRIPTS.includes(esperado), 'index.html não carrega ' + esperado));
});

teste('Nenhum identificador global é declarado por dois scripts diferentes (mataria um deles no navegador)', () => {
  const dono = {};
  const colisoes = [];
  SCRIPTS.forEach(script => {
    const codigo = fs.readFileSync(path.join(RAIZ, script), 'utf-8');
    new Set(declaracoesGlobais(codigo)).forEach(nome => {
      if (dono[nome] && dono[nome] !== script) {
        colisoes.push(`${nome}: ${dono[nome]} x ${script}`);
      } else {
        dono[nome] = script;
      }
    });
  });
  assert.deepStrictEqual(colisoes, [],
    'colisões de escopo global (o segundo arquivo não executa no navegador):\n    ' + colisoes.join('\n    '));
});

teste('Nenhum script declara o mesmo identificador global duas vezes dentro de si', () => {
  const duplicados = [];
  SCRIPTS.forEach(script => {
    const nomes = declaracoesGlobais(fs.readFileSync(path.join(RAIZ, script), 'utf-8'));
    const vistos = new Set();
    nomes.forEach(n => {
      // `function f(){}` redeclarada é legal em JS; const/let/class não são.
      if (vistos.has(n)) duplicados.push(script + ': ' + n);
      vistos.add(n);
    });
  });
  const soConstELet = duplicados.filter(d => {
    const [arquivo, nome] = d.split(': ');
    const codigo = fs.readFileSync(path.join(RAIZ, arquivo), 'utf-8');
    const ocorrencias = codigo.match(new RegExp('^(?:const|let|class)\\s+' + nome + '\\b', 'gm')) || [];
    return ocorrencias.length > 1;
  });
  assert.deepStrictEqual(soConstELet, [], 'redeclaração de const/let/class no mesmo arquivo: ' + soConstELet.join(', '));
});

teste('O service worker precacheia TODOS os scripts do index.html (app instalado funciona sem rede)', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf-8');
  const faltando = SCRIPTS.filter(s => !sw.includes(s));
  assert.deepStrictEqual(faltando, [],
    'scripts fora do precache do sw.js — offline o app sobe pela metade:\n    ' + faltando.join('\n    '));
});

teste('O service worker não precacheia arquivo que não existe (cache.addAll aborta a instalação inteira)', () => {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf-8');
  const listados = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
  const inexistentes = listados.filter(rel => !fs.existsSync(path.join(RAIZ, rel)));
  assert.deepStrictEqual(inexistentes, [], 'listados no precache mas ausentes do disco: ' + inexistentes.join(', '));
});

teste('O manifest do PWA aponta para ícones que existem', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf-8'));
  const ausentes = (manifest.icons || [])
    .map(i => i.src.replace(/^\.\//, ''))
    .filter(src => !fs.existsSync(path.join(RAIZ, src)));
  assert.deepStrictEqual(ausentes, [], 'ícones do manifest ausentes: ' + ausentes.join(', '));
});

console.log(`\n=== ${passaram + falharam} teste(s), ${passaram} passaram, ${falharam} falharam ===`);
process.exit(falharam ? 1 : 0);
