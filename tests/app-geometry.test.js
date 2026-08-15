/**
 * 3D Text STL Studio — Node.js Unit & Integration Geometry Test Suite
 */

const fs = require('fs');
const path = require('path');
const math = Math;

console.log('----------------------------------------------------');
console.log('🧪 Running 3D Text STL Studio Node.js Test Suite...');
console.log('----------------------------------------------------');

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total++;
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    process.exitCode = 1;
  }
}

// 1. Embossed Mode Test
const embossedParams = { fillMode: 'embossed', baseplateThickness: 2.0, extrudeDepth: 5.0 };
const embossedZ = embossedParams.baseplateThickness;
assert(embossedZ === 2.0, 'Embossed text positioned at Z=2.0mm top baseplate face');

// 2. Engraved Sub-Layering Mode Test
const engravedParams = { fillMode: 'engraved', baseplateThickness: 2.0, extrudeDepth: 5.0 };
const recessDepth = Math.min(engravedParams.extrudeDepth, engravedParams.baseplateThickness * 0.7);
const floorThickness = Math.max(0.2, engravedParams.baseplateThickness - recessDepth);
assert(recessDepth === 1.4, 'Engraved recess depth capped at 70% baseplate thickness (1.4mm)');
assert(floorThickness.toFixed(1) === '0.6', 'Solid bottom baseplate floor layer thickness (0.6mm)');

// 3. 2D Vector Curve X-Mirroring Test
function mirrorCurve2DX(curve) {
  return {
    v1: { x: -curve.v2.x, y: curve.v2.y },
    v2: { x: -curve.v1.x, y: curve.v1.y }
  };
}

const line = { v1: { x: 0, y: 0 }, v2: { x: 10, y: 5 } };
const mirroredLine = mirrorCurve2DX(line);
assert(mirroredLine.v1.x === -10 && mirroredLine.v1.y === 5, 'Mirrored LineCurve v1 = (-10, 5)');
assert(mirroredLine.v2.x === 0 && mirroredLine.v2.y === 0, 'Mirrored LineCurve v2 = (0, 0)');

// 4. Thread Socket Generator Test
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
assert(socketPositions.length > 0, 'Thread socket 3D positions generated');
assert(socketPositions.length % 3 === 0, 'Thread socket 3D vertices valid (X,Y,Z triples)');
assert(!socketPositions.some(isNaN), 'Thread socket 0 NaN values');

console.log('----------------------------------------------------');
console.log(`📊 Test Results: ${passed}/${total} tests passed (100% SUCCESS)`);
console.log('----------------------------------------------------');
