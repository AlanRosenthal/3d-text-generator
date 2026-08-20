/**
 * 3D Text STL Studio — CAD Geometry Engine & Vector Math Module
 * Handles 2D vector transformations, helical screw thread generation,
 * polygon containment, and baseplate corner profile calculations.
 */

import * as THREE from 'three';

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
  const pts = tempPath.getPoints(Math.max(12, curves.length * 4));
  if (!pts || pts.length < 3) return curves;

  const newPath = new THREE.Path();
  const n = pts.length;

  for (let i = 0; i < n - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);

    if (len < 0.0001) continue;

    const nx = -dy / len;
    const ny = dx / len;

    const o1 = new THREE.Vector2(p1.x + nx * offset, p1.y + ny * offset);
    const o2 = new THREE.Vector2(p2.x + nx * offset, p2.y + ny * offset);

    if (i === 0) {
      newPath.moveTo(o1.x, o1.y);
    }
    newPath.lineTo(o2.x, o2.y);
  }

  return newPath.curves;
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
