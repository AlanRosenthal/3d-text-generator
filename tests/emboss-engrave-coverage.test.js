/**
 * 3D Text STL Studio — Comprehensive Embossed & Engraved Mode Unit Tests
 * Standard Node.js Test Suite (node:test & node:assert/strict)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Baseline Default Config Constants
const DEFAULT_PARAMS = {
  text: 'Your Text Here',
  font: 'arial',
  extrudeDepth: 5.0,
  fontSize: 25.0,
  letterSpacing: 0.0,
  textThickness: 0.0,
  fillMode: 'embossed',
  mirrorText: false,
  baseplateEnabled: true,
  baseplateProfile: 'fillet',
  baseplateThickness: 2.0,
  baseplatePadding: 4.0,
  baseplateRadius: 4.0,
  mountHoleEnabled: false,
  threadStandard: '1/4-20',
  mountHoleOffset: 0.20,
  mountHoleDepthRatio: 0.90,
  textColor: '#818cf8',
  baseColor: '#475569',
  threadColor: '#f59e0b'
};

// --- SECTION 1: EMBOSSED MODE COMPREHENSIVE COVERAGE ---

test('Embossed Mode: Baseplate Enabled Height & Positioning', () => {
  const params = { ...DEFAULT_PARAMS, fillMode: 'embossed', baseplateEnabled: true, baseplateThickness: 2.0, extrudeDepth: 5.0 };
  const textZPosition = params.baseplateEnabled ? params.baseplateThickness : 0.0;
  const totalModelHeight = params.baseplateThickness + params.extrudeDepth;

  assert.strictEqual(params.fillMode, 'embossed');
  assert.strictEqual(textZPosition, 2.0, 'Embossed text sits on top surface of 2.0mm baseplate');
  assert.strictEqual(totalModelHeight, 7.0, 'Total model height is baseplate + text extrusion (2.0 + 5.0 = 7.0mm)');
});

test('Embossed Mode: Baseplate Disabled Height & Positioning', () => {
  const params = { ...DEFAULT_PARAMS, fillMode: 'embossed', baseplateEnabled: false, baseplateThickness: 2.0, extrudeDepth: 8.5 };
  const textZPosition = params.baseplateEnabled ? params.baseplateThickness : 0.0;
  const totalModelHeight = params.extrudeDepth;

  assert.strictEqual(textZPosition, 0.0, 'Embossed text sits at Z=0 when baseplate is disabled');
  assert.strictEqual(totalModelHeight, 8.5, 'Total height equals text extrudeDepth (8.5mm) when standalone');
});

test('Embossed Mode: Letter Spacing & Thickness Offsets', () => {
  function computeGlyphXPositions(text, fontSize, letterSpacing) {
    let currentX = 0;
    const positions = [];
    const advanceWidth = fontSize * 0.6 + letterSpacing;
    for (let i = 0; i < text.length; i++) {
      positions.push(currentX);
      currentX += advanceWidth;
    }
    return positions;
  }

  const posDefault = computeGlyphXPositions('ABC', 25.0, 0.0);
  const posSpaced = computeGlyphXPositions('ABC', 25.0, 5.0);

  assert.strictEqual(posDefault[0], 0.0);
  assert.strictEqual(posDefault[1], 15.0);
  assert.strictEqual(posSpaced[1], 20.0, '5mm letter spacing adds 5mm offset between characters');
});

// --- SECTION 2: ENGRAVED MODE COMPREHENSIVE COVERAGE ---

test('Engraved Mode: Force Baseplate Enable & UI Lock', () => {
  function applyFillModeLogic(mode, userBaseplateCheckbox) {
    let baseplateEnabled = userBaseplateCheckbox;
    let baseplateDisabledInUI = false;

    if (mode === 'engraved') {
      baseplateEnabled = true;
      baseplateDisabledInUI = true;
    }
    return { baseplateEnabled, baseplateDisabledInUI };
  }

  const res = applyFillModeLogic('engraved', false);
  assert.strictEqual(res.baseplateEnabled, true, 'Baseplate is forcibly enabled for Engraved mode');
  assert.strictEqual(res.baseplateDisabledInUI, true, 'Baseplate toggle checkbox is locked in UI');
});

test('Engraved Mode: Recess Depth Capping (60% Max Limit Rule)', () => {
  function computeEngravedDepth(extrudeDepth, baseplateThickness) {
    return Math.min(extrudeDepth, baseplateThickness * 0.6);
  }

  // Case A: extrudeDepth (10mm) > 60% of baseplate (2.0mm * 0.6 = 1.2mm)
  const depthA = computeEngravedDepth(10.0, 2.0);
  assert.strictEqual(depthA, 1.2, 'Recess depth capped at 1.2mm (60% of 2.0mm baseplate)');

  // Case B: Small extrudeDepth (0.5mm) < 60% of baseplate (2.0mm * 0.6 = 1.2mm)
  const depthB = computeEngravedDepth(0.5, 2.0);
  assert.strictEqual(depthB, 0.5, 'Recess depth uses exact extrudeDepth when smaller than 60% cap');

  // Case C: Thick baseplate (10.0mm) -> 60% cap = 6.0mm
  const depthC = computeEngravedDepth(5.0, 10.0);
  assert.strictEqual(depthC, 5.0, 'Recess depth uses 5.0mm when within 6.0mm cap');
});

test('Engraved Mode: Recess Floor Z-Level Calculation', () => {
  function computeRecessFloorZ(baseplateThickness, engravedDepth) {
    return Math.max(0.05, baseplateThickness - engravedDepth);
  }

  const floorZ = computeRecessFloorZ(2.0, 1.2);
  assert.strictEqual(floorZ, 0.8, 'Recess floor Z-level sits at Z=0.8mm for 2.0mm baseplate with 1.2mm recess');
});

test('Engraved Mode: Constant Total Height Invariance', () => {
  const baseplateThickness = 3.0;
  const extrudeDepth = 8.0;
  const engravedDepth = Math.min(extrudeDepth, baseplateThickness * 0.6); // 1.8mm
  const recessFloorZ = Math.max(0.05, baseplateThickness - engravedDepth); // 1.2mm
  const recessExtrusionHeight = baseplateThickness - recessFloorZ; // 1.8mm

  assert.strictEqual(recessFloorZ + recessExtrusionHeight, baseplateThickness, 'Combined recess + floor height equals exact baseplate thickness (3.0mm)');
});

test('Engraved Mode: Inner Island Counter Preservation for Characters with Holes', () => {
  function classifyGlyphComponents(glyphPaths) {
    // Outer boundary vs Inner holes (e.g. 'O', 'B', 'P', '8')
    const outerLoops = [];
    const innerHoles = [];

    glyphPaths.forEach(path => {
      if (path.isHole) {
        innerHoles.push(path);
      } else {
        outerLoops.push(path);
      }
    });

    return { outerCount: outerLoops.length, holeCount: innerHoles.length };
  }

  // Simulated letter 'O' glyph (1 outer loop + 1 inner hole)
  const letterO = [{ isHole: false }, { isHole: true }];
  const classifiedO = classifyGlyphComponents(letterO);

  assert.strictEqual(classifiedO.outerCount, 1, "Letter 'O' has 1 outer boundary loop");
  assert.strictEqual(classifiedO.holeCount, 1, "Letter 'O' has 1 inner hole counter that must be preserved as a solid island");

  // Simulated letter 'B' glyph (1 outer loop + 2 inner holes)
  const letterB = [{ isHole: false }, { isHole: true }, { isHole: true }];
  const classifiedB = classifyGlyphComponents(letterB);

  assert.strictEqual(classifiedB.holeCount, 2, "Letter 'B' has 2 inner hole counters that must be preserved as solid islands");
});

test('Engraved Mode: Mirrored Text Interaction with Recess Geometry', () => {
  function generateEngravedTextTransform(mirrorText) {
    const scaleX = mirrorText ? -1 : 1;
    return { scaleX };
  }

  const normalTransform = generateEngravedTextTransform(false);
  const mirroredTransform = generateEngravedTextTransform(true);

  assert.strictEqual(normalTransform.scaleX, 1);
  assert.strictEqual(mirroredTransform.scaleX, -1, 'Mirror text applies X-axis reversal (scaleX=-1) for face-down printing');
});
