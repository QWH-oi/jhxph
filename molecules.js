import * as THREE from 'three';

const PHASE_COLORS = {
  solid: '#7dd3fc',
  liquid: '#2dd4bf',
  gas: '#fbbf24',
  supercritical: '#c084fc',
  'solid-liquid': '#93c5fd',
  'liquid-gas': '#fcd34d',
  'solid-gas': '#a5b4fc',
  triple: '#f8fafc',
  critical: '#c084fc',
  'two-phase': '#fcd34d',
  azeotrope: '#f0abfc',
  vapor: '#fbbf24',
  'liquid-solid-bi': '#fdba74',
  'liquid-solid-cd': '#c4b5fd',
  'solid-mixture': '#a5b4fc',
  eutectic: '#f0abfc',
  'pure-melting': '#93c5fd',
};

function seededNoise(seed, time, frequency = 1) {
  const n = Math.sin(time * frequency + seed * 91.731) * 43758.5453;
  return (n - Math.floor(n)) * 2 - 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class MoleculeStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.phaseKey = 'liquid';
    this.temperatureK = 298.15;
    this.speedFactor = 0.6;
    this.averageSpeed = 0.42;
    this.count = 48;
    this.visible = true;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 30);
    this.camera.position.set(0.15, 0.7, 5.25);
    this.camera.lookAt(0, -0.05, 0);

    this.scene.add(new THREE.HemisphereLight(0x9eeaff, 0x02050a, 1.5));
    const key = new THREE.DirectionalLight(0xe8fbff, 2.5);
    key.position.set(3, 5, 5);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x22d3ee, 14, 12, 2);
    rim.position.set(-2.4, 0.4, 2.6);
    this.scene.add(rim);
    const amber = new THREE.PointLight(0xf59e0b, 5, 9, 2);
    amber.position.set(2.2, -0.6, 1.8);
    this.scene.add(amber);
    this.rimLight = rim;
    this.amberLight = amber;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.buildCage();
    this.buildMolecules();
    this.buildGlowTexture();
    this.resize();
    this.assignGroups('liquid');
    this.syncColors(true);
  }

  buildCage() {
    const cageGeo = new THREE.BoxGeometry(3.1, 2.3, 2.3);
    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(cageGeo),
      new THREE.LineBasicMaterial({
        color: 0x3caec4,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    cage.position.y = -0.05;
    this.root.add(cage);
    cageGeo.dispose();

    const floorGeo = new THREE.PlaneGeometry(3.3, 2.5);
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshBasicMaterial({
        color: 0x0d5266,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    this.root.add(floor);

    const grid = new THREE.GridHelper(3.2, 8, 0x15566b, 0x0b3343);
    grid.position.y = -1.195;
    grid.material.transparent = true;
    grid.material.opacity = 0.26;
    grid.material.depthWrite = false;
    this.root.add(grid);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.58, 0.62, 64),
      new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = -1.19;
    this.root.add(halo);
  }

  buildMolecules() {
    this.spriteTexture = this.makeParticleTexture();
    const geometry = new THREE.IcosahedronGeometry(0.085, 1);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.3,
      metalness: 0.18,
      emissive: 0x0d3541,
      emissiveIntensity: 0.85,
      vertexColors: false,
    });
    this.instanced = new THREE.InstancedMesh(geometry, material, this.count);
    this.instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.instanced.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.count * 3),
      3,
    );
    this.root.add(this.instanced);

    const glowGeo = new THREE.BufferGeometry();
    const glowPositions = new Float32Array(this.count * 3);
    const glowColors = new Float32Array(this.count * 3);
    glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPositions, 3));
    glowGeo.setAttribute('color', new THREE.BufferAttribute(glowColors, 3));
    this.glow = new THREE.Points(
      glowGeo,
      new THREE.PointsMaterial({
        size: 0.42,
        map: this.spriteTexture,
        vertexColors: true,
        transparent: true,
        opacity: 0.58,
        alphaTest: 0.01,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
        toneMapped: false,
      }),
    );
    this.glow.frustumCulled = false;
    this.root.add(this.glow);

    this.molecules = [];
    const lattice = [];
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        for (let x = -1; x <= 1; x += 1) {
          lattice.push(
            new THREE.Vector3(
              x * 0.56 + (z % 2 ? 0.08 : 0),
              -0.16 + y * 0.52,
              z * 0.46,
            ),
          );
        }
      }
    }

    for (let i = 0; i < this.count; i += 1) {
      const home = lattice[i % lattice.length].clone();
      const seed = Math.random();
      const position = home.clone().add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.18,
          (Math.random() - 0.5) * 0.18,
          (Math.random() - 0.5) * 0.18,
        ),
      );
      this.molecules.push({
        home,
        pos: position,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
        ),
        seed,
        group: 'liquid',
        color: new THREE.Color(PHASE_COLORS.liquid),
        targetColor: new THREE.Color(PHASE_COLORS.liquid),
        scale: 1,
      });
    }

    this.tmpMatrix = new THREE.Matrix4();
    this.tmpQuat = new THREE.Quaternion();
    this.tmpScale = new THREE.Vector3(1, 1, 1);
    this.tmpColor = new THREE.Color();
  }

  makeParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.22, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  buildGlowTexture() {
    // 共享给粒子 points 的贴图在 buildMolecules 中已经创建。
  }

  setPhase(phaseKey, temperatureK) {
    this.temperatureK = Number.isFinite(temperatureK) ? temperatureK : this.temperatureK;
    const next = phaseKey || 'liquid';
    const mode = this.modeForPhase(next);
    if (next !== this.phaseKey || mode !== this.mode) {
      this.phaseKey = next;
      this.mode = mode;
      this.assignGroups(mode);
      this.syncColors();
    }
    this.speedFactor = clamp(0.28 + ((this.temperatureK - 200) / 500) * 1.15, 0.24, 1.7);
    this.updateLights();
  }

  modeForPhase(phaseKey) {
    if (phaseKey === 'liquid-gas' || phaseKey === 'two-phase' || phaseKey === 'azeotrope') return 'liquid-gas';
    if (phaseKey === 'solid-liquid' || phaseKey === 'pure-melting') return 'solid-liquid';
    if (phaseKey === 'solid-gas') return 'solid-gas';
    if (phaseKey === 'triple') return 'triple';
    if (phaseKey === 'critical') return 'critical';
    if (phaseKey === 'supercritical') return 'supercritical';
    if (phaseKey === 'vapor') return 'gas';
    if (phaseKey === 'liquid-solid-bi') return 'liquid-solid-bi';
    if (phaseKey === 'liquid-solid-cd') return 'liquid-solid-cd';
    if (phaseKey === 'solid-mixture') return 'solid-mixture';
    if (phaseKey === 'eutectic') return 'eutectic';
    return phaseKey;
  }

  assignGroups(mode) {
    const n = this.molecules.length;
    const solidEnd = Math.floor(n * 0.52);
    const liquidEnd = Math.floor(n * 0.78);
    this.molecules.forEach((p, index) => {
      let group = 'liquid';
      if (mode === 'solid') group = 'solid';
      else if (mode === 'liquid') group = 'liquid';
      else if (mode === 'gas') group = 'gas';
      else if (mode === 'supercritical' || mode === 'critical') group = 'super';
      else if (mode === 'solid-liquid') group = index < solidEnd ? 'solid' : 'liquid';
      else if (mode === 'solid-gas') group = index < solidEnd ? 'solid' : 'gas';
      else if (mode === 'liquid-gas') group = index < solidEnd ? 'liquid' : 'gas';
      else if (mode === 'liquid-solid-bi') group = index < solidEnd ? 'solid' : 'liquid';
      else if (mode === 'liquid-solid-cd') group = index < solidEnd ? 'solid2' : 'liquid';
      else if (mode === 'solid-mixture') group = index < n / 2 ? 'solid' : 'solid2';
      else if (mode === 'eutectic') {
        group = index < n / 3 ? 'solid' : index < (n * 2) / 3 ? 'solid2' : 'liquid';
      } else if (mode === 'triple') {
        group = index < n / 3 ? 'solid' : index < (n * 2) / 3 ? 'liquid' : 'gas';
      }
      if (p.group !== group) {
        p.group = group;
        if (group === 'gas' || group === 'super') {
          p.vel.set(
            (Math.random() - 0.5) * 1.35,
            (Math.random() - 0.5) * 1.35,
            (Math.random() - 0.5) * 1.35,
          );
        } else if (group === 'liquid') {
          p.vel.set(
            (Math.random() - 0.5) * 0.28,
            (Math.random() - 0.5) * 0.28,
            (Math.random() - 0.5) * 0.28,
          );
        }
      }
    });
    this.syncColors(true);
  }

  syncColors(immediate = false) {
    const n = this.molecules.length;
    this.molecules.forEach((p, index) => {
      let phaseColor = PHASE_COLORS[this.phaseKey] || PHASE_COLORS.liquid;
      if (this.mode === 'liquid-gas' || this.mode === 'triple' || this.mode === 'solid-gas') {
        phaseColor =
          p.group === 'solid'
            ? PHASE_COLORS.solid
            : p.group === 'gas'
              ? PHASE_COLORS.gas
              : PHASE_COLORS.liquid;
      } else if (this.mode === 'solid-liquid') {
        phaseColor = p.group === 'solid' ? PHASE_COLORS.solid : PHASE_COLORS.liquid;
      } else if (
        this.mode === 'liquid-solid-bi' ||
        this.mode === 'liquid-solid-cd' ||
        this.mode === 'solid-mixture' ||
        this.mode === 'eutectic'
      ) {
        phaseColor =
          p.group === 'solid'
            ? PHASE_COLORS['liquid-solid-bi'] || '#fdba74'
            : p.group === 'solid2'
              ? PHASE_COLORS['liquid-solid-cd'] || '#c4b5fd'
              : PHASE_COLORS.liquid;
      }
      p.targetColor.set(phaseColor);
      if (immediate) p.color.copy(p.targetColor);
      if (this.instanced?.instanceColor) {
        this.instanced.setColorAt(index, p.color);
      }
    });
    if (this.instanced?.instanceColor) this.instanced.instanceColor.needsUpdate = true;
  }

  updateLights() {
    if (!this.rimLight) return;
    const base = new THREE.Color(PHASE_COLORS[this.phaseKey] || PHASE_COLORS.liquid);
    this.rimLight.color.lerp(base, 0.05);
    this.rimLight.intensity = 11 + this.speedFactor * 4;
    this.amberLight.intensity = 3 + this.speedFactor * 3;
  }

  update(delta, time) {
    if (!this.visible) return;
    const dt = Math.min(delta, 0.035);
    const speed = this.speedFactor;
    let speedSum = 0;

    for (let i = 0; i < this.molecules.length; i += 1) {
      const p = this.molecules[i];
      const n1 = seededNoise(p.seed, time, 1.7);
      const n2 = seededNoise(p.seed + 3.1, time, 2.1);
      const n3 = seededNoise(p.seed + 7.7, time, 1.3);

      if (p.group === 'solid' || p.group === 'solid2') {
        const amp = 0.012 + 0.025 * speed;
        const target = this.tmpScale.set(
          p.home.x + n1 * amp,
          p.home.y + n2 * amp * 1.25,
          p.home.z + n3 * amp,
        );
        p.vel.x += (target.x - p.pos.x) * dt * 24;
        p.vel.y += (target.y - p.pos.y) * dt * 24;
        p.vel.z += (target.z - p.pos.z) * dt * 24;
        p.vel.multiplyScalar(Math.exp(-dt * 5.2));
        p.pos.addScaledVector(p.vel, dt);
        p.scale = 1.0;
      } else if (p.group === 'liquid') {
        const isTwoPhase = this.mode === 'liquid-gas';
        const lower = isTwoPhase ? -0.98 : -1.02;
        const upper = isTwoPhase ? -0.02 : 1.05;
        p.vel.x += n1 * dt * 3.2 * speed;
        p.vel.y += n2 * dt * 2.8 * speed;
        p.vel.z += n3 * dt * 3.2 * speed;
        p.vel.multiplyScalar(Math.exp(-dt * 0.92));
        const maxSpeed = 0.7 + speed * 0.32;
        if (p.vel.lengthSq() > maxSpeed * maxSpeed) p.vel.setLength(maxSpeed);
        p.pos.addScaledVector(p.vel, dt);
        this.confineBox(p, 1.22, lower, upper, 0.86);
        p.scale = 1.0;
      } else if (p.group === 'gas') {
        const isTwoPhase = this.mode === 'liquid-gas';
        const lower = isTwoPhase ? 0.02 : -1.05;
        const upper = 1.08;
        const maxSpeed = 0.95 + speed * 1.1;
        if (p.vel.lengthSq() < 0.42) {
          p.vel.x += n1 * dt * 2.8;
          p.vel.y += n2 * dt * 2.8;
          p.vel.z += n3 * dt * 2.8;
        }
        if (p.vel.lengthSq() > maxSpeed * maxSpeed) p.vel.setLength(maxSpeed);
        p.pos.addScaledVector(p.vel, dt);
        this.confineBox(p, 1.32, lower, upper, 0.94);
        p.scale = 0.94;
      } else {
        // supercritical / critical：高密度、强涨落
        p.vel.x += n1 * dt * 1.6;
        p.vel.y += n2 * dt * 1.5;
        p.vel.z += n3 * dt * 1.6;
        p.vel.multiplyScalar(Math.exp(-dt * 0.45));
        const maxSpeed = 0.7 + speed * 0.75;
        if (p.vel.lengthSq() > maxSpeed * maxSpeed) p.vel.setLength(maxSpeed);
        p.pos.addScaledVector(p.vel, dt);
        this.confineBox(p, 1.3, -1.02, 1.06, 0.95);
        p.scale = 1.04;
      }

      speedSum += p.vel.length();
      p.color.lerp(p.targetColor, 1 - Math.exp(-dt * 4.6));

      this.tmpQuat.setFromEuler(
        new THREE.Euler(time * 0.2 + p.seed * 3, time * 0.15 + p.seed * 5, 0),
      );
      this.tmpScale.set(p.scale, p.scale, p.scale);
      this.tmpMatrix.compose(p.pos, this.tmpQuat, this.tmpScale);
      this.instanced.setMatrixAt(i, this.tmpMatrix);
      this.instanced.setColorAt(i, p.color);

      const positions = this.glow.geometry.attributes.position.array;
      const colors = this.glow.geometry.attributes.color.array;
      positions[i * 3] = p.pos.x;
      positions[i * 3 + 1] = p.pos.y;
      positions[i * 3 + 2] = p.pos.z;
      colors[i * 3] = p.color.r;
      colors[i * 3 + 1] = p.color.g;
      colors[i * 3 + 2] = p.color.b;
    }

    this.instanced.instanceMatrix.needsUpdate = true;
    if (this.instanced.instanceColor) this.instanced.instanceColor.needsUpdate = true;
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.geometry.attributes.color.needsUpdate = true;
    this.averageSpeed = speedSum / this.molecules.length;

    this.camera.position.x = 0.15 + Math.sin(time * 0.07) * 0.22;
    this.camera.position.y = 0.72 + Math.sin(time * 0.055) * 0.08;
    this.camera.lookAt(0, -0.05, 0);
  }

  confineBox(p, xBound, yMin, yMax, zBound) {
    if (p.pos.x < -xBound) {
      p.pos.x = -xBound;
      p.vel.x = Math.abs(p.vel.x) * 0.7;
    } else if (p.pos.x > xBound) {
      p.pos.x = xBound;
      p.vel.x = -Math.abs(p.vel.x) * 0.7;
    }
    if (p.pos.y < yMin) {
      p.pos.y = yMin;
      p.vel.y = Math.abs(p.vel.y) * 0.7;
    } else if (p.pos.y > yMax) {
      p.pos.y = yMax;
      p.vel.y = -Math.abs(p.vel.y) * 0.7;
    }
    if (p.pos.z < -zBound) {
      p.pos.z = -zBound;
      p.vel.z = Math.abs(p.vel.z) * 0.7;
    } else if (p.pos.z > zBound) {
      p.pos.z = zBound;
      p.vel.z = -Math.abs(p.vel.z) * 0.7;
    }
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const width = parent.clientWidth;
    const height = parent.clientHeight;
    if (width < 10 || height < 10) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setVisible(visible) {
    this.visible = visible;
    if (visible) {
      this.resize();
    }
  }

  render() {
    if (!this.visible) return;
    this.renderer.render(this.scene, this.camera);
  }

  getSpeedReadout() {
    return this.averageSpeed.toFixed(2);
  }
}
