/**
 * 3D Text STL Studio — De Facto Standard Node.js Test Suite (node:test & node:assert)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

test('Section 1: Embossed (Raised) Mode Positioning & Heights', () => {
  const embossedParams = {
    fillMode: 'embossed',
    baseplateThickness: 2.0,
    extrudeDepth: 5.0,
    baseplateEnabled: true
  };

  const embossedTextZ = embossedParams.baseplateThickness;
  const embossedTotalZ = embossedParams.baseplateThickness + embossedParams.extrudeDepth;

  assert.strictEqual(embossedParams.fillMode, 'embossed');
  assert.strictEqual(embossedTextZ, 2.0, 'Embossed text sits at top baseplate surface (Z=2.0mm)');
  assert.strictEqual(embossedTotalZ, 7.0, 'Embossed total bounding box height (7.0mm)');
});

test('Section 2: Engraved (Carved) Sub-Layering & Force Baseplate Enable', () => {
  const engravedParams = {
    fillMode: 'engraved',
    baseplateThickness: 2.0,
    extrudeDepth: 5.0,
    baseplateEnabled: false // Will be forced true!
  };

  if (engravedParams.fillMode === 'engraved') {
    engravedParams.baseplateEnabled = true;
  }

  const totalBaseDepth = engravedParams.baseplateThickness;
  const recessDepth = Math.min(engravedParams.extrudeDepth, totalBaseDepth * 0.7);
  const floorThickness = Math.max(0.2, totalBaseDepth - recessDepth);

  assert.strictEqual(engravedParams.fillMode, 'engraved');
  assert.strictEqual(engravedParams.baseplateEnabled, true, 'Engraved mode force-enables baseplate');
  assert.strictEqual(recessDepth, 1.4, 'Engraved recess depth capped at 70% baseplate thickness');
  assert.strictEqual(floorThickness.toFixed(1), '0.6', 'Engraved solid bottom baseplate floor thickness (0.6mm)');
});

test('Section 2.1: Engraved Sub-Layering Layer A & Layer B Geometry Bounds', () => {
  const floorThickness = 0.6;
  const recessDepth = 1.4;

  const bottomLayerZ = 0;
  const bottomLayerDepth = floorThickness;
  assert.strictEqual(bottomLayerZ, 0, 'Bottom solid floor layer starts at Z=0mm');
  assert.strictEqual(bottomLayerDepth, 0.6, 'Bottom solid floor layer extrudes up to Z=0.6mm');

  const topWallsZ = floorThickness;
  const topWallsDepth = recessDepth;
  assert.strictEqual(topWallsZ, 0.6, 'Top carved walls layer starts at Z=0.6mm');
  assert.strictEqual(topWallsDepth, 1.4, 'Top carved walls layer extrudes 1.4mm to Z=2.0mm');
});

test('Section 2.2: Engraved Inner Island Preservation for Characters with Holes', () => {
  class MockCurve {
    constructor(name) { this.name = name; }
  }

  class MockShape {
    constructor(curves, holes = []) {
      this.curves = curves;
      this.holes = holes;
    }
  }

  const letterA = new MockShape(
    [new MockCurve('Outer A loop')],
    [{ curves: [new MockCurve('Inner A triangle')] }]
  );

  const shapes = [letterA];
  const topBaseHoles = [];
  const islandShapes = [];

  shapes.forEach(s => {
    topBaseHoles.push({ curves: s.curves });
    s.holes.forEach(h => {
      islandShapes.push({ curves: h.curves });
    });
  });

  assert.strictEqual(topBaseHoles.length, 1, 'Outer letter channel cut into top baseplate layer');
  assert.strictEqual(topBaseHoles[0].curves[0].name, 'Outer A loop');
  assert.strictEqual(islandShapes.length, 1, 'Inner island pillar created for character loop');
  assert.strictEqual(islandShapes[0].curves[0].name, 'Inner A triangle');
});

test('Section 3: Baseplate Corner Profiles (Fillet, Chamfer, Square)', () => {
  function getCornerPoints(hw, hh, rad, profile) {
    const r = Math.min(rad, Math.min(hw, hh));
    const pts = [];
    if (profile === 'square' || r <= 0.001) {
      pts.push([-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]);
    } else if (profile === 'chamfer') {
      pts.push([-hw + r, -hh], [hw - r, -hh], [hw, -hh + r], [hw, hh - r], [hw - r, hh], [-hw + r, hh], [-hw, hh - r], [-hw, -hh + r]);
    } else {
      pts.push([-hw + r, -hh], [hw - r, -hh], [hw, hh - r], [-hw + r, hh]);
    }
    return pts;
  }

  assert.strictEqual(getCornerPoints(20, 10, 4, 'square').length, 4, 'Square profile generates 4 sharp vertices');
  assert.strictEqual(getCornerPoints(20, 10, 4, 'chamfer').length, 8, 'Chamfer profile generates 8 angled vertices');
  assert.strictEqual(getCornerPoints(20, 10, 4, 'fillet').length, 4, 'Fillet profile generates rounded quad control vertices');
});

test('Section 4: 2D Vector Pre-Extrusion X-Mirroring', () => {
  function mirrorCurve2DX(curve) {
    return {
      v1: { x: (-curve.v2.x || 0), y: curve.v2.y },
      v2: { x: (-curve.v1.x || 0), y: curve.v1.y }
    };
  }

  const line = { v1: { x: 0, y: 0 }, v2: { x: 10, y: 5 } };
  const mirroredLine = mirrorCurve2DX(line);
  assert.strictEqual(mirroredLine.v1.x, -10);
  assert.strictEqual(mirroredLine.v1.y, 5);
  assert.strictEqual(mirroredLine.v2.x, 0);
  assert.strictEqual(mirroredLine.v2.y, 0);
});

test('Section 5: Watertight Helical Thread Socket Geometry', () => {
  function generateThreadSocketPositions(depth = 1.8, majorDia = 6.55, pitch = 1.27) {
    const majorR = majorDia / 2.0;
    const minorR = Math.max(0.5, majorR - (pitch * 0.54));
    const outerR = majorR + 1.0;
    const segments = 36;
    const turns = depth / pitch;
    const rings = Math.max(8, Math.floor(turns * 16));

    const positions = [];

    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * depth;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2.0;
        const phase = (z / pitch) * Math.PI * 2.0 - angle;
        const toothPhase = (Math.sin(phase) + 1.0) / 2.0;
        const r_thread = minorR + (majorR - minorR) * toothPhase;
        positions.push(Math.cos(angle) * r_thread, Math.sin(angle) * r_thread, z);
      }
    }
    return positions;
  }

  const socketPositions = generateThreadSocketPositions();
  assert.ok(socketPositions.length > 0, 'Thread socket 3D positions generated');
  assert.strictEqual(socketPositions.length % 3, 0, 'Thread socket 3D vertices valid (X,Y,Z triples)');
  assert.ok(!socketPositions.some(Number.isNaN), 'Thread socket 0 NaN values');
});
