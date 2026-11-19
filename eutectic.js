/**
 * Bi–Cd 简单低共熔体系
 * ------------------------------------------------------------------
 * 标准数据（常压凝聚体系）：
 *   T_m(Bi) = 271.4 °C = 544.55 K, ΔH_fus(Bi) = 11.30 kJ mol^-1
 *   T_m(Cd) = 321.07 °C = 594.22 K, ΔH_fus(Cd) = 6.19 kJ mol^-1
 *   低共熔点 T_E = 144.0 °C = 417.15 K
 *   低共熔组成 x(Bi) ≈ 0.446（约 60 wt% Bi / 40 wt% Cd）
 *
 * 液相线采用理想凝固点降低方程，并用两参数 Margules 活度系数
 * 对低共熔点做热力学一致校正；两条液相线在 E 点严格相交。
 * 固相按 Bi、Cd 互溶度可忽略的简单低共熔模型处理。
 */

import { R } from './science.js';

export const BI_CD = Object.freeze({
  id: 'bi-cd',
  kind: 'eutectic',
  label: 'Bi–Cd',
  en: 'BISMUTH / CADMIUM',
  xLabel: 'Bi 摩尔分数',
  xShort: 'x(Bi)',
  component1: 'Bi',
  component2: 'Cd',
  component1Short: 'Bi',
  component2Short: 'Cd',
  azeotropic: false,
  colors: {
    liquid: '#2dd4bf',
    bi: '#fb923c',
    cd: '#a78bfa',
    tie: '#f0abfc',
    eutectic: '#f0abfc',
  },
  TmBi: 544.55,
  TmCd: 594.22,
  HfBi: 11300,
  HfCd: 6190,
  TE: 417.15,
  TE_C: 144.0,
  xE: 0.446,
  A12: 0.27946925,
  A21: 0.13130382,
  note: '简单低共熔；固相互溶度可忽略。低共熔点约 144 °C，x(Bi) ≈ 0.446（约 60 wt% Bi）。',
});

export const EUTECTIC_DOMAIN = Object.freeze({
  Tmin: 100,
  Tmax: 340,
  depth: 0.9,
});

const M_BI = 208.98;
const M_CD = 112.41;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function gammaBiCd(xBi) {
  const x1 = clamp(xBi, 1e-9, 1 - 1e-9);
  const x2 = 1 - x1;
  const lnGammaBi = x2 * x2 * (BI_CD.A12 + 2 * (BI_CD.A21 - BI_CD.A12) * x1);
  const lnGammaCd = x1 * x1 * (BI_CD.A21 + 2 * (BI_CD.A12 - BI_CD.A21) * x2);
  return [Math.exp(lnGammaBi), Math.exp(lnGammaCd)];
}

/** Bi 液相线温度（K）；xBi 为液相中 Bi 的摩尔分数。 */
export function biLiquidusK(xBi) {
  if (xBi <= 0) return 0;
  if (xBi >= 1) return BI_CD.TmBi;
  const [gammaBi] = gammaBiCd(xBi);
  return 1 / (1 / BI_CD.TmBi - (R / BI_CD.HfBi) * Math.log(xBi * gammaBi));
}

/** Cd 液相线温度（K）；xBi 为液相中 Bi 的摩尔分数。 */
export function cdLiquidusK(xBi) {
  if (xBi <= 0) return BI_CD.TmCd;
  if (xBi >= 1) return 0;
  const [, gammaCd] = gammaBiCd(xBi);
  const xCd = 1 - xBi;
  return 1 / (1 / BI_CD.TmCd - (R / BI_CD.HfCd) * Math.log(xCd * gammaCd));
}

/** 物理液相线：左侧 Cd 富集支；右侧 Bi 富集支。 */
export function liquidusK(xBi) {
  return xBi < BI_CD.xE ? cdLiquidusK(xBi) : biLiquidusK(xBi);
}

export function liquidusC(xBi) {
  return liquidusK(xBi) - 273.15;
}

export function weightPercentBi(xBi) {
  const massBi = xBi * M_BI;
  return (massBi / (massBi + (1 - xBi) * M_CD)) * 100;
}

/** 给定温度与分支，反解液相组成 x(Bi)。 */
export function liquidCompositionAt(T_C, side) {
  if (T_C <= BI_CD.TE_C) return side === 'cd' ? 0 : BI_CD.xE;
  if (side === 'cd') {
    if (T_C >= BI_CD.TmCd - 273.15) return 0;
    let lo = 0;
    let hi = BI_CD.xE;
    for (let i = 0; i < 80; i += 1) {
      const mid = (lo + hi) / 2;
      if (cdLiquidusK(mid) - 273.15 > T_C) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }
  if (T_C >= BI_CD.TmBi - 273.15) return 1;
  let lo = BI_CD.xE;
  let hi = 1;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (biLiquidusK(mid) - 273.15 < T_C) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** 用于三维场景的液相线采样。 */
export function eutecticCurves(samples = 120) {
  const left = [];
  const right = [];
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const x = u * BI_CD.xE;
    left.push({ x, T_C: cdLiquidusK(x) - 273.15 });
  }
  for (let i = 0; i <= samples; i += 1) {
    const u = i / samples;
    const x = BI_CD.xE + u * (1 - BI_CD.xE);
    right.push({ x, T_C: biLiquidusK(x) - 273.15 });
  }
  return {
    left,
    right,
    eutectic: { x: BI_CD.xE, T_C: BI_CD.TE_C },
    pureCd: { x: 0, T_C: BI_CD.TmCd - 273.15 },
    pureBi: { x: 1, T_C: BI_CD.TmBi - 273.15 },
  };
}

function result(phaseKey, phases, extras = {}) {
  const meta = {
    liquid: { label: '液相 L', en: 'LIQUID', color: '#2dd4bf' },
    'liquid-solid-cd': { label: 'L + Cd(s)', en: 'LIQUID + Cd(s)', color: '#c4b5fd' },
    'liquid-solid-bi': { label: 'L + Bi(s)', en: 'LIQUID + Bi(s)', color: '#fdba74' },
    'solid-mixture': { label: 'Bi(s) + Cd(s)', en: 'SOLID MIXTURE', color: '#a5b4fc' },
    eutectic: { label: '低共熔三相', en: 'EUTECTIC', color: '#f0abfc' },
    solid: { label: '固相', en: 'SOLID', color: '#a5b4fc' },
    'pure-melting': { label: '纯组分熔化', en: 'PURE MELTING', color: '#93c5fd' },
  }[phaseKey];
  const F = 4 - phases;
  return {
    phaseKey,
    phase: meta.label,
    phaseEn: meta.en,
    phases,
    F,
    fixedPF: F - 1,
    color: meta.color,
    soft: meta.color,
    gradient: [meta.color, meta.color],
    ...extras,
  };
}

/**
 * Bi–Cd 状态计算。T_C 为摄氏度，x 为总组成 x(Bi)。
 * 固定常压 P = 101.325 kPa，相律基准 F = C − P + 2，固定 P 后 f = F − 1。
 */
export function biCdStateAt(x, T_C) {
  const xc = clamp(x, 0, 1);
  const T = T_C;
  const xE = BI_CD.xE;
  const tE = BI_CD.TE_C;

  // 纯组分端点
  if (xc <= 0.0008 || xc >= 0.9992) {
    const isBi = xc >= 0.5;
    const name = isBi ? 'Bi' : 'Cd';
    const Tm = (isBi ? BI_CD.TmBi : BI_CD.TmCd) - 273.15;
    if (Math.abs(T - Tm) <= 0.12) {
      return result('pure-melting', 2, {
        T,
        x: xc,
        xL: null,
        xS: isBi ? 1 : 0,
        liquidFrac: null,
        solidFrac: null,
        interpretation: `${name} 纯组分在熔点附近固液共存。C = 2、P = 2，F = 2；固定 P 后 f = 1。`,
        hint: `纯 ${name} 熔点 ${Tm.toFixed(2)} °C。`,
      });
    }
    if (T > Tm) {
      return result('liquid', 1, {
        T,
        x: xc,
        xL: xc,
        xS: null,
        liquidFrac: 1,
        solidFrac: 0,
        interpretation: `纯 ${name} 熔体，单液相。C = 2、P = 1，F = 3；固定 P 后 f = 2。`,
        hint: `温度高于纯 ${name} 熔点。`,
      });
    }
    return result('solid', 1, {
      T,
      x: xc,
      xL: null,
      xS: isBi ? 1 : 0,
      liquidFrac: 0,
      solidFrac: 1,
      interpretation: `纯 ${name} 固相。C = 2、P = 1，F = 3；固定 P 后 f = 2。`,
      hint: `温度低于纯 ${name} 熔点。`,
    });
  }

  // 低共熔三相点（恒温线）
  if (Math.abs(T - tE) <= 0.12) {
    return result('eutectic', 3, {
      T,
      x: xc,
      xL: xE,
      xS: null,
      liquidFrac: null,
      solidFrac: null,
      isEutectic: true,
      interpretation:
        '低共熔三相共存：L_E ⇌ Bi(s) + Cd(s)。C = 2、P = 3，F = 1；固定 P 后 f = 0，温度与三相组成被同时锁定。',
      hint: '低共熔点的相分数不是杠杆规则的唯一解，而取决于冷却 / 加热历史。',
    });
  }

  const Tliq = liquidusC(xc);

  if (T > Tliq + 0.15) {
    return result('liquid', 1, {
      T,
      x: xc,
      xL: xc,
      xS: null,
      liquidFrac: 1,
      solidFrac: 0,
      interpretation:
        '当前位于液相单相区。C = 2、P = 1，F = 3；固定 P 后 f = 2，温度与总组成可独立改变。',
      hint: '继续降温到液相线，开始析出 Bi 或 Cd 晶体。',
    });
  }

  if (T < tE - 0.12) {
    return result('solid-mixture', 2, {
      T,
      x: xc,
      xL: null,
      xS: null,
      liquidFrac: 0,
      solidFrac: 1,
      biFrac: xc,
      cdFrac: 1 - xc,
      leverType: 'solid',
      interpretation:
        '低共熔点以下：Bi(s) 与 Cd(s) 两固相共存。C = 2、P = 2，F = 2；固定 P 后 f = 1。相分数由杠杆规则给出。',
      hint: `Bi(s) 分数 = x = ${xc.toFixed(3)}；Cd(s) 分数 = 1 − x = ${(1 - xc).toFixed(3)}。`,
    });
  }

  const side = xc < xE ? 'cd' : 'bi';
  const xL = liquidCompositionAt(T, side);
  if (side === 'cd') {
    const liquidFrac = clamp(xc / Math.max(xL, 1e-8), 0, 1);
    return result('liquid-solid-cd', 2, {
      T,
      x: xc,
      xL,
      xS: 0,
      liquidFrac,
      solidFrac: 1 - liquidFrac,
      leverType: 'liquid-solid',
      interpretation:
        '液–固两相区：液相 L 与纯 Cd(s) 共存。C = 2、P = 2，F = 2；固定 P 后 f = 1。',
      hint: `杠杆规则：L = x / x_L = ${liquidFrac.toFixed(3)}；Cd(s) = 1 − L。`,
    });
  }

  const liquidFrac = clamp((1 - xc) / Math.max(1 - xL, 1e-8), 0, 1);
  return result('liquid-solid-bi', 2, {
    T,
    x: xc,
    xL,
    xS: 1,
    liquidFrac,
    solidFrac: 1 - liquidFrac,
    leverType: 'liquid-solid',
    interpretation:
      '液–固两相区：液相 L 与纯 Bi(s) 共存。C = 2、P = 2，F = 2；固定 P 后 f = 1。',
    hint: `杠杆规则：L = (1 − x) / (1 − x_L) = ${liquidFrac.toFixed(3)}；Bi(s) = 1 − L。`,
  });
}

export function eutecticTemperatureReadout() {
  return {
    T_C: BI_CD.TE_C,
    xBi: BI_CD.xE,
    wtBi: weightPercentBi(BI_CD.xE),
    TmBiC: BI_CD.TmBi - 273.15,
    TmCdC: BI_CD.TmCd - 273.15,
  };
}
