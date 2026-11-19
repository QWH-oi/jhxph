import * as THREE from 'three';
import {
  PHASE_META,
  vleCurve,
  azeotrope as findAzeotrope,
  binaryPurePoints,
  bubbleAtComposition,
  dewAtComposition,
} from '../science.js';
import {
  makeTextSprite,
  makeGlowSprite,
  makeRingSprite,
  createLine,
  createTube,
  disposeObject,
} from './labels.js';

const W = 10.0;
const D = 9.2;
const H = 5.9;
const X_MIN = -W / 2;
const X_MAX = W / 2;
const Z_MIN = -D / 2;
const Z_MAX = D / 2;

const COLORS = {
  bubble: '#2dd4bf',
  dew: '#fbbf24',
  tie: '#f0abfc',
  azeotrope: '#f0abfc',
  liquid: '#2dd4bf',
  vapor: '#fbbf24',
  grid: 0x0d3344,
};

function makeStateLabel(text, color) {
  return makeTextSprite(text, {
    fontSize: 26,
    color,
    background: true,
    border: true,
    height: 0.34,
    weight: 500,
    opacity: 0.94,
    padding: 12,
  });
}

export class BinaryScene {
  constructor(scene, system, P_atm) {
    this.scene = scene;
    this.system = system;
    this.P_atm = P_atm;
    this.group = new THREE.Group();
    this.labelsGroup = new THREE.Group();
    this.pickables = [];
    this.markerPos = new THREE.Vector3();
    this.markerTarget = new THREE.Vector3();
    this.liquidPos = new THREE.Vector3();
    this.vaporPos = new THREE.Vector3();
    this.overallColor = new THREE.Color('#2dd4bf');
    this.labelTimer = 0;
    this.pulse = 0;
    this.visible = true;
    this.built = false;
    this.scene.add(this.group);
    this.scene.add(this.labelsGroup);
    this.rebuild();
  }

  setContext(system, P_atm) {
    if (this.system?.id === system.id && Math.abs(this.P_atm - P_atm) < 1e-9 && this.built) {
      return false;
    }
    const changed = this.system?.id !== system.id || Math.abs(this.P_atm - P_atm) >= 1e-9;
    this.system = system;
    this.P_atm = P_atm;
    if (changed || !this.built) this.rebuild();
    return changed || !this.built;
  }

  mapX(value) {
    return X_MIN + value * W;
  }

  mapZ(value) {
    return Z_MIN + value * D;
  }

  mapT(T) {
    const u = (T - this.Tmin) / Math.max(1e-6, this.Tmax - this.Tmin);
    return 0.3 + Math.min(1, Math.max(0, u)) * H;
  }

  rebuild() {
    this.disposeContent();
    this.group = new THREE.Group();
    this.group.name = 'binary-phase-scene';
    this.labelsGroup = new THREE.Group();
    this.labelsGroup.name = 'binary-labels';
    this.scene.add(this.group);
    this.scene.add(this.labelsGroup);
    this.pickables = [];
    this.built = true;

    this.curve = vleCurve(this.system, this.P_atm);
    this.azeo = findAzeotrope(this.system, this.P_atm);
    this.pure = binaryPurePoints(this.system, this.P_atm);
    const pad = 5;
    this.Tmin = Math.floor(this.curve.Tmin - pad);
    this.Tmax = Math.ceil(this.curve.Tmax + pad);
    if (this.Tmax - this.Tmin < 18) this.Tmax = this.Tmin + 18;

    this.buildFloor();
    this.buildAxes();
    this.buildCurves();
    this.buildLens();
    this.buildTieLines();
    this.buildKeyPoints();
    this.buildStateMarkers();
    this.buildLabels();
  }

  disposeContent() {
    if (this.group) {
      disposeObject(this.group);
      this.scene.remove(this.group);
    }
    if (this.labelsGroup) {
      disposeObject(this.labelsGroup);
      this.scene.remove(this.labelsGroup);
    }
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9.6, 96),
      new THREE.MeshBasicMaterial({
        color: 0x04131d,
        transparent: true,
        opacity: 0.52,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.07;
    this.group.add(floor);

    const grid = new THREE.GridHelper(18, 20, COLORS.grid, 0x061c29);
    grid.position.y = -0.045;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    grid.material.depthWrite = false;
    this.group.add(grid);

    const ring = createLine(
      Array.from({ length: 101 }, (_, i) => {
        const a = (i / 100) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * 7.9, -0.03, Math.sin(a) * 7.9);
      }),
      0x1e6c80,
      0.28,
    );
    this.group.add(ring);

    // 组成定义域的地面框架，帮助辨认 x/y 轴
    const domainFrame = createLine(
      [
        new THREE.Vector3(this.mapX(0), 0.015, this.mapZ(0)),
        new THREE.Vector3(this.mapX(1), 0.015, this.mapZ(0)),
        new THREE.Vector3(this.mapX(1), 0.015, this.mapZ(1)),
        new THREE.Vector3(this.mapX(0), 0.015, this.mapZ(1)),
        new THREE.Vector3(this.mapX(0), 0.015, this.mapZ(0)),
      ],
      0x2e7b92,
      0.45,
    );
    domainFrame.renderOrder = 4;
    this.group.add(domainFrame);

    // x = y 对角线
    const diagonal = createLine(
      [
        new THREE.Vector3(this.mapX(0), 0.025, this.mapZ(0)),
        new THREE.Vector3(this.mapX(1), 0.025, this.mapZ(1)),
      ],
      COLORS.tie,
      0.34,
      true,
      0.1,
      0.08,
    );
    diagonal.renderOrder = 4;
    this.group.add(diagonal);
  }

  buildAxes() {
    const axisColor = 0x78b5c8;
    const yFloor = 0.02;

    const axisSegments = [
      [
        new THREE.Vector3(this.mapX(0) - 0.4, yFloor, this.mapZ(1) + 0.5),
        new THREE.Vector3(this.mapX(1) + 0.4, yFloor, this.mapZ(1) + 0.5),
      ],
      [
        new THREE.Vector3(this.mapX(0) - 0.5, yFloor, this.mapZ(0) - 0.35),
        new THREE.Vector3(this.mapX(0) - 0.5, yFloor, this.mapZ(1) + 0.45),
      ],
      [
        new THREE.Vector3(this.mapX(0) - 0.05, 0, this.mapZ(1) + 0.5),
        new THREE.Vector3(this.mapX(0) - 0.05, H + 0.35, this.mapZ(1) + 0.5),
      ],
    ];
    axisSegments.forEach((points) => {
      const glow = createTube(points, axisColor, 0.032, 0.14);
      glow.renderOrder = 9;
      this.group.add(glow);
      const axis = createTube(points, axisColor, 0.012, 0.95);
      axis.renderOrder = 10;
      this.group.add(axis);
    });

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, D)),
      new THREE.LineBasicMaterial({
        color: 0x2e7b92,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      }),
    );
    box.position.set(0, H / 2, 0);
    this.group.add(box);

    // 组成刻度
    [0, 0.25, 0.5, 0.75, 1].forEach((value) => {
      const x = this.mapX(value);
      const z = this.mapZ(value);
      this.group.add(
        createLine(
          [
            new THREE.Vector3(x, 0.01, this.mapZ(1) + 0.38),
            new THREE.Vector3(x, 0.01, this.mapZ(1) + 0.62),
          ],
          axisColor,
          0.55,
        ),
      );
      this.group.add(
        createLine(
          [
            new THREE.Vector3(this.mapX(0) - 0.66, 0.01, z),
            new THREE.Vector3(this.mapX(0) - 0.4, 0.01, z),
          ],
          axisColor,
          0.55,
        ),
      );
      const xLabel = makeTextSprite(value.toFixed(2), {
        fontSize: 25,
        color: '#d3f0f9',
        height: 0.23,
        weight: 400,
      });
      xLabel.position.set(x, 0.24, this.mapZ(1) + 0.86);
      this.group.add(xLabel);

      const zLabel = makeTextSprite(value.toFixed(2), {
        fontSize: 25,
        color: '#d3f0f9',
        height: 0.23,
        weight: 400,
      });
      zLabel.position.set(this.mapX(0) - 1.1, 0.24, z);
      this.group.add(zLabel);
    });

    // 温度刻度
    for (let i = 0; i <= 4; i += 1) {
      const T = this.Tmin + ((this.Tmax - this.Tmin) * i) / 4;
      const y = this.mapT(T);
      this.group.add(
        createLine(
          [
            new THREE.Vector3(this.mapX(0) - 0.2, y, this.mapZ(1) + 0.5),
            new THREE.Vector3(this.mapX(0) + 0.1, y, this.mapZ(1) + 0.5),
          ],
          axisColor,
          0.65,
        ),
      );
      const label = makeTextSprite(`${T.toFixed(0)} °C`, {
        fontSize: 25,
        color: '#d3f0f9',
        height: 0.23,
        weight: 400,
        background: true,
        border: false,
        padding: 6,
        opacity: 0.92,
      });
      label.position.set(this.mapX(0) + 0.7, y, this.mapZ(1) + 0.62);
      this.group.add(label);
    }

    const xTitle = makeTextSprite(`${this.system.xLabel}  x₁  →`, {
      fontSize: 30,
      color: '#e2f8ff',
      height: 0.28,
      weight: 500,
      background: true,
      border: false,
      padding: 8,
    });
    xTitle.position.set(this.mapX(0.5), 0.48, this.mapZ(1) + 1.18);
    this.group.add(xTitle);

    const zTitle = makeTextSprite(`气相组成  y₁  →`, {
      fontSize: 29,
      color: '#e2f8ff',
      height: 0.27,
      weight: 500,
      background: true,
      border: false,
      padding: 8,
    });
    zTitle.position.set(this.mapX(0) - 1.95, 0.48, this.mapZ(0.5));
    this.group.add(zTitle);

    const tTitle = makeTextSprite('温度 T / °C', {
      fontSize: 29,
      color: '#e2f8ff',
      height: 0.27,
      weight: 500,
      background: true,
      border: false,
      padding: 8,
    });
    tTitle.position.set(this.mapX(0) + 0.85, H + 0.8, this.mapZ(1) + 0.58);
    this.group.add(tTitle);
  }

  buildCurves() {
    const points = this.curve.points;
    const bubblePoints = points.map(
      (p) => new THREE.Vector3(this.mapX(p.x), this.mapT(p.T), this.mapZ(p.y)),
    );
    const dewPoints = points.map(
      (p) => new THREE.Vector3(this.mapX(p.y), this.mapT(p.T), this.mapZ(p.x)),
    );
    this.bubblePoints = bubblePoints;
    this.dewPoints = dewPoints;

    const bubbleGlow = createTube(bubblePoints, COLORS.bubble, 0.055, 0.1);
    bubbleGlow.renderOrder = 7;
    this.group.add(bubbleGlow);
    const bubble = createTube(bubblePoints, COLORS.bubble, 0.022, 0.95);
    bubble.renderOrder = 8;
    this.group.add(bubble);

    const dewGlow = createTube(dewPoints, COLORS.dew, 0.055, 0.1);
    dewGlow.renderOrder = 7;
    this.group.add(dewGlow);
    const dew = createTube(dewPoints, COLORS.dew, 0.022, 0.95);
    dew.renderOrder = 8;
    this.group.add(dew);
  }

  buildLens() {
    const points = this.curve.points;
    const positions = [];
    const colors = [];
    const cBubble = new THREE.Color(COLORS.bubble);
    const cDew = new THREE.Color(COLORS.dew);

    points.forEach((p) => {
      positions.push(this.mapX(p.x), this.mapT(p.T), this.mapZ(p.y));
      colors.push(cBubble.r, cBubble.g, cBubble.b);
      positions.push(this.mapX(p.y), this.mapT(p.T), this.mapZ(p.x));
      colors.push(cDew.r, cDew.g, cDew.b);
    });

    const indices = [];
    for (let i = 0; i < points.length - 1; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 5;
    this.group.add(mesh);

    // 表面轮廓细线，帮助在低角度下辨认两相区
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < points.length - 1; i += 4) {
      const a = i * 2;
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]),
        new THREE.Vector3(
          positions[(a + 1) * 3],
          positions[(a + 1) * 3 + 1],
          positions[(a + 1) * 3 + 2],
        ),
      ]);
      const line = new THREE.Line(lineGeo, outlineMaterial);
      line.renderOrder = 6;
      this.group.add(line);
    }
  }

  buildTieLines() {
    const points = this.curve.points;
    const stride = Math.max(1, Math.floor(points.length / 16));
    const positions = [];
    const colors = [];
    const cB = new THREE.Color(COLORS.bubble);
    const cD = new THREE.Color(COLORS.dew);

    for (let i = stride; i < points.length - 1; i += stride) {
      const p = points[i];
      positions.push(this.mapX(p.x), this.mapT(p.T), this.mapZ(p.y));
      positions.push(this.mapX(p.y), this.mapT(p.T), this.mapZ(p.x));
      colors.push(cB.r, cB.g, cB.b, cD.r, cD.g, cD.b);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.36,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    lines.renderOrder = 9;
    this.group.add(lines);
  }

  buildKeyPoints() {
    const addPick = (position, id, label, tooltip) => {
      const hit = new THREE.Mesh(
        new THREE.SphereGeometry(0.26, 12, 10),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      hit.position.copy(position);
      hit.userData = { kind: 'binary-marker', id, label, tooltip };
      this.group.add(hit);
      this.pickables.push(hit);
      return hit;
    };

    const addMarker = (position, color, size, glowSize) => {
      const group = new THREE.Group();
      group.position.copy(position);
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(size, 0),
        new THREE.MeshBasicMaterial({ color, toneMapped: false, depthWrite: false }),
      );
      group.add(mesh);
      const glow = makeGlowSprite('#ffffff', glowSize, 0.4);
      glow.material.color.set(color);
      group.add(glow);
      const ring = makeRingSprite('#ffffff', size * 4.2, 0.25);
      ring.material.color.set(color);
      group.add(ring);
      this.group.add(group);
      return group;
    };

    if (this.azeo) {
      const pos = new THREE.Vector3(
        this.mapX(this.azeo.x),
        this.mapT(this.azeo.T),
        this.mapZ(this.azeo.x),
      );
      this.azeoPosition = pos;
      addMarker(pos, COLORS.azeotrope, 0.12, 0.85);
      const label = makeTextSprite(
        `共沸点 · x = y\n${this.azeo.T.toFixed(1)} °C · x = ${this.azeo.x.toFixed(3)}`,
        {
          fontSize: 25,
          color: COLORS.azeotrope,
          background: true,
          border: true,
          height: 0.36,
          weight: 500,
          padding: 12,
        },
      );
      label.position.copy(pos).add(new THREE.Vector3(0, 0.55, 0.12));
      this.labelsGroup.add(label);
      addPick(
        pos,
        'azeotrope',
        '共沸点',
        '共沸点：液相与气相组成相同（x = y），简单蒸馏无法进一步提纯。点击跳转。',
      );
    }

    const pure2 = new THREE.Vector3(
      this.mapX(0),
      this.mapT(this.pure.component2.T),
      this.mapZ(0),
    );
    const pure1 = new THREE.Vector3(
      this.mapX(1),
      this.mapT(this.pure.component1.T),
      this.mapZ(1),
    );
    addMarker(pure2, this.system.colors.liquid, 0.07, 0.5);
    addMarker(pure1, this.system.colors.vapor, 0.07, 0.5);

    const label2 = makeTextSprite(
      `${this.system.component2Short} ${this.pure.component2.T.toFixed(1)} °C`,
      {
        fontSize: 21,
        color: this.system.colors.liquid,
        background: true,
        border: false,
        height: 0.28,
        weight: 500,
        padding: 9,
      },
    );
    label2.position.copy(pure2).add(new THREE.Vector3(-0.3, 0.42, 0.15));
    this.labelsGroup.add(label2);

    const label1 = makeTextSprite(
      `${this.system.component1Short} ${this.pure.component1.T.toFixed(1)} °C`,
      {
        fontSize: 21,
        color: this.system.colors.vapor,
        background: true,
        border: false,
        height: 0.28,
        weight: 500,
        padding: 9,
      },
    );
    label1.position.copy(pure1).add(new THREE.Vector3(0.35, 0.42, -0.1));
    this.labelsGroup.add(label1);

    addPick(pure2, 'pure-2', `${this.system.component2Short}纯组分`, '纯组分沸点。点击跳转。');
    addPick(pure1, 'pure-1', `${this.system.component1Short}纯组分`, '纯组分沸点。点击跳转。');
  }

  buildStateMarkers() {
    const overallGroup = new THREE.Group();
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.105, 0),
      new THREE.MeshBasicMaterial({
        color: '#f8fafc',
        toneMapped: false,
        depthWrite: false,
      }),
    );
    overallGroup.add(diamond);
    const overallGlow = makeGlowSprite('#ffffff', 0.8, 0.5);
    overallGlow.material.color.set('#2dd4bf');
    overallGroup.add(overallGlow);
    const overallRing = makeRingSprite('#ffffff', 0.56, 0.35);
    overallRing.material.color.set('#2dd4bf');
    overallGroup.add(overallRing);
    this.group.add(overallGroup);
    this.overallGroup = overallGroup;
    this.overallDiamond = diamond;
    this.overallGlow = overallGlow;
    this.overallRing = overallRing;

    const liquidGroup = new THREE.Group();
    const liquidCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 22, 18),
      new THREE.MeshBasicMaterial({ color: COLORS.liquid, toneMapped: false, depthWrite: false }),
    );
    liquidGroup.add(liquidCore);
    const liquidGlow = makeGlowSprite('#ffffff', 0.6, 0.45);
    liquidGlow.material.color.set(COLORS.liquid);
    liquidGroup.add(liquidGlow);
    this.group.add(liquidGroup);
    this.liquidGroup = liquidGroup;

    const vaporGroup = new THREE.Group();
    const vaporCore = new THREE.Mesh(
      new THREE.SphereGeometry(0.095, 22, 18),
      new THREE.MeshBasicMaterial({ color: COLORS.vapor, toneMapped: false, depthWrite: false }),
    );
    vaporGroup.add(vaporCore);
    const vaporGlow = makeGlowSprite('#ffffff', 0.6, 0.45);
    vaporGlow.material.color.set(COLORS.vapor);
    vaporGroup.add(vaporGlow);
    this.group.add(vaporGroup);
    this.vaporGroup = vaporGroup;

    const tieGuide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: COLORS.tie,
        transparent: true,
        opacity: 0.6,
        dashSize: 0.07,
        gapSize: 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    tieGuide.computeLineDistances();
    tieGuide.renderOrder = 12;
    this.group.add(tieGuide);
    this.tieGuide = tieGuide;

    const tieRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 7),
      new THREE.MeshBasicMaterial({
        color: COLORS.tie,
        transparent: true,
        opacity: 0.86,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    tieRod.visible = false;
    tieRod.renderOrder = 12;
    this.group.add(tieRod);
    this.tieRod = tieRod;

    const verticalGuide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({
        color: '#67e8f9',
        transparent: true,
        opacity: 0.3,
        dashSize: 0.09,
        gapSize: 0.08,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    verticalGuide.computeLineDistances();
    verticalGuide.renderOrder = 11;
    this.group.add(verticalGuide);
    this.verticalGuide = verticalGuide;

    const flowGeometry = new THREE.BufferGeometry();
    flowGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    const flow = new THREE.Points(
      flowGeometry,
      new THREE.PointsMaterial({
        size: 0.16,
        color: COLORS.tie,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        sizeAttenuation: true,
      }),
    );
    flow.frustumCulled = false;
    this.group.add(flow);
    this.flowPoints = flow;

    this.overallLabel = makeStateLabel('总组成 z = 0.300', '#dffaff');
    this.liquidLabel = makeStateLabel('液相 x = —', COLORS.liquid);
    this.vaporLabel = makeStateLabel('气相 y = —', COLORS.vapor);
    this.labelsGroup.add(this.overallLabel);
    this.labelsGroup.add(this.liquidLabel);
    this.labelsGroup.add(this.vaporLabel);

    this.markerPos.set(this.mapX(0.3), this.mapT((this.Tmin + this.Tmax) / 2), this.mapZ(0.3));
    this.overallGroup.position.copy(this.markerPos);
    this.liquidPos.copy(this.markerPos);
    this.vaporPos.copy(this.markerPos);
  }

  buildLabels() {
    const liquidLabel = makeTextSprite('液相区\nLIQUID', {
      fontSize: 24,
      color: COLORS.liquid,
      height: 0.34,
      weight: 500,
      opacity: 0.55,
      lineGap: 5,
    });
    liquidLabel.position.set(this.mapX(0.08), this.mapT(this.Tmin + 3), this.mapZ(0.08));
    this.labelsGroup.add(liquidLabel);

    const vaporLabel = makeTextSprite('气相区\nVAPOR', {
      fontSize: 24,
      color: COLORS.vapor,
      height: 0.34,
      weight: 500,
      opacity: 0.55,
      lineGap: 5,
    });
    vaporLabel.position.set(this.mapX(0.92), this.mapT(this.Tmax - 3), this.mapZ(0.92));
    this.labelsGroup.add(vaporLabel);

    const tieLabel = makeTextSprite('两相区 / TIE LINES', {
      fontSize: 19,
      color: COLORS.tie,
      height: 0.17,
      weight: 500,
      opacity: 0.72,
    });
    tieLabel.position.set(this.mapX(0.48), this.mapT(this.curve.points[Math.floor(this.curve.points.length * 0.6)].T) + 0.25, this.mapZ(0.48));
    this.labelsGroup.add(tieLabel);

    const bubbleLabel = makeTextSprite('泡点线\nBUBBLE', {
      fontSize: 20,
      color: COLORS.bubble,
      height: 0.25,
      weight: 500,
      opacity: 0.8,
      lineGap: 4,
    });
    bubbleLabel.position.set(this.mapX(0.16), this.mapT(this.Tmin + 10), this.mapZ(0.68));
    this.labelsGroup.add(bubbleLabel);

    const dewLabel = makeTextSprite('露点线\nDEW', {
      fontSize: 20,
      color: COLORS.dew,
      height: 0.25,
      weight: 500,
      opacity: 0.8,
      lineGap: 4,
    });
    dewLabel.position.set(this.mapX(0.82), this.mapT(this.Tmin + 8), this.mapZ(0.45));
    this.labelsGroup.add(dewLabel);

    const azeoNote = this.azeo
      ? `最低共沸体系 · ${this.azeo.T.toFixed(1)} °C`
      : '理想体系 · 无共沸点';
    const note = makeTextSprite(azeoNote, {
      fontSize: 20,
      color: this.azeo ? COLORS.azeotrope : '#7d9aad',
      height: 0.18,
      weight: 500,
      opacity: 0.8,
    });
    note.position.set(this.mapX(0.5), 0.38, this.mapZ(1) + 1.2);
    this.labelsGroup.add(note);
  }

  setLabelsVisible(visible) {
    this.labelsGroup.visible = visible;
  }

  setVisible(visible) {
    this.visible = visible;
    this.group.visible = visible;
    this.labelsGroup.visible = visible;
  }

  getPickables() {
    return this.visible ? this.pickables : [];
  }

  triggerPulse() {
    this.pulse = 1;
  }

  update(state, delta, time) {
    if (!this.visible || !state) return;
    this.labelTimer += delta;

    const overallTarget = new THREE.Vector3(
      this.mapX(state.z),
      this.mapT(state.T),
      this.mapZ(state.z),
    );
    this.markerPos.lerp(overallTarget, 1 - Math.exp(-delta * 12));
    this.overallGroup.position.copy(this.markerPos);

    const targetColor = new THREE.Color(state.color);
    this.overallColor.lerp(targetColor, 1 - Math.exp(-delta * 8));
    this.overallGlow.material.color.copy(this.overallColor);
    this.overallRing.material.color.copy(this.overallColor);
    this.overallDiamond.material.color.copy(this.overallColor);

    const isTwoPhase =
      state.phases === 2 &&
      state.x !== null &&
      state.y !== null &&
      Math.abs(state.x - state.y) > 0.0015;

    if (isTwoPhase) {
      this.liquidGroup.visible = true;
      this.vaporGroup.visible = true;
      this.tieGuide.visible = true;
      this.tieRod.visible = true;
      this.flowPoints.visible = true;
      this.liquidLabel.visible = true;
      this.vaporLabel.visible = true;

      const liquidTarget = new THREE.Vector3(
        this.mapX(state.x),
        this.mapT(state.T),
        this.mapZ(state.y),
      );
      const vaporTarget = new THREE.Vector3(
        this.mapX(state.y),
        this.mapT(state.T),
        this.mapZ(state.x),
      );
      this.liquidPos.lerp(liquidTarget, 1 - Math.exp(-delta * 12));
      this.vaporPos.lerp(vaporTarget, 1 - Math.exp(-delta * 12));
      this.liquidGroup.position.copy(this.liquidPos);
      this.vaporGroup.position.copy(this.vaporPos);
      this.liquidLabel.position.copy(this.liquidPos).add(new THREE.Vector3(-0.05, 0.35, 0.08));
      this.vaporLabel.position.copy(this.vaporPos).add(new THREE.Vector3(0.05, 0.35, -0.06));

      const lp = this.tieGuide.geometry.attributes.position;
      lp.setXYZ(0, this.liquidPos.x, this.liquidPos.y, this.liquidPos.z);
      lp.setXYZ(1, this.vaporPos.x, this.vaporPos.y, this.vaporPos.z);
      lp.needsUpdate = true;
      this.tieGuide.computeLineDistances();

      const direction = this.vaporPos.clone().sub(this.liquidPos);
      const length = direction.length();
      if (length > 1e-5) {
        this.tieRod.position.copy(this.liquidPos).addScaledVector(direction, 0.5);
        this.tieRod.scale.set(1, length, 1);
        this.tieRod.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.normalize(),
        );
      }

      const flowPos = this.flowPoints.geometry.attributes.position;
      for (let i = 0; i < 8; i += 1) {
        const u = (time * 0.18 + i / 8) % 1;
        flowPos.setXYZ(
          i,
          this.liquidPos.x + (this.vaporPos.x - this.liquidPos.x) * u,
          this.liquidPos.y + (this.vaporPos.y - this.liquidPos.y) * u + Math.sin(u * Math.PI) * 0.08,
          this.liquidPos.z + (this.vaporPos.z - this.liquidPos.z) * u,
        );
      }
      flowPos.needsUpdate = true;
    } else {
      this.liquidGroup.visible = false;
      this.vaporGroup.visible = false;
      this.tieGuide.visible = false;
      this.tieRod.visible = false;
      this.flowPoints.visible = false;
      this.liquidLabel.visible = false;
      this.vaporLabel.visible = false;
      this.liquidPos.copy(this.markerPos);
      this.vaporPos.copy(this.markerPos);
    }

    const vp = this.verticalGuide.geometry.attributes.position;
    vp.setXYZ(0, this.markerPos.x, 0.02, this.markerPos.z);
    vp.setXYZ(1, this.markerPos.x, Math.max(0.15, this.markerPos.y - 0.14), this.markerPos.z);
    vp.needsUpdate = true;
    this.verticalGuide.computeLineDistances();
    this.verticalGuide.material.color.copy(this.overallColor);

    this.overallLabel.position.copy(this.markerPos).add(new THREE.Vector3(0, 0.5, 0.1));
    this.overallLabel.material.color.set('#ffffff');

    const pulseScale = 1 + Math.sin(time * 2.8) * 0.08;
    this.overallRing.scale.setScalar(pulseScale);
    if (this.pulse > 0) {
      this.pulse = Math.max(0, this.pulse - delta * 1.8);
      this.overallRing.scale.setScalar(1 + (1 - this.pulse) * 2.6);
      this.overallRing.material.opacity = 0.5 * this.pulse;
    } else {
      this.overallRing.material.opacity = 0.35 + Math.sin(time * 2.8) * 0.08;
    }

    if (this.labelTimer > 0.12) {
      this.labelTimer = 0;
      this.overallLabel.userData.update(`总组成 z = ${state.z.toFixed(3)}`, {
        fontSize: 26,
        color: '#dffaff',
        background: true,
        border: true,
        height: 0.34,
        padding: 12,
      });
      if (isTwoPhase) {
        this.liquidLabel.userData.update(`液相 x = ${state.x.toFixed(3)}`, {
          fontSize: 24,
          color: COLORS.liquid,
          background: true,
          border: true,
          height: 0.3,
          padding: 10,
        });
        this.vaporLabel.userData.update(`气相 y = ${state.y.toFixed(3)}`, {
          fontSize: 24,
          color: COLORS.vapor,
          background: true,
          border: true,
          height: 0.3,
          padding: 10,
        });
        this.liquidLabel.material.color.set('#ffffff');
        this.vaporLabel.material.color.set('#ffffff');
      }
    }
  }

  getDomain() {
    return { Tmin: this.Tmin, Tmax: this.Tmax, P_atm: this.P_atm };
  }

  dispose() {
    this.disposeContent();
  }
}
