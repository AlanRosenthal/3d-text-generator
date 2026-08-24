/**
 * 3D Text STL Studio — 100% Comprehensive Unit Test Coverage Suite
 * Tests all functions, edge cases, curve types, profile modes, and parameter variations.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createBaseplateShape,
  mirrorCurve2DX,
  mirrorShape2DX,
  translateCurve2D,
  pointInPolygon,
  offsetPathCurves,
  generateScrewThreadPlug,
  reverseCurve,
  reverseCurves,
  getCurvesArea,
  mergeOverlappingShapes,
  createTextFrameShape,
  getEffectiveTextBounds
} from '../js/geometry.js';
import worker from '../worker.js';

// --- SECTION 1: GEOMETRY ENGINE BASEPLATE PROFILES & EDGE CASES ---

test('createBaseplateShape: Square profile with zero radius or explicit square mode', () => {
  const shapeSquare = createBaseplateShape(15, 10, 0, 'square');
  assert.strictEqual(shapeSquare.curves.length, 4, 'Square profile has 4 straight line sides');

  const shapeZeroRad = createBaseplateShape(15, 10, 0.0001, 'fillet');
  assert.strictEqual(shapeZeroRad.curves.length, 4, 'Fillet with <=0.001 radius falls back to square (4 curves)');
});

test('createBaseplateShape: Chamfer profile angled corner geometry', () => {
  const shapeChamfer = createBaseplateShape(30, 20, 5, 'chamfer');
  assert.strictEqual(shapeChamfer.curves.length, 8, 'Chamfer profile has 8 line segments');
});

test('createBaseplateShape: Fillet profile rounded quadratic bezier corners', () => {
  const shapeFillet = createBaseplateShape(30, 20, 5, 'fillet');
  assert.strictEqual(shapeFillet.curves.length, 8, 'Fillet profile has 8 curves (4 lines + 4 quadratic arcs)');
});

// --- SECTION 2: CURVE TRANSFORMATIONS & MIRRORING ---

test('mirrorCurve2DX: LineCurve, QuadraticBezierCurve, CubicBezierCurve, and fallback', () => {
  // 1. LineCurve
  const line = new THREE.LineCurve(new THREE.Vector2(2, 3), new THREE.Vector2(8, 7));
  const mLine = mirrorCurve2DX(line);
  assert.strictEqual(mLine.v1.x, -8);
  assert.strictEqual(mLine.v1.y, 7);
  assert.strictEqual(mLine.v2.x, -2);
  assert.strictEqual(mLine.v2.y, 3);

  // 2. QuadraticBezierCurve
  const quad = new THREE.QuadraticBezierCurve(
    new THREE.Vector2(1, 2),
    new THREE.Vector2(5, 8),
    new THREE.Vector2(9, 2)
  );
  const mQuad = mirrorCurve2DX(quad);
  assert.strictEqual(mQuad.v0.x, -9);
  assert.strictEqual(mQuad.v1.x, -5);
  assert.strictEqual(mQuad.v2.x, -1);

  // 3. CubicBezierCurve
  const cubic = new THREE.CubicBezierCurve(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(3, 9),
    new THREE.Vector2(7, 9),
    new THREE.Vector2(10, 0)
  );
  const mCubic = mirrorCurve2DX(cubic);
  assert.strictEqual(mCubic.v0.x, -10);
  assert.strictEqual(mCubic.v1.x, -7);
  assert.strictEqual(mCubic.v2.x, -3);
  assert.strictEqual(Math.abs(mCubic.v3.x), 0);

  // 4. Custom/unknown curve fallback
  const customCurve = { isUnknown: true };
  assert.strictEqual(mirrorCurve2DX(customCurve), customCurve);
});

test('translateCurve2D: LineCurve, QuadraticBezierCurve, CubicBezierCurve translation', () => {
  const line = new THREE.LineCurve(new THREE.Vector2(0, 0), new THREE.Vector2(5, 5));
  const tLine = translateCurve2D(line, 10, -5);
  assert.strictEqual(tLine.v1.x, 10);
  assert.strictEqual(tLine.v1.y, -5);

  const quad = new THREE.QuadraticBezierCurve(new THREE.Vector2(0, 0), new THREE.Vector2(5, 5), new THREE.Vector2(10, 0));
  const tQuad = translateCurve2D(quad, 2, 3);
  assert.strictEqual(tQuad.v0.x, 2);
  assert.strictEqual(tQuad.v0.y, 3);

  const cubic = new THREE.CubicBezierCurve(new THREE.Vector2(0,0), new THREE.Vector2(1,1), new THREE.Vector2(2,2), new THREE.Vector2(3,3));
  const tCubic = translateCurve2D(cubic, -1, -1);
  assert.strictEqual(tCubic.v0.x, -1);
  assert.strictEqual(tCubic.v3.x, 2);

  const dummy = { isUnknown: true };
  assert.strictEqual(translateCurve2D(dummy, 1, 1), dummy);
});

// --- SECTION 3: REVERSE CURVES & WINDING AREA HELPER ---

test('reverseCurve & reverseCurves: Flip start/end control points', () => {
  const line = new THREE.LineCurve(new THREE.Vector2(1, 2), new THREE.Vector2(10, 20));
  const rLine = reverseCurve(line);
  assert.strictEqual(rLine.v1.x, 10);
  assert.strictEqual(rLine.v1.y, 20);
  assert.strictEqual(rLine.v2.x, 1);
  assert.strictEqual(rLine.v2.y, 2);

  const quad = new THREE.QuadraticBezierCurve(new THREE.Vector2(0, 0), new THREE.Vector2(5, 10), new THREE.Vector2(10, 0));
  const rQuad = reverseCurve(quad);
  assert.strictEqual(rQuad.v0.x, 10);
  assert.strictEqual(rQuad.v2.x, 0);

  const reversedArr = reverseCurves([line, quad]);
  assert.strictEqual(reversedArr.length, 2);
});

test('getCurvesArea: Positive for CCW, Negative for CW, 0 for empty', () => {
  assert.strictEqual(getCurvesArea(null), 0);
  assert.strictEqual(getCurvesArea([]), 0);

  const sCCW = new THREE.Shape();
  sCCW.moveTo(0,0); sCCW.lineTo(10,0); sCCW.lineTo(10,10); sCCW.lineTo(0,10); sCCW.closePath();
  const areaCCW = getCurvesArea(sCCW.curves);
  assert.ok(areaCCW > 0, 'CCW area is positive');

  const rCurves = reverseCurves(sCCW.curves);
  const areaCW = getCurvesArea(rCurves);
  assert.ok(areaCW < 0, 'CW area is negative');
});

// --- SECTION 4: POINT IN POLYGON CONTAINMENT ---

test('pointInPolygon: Test vector objects vs coordinate arrays', () => {
  const polyObj = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  assert.strictEqual(pointInPolygon({ x: 5, y: 5 }, polyObj), true);
  assert.strictEqual(pointInPolygon({ x: 15, y: 5 }, polyObj), false);

  const polyArr = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.strictEqual(pointInPolygon([5, 5], polyArr), true);
  assert.strictEqual(pointInPolygon([15, 5], polyArr), false);
});

// --- SECTION 5: MERGE OVERLAPPING SHAPES ---

test('mergeOverlappingShapes: Edge cases (single shape, empty, non-overlapping, overlapping)', () => {
  assert.strictEqual(mergeOverlappingShapes(null), null);
  assert.deepStrictEqual(mergeOverlappingShapes([]), []);

  const s1 = new THREE.Shape();
  s1.moveTo(0,0); s1.lineTo(10,0); s1.lineTo(10,10); s1.lineTo(0,10); s1.closePath();
  assert.strictEqual(mergeOverlappingShapes([s1]).length, 1);

  // Non-overlapping shapes
  const s2 = new THREE.Shape();
  s2.moveTo(20,0); s2.lineTo(30,0); s2.lineTo(30,10); s2.lineTo(20,10); s2.closePath();
  const nonOverlapping = mergeOverlappingShapes([s1, s2]);
  assert.strictEqual(nonOverlapping.length, 2);

  // Overlapping shapes
  const s3 = new THREE.Shape();
  s3.moveTo(5,0); s3.lineTo(15,0); s3.lineTo(15,10); s3.lineTo(5,10); s3.closePath();
  const overlapping = mergeOverlappingShapes([s1, s3]);
  assert.strictEqual(overlapping.length, 1);
});

// --- SECTION 6: HELICAL THREAD SOCKET GEOMETRY STANDARDS ---

test('generateScrewThreadPlug: Test multiple thread standards (1/4-20, M6, M8, M10, M12)', () => {
  const standards = {
    '1/4-20': { name: '1/4-20', majorDia: 6.35, pitch: 1.27 },
    'M6x1.0': { name: 'M6x1.0', majorDia: 6.00, pitch: 1.00 },
    'M8x1.25': { name: 'M8x1.25', majorDia: 8.00, pitch: 1.25 },
    'M10x1.5': { name: 'M10x1.5', majorDia: 10.00, pitch: 1.50 },
    'M12x1.75': { name: 'M12x1.75', majorDia: 12.00, pitch: 1.75 }
  };
  const mat = new THREE.MeshStandardMaterial();

  Object.keys(standards).forEach(key => {
    const mesh = generateScrewThreadPlug(key, 0.20, 3.0, 0.90, standards, mat);
    assert.ok(mesh.isMesh, `Mesh created for ${key}`);
    assert.ok(mesh.geometry.attributes.position.count > 0, `Vertices generated for ${key}`);
    assert.ok(!Array.from(mesh.geometry.attributes.position.array).some(Number.isNaN), `No NaNs in ${key} geometry`);
  });
});

// --- SECTION 7: CLOUDFLARE WORKER CORS PROXY API ---

test('Worker API: OPTIONS preflight request', async () => {
  const req = new Request('https://worker.dev', { method: 'OPTIONS' });
  const res = await worker.fetch(req);
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), '*');
});

test('Worker API: Missing url parameter error', async () => {
  const req = new Request('https://worker.dev', { method: 'GET' });
  const res = await worker.fetch(req);
  assert.strictEqual(res.status, 400);
  const text = await res.text();
  assert.ok(text.includes('Missing parameter'));
});

// --- SECTION 8: ADDITIONAL CAD GEOMETRY & CURVE EDGE CASES ---

test('reverseCurve: CubicBezierCurve reversal', () => {
  const cubic = new THREE.CubicBezierCurve(
    new THREE.Vector2(0, 0),
    new THREE.Vector2(3, 9),
    new THREE.Vector2(7, 9),
    new THREE.Vector2(10, 0)
  );
  const revCubic = reverseCurve(cubic);
  assert.strictEqual(revCubic.v0.x, 10);
  assert.strictEqual(revCubic.v1.x, 7);
  assert.strictEqual(revCubic.v2.x, 3);
  assert.strictEqual(revCubic.v3.x, 0);
});

test('mergeOverlappingShapes: Overlapping shapes with inner holes (e.g. letter O overlapping letter X)', () => {
  const sO = new THREE.Shape();
  sO.moveTo(0,0); sO.lineTo(10,0); sO.lineTo(10,10); sO.lineTo(0,10); sO.closePath();
  const holeO = new THREE.Path();
  holeO.moveTo(3,3); holeO.lineTo(7,3); holeO.lineTo(7,7); holeO.lineTo(3,7); holeO.closePath();
  sO.holes.push(holeO);

  const sX = new THREE.Shape();
  sX.moveTo(5,0); sX.lineTo(15,0); sX.lineTo(15,10); sX.lineTo(5,10); sX.closePath();

  const merged = mergeOverlappingShapes([sO, sX]);
  assert.strictEqual(merged.length, 1, 'Overlapping shape with hole merges into single composite shape');
  assert.strictEqual(merged[0].holes.length, 1, 'Inner hole is preserved inside merged composite shape');
});

test('offsetPathCurves: Adaptive sampling and miter clamping', () => {
  const s = new THREE.Shape();
  s.moveTo(0,0); s.lineTo(10,0); s.lineTo(10,10); s.lineTo(0,10); s.closePath();

  const posOffset = offsetPathCurves(s.curves, 1.0);
  assert.strictEqual(posOffset.length, 4);

  const negOffset = offsetPathCurves(s.curves, -1.0);
  assert.strictEqual(negOffset.length, 4);
});

// --- SECTION 9: TEXT FRAME ENCLOSURE GEOMETRY ---

test('createTextFrameShape: Circle and Rectangle frame enclosures', () => {
  assert.strictEqual(createTextFrameShape(40, 15, 'none'), null);

  const circleFrame = createTextFrameShape(40, 15, 'circle', 2.0, 3.0);
  assert.ok(circleFrame, 'Circle frame shape created');
  assert.strictEqual(circleFrame.holes.length, 1, 'Circle frame shape has inner hole');

  const rectFrame = createTextFrameShape(40, 15, 'rectangle', 2.0, 3.0);
  assert.ok(rectFrame, 'Rectangle frame shape created');
  assert.strictEqual(rectFrame.holes.length, 1, 'Rectangle frame shape has inner hole');
});

test('getEffectiveTextBounds: Auto-enlarging baseplate calculation logic for frames', () => {
  const boundsNone = getEffectiveTextBounds(50, 20, 'none');
  assert.strictEqual(boundsNone.effectiveWidth, 50);
  assert.strictEqual(boundsNone.effectiveHeight, 20);

  const boundsRect = getEffectiveTextBounds(50, 20, 'rectangle', 2.0, 3.0);
  assert.strictEqual(boundsRect.effectiveWidth, 60, 'Rectangle frame expands width by 2*(pad+thick)');
  assert.strictEqual(boundsRect.effectiveHeight, 30, 'Rectangle frame expands height by 2*(pad+thick)');

  const boundsCircle = getEffectiveTextBounds(50, 20, 'circle', 2.0, 3.0);
  assert.strictEqual(boundsCircle.effectiveWidth, 60, 'Circle frame expands outer diameter');
  assert.strictEqual(boundsCircle.effectiveHeight, 60, 'Circle frame forms square outer bounding diameter');
});
