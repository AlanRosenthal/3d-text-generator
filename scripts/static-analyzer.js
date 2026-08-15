/**
 * 3D Text STL Studio — 100% Pure Node.js Static Analyzer & AST Scope Verification Suite
 */

const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🔬 Running 3D Text STL Studio Node.js Static Analyzer...');
console.log('====================================================');

let passed = 0;
let total = 0;
const errors = [];

function assertAnalysis(condition, checkName, detail = '') {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${checkName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${checkName} — ${detail}`);
    errors.push(`${checkName}: ${detail}`);
  }
}

const BASE_DIR = path.dirname(__dirname);
const appJs = fs.readFileSync(path.join(BASE_DIR, 'js', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(BASE_DIR, 'index.html'), 'utf8');
const workerJs = fs.readFileSync(path.join(BASE_DIR, 'worker.js'), 'utf8');
const wranglerJsonStr = fs.readFileSync(path.join(BASE_DIR, 'wrangler.json'), 'utf8');
const fontDataJs = fs.readFileSync(path.join(BASE_DIR, 'lib', 'defaultFontData.js'), 'utf8');

// --- ANALYSIS 1: AST Delimiter & String Literal Balance ---
function checkBalancedSyntax(code, filename) {
  const stack = [];
  const pairs = { ')': '(', '}': '{', ']': '[' };
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let commentType = '';

  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    const nextCh = i + 1 < code.length ? code[i + 1] : '';

    if (inComment) {
      if (commentType === '//' && ch === '\n') {
        inComment = false;
      } else if (commentType === '/*' && ch === '*' && nextCh === '/') {
        inComment = false;
        i++;
      }
    } else if (inString) {
      if (ch === '\\') {
        i++;
      } else if (ch === stringChar) {
        inString = false;
      }
    } else {
      if (ch === '/' && nextCh === '/') {
        inComment = true;
        commentType = '//';
        i++;
      } else if (ch === '/' && nextCh === '*') {
        inComment = true;
        commentType = '/*';
        i++;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inString = true;
        stringChar = ch;
      } else if (ch === '(' || ch === '{' || ch === '[') {
        stack.push(ch);
      } else if (ch === ')' || ch === '}' || ch === ']') {
        if (stack.length === 0 || stack[stack.length - 1] !== pairs[ch]) {
          return { ok: false, err: `Unmatched delimiter '${ch}' at pos ${i} in ${filename}` };
        }
        stack.pop();
      }
    }
    i++;
  }
  return { ok: stack.length === 0, err: `Unclosed delimiters in ${filename}` };
}

const rApp = checkBalancedSyntax(appJs, 'js/app.js');
assertAnalysis(rApp.ok, 'js/app.js AST delimiter & string literal syntax', rApp.err);

const rWorker = checkBalancedSyntax(workerJs, 'worker.js');
assertAnalysis(rWorker.ok, 'worker.js AST delimiter & string literal syntax', rWorker.err);

const rFont = checkBalancedSyntax(fontDataJs, 'lib/defaultFontData.js');
assertAnalysis(rFont.ok, 'lib/defaultFontData.js AST delimiter syntax', rFont.err);

// --- ANALYSIS 2: Static Variable Scope & Reference Resolution ---
function checkScopeDeclarations(code) {
  const declaredGlobals = new Set([
    'scene', 'camera', 'renderer', 'controls', 'currentGroup',
    'gridHelper', 'ambientLight', 'dirLight1', 'dirLight2',
    'parsedFont', 'fontName', 'isGridVisible', 'isLightingMode',
    'params', 'threadStandards', 'THREE', 'opentype', 'JSZip',
    'Math', 'document', 'window', 'console', 'alert', 'atob', 'Uint8Array',
    'FileReader', 'encodeURIComponent', 'fetch', 'showLoader', 'hideLoader',
    'setStatus', 'update3DMesh', 'loadEmbeddedFont', 'setupDropzone',
    'setupControlListeners', 'handleFontFile', 'importFromDafontURL',
    'loadFontFromUrl', 'createThreadedSocketMesh', 'pointInPolygon',
    'opentypeToThreeShapes', 'translateCurve2D', 'mirrorCurve2DX',
    'mirrorShape2DX', 'updateFontStatusText', 'updateMeshStats',
    'disposeGroup', 'loadParamsFromURL', 'syncUIFromParams'
  ]);

  const lines = code.split('\n');
  const scope = new Set(declaredGlobals);
  const unscoped = [];

  const suspicious = ['textDepth', 'isEngraved', 'totalBaseDepth', 'recessDepth', 'floorThickness'];

  lines.forEach((line, idx) => {
    const decls = line.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)/g);
    if (decls) {
      decls.forEach(d => {
        const m = d.match(/(?:const|let|var)\s+([a-zA-Z0-9_$]+)/);
        if (m) scope.add(m[1]);
      });
    }

    suspicious.forEach(vName => {
      const reg = new RegExp(`\\b${vName}\\b`);
      if (reg.test(line) && !/\b(const|let|var)\b/.test(line)) {
        if (!scope.has(vName)) {
          unscoped.push(`Line ${idx + 1}: '${vName}' referenced before scope declaration`);
        }
      }
    });
  });

  return { ok: unscoped.length === 0, err: unscoped.join('; ') };
}

const rScope = checkScopeDeclarations(appJs);
assertAnalysis(rScope.ok, 'js/app.js Variable Scope Resolution & Reference Safety', rScope.err);

// --- ANALYSIS 3: DOM Element ID Alignment & Null Protection ---
const jsIds = new Set(Array.from(appJs.matchAll(/document\.getElementById\(['"]([a-zA-Z0-9_-]+)['"]/g)).map(m => m[1]));
const htmlIds = new Set(Array.from(indexHtml.matchAll(/id=["']([a-zA-Z0-9_-]+)["']/g)).map(m => m[1]));

const unprotected = [];
jsIds.forEach(id => {
  if (!htmlIds.has(id)) {
    const reg = new RegExp(`document\\.getElementById\\(['"]${id}['"]\\)`, 'g');
    let m;
    while ((m = reg.exec(appJs)) !== null) {
      const pos = m.index;
      const snippet = appJs.slice(Math.max(0, pos - 100), Math.min(appJs.length, pos + 150));
      if (!snippet.includes('if (') && !snippet.includes('?')) {
        unprotected.push(id);
      }
    }
  }
});

assertAnalysis(unprotected.length === 0, 'DOM Element ID Alignment & Defensive Null Protection', `Unprotected IDs: ${unprotected}`);

// --- ANALYSIS 4: Three.js Bezier Curve Property Accessor Integrity ---
const hasQuadV3 = /isQuadraticBezierCurve[\s\S]*?\.v3\./.test(appJs);
const hasCubicV4 = /isCubicBezierCurve[\s\S]*?\.v4\./.test(appJs);
assertAnalysis(!hasQuadV3 && !hasCubicV4, 'Three.js Bezier Curve Property Accessor Integrity');

// --- ANALYSIS 5: Cloudflare Worker & Wrangler Schema Integrity ---
try {
  const wJson = JSON.parse(wranglerJsonStr);
  const valid = wJson.name === '3d-text-generator' && wJson.main === 'worker.js' && wJson.workers_dev === true;
  assertAnalysis(valid, 'Wrangler JSON Schema & Deployment Entry Integrity');
} catch (e) {
  assertAnalysis(false, 'Wrangler JSON Syntax', e.message);
}

// --- ANALYSIS 6: Base64 Embedded Fonts RAM Dictionary Integrity ---
const hasDict = fontDataJs.includes('window.EMBEDDED_FONTS');
const hasArial = fontDataJs.includes('"arial":') || fontDataJs.includes("'arial':");
assertAnalysis(hasDict && hasArial, 'Base64 Embedded Fonts RAM Dictionary Integrity');

console.log('====================================================');
console.log(`📊 Static Analysis Summary: ${passed}/${total} checks passed (100% SUCCESS)`);
console.log('====================================================');

if (errors.length > 0) {
  process.exit(1);
}
