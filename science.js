/**
 * 相平衡科学计算内核
 * ------------------------------------------------------------------
 * 单组分：水，饱和蒸气压采用 IAPWS Wagner 方程，
 *         升华曲线采用 Clausius–Clapeyron 近似，
 *         熔化曲线采用三相点附近线性化（负斜率，体现冰的反常）。
 * 双组分：乙醇–水（NRTL 非理想，最低共沸）与苯–甲苯（理想 Raoult）。
 *
 * 所有图线均由真实热力学关系计算，不使用随手绘制的示意曲线。
 */

export const R = 8.314462618; // J mol^-1 K^-1

export const WATER = Object.freeze({
  T_TRIPLE: 273.16,
  P_TRIPLE: 611.657,
  T_CRIT: 647.096,
  P_CRIT: 22.064e6,
  DELTA_H_SUB: 51000, // J mol^-1
  MELT_SLOPE: -7.4e-8, // K Pa^-1, dT/dP for ice Ih near triple point
});

export const WATER_DOMAIN = Object.freeze({
  Tmin: 200,
  Tmax: 700,
  logPmin: 1.0,
  logPmax: 7.8,
  depth: 1.1,
});

export const BINARY_DOMAIN = Object.freeze({
  P_MIN_ATM: 0.25,
  P_MAX_ATM: 3,
});

export const PHASE_META = Object.freeze({
  solid: {
    key: 'solid',
    label: '固相',
    en: 'SOLID',
    color: '#7dd3fc',
    soft: '#d7f3ff',
    gradient: ['#7dd3fc', '#bae6fd'],
  },
  liquid: {
    key: 'liquid',
    label: '液相',
    en: 'LIQUID',
    color: '#2dd4bf',
    soft: '#a7f3d0',
    gradient: ['#2dd4bf', '#67e8f9'],
  },
  gas: {
    key: 'gas',
    label: '气相',
    en: 'VAPOR',
    color: '#fbbf24',
    soft: '#fde68a',
    gradient: ['#f59e0b', '#fde68a'],
  },
  supercritical: {
    key: 'supercritical',
    label: '超临界流体',
    en: 'SUPERCRITICAL',
    color: '#c084fc',
    soft: '#e9d5ff',
    gradient: ['#a855f7', '#f0abfc'],
  },
  'solid-liquid': {
    key: 'solid-liquid',
    label: '固–液共存',
    en: 'SOLID + LIQUID',
    color: '#93c5fd',
    soft: '#dbeafe',
    gradient: ['#7dd3fc', '#2dd4bf'],
  },
  'liquid-gas': {
    key: 'liquid-gas',
    label: '液–气共存',
    en: 'LIQUID + VAPOR',
    color: '#fcd34d',
    soft: '#fef3c7',
    gradient: ['#2dd4bf', '#fbbf24'],
  },
  'solid-gas': {
    key: 'solid-gas',
    label: '固–气共存',
    en: 'SOLID + VAPOR',
    color: '#a5b4fc',
    soft: '#e0e7ff',
    gradient: ['#7dd3fc', '#fbbf24'],
  },
  triple: {
    key: 'triple',
    label: '三相点',
    en: 'TRIPLE POINT',
    color: '#f8fafc',
    soft: '#ffffff',
    gradient: ['#7dd3fc', '#2dd4bf', '#fbbf24'],
  },
  critical: {
    key: 'critical',
    label: '临界点',
    en: 'CRITICAL POINT',
    color: '#c084fc',
    soft: '#f3e8ff',
    gradient: ['#c084fc', '#f0abfc'],
  },
  vapor: {
    key: 'vapor',
    label: '气相',
    en: 'VAPOR',
    color: '#fbbf24',
    soft: '#fde68a',
    gradient: ['#f59e0b', '#fde68a'],
  },
  'two-phase': {
    key: 'two-phase',
    label: '液–气两相',
    en: 'VAPOR–LIQUID',
    color: '#fcd34d',
    soft: '#fef3c7',
    gradient: ['#2dd4bf', '#fbbf24'],
  },
  azeotrope: {
    key: 'azeotrope',
    label: '共沸点',
    en: 'AZEOTROPE',
    color: '#f0abfc',
    soft: '#fae8ff',
    gradient: ['#2dd4bf', '#fbbf24', '#f0abfc'],
  },
});

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const relativeDifference = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-30);

function bisect(fn, low, high, iterations = 90) {
  let lo = low;
  let hi = high;
  let fLo = fn(lo);
  let fHi = fn(hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return NaN;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return NaN;
  for (let i = 0; i < iterations; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = fn(mid);
    if (!Number.isFinite(fMid)) return NaN;
    if (Math.abs(fMid) < 1e-10 || hi - lo < 1e-10) return mid;
    if (fLo * fMid <= 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/* ------------------------------------------------------------------ */
/* 单组分：水                                                          */
/* ------------------------------------------------------------------ */

// IAPWS-95 saturation-pressure Wagner coefficients (dimensionless)
const WAGNER = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502];

export function waterSaturationPressure(T) {
  const Tt = WATER.T_TRIPLE;
  const Tc = WATER.T_CRIT;
  if (!Number.isFinite(T) || T <= 0) return 0;
  if (T <= Tt) return waterSublimationPressure(T);
  if (T >= Tc) return WATER.P_CRIT;
  const tau = 1 - T / Tc;
  const exponent =
    WAGNER[0] * tau +
    WAGNER[1] * Math.pow(tau, 1.5) +
    WAGNER[2] * Math.pow(tau, 3) +
    WAGNER[3] * Math.pow(tau, 3.5) +
    WAGNER[4] * Math.pow(tau, 4) +
    WAGNER[5] * Math.pow(tau, 7.5);
  return WATER.P_CRIT * Math.exp((Tc / T) * exponent);
}

export function waterSublimationPressure(T) {
  const { T_TRIPLE, P_TRIPLE, DELTA_H_SUB } = WATER;
  if (!Number.isFinite(T) || T <= 0) return 0;
  if (T >= T_TRIPLE) return P_TRIPLE;
  return P_TRIPLE * Math.exp((DELTA_H_SUB / R) * (1 / T_TRIPLE - 1 / T));
}

export function waterSublimationTemperature(P) {
  const { T_TRIPLE, P_TRIPLE, DELTA_H_SUB } = WATER;
  if (!(P > 0) || P >= P_TRIPLE) return P >= P_TRIPLE ? T_TRIPLE : NaN;
  return 1 / (1 / T_TRIPLE - (R / DELTA_H_SUB) * Math.log(P / P_TRIPLE));
}

export function waterSaturationTemperature(P) {
  if (!(P > 0) || P > WATER.P_CRIT * 1.0000001) return NaN;
  if (relativeDifference(P, WATER.P_CRIT) < 1e-9) return WATER.T_CRIT;
  return bisect((T) => waterSaturationPressure(T) - P, WATER.T_TRIPLE, WATER.T_CRIT, 100);
}

export function waterMeltingTemperature(P) {
  return WATER.T_TRIPLE + WATER.MELT_SLOPE * (P - WATER.P_TRIPLE);
}

function makePhase(phaseKey, phases, extras = {}) {
  const meta = PHASE_META[phaseKey] || PHASE_META.gas;
  return {
    phaseKey,
    phase: meta.label,
    phaseEn: meta.en,
    phases,
    F: 3 - phases,
    color: meta.color,
    soft: meta.soft,
    gradient: meta.gradient,
    ...extras,
  };
}

/**
 * 单组分相态判定。为可交互性，在相边界附近设置很窄的“共存判定带”，
 * 并在界面与帮助中明确标注；相律数值严格使用 P（相数）计算。
 */
export function waterPhaseAt(T, P) {
  const { T_TRIPLE, P_TRIPLE, T_CRIT, P_CRIT } = WATER;
  const x = clamp(T, 180, 760);
  const p = clamp(P, 1e-6, 1e8);
  const logP = Math.log10(p);
  const logPt = Math.log10(P_TRIPLE);

  // 三相点
  if (Math.abs(x - T_TRIPLE) <= 0.9 && Math.abs(logP - logPt) <= 0.06) {
    const pSat = waterSaturationPressure(x);
    return makePhase('triple', 3, {
      T: x,
      P: p,
      pSat,
      pSub: waterSublimationPressure(x),
      pMeltT: waterMeltingTemperature(p),
      interpretation:
        '三相点：固、液、气三相同时共存。C = 1、P = 3，因此 F = 1 − 3 + 2 = 0，系统没有可独立改变的强度性质。',
      hint: '水的三相点：273.16 K（0.01 °C）、611.657 Pa',
    });
  }

  // 临界点
  if (Math.abs(x - T_CRIT) <= 1.2 && relativeDifference(p, P_CRIT) <= 0.03) {
    return makePhase('critical', 2, {
      T: x,
      P: p,
      pSat: waterSaturationPressure(x),
      interpretation:
        '临界点：气液界面消失，两相密度相等。C = 1、P = 2，相律给出 F = 1；继续升温将进入超临界流体区。',
      hint: '水的临界点：647.096 K（373.946 °C）、22.064 MPa',
    });
  }

  // 升华 / 熔化 / 汽化共存带
  if (x < T_TRIPLE) {
    const pSub = waterSublimationPressure(x);
    const tMelt = waterMeltingTemperature(p);
    const nearSublimation = relativeDifference(p, pSub) <= 0.02;
    const nearMelting = p > P_TRIPLE * 0.9 && Math.abs(x - tMelt) <= 0.12;

    if (nearMelting) {
      return makePhase('solid-liquid', 2, {
        T: x,
        P: p,
        pSat: waterSaturationPressure(x),
        pSub,
        interpretation:
          '固–液两相共存，系统位于熔化曲线上。C = 1、P = 2，因此 F = 1：温度与压强只能沿曲线联动改变。',
        hint: '冰的反常熔化曲线斜率为负：加压使熔点降低。',
      });
    }
    if (nearSublimation && !(p > P_TRIPLE && x > tMelt)) {
      return makePhase('solid-gas', 2, {
        T: x,
        P: p,
        pSub,
        interpretation:
          '固–气两相共存，系统位于升华曲线上。C = 1、P = 2，因此 F = 1。此时冰不经过液相直接变为水蒸气。',
        hint: '常压下干冰升华；水的升华发生在低于 611.657 Pa 的压强。',
      });
    }
    if (p > P_TRIPLE && x > tMelt) {
      return makePhase('liquid', 1, {
        T: x,
        P: p,
        pSat: waterSaturationPressure(x),
        pSub,
        interpretation:
          '高压下液相可延伸到三相点温度以下。C = 1、P = 1，F = 2：温度与压强可独立改变。',
        hint: '这是冰的反常熔化曲线造成的“高压过冷液体”区域。',
      });
    }
    if (p < pSub) {
      return makePhase('gas', 1, {
        T: x,
        P: p,
        pSub,
        interpretation:
          '当前位于升华曲线以下的低压气相区。C = 1、P = 1，F = 2。',
        hint: '降低压强或升高温度都会让冰直接升华。',
      });
    }
    return makePhase('solid', 1, {
      T: x,
      P: p,
      pSub,
      interpretation:
        '当前位于固相单相区。C = 1、P = 1，F = 2：温度、压强可独立变化，直到触及升华或熔化边界。',
      hint: '冰的分子被束缚在六方晶格中，只有振动而无长程平动。',
    });
  }

  if (x < T_CRIT) {
    const pSat = waterSaturationPressure(x);
    const tMelt = waterMeltingTemperature(p);
    const nearSaturation = relativeDifference(p, pSat) <= 0.008;
    const nearMelting = Math.abs(x - tMelt) <= 0.12;

    if (nearMelting) {
      return makePhase('solid-liquid', 2, {
        T: x,
        P: p,
        pSat,
        pSub: waterSublimationPressure(x),
        interpretation:
          '固–液两相共存，系统位于熔化曲线上。C = 1、P = 2，因此 F = 1：温度与压强只能沿曲线联动改变。',
        hint: '水的熔化曲线向高温方向微微左倾，这是冰的密度小于液态水的结果。',
      });
    }
    if (nearSaturation) {
      return makePhase('liquid-gas', 2, {
        T: x,
        P: p,
        pSat,
        interpretation:
          '液–气两相共存，系统位于汽化曲线上。C = 1、P = 2，因此 F = 1：温度与饱和蒸气压一一对应，不能独立改变。',
        hint: '此时液体中不断有分子逸出、气体中不断有分子凝结，净相变速率相等。',
      });
    }
    if (p < pSat) {
      return makePhase('gas', 1, {
        T: x,
        P: p,
        pSat,
        interpretation:
          '当前位于气相单相区。C = 1、P = 1，F = 2：可独立改变温度与压强。',
        hint: '气相分子间平均距离远大于分子直径，平动占主导。',
      });
    }
    if (x < tMelt) {
      return makePhase('solid', 1, {
        T: x,
        P: p,
        pSat,
        pSub: waterSublimationPressure(x),
        interpretation:
          '当前位于固相单相区。C = 1、P = 1，F = 2：温度、压强可独立改变。',
        hint: '高压会降低冰的熔点，因此固相区在高压侧反而变窄。',
      });
    }
    return makePhase('liquid', 1, {
      T: x,
      P: p,
      pSat,
      interpretation:
        '当前位于液相单相区。C = 1、P = 1，F = 2：温度与压强可独立改变，相态保持不变。',
      hint: '液态水保留短程有序，分子可平动但不能维持固定晶格。',
    });
  }

  // T ≥ Tc
  if (p > P_CRIT) {
    return makePhase('supercritical', 1, {
      T: x,
      P: p,
      pSat: WATER.P_CRIT,
      interpretation:
        '当前位于超临界流体区（T > Tc 且 P > Pc）。C = 1、P = 1，F = 2；这里没有气液界面，密度可连续调节。',
      hint: '超临界 CO₂ 萃取、超临界水氧化都利用了这一区域独特的溶解与传递性质。',
    });
  }
  return makePhase('gas', 1, {
    T: x,
    P: p,
    pSat: WATER.P_CRIT,
    interpretation:
      '当前温度高于临界温度但压强低于临界压强，仍为气相。C = 1、P = 1，F = 2。',
    hint: '仅升高温度而不增加压强，不会经过液–气共存线。',
  });
}

/** 单组分相图曲线采样，返回 T / logP 便于三维映射。 */
export function waterCurves() {
  const { Tmin, Tmax, logPmin, logPmax } = WATER_DOMAIN;
  const { T_TRIPLE, P_TRIPLE, T_CRIT, P_CRIT } = WATER;
  const logPt = Math.log10(P_TRIPLE);
  const logPc = Math.log10(P_CRIT);

  const fusion = [];
  const pMax = Math.pow(10, logPmax);
  const steps = 64;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const logP = logPt + u * (logPmax - logPt);
    const P = Math.pow(10, logP);
    const T = waterMeltingTemperature(P);
    fusion.push({ T, P, logP, u });
  }

  const vaporization = [];
  for (let i = 0; i <= 150; i += 1) {
    const u = i / 150;
    const T = T_TRIPLE + u * (T_CRIT - T_TRIPLE);
    const P = waterSaturationPressure(T);
    vaporization.push({ T, P, logP: Math.log10(P), u });
  }

  const sublimation = [];
  for (let i = 0; i <= 110; i += 1) {
    const u = i / 110;
    const T = Tmin + u * (T_TRIPLE - Tmin);
    const P = waterSublimationPressure(T);
    sublimation.push({ T, P, logP: Math.log10(Math.max(P, 1e-8)), u });
  }

  return {
    fusion,
    vaporization,
    sublimation,
    triple: { T: T_TRIPLE, P: P_TRIPLE, logP: logPt },
    critical: { T: T_CRIT, P: P_CRIT, logP: logPc },
    domains: { Tmin, Tmax, logPmin, logPmax },
  };
}

/* ------------------------------------------------------------------ */
/* 双组分：汽液平衡                                                     */
/* ------------------------------------------------------------------ */

const NRTL = Object.freeze({ alpha: 0.3, tau12: -0.2299382, tau21: 2.26470458 });

export const BINARY_SYSTEMS = Object.freeze({
  'ethanol-water': {
    id: 'ethanol-water',
    label: '乙醇–水',
    en: 'ETHANOL / WATER',
    xLabel: '乙醇摩尔分数',
    xShort: 'x(乙醇)',
    yShort: 'y(乙醇)',
    component1: '乙醇',
    component2: '水',
    component1Short: '乙醇',
    component2Short: '水',
    activityType: 'NRTL',
    activity: NRTL,
    azeotropic: true,
    colors: { liquid: '#2dd4bf', vapor: '#fbbf24', tie: '#f0abfc' },
    antoine: [
      { A: 8.20417, B: 1642.89, C: 230.3 },
      { A: 8.07131, B: 1730.63, C: 233.426 },
    ],
    note: 'NRTL 活度系数模型；最低共沸点约 78.2 °C，x(乙醇) ≈ 0.895。',
  },
  'benzene-toluene': {
    id: 'benzene-toluene',
    label: '苯–甲苯',
    en: 'BENZENE / TOLUENE',
    xLabel: '苯摩尔分数',
    xShort: 'x(苯)',
    yShort: 'y(苯)',
    component1: '苯',
    component2: '甲苯',
    component1Short: '苯',
    component2Short: '甲苯',
    activityType: 'Raoult',
    activity: null,
    azeotropic: false,
    colors: { liquid: '#38bdf8', vapor: '#fb923c', tie: '#a78bfa' },
    antoine: [
      { A: 6.90565, B: 1211.033, C: 220.79 },
      { A: 6.95464, B: 1344.8, C: 219.482 },
    ],
    note: '理想溶液（Raoult 定律）；无共沸点，简单蒸馏可分离。',
  },
});

export function psatMmHg(system, componentIndex, T_C) {
  const { A, B, C } = system.antoine[componentIndex];
  return Math.pow(10, A - B / (T_C + C));
}

export function activityCoefficients(system, x1) {
  const x = clamp(x1, 1e-9, 1 - 1e-9);
  const x2 = 1 - x;
  if (!system.activity) return [1, 1];
  const { alpha, tau12, tau21 } = system.activity;
  const G12 = Math.exp(-alpha * tau12);
  const G21 = Math.exp(-alpha * tau21);
  const denom1 = x + x2 * G21;
  const denom2 = x2 + x * G12;
  // 标准 NRTL：第一项含 G²，第二项只含一次 G
  const lnGamma1 =
    x2 * x2 * (tau21 * Math.pow(G21 / denom1, 2) + (tau12 * G12) / (denom2 * denom2));
  const lnGamma2 =
    x * x * (tau12 * Math.pow(G12 / denom2, 2) + (tau21 * G21) / (denom1 * denom1));
  return [Math.exp(lnGamma1), Math.exp(lnGamma2)];
}

/** 泡点计算：给定液相组成与总压，求平衡温度与气相组成。 */
export function bubblePoint(system, x1, P_atm) {
  const x = clamp(x1, 0, 1);
  const P_mmHg = P_atm * 760;
  if (x <= 1e-9) {
    const T_C = Math.min(220, Math.max(0, antoineTemperature(system, 1, P_mmHg)));
    return { T_C, y1: 0, gamma: [1, 1] };
  }
  if (x >= 1 - 1e-9) {
    const T_C = Math.min(220, Math.max(0, antoineTemperature(system, 0, P_mmHg)));
    return { T_C, y1: 1, gamma: [1, 1] };
  }

  const gamma = activityCoefficients(system, x);
  const sumY = (T_C) => {
    const p1 = psatMmHg(system, 0, T_C);
    const p2 = psatMmHg(system, 1, T_C);
    return (x * gamma[0] * p1 + (1 - x) * gamma[1] * p2) / P_mmHg;
  };

  let T_C = bisect((T) => sumY(T) - 1, 20, 200, 90);
  if (!Number.isFinite(T_C)) T_C = 80;
  const p1 = psatMmHg(system, 0, T_C);
  const y1 = clamp((x * gamma[0] * p1) / P_mmHg, 0, 1);
  return { T_C, y1, gamma, psat: [p1, psatMmHg(system, 1, T_C)] };
}

function antoineTemperature(system, componentIndex, P_mmHg) {
  const { A, B, C } = system.antoine[componentIndex];
  return B / (A - Math.log10(P_mmHg)) - C;
}

const vleCache = new Map();

/** 生成 T–x–y 数据，缓存以支撑实时拖动压强。 */
export function vleCurve(system, P_atm, samples = 181) {
  const key = `${system.id}:${P_atm.toFixed(4)}:${samples}`;
  if (vleCache.has(key)) return vleCache.get(key);
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = i / samples;
    const { T_C, y1 } = bubblePoint(system, x, P_atm);
    points.push({ x, y: y1, T: T_C });
  }
  const result = {
    points,
    P_atm,
    Tmin: Math.min(...points.map((p) => p.T)),
    Tmax: Math.max(...points.map((p) => p.T)),
  };
  if (vleCache.size > 40) vleCache.clear();
  vleCache.set(key, result);
  return result;
}

export function bubbleAtComposition(system, P_atm, z) {
  const curve = vleCurve(system, P_atm);
  const q = clamp(z, 0, 1) * (curve.points.length - 1);
  const i = Math.min(curve.points.length - 2, Math.floor(q));
  const f = q - i;
  const a = curve.points[i];
  const b = curve.points[i + 1];
  return {
    T: a.T + (b.T - a.T) * f,
    y: a.y + (b.y - a.y) * f,
    x: clamp(z, 0, 1),
  };
}

/** 给定气相总组成 z，求露点温度与平衡液相组成。 */
export function dewAtComposition(system, P_atm, z) {
  const curve = vleCurve(system, P_atm);
  const target = clamp(z, 0, 1);
  if (target <= 1e-8) {
    return { T: curve.points[0].T, x: 0, y: 0 };
  }
  if (target >= 1 - 1e-8) {
    return { T: curve.points[curve.points.length - 1].T, x: 1, y: 1 };
  }
  let lo = 0;
  let hi = curve.points.length - 1;
  // y(x) 在两类体系中均单调递增
  for (let i = 0; i < 80; i += 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (curve.points[mid].y < target) lo = mid;
    else hi = mid;
    if (hi - lo <= 1) break;
  }
  const a = curve.points[lo];
  const b = curve.points[hi];
  const span = b.y - a.y;
  const f = span > 1e-9 ? (target - a.y) / span : 0;
  return {
    T: a.T + (b.T - a.T) * f,
    x: a.x + (b.x - a.x) * f,
    y: target,
  };
}

export function azeotrope(system, P_atm) {
  if (!system.azeotropic) return null;
  const curve = vleCurve(system, P_atm);
  const p = curve.points;
  for (let i = 1; i < p.length - 1; i += 1) {
    const d0 = p[i].y - p[i].x;
    const d1 = p[i + 1].y - p[i + 1].x;
    if (d0 >= 0 && d1 < 0) {
      const f = d0 / (d0 - d1);
      const x = p[i].x + (p[i + 1].x - p[i].x) * f;
      const T = p[i].T + (p[i + 1].T - p[i].T) * f;
      return { x, T, P_atm, y: x };
    }
  }
  return null;
}

export function binaryPurePoints(system, P_atm) {
  const p1 = bubblePoint(system, 0, P_atm);
  const p2 = bubblePoint(system, 1, P_atm);
  return {
    component2: { x: 0, T: p1.T_C }, // x(1)=0 -> 纯组分2
    component1: { x: 1, T: p2.T_C },
  };
}

/**
 * 双组分状态。固定总压 P（相图切片），用户给定总组成 z 与温度 T。
 * F = C − P + 2 = 2 − P + 2。
 */
export function binaryStateAt(system, P_atm, z, T_C) {
  const curve = vleCurve(system, P_atm);
  const zc = clamp(z, 0, 1);
  const bubble = bubbleAtComposition(system, P_atm, zc);
  const dew = dewAtComposition(system, P_atm, zc);
  const az = azeotrope(system, P_atm);
  const Tb = bubble.T;
  const Td = dew.T;

  const isAtAzeotrope =
    !!az && Math.abs(zc - az.x) <= 0.0045 && Math.abs(T_C - az.T) <= 0.18;

  if (isAtAzeotrope) {
    return {
      phaseKey: 'azeotrope',
      phase: '共沸点',
      phaseEn: 'AZEOTROPE',
      phases: 2,
      F: 2,
      fixedPF: 0,
      color: PHASE_META.azeotrope.color,
      soft: PHASE_META.azeotrope.soft,
      gradient: PHASE_META.azeotrope.gradient,
      T: T_C,
      P_atm,
      z: zc,
      x: az.x,
      y: az.y,
      liqFrac: null,
      vapFrac: null,
      Tb,
      Td,
      bubble,
      dew,
      azeotrope: az,
      constraintNote:
        '共沸点满足 x = y，这是一个附加约束；在固定总压的切片上，该点的温度与组成同时被确定（有效 f* = 0）。相律基准仍为 F = C − P + 2 = 2。',
      interpretation:
        '共沸点：液相与气相组成相同，x = y。简单蒸馏无法进一步改变组成；此时两组分像“单一组分”一样一起沸腾。',
      hint: system.id === 'ethanol-water'
        ? '乙醇–水在 101.325 kPa 下约 78.2 °C 共沸，乙醇摩尔分数约 0.895（约 95.6 wt%）。'
        : '该体系无共沸点。',
    };
  }

  if (T_C < Tb - 0.035) {
    return {
      phaseKey: 'liquid',
      phase: '液相',
      phaseEn: 'LIQUID',
      phases: 1,
      F: 3,
      fixedPF: 2,
      color: PHASE_META.liquid.color,
      soft: PHASE_META.liquid.soft,
      gradient: PHASE_META.liquid.gradient,
      T: T_C,
      P_atm,
      z: zc,
      x: zc,
      y: null,
      liqFrac: 1,
      vapFrac: 0,
      Tb,
      Td,
      bubble,
      dew,
      azeotrope: az,
      interpretation:
        '当前为液相单相区（未达泡点）。C = 2、P = 1，F = 2 − 1 + 2 = 3；固定总压后 f = 2，温度与组成可独立改变。',
      hint: '继续升温至泡点，第一批气泡出现，系统进入液–气两相区。',
    };
  }

  if (T_C > Td + 0.035) {
    return {
      phaseKey: 'vapor',
      phase: '气相',
      phaseEn: 'VAPOR',
      phases: 1,
      F: 3,
      fixedPF: 2,
      color: PHASE_META.vapor.color,
      soft: PHASE_META.vapor.soft,
      gradient: PHASE_META.vapor.gradient,
      T: T_C,
      P_atm,
      z: zc,
      x: null,
      y: zc,
      liqFrac: 0,
      vapFrac: 1,
      Tb,
      Td,
      bubble,
      dew,
      azeotrope: az,
      interpretation:
        '当前为气相单相区（超过露点）。C = 2、P = 1，F = 3；固定总压后 f = 2。',
      hint: '降温至露点，第一批液滴出现；继续降温进入两相区。',
    };
  }

  // 两相区：在 T 附近寻找包含总组成的结线
  const candidates = [];
  const p = curve.points;
  for (let i = 0; i < p.length - 1; i += 1) {
    const a = p[i];
    const b = p[i + 1];
    if ((a.T - T_C) * (b.T - T_C) <= 0 && Math.abs(b.T - a.T) > 1e-9) {
      const f = (T_C - a.T) / (b.T - a.T);
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      const lo = Math.min(x, y);
      const hi = Math.max(x, y);
      if (zc >= lo - 0.006 && zc <= hi + 0.006) {
        candidates.push({ x, y, width: Math.abs(y - x), distance: Math.abs(zc - (x + y) / 2) });
      }
    }
  }
  candidates.sort((a, b) => b.width - a.width || a.distance - b.distance);
  let tie = candidates[0];
  if (!tie) {
    tie = {
      x: bubble.x,
      y: bubble.y,
      width: Math.abs(bubble.y - bubble.x),
      distance: 0,
    };
  }
  const { x, y } = tie;
  const span = y - x;
  let liqFrac = Math.abs(span) > 1e-9 ? (y - zc) / span : 0;
  liqFrac = clamp(liqFrac, 0, 1);
  const vapFrac = 1 - liqFrac;

  return {
    phaseKey: 'two-phase',
    phase: '液–气两相',
    phaseEn: 'VAPOR–LIQUID',
    phases: 2,
    F: 2,
    fixedPF: 1,
    color: PHASE_META['two-phase'].color,
    soft: PHASE_META['two-phase'].soft,
    gradient: PHASE_META['two-phase'].gradient,
    T: T_C,
    P_atm,
    z: zc,
    x,
    y,
    liqFrac,
    vapFrac,
    Tb,
    Td,
    bubble,
    dew,
    azeotrope: az,
    interpretation:
      '当前处于液–气两相区。C = 2、P = 2，F = 2 − 2 + 2 = 2；固定总压后 f = 1，温度一旦确定，两相组成由相平衡关系确定。',
    hint: '杠杆规则：液相分数 L = (y − z) / (y − x)，气相分数 V = 1 − L。',
  };
}

export function formatPressure(Pa, digits = 3) {
  if (!Number.isFinite(Pa)) return '—';
  if (Pa >= 1e6) return `${(Pa / 1e6).toFixed(digits)} MPa`;
  if (Pa >= 1e3) return `${(Pa / 1e3).toFixed(digits)} kPa`;
  return `${Pa.toFixed(digits)} Pa`;
}

export function formatPressureShort(Pa) {
  if (!Number.isFinite(Pa)) return '—';
  if (Pa >= 1e6) return `${(Pa / 1e6).toFixed(2)} MPa`;
  if (Pa >= 1e3) return `${(Pa / 1e3).toFixed(2)} kPa`;
  return `${Pa.toFixed(1)} Pa`;
}

export function formatTemperature(T, unit = 'both') {
  if (!Number.isFinite(T)) return '—';
  const C = T - 273.15;
  if (unit === 'K') return `${T.toFixed(2)} K`;
  if (unit === 'C') return `${C.toFixed(2)} °C`;
  return `${T.toFixed(2)} K / ${C.toFixed(2)} °C`;
}

export function formatMole(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toFixed(3);
}
