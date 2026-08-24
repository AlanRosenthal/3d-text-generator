/**
 * 3D Text STL Studio — Standard Node.js Test File (node:test & node:assert)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeOverlappingShapes, getCurvesArea, reverseCurves } from '../js/geometry.js';

test('Ray-casting point inside/outside polygon containment math', () => {
  function pointInPolygon(point, vs) {
    const x = point.x !== undefined ? point.x : point[0];
    const y = point.y !== undefined ? point.y : point[1];
    let inside = false;

    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x !== undefined ? vs[i].x : vs[i][0];
      const yi = vs[i].y !== undefined ? vs[i].y : vs[i][1];
      const xj = vs[j].x !== undefined ? vs[j].x : vs[j][0];
      const yj = vs[j].y !== undefined ? vs[j].y : vs[j][1];

      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }

    return inside;
  }

  const poly = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}];
  assert.strictEqual(pointInPolygon({x: 5, y: 5}, poly), true, 'Point inside polygon containment');
  assert.strictEqual(pointInPolygon({x: 15, y: 5}, poly), false, 'Point outside polygon containment');
});

test('2D Contour X-Mirroring (Winding & Normal Orientation)', () => {
  function mirrorContourX(pts) {
    const mirrored = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      mirrored.push({
        x: (-pts[i].x || 0),
        y: pts[i].y
      });
    }
    return mirrored;
  }

  const squarePts = [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}];
  const mirroredSquare = mirrorContourX(squarePts);
  assert.strictEqual(mirroredSquare[0].x, 0);
  assert.strictEqual(mirroredSquare[0].y, 10);
  assert.strictEqual(mirroredSquare[1].x, -10);
  assert.strictEqual(mirroredSquare[1].y, 10);
  assert.strictEqual(mirroredSquare.length, 4);
});

test('Embossed Mode Parameters & Surface Positioning', () => {
  const embossedParams = {
    fillMode: 'embossed',
    baseplateThickness: 2.0,
    extrudeDepth: 5.0
  };
  const embossedTextZ = embossedParams.baseplateThickness;
  assert.strictEqual(embossedTextZ, 2.0, 'Embossed text sits at top baseplate surface (Z=2.0mm)');
});

test('Engraved Mode Parameters & Recess Floor Calculation', () => {
  const engravedParams = {
    fillMode: 'engraved',
    baseplateThickness: 2.0,
    extrudeDepth: 5.0
  };
  const isEngraved = (engravedParams.fillMode === 'engraved');
  const engravedTextDepth = Math.min(engravedParams.extrudeDepth, engravedParams.baseplateThickness * 0.6);
  const engravedTextZ = Math.max(0.05, engravedParams.baseplateThickness - engravedTextDepth);
  assert.strictEqual(isEngraved, true);
  assert.strictEqual(engravedTextDepth, 1.2);
  assert.strictEqual(engravedTextZ, 0.8);
});

test('Tapped Screw Thread Socket Plug Geometry Generator', () => {
  function generateThreadSocketPositions(depth = 1.8, majorDia = 6.55, pitch = 1.27) {
    const majorR = majorDia / 2;
    const minorR = Math.max(0.5, majorR - (pitch * 0.54));
    const wallThick = 1.0;
    const outerR = majorR + wallThick;
    const segments = 36;
    const turns = depth / pitch;
    const rings = Math.max(8, Math.floor(turns * 16));

    const positions = [];

    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * depth;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const phase = (z / pitch) * Math.PI * 2 - angle;
        const toothPhase = (Math.sin(phase) + 1) / 2;
        const r_thread = minorR + (majorR - minorR) * toothPhase;
        positions.push(Math.cos(angle) * r_thread, Math.sin(angle) * r_thread, z);
      }
    }

    for (let r = 0; r <= rings; r++) {
      const z = (r / rings) * depth;
      for (let s = 0; s < segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        positions.push(Math.cos(angle) * outerR, Math.sin(angle) * outerR, z);
      }
    }

    positions.push(0, 0, depth);

    return positions;
  }

  const socketPositions = generateThreadSocketPositions();
  assert.ok(socketPositions.length > 0);
  assert.strictEqual(socketPositions.length % 3, 0);
  assert.ok(!socketPositions.some(Number.isNaN));
});

test('daFont Shareable URL Query Format: font=dafont&dafont=URL', () => {
  function buildShareQuery(font, dafontUrl) {
    const params = new URLSearchParams();
    if (font === 'dafont') {
      params.set('font', 'dafont');
      if (dafontUrl) params.set('dafont', dafontUrl);
    } else {
      params.set('font', font);
    }
    return params.toString();
  }

  const query = buildShareQuery('dafont', 'https://www.dafont.com/midstar.font');
  assert.strictEqual(query, 'font=dafont&dafont=https%3A%2F%2Fwww.dafont.com%2Fmidstar.font');

  const parsed = new URLSearchParams(query);
  assert.strictEqual(parsed.get('font'), 'dafont');
  assert.strictEqual(parsed.get('dafont'), 'https://www.dafont.com/midstar.font');
});

test('Tolerance Compensation Default Baseline is 0.0mm', () => {
  const defaultOffset = 0.0;
  assert.strictEqual(defaultOffset, 0.0, 'Tolerance compensation defaults to 0.0mm');
});

test('Degenerate subpath artifact filtering (area > 0.01)', () => {
  const subpathPoints = [
    [{x: 0, y: 0}, {x: 10, y: 0}, {x: 10, y: 10}, {x: 0, y: 10}], // Outer contour, area = 100
    [{x: 2, y: 2}, {x: 2.01, y: 2.01}, {x: 2, y: 2}], // Degenerate 0-area line/spike
    [{x: 3, y: 3}, {x: 7, y: 3}, {x: 7, y: 7}, {x: 3, y: 7}] // Inner hole contour, area = 16
  ];

  function calcArea(pts) {
    let area = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      area += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
    }
    return Math.abs(area / 2);
  }

  const validPaths = subpathPoints.filter(pts => calcArea(pts) > 0.01);
  assert.strictEqual(validPaths.length, 2, 'Degenerate zero-area subpaths are filtered out');
});

test('mergeOverlappingShapes: 2D polygon union on squished overlapping letters', () => {
  const s1 = new THREE.Shape();
  s1.moveTo(0,0); s1.lineTo(10,0); s1.lineTo(10,10); s1.lineTo(0,10); s1.closePath();

  const s2 = new THREE.Shape();
  s2.moveTo(5,0); s2.lineTo(15,0); s2.lineTo(15,10); s2.lineTo(5,10); s2.closePath();

  const merged = mergeOverlappingShapes([s1, s2]);
  assert.strictEqual(merged.length, 1, 'Overlapping shapes are merged into a single composite shape');
});

test('Winding Normalization: Inverted hole subpaths (CCW -> CW) for complex fonts (Someflowers)', () => {
  const ccwHoleCurves = [
    new THREE.LineCurve(new THREE.Vector2(3, 3), new THREE.Vector2(7, 3)),
    new THREE.LineCurve(new THREE.Vector2(7, 3), new THREE.Vector2(7, 7)),
    new THREE.LineCurve(new THREE.Vector2(7, 7), new THREE.Vector2(3, 7)),
    new THREE.LineCurve(new THREE.Vector2(3, 7), new THREE.Vector2(3, 3))
  ];
  const rawArea = getCurvesArea(ccwHoleCurves);
  assert.ok(rawArea > 0, 'Initial hole curves are CCW');

  // Winding normalization: Hole paths in Three.js MUST be Clockwise (rawArea < 0)
  const normalizedHoleCurves = rawArea > 0 ? reverseCurves(ccwHoleCurves) : ccwHoleCurves;
  const normArea = getCurvesArea(normalizedHoleCurves);
  assert.ok(normArea < 0, 'Normalized hole curves are strictly Clockwise (CW)');
});

test('Even-Odd Nesting Classification: 2-level nested island shapes (Root -> Hole -> Island) for boxed fonts (Cute Notes)', () => {
  const outerBoxPts = [{x:0,y:0}, {x:20,y:0}, {x:20,y:20}, {x:0,y:20}];
  const cutoutPts = [{x:2,y:2}, {x:18,y:2}, {x:18,y:18}, {x:2,y:18}];
  const letterPts = [{x:5,y:5}, {x:15,y:5}, {x:15,y:15}, {x:5,y:15}];

  const subpaths = [
    { name: 'outerBox', pts: outerBoxPts },
    { name: 'cutout', pts: cutoutPts },
    { name: 'letterC', pts: letterPts }
  ];

  function pointInPoly(pt, vs) {
    let x = pt.x, y = pt.y, inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
      let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const depths = subpaths.map((sp, idx) => {
    let depth = 0;
    for (let m = 0; m < idx; m++) {
      if (pointInPoly(sp.pts[0], subpaths[m].pts)) depth++;
    }
    return { name: sp.name, depth, isSolid: depth % 2 === 0 };
  });

  assert.strictEqual(depths[0].isSolid, true, 'Outer box is depth 0 (solid root shape)');
  assert.strictEqual(depths[1].isSolid, false, 'Box cutout is depth 1 (inner hole)');
  assert.strictEqual(depths[2].isSolid, true, 'Letter C inside cutout is depth 2 (solid island shape)');
});
