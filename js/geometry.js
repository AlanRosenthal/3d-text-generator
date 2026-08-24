/**
 * 3D Text STL Studio — CAD Geometry Engine & Vector Math Module
 * Handles 2D vector transformations, helical screw thread generation,
 * polygon containment, and baseplate corner profile calculations.
 */

import * as THREE from 'three';
import polygonClipping from 'polygon-clipping';

// Calculate effective 2D bounds enclosing text and text frame enclosure
export function getEffectiveTextBounds(textWidth, textHeight, frameType = 'none', frameThickness = 2.0, framePadding = 3.0) {
  let effectiveWidth = textWidth;
  let effectiveHeight = textHeight;

  if (frameType && frameType !== 'none') {
    if (frameType === 'circle') {
      const rxOuter = (textWidth / 2) + framePadding + frameThickness;
      const ryOuter = (textHeight / 2) + framePadding + frameThickness;
      const rOuter = Math.max(rxOuter, ryOuter);
      effectiveWidth = rOuter * 2;
      effectiveHeight = rOuter * 2;
    } else {
      effectiveWidth = textWidth + (framePadding * 2) + (frameThickness * 2);
      effectiveHeight = textHeight + (framePadding * 2) + (frameThickness * 2);
    }
  }

  return { effectiveWidth, effectiveHeight };
}

// Create 2D Text Frame Enclosure Shape (Circle or Rectangle Frame around text)
export function createTextFrameShape(textWidth, textHeight, frameType = 'none', frameThickness = 2.0, framePadding = 3.0) {
  if (!frameType || frameType === 'none') return null;

  const shape = new THREE.Shape();

  if (frameType === 'circle') {
    const rxOuter = (textWidth / 2) + framePadding + frameThickness;
    const ryOuter = (textHeight / 2) + framePadding + frameThickness;
    const rOuter = Math.max(rxOuter, ryOuter);

    const rxInner = (textWidth / 2) + framePadding;
    const ryInner = (textHeight / 2) + framePadding;
    const rInner = Math.max(rxInner, ryInner);

    shape.absarc(0, 0, rOuter, 0, Math.PI * 2, false);

    const holePath = new THREE.Path();
    holePath.absarc(0, 0, rInner, 0, Math.PI * 2, true);
    shape.holes.push(holePath);
  } else {
    // Rectangle frame
    const hwOuter = (textWidth / 2) + framePadding + frameThickness;
    const hhOuter = (textHeight / 2) + framePadding + frameThickness;
    const radOuter = Math.min(4.0, Math.min(hwOuter, hhOuter));

    const hwInner = (textWidth / 2) + framePadding;
    const hhInner = (textHeight / 2) + framePadding;
    const radInner = Math.min(3.0, Math.min(hwInner, hhInner));

    const outerShape = createBaseplateShape(hwOuter, hhOuter, radOuter, 'fillet');
    shape.curves = outerShape.curves;

    const innerShape = createBaseplateShape(hwInner, hhInner, radInner, 'fillet');
    const holePath = new THREE.Path();
    const area = getCurvesArea(innerShape.curves);
    holePath.curves = area > 0 ? reverseCurves(innerShape.curves) : innerShape.curves;
    shape.holes.push(holePath);
  }

  return shape;
}

// Merge overlapping 2D THREE.Shape objects into unified non-intersecting composite shapes
export function mergeOverlappingShapes(shapes) {
  if (!shapes || shapes.length <= 1) return shapes;

  try {
    const multi = [];
    shapes.forEach(shape => {
      const outerPts = shape.getPoints(12);
      if (!outerPts || outerPts.length < 3) return;
      if (outerPts[0].distanceTo(outerPts[outerPts.length - 1]) > 1e-4) {
        outerPts.push(outerPts[0].clone());
      }
      const outerCoords = outerPts.map(p => [p.x, p.y]);
      const poly = [outerCoords];

      shape.holes.forEach(hole => {
        const holePts = hole.getPoints(12);
        if (holePts && holePts.length >= 3) {
          if (holePts[0].distanceTo(holePts[holePts.length - 1]) > 1e-4) {
            holePts.push(holePts[0].clone());
          }
          poly.push(holePts.map(p => [p.x, p.y]));
        }
      });

      multi.push(poly);
    });

    if (multi.length === 0) return shapes;

    const merged = polygonClipping.union(...multi);
    const resultShapes = [];

    merged.forEach(polyCoords => {
      if (!polyCoords || polyCoords.length === 0) return;
      const outerRing = polyCoords[0];
      if (!outerRing || outerRing.length < 3) return;

      const shape = new THREE.Shape();
      shape.moveTo(outerRing[0][0], outerRing[0][1]);
      for (let i = 1; i < outerRing.length; i++) {
        shape.lineTo(outerRing[i][0], outerRing[i][1]);
      }

      for (let h = 1; h < polyCoords.length; h++) {
        const holeRing = polyCoords[h];
        if (holeRing && holeRing.length >= 3) {
          const holePath = new THREE.Path();
          holePath.moveTo(holeRing[0][0], holeRing[0][1]);
          for (let i = 1; i < holeRing.length; i++) {
            holePath.lineTo(holeRing[i][0], holeRing[i][1]);
          }
          shape.holes.push(holePath);
        }
      }

      resultShapes.push(shape);
    });

    return resultShapes.length > 0 ? resultShapes : shapes;
  } catch (err) {
    console.warn('Polygon merging warning:', err);
    return shapes;
  }
}

// Reverse a single THREE curve direction (swaps start and end control points)
export function reverseCurve(c) {
  if (c.isLineCurve) {
    return new THREE.LineCurve(c.v2.clone(), c.v1.clone());
  } else if (c.isQuadraticBezierCurve) {
    const p0 = c.v0 || c.v1;
    const p1 = c.v1 || c.v2;
    const p2 = c.v2;
    return new THREE.QuadraticBezierCurve(p2.clone(), p1.clone(), p0.clone());
  } else if (c.isCubicBezierCurve) {
    const p0 = c.v0 || c.v1;
    const p1 = c.v1 || c.v2;
    const p2 = c.v2 || c.v3;
    const p3 = c.v3;
    return new THREE.CubicBezierCurve(p3.clone(), p2.clone(), p1.clone(), p0.clone());
  }
  return c;
}

// Reverse array of curves to flip winding direction (CCW -> CW or CW -> CCW)
export function reverseCurves(curves) {
  const rev = [];
  for (let i = curves.length - 1; i >= 0; i--) {
    rev.push(reverseCurve(curves[i]));
  }
  return rev;
}

// Calculate signed 2D area of an array of curves (Positive = CCW, Negative = CW)
export function getCurvesArea(curves) {
  if (!curves || curves.length === 0) return 0;
  const tempPath = new THREE.Path();
  tempPath.curves = curves;
  const pts = tempPath.getPoints(Math.max(12, curves.length * 4));
  if (!pts || pts.length < 3) return 0;
  return THREE.ShapeUtils.area(pts);
}

// Create Baseplate 2D Shape with Corner Profile (Fillet, Chamfer, Square)
export function createBaseplateShape(hw, hh, rad, profile = 'fillet') {
  const shape = new THREE.Shape();
  const r = Math.min(rad, Math.min(hw, hh));

  if (profile === 'square' || r <= 0.001) {
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.lineTo(-hw, -hh);
  } else if (profile === 'chamfer') {
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.lineTo(hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.lineTo(hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.lineTo(-hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.lineTo(-hw + r, -hh);
  } else {
    // Fillet (Round)
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    shape.lineTo(hw, hh - r);
    shape.quadraticCurveTo(hw, hh, hw - r, hh);
    shape.lineTo(-hw + r, hh);
    shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    shape.lineTo(-hw, -hh + r);
    shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  }
  return shape;
}

// Mirror 2D curve on X axis (x -> -x) with curve direction reversal
export function mirrorCurve2DX(curve) {
  if (curve.isLineCurve) {
    return new THREE.LineCurve(
      new THREE.Vector2(-curve.v2.x, curve.v2.y),
      new THREE.Vector2(-curve.v1.x, curve.v1.y)
    );
  } else if (curve.isQuadraticBezierCurve) {
    const p0 = curve.v0 || curve.v1;
    const p1 = curve.v1 || curve.v2;
    const p2 = curve.v2;
    return new THREE.QuadraticBezierCurve(
      new THREE.Vector2(-p2.x, p2.y),
      new THREE.Vector2(-p1.x, p1.y),
      new THREE.Vector2(-p0.x, p0.y)
    );
  } else if (curve.isCubicBezierCurve) {
    const p0 = curve.v0 || curve.v1;
    const p1 = curve.v1 || curve.v2;
    const p2 = curve.v2 || curve.v3;
    const p3 = curve.v3;
    return new THREE.CubicBezierCurve(
      new THREE.Vector2(-p3.x, p3.y),
      new THREE.Vector2(-p2.x, p2.y),
      new THREE.Vector2(-p1.x, p1.y),
      new THREE.Vector2(-p0.x, p0.y)
    );
  }
  return curve;
}

// Mirror 2D THREE.Shape on X axis
export function mirrorShape2DX(shape) {
  const newShape = new THREE.Shape();
  for (let i = shape.curves.length - 1; i >= 0; i--) {
    newShape.curves.push(mirrorCurve2DX(shape.curves[i]));
  }
  shape.holes.forEach(h => {
    const newHole = new THREE.Path();
    for (let j = h.curves.length - 1; j >= 0; j--) {
      newHole.curves.push(mirrorCurve2DX(h.curves[j]));
    }
    newShape.holes.push(newHole);
  });
  return newShape;
}

// Translate 2D vector curve by (dx, dy)
export function translateCurve2D(curve, dx, dy) {
  if (curve.isLineCurve) {
    return new THREE.LineCurve(
      new THREE.Vector2(curve.v1.x + dx, curve.v1.y + dy),
      new THREE.Vector2(curve.v2.x + dx, curve.v2.y + dy)
    );
  } else if (curve.isQuadraticBezierCurve) {
    const p0 = curve.v0 || curve.v1;
    const p1 = curve.v1 || curve.v2;
    const p2 = curve.v2;
    return new THREE.QuadraticBezierCurve(
      new THREE.Vector2(p0.x + dx, p0.y + dy),
      new THREE.Vector2(p1.x + dx, p1.y + dy),
      new THREE.Vector2(p2.x + dx, p2.y + dy)
    );
  } else if (curve.isCubicBezierCurve) {
    const p0 = curve.v0 || curve.v1;
    const p1 = curve.v1 || curve.v2;
    const p2 = curve.v2 || curve.v3;
    const p3 = curve.v3;
    return new THREE.CubicBezierCurve(
      new THREE.Vector2(p0.x + dx, p0.y + dy),
      new THREE.Vector2(p1.x + dx, p1.y + dy),
      new THREE.Vector2(p2.x + dx, p2.y + dy),
      new THREE.Vector2(p3.x + dx, p3.y + dy)
    );
  }
  return curve;
}

// Pure 2D Point-in-Polygon Containment Test (Ray-casting Algorithm)
export function pointInPolygon(point, vs) {
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

// Bolden 2D vector curve contour by offsetting vertices along local normals
export function offsetPathCurves(curves, offset) {
  if (!offset || !curves || curves.length === 0) return curves;

  const tempPath = new THREE.Path();
  tempPath.curves = curves;
  const pts = tempPath.getPoints(Math.min(24, Math.max(10, curves.length * 2)));
  if (!pts || pts.length < 3) return curves;

  if (pts[0].distanceTo(pts[pts.length - 1]) < 1e-4) pts.pop();
  const n = pts.length;
  if (n < 3) return curves;

  const isClockwise = THREE.ShapeUtils.area(pts) < 0;
  const sign = isClockwise ? -1 : 1;

  const newPts = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const curr = pts[i];
    const next = pts[(i + 1) % n];

    const e1x = curr.x - prev.x, e1y = curr.y - prev.y;
    const len1 = Math.hypot(e1x, e1y) || 1;
    const n1x = (e1y / len1) * sign, n1y = (-e1x / len1) * sign;

    const e2x = next.x - curr.x, e2y = next.y - curr.y;
    const len2 = Math.hypot(e2x, e2y) || 1;
    const n2x = (e2y / len2) * sign, n2y = (-e2x / len2) * sign;

    let nx = n1x + n2x, ny = n1y + n2y;
    const norm = Math.hypot(nx, ny) || 1;
    nx /= norm;
    ny /= norm;

    const dot = n1x * n2x + n1y * n2y;
    const miterScale = Math.min(2.0, 1.0 / Math.max(0.3, Math.sqrt((1 + dot) / 2)));
    const effOffset = offset * miterScale;

    newPts.push(new THREE.Vector2(curr.x + nx * effOffset, curr.y + ny * effOffset));
  }
  newPts.push(newPts[0].clone());

  const newCurves = [];
  for (let j = 0; j < newPts.length - 1; j++) {
    newCurves.push(new THREE.LineCurve(newPts[j], newPts[j + 1]));
  }
  return newCurves;
}

// Generate Watertight Tapped Helical Thread Socket Geometry
export function generateScrewThreadPlug(threadStandard, mountHoleOffset, baseplateThickness, mountHoleDepthRatio, threadStandards, material) {
  const spec = threadStandards[threadStandard] || threadStandards['1/4-20'];
  const majorDia = spec.majorDia + mountHoleOffset;
  const pitch = spec.pitch;
  const depth = baseplateThickness * mountHoleDepthRatio;

  const majorR = majorDia / 2;
  const minorR = Math.max(0.3, majorR - (pitch * 0.54));
  const wallThick = 1.0;
  const outerR = majorR + wallThick;

  const segments = 36;
  const turns = depth / pitch;
  const rings = Math.max(8, Math.floor(turns * 16));

  const geom = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];

  // Ring 0: Inner Thread Surface Vertices (Z=0 to Z=depth)
  const idxInnerStart = 0;
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

  // Ring 1: Outer Plug Cylinder Wall Vertices (Z=0 to Z=depth)
  const idxOuterStart = positions.length / 3;
  for (let r = 0; r <= rings; r++) {
    const z = (r / rings) * depth;
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * outerR, Math.sin(angle) * outerR, z);
    }
  }

  // Top Cap Center Vertex (Z=depth)
  const idxCapCenter = positions.length / 3;
  positions.push(0, 0, depth);

  // --- TRIANGLES ---

  // 1. Inner Thread Surface (Facing Inward to hole)
  for (let r = 0; r < rings; r++) {
    const r1 = idxInnerStart + r * segments;
    const r2 = idxInnerStart + (r + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      indices.push(r1 + s, r1 + sNext, r2 + s);
      indices.push(r1 + sNext, r2 + sNext, r2 + s);
    }
  }

  // 2. Outer Plug Cylinder Wall (Facing Outward)
  for (let r = 0; r < rings; r++) {
    const r1 = idxOuterStart + r * segments;
    const r2 = idxOuterStart + (r + 1) * segments;
    for (let s = 0; s < segments; s++) {
      const sNext = (s + 1) % segments;
      indices.push(r1 + s, r2 + s, r1 + sNext);
      indices.push(r1 + sNext, r2 + s, r2 + sNext);
    }
  }

  // 3. Bottom Ring Annulus at Z=0
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    const in1 = idxInnerStart + s;
    const in2 = idxInnerStart + sNext;
    const out1 = idxOuterStart + s;
    const out2 = idxOuterStart + sNext;
    indices.push(in1, in2, out1);
    indices.push(in2, out2, out1);
  }

  // 4. Top Cap Annulus at Z=depth
  const topInnerStart = idxInnerStart + rings * segments;
  const topOuterStart = idxOuterStart + rings * segments;
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    const in1 = topInnerStart + s;
    const in2 = topInnerStart + sNext;
    const out1 = topOuterStart + s;
    const out2 = topOuterStart + sNext;
    indices.push(in1, out1, in2);
    indices.push(in2, out1, out2);
  }

  // 5. Blind Hole Cap Disc at Z=depth
  for (let s = 0; s < segments; s++) {
    const sNext = (s + 1) % segments;
    const in1 = topInnerStart + s;
    const in2 = topInnerStart + sNext;
    indices.push(in1, in2, idxCapCenter);
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  return new THREE.Mesh(geom, material);
}
