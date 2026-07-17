/** 2D top-down (birds-eye) ball physics with drag + Magnus curve. */

export interface Vec2 {
  x: number;
  y: number;
}

export interface BallState2D {
  position: Vec2;
  velocity: Vec2;
  /** Angular speed around vertical axis (rad/s). Sign → curve direction. */
  omega: number;
  /** Visual spin angle (rad) for texture rotation. */
  spinAngle: number;
}

export interface Physics2DParams {
  dragCoeff: number;
  magnusCoeff: number;
  fieldLength: number;
  fieldHalfWidth: number;
  ballRadius: number;
}

export const FIELD = {
  length: 36,
  halfWidth: 12,
  ballRadius: 0.55,
} as const;

const DEFAULT_PARAMS: Physics2DParams = {
  dragCoeff: 0.045,
  magnusCoeff: 0.12,
  fieldLength: FIELD.length,
  fieldHalfWidth: FIELD.halfWidth,
  ballRadius: FIELD.ballRadius,
};

export function createInitialState2D(): BallState2D {
  return {
    position: { x: 0, y: 1.2 },
    velocity: { x: 0, y: 0 },
    omega: 0,
    spinAngle: 0,
  };
}

export function getWind2D(
  strength: number,
  directionDeg: number,
  gust: boolean,
  timeSec: number
): Vec2 {
  const dirRad = (directionDeg * Math.PI) / 180;
  const gustMul = gust ? 1 + Math.sin(timeSec * 3) * 0.28 : 1;
  const s = strength * gustMul * 0.35;
  // 0° = toward top of screen (+y), 90° = +x
  return {
    x: Math.sin(dirRad) * s,
    y: Math.cos(dirRad) * s,
  };
}

export function kick2D(
  power: number,
  aimX: number,
  sideSpin: number,
  launchAngleDeg: number
): BallState2D {
  // launchAngleDeg still useful as "drive vs loft" → maps to forward speed bias
  const loft = Math.cos(((launchAngleDeg - 25) * Math.PI) / 180);
  const speed = power * 0.55 * (0.85 + 0.15 * loft);
  const aimRad = Math.atan2(aimX, FIELD.length * 0.85);

  return {
    position: { x: 0, y: 1.2 },
    velocity: {
      x: Math.sin(aimRad) * speed,
      y: Math.cos(aimRad) * speed,
    },
    // sideSpin dial [-50,50] → rad/s; positive = curve right (conventional top-spin-left in 2D)
    omega: -sideSpin * 0.55,
    spinAngle: 0,
  };
}

function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function integrate2D(
  state: BallState2D,
  wind: Vec2,
  dt: number,
  substeps = 6,
  params: Physics2DParams = DEFAULT_PARAMS
): BallState2D {
  const subDt = dt / substeps;
  let { x, y } = state.position;
  let vx = state.velocity.x;
  let vy = state.velocity.y;
  let omega = state.omega;
  let spinAngle = state.spinAngle;

  for (let i = 0; i < substeps; i++) {
    const vrx = vx - wind.x;
    const vry = vy - wind.y;
    const speed = Math.hypot(vrx, vry);

    let ax = 0;
    let ay = 0;

    if (speed > 1e-4) {
      // Quadratic drag
      const drag = params.dragCoeff * speed;
      ax -= (vrx / speed) * drag * speed;
      ay -= (vry / speed) * drag * speed;

      // Magnus in 2D: force ⊥ to relative velocity, proportional to ω × |v|
      // F = k * ω × v_rel  →  (ax, ay) += k * ω * (-vry, vrx) / |v| * |v|
      // Simplified: a = k * ω * perp(v_rel)
      ax += params.magnusCoeff * omega * -vry;
      ay += params.magnusCoeff * omega * vrx;
    }

    vx += ax * subDt;
    vy += ay * subDt;
    x += vx * subDt;
    y += vy * subDt;

    // Soft side bounds
    const maxX = params.fieldHalfWidth - params.ballRadius;
    if (x < -maxX) {
      x = -maxX;
      vx *= -0.35;
      omega *= 0.7;
    } else if (x > maxX) {
      x = maxX;
      vx *= -0.35;
      omega *= 0.7;
    }

    // Spin down slowly from air friction
    omega *= 0.9992;
    spinAngle += omega * subDt;
  }

  return {
    position: { x, y },
    velocity: { x: vx, y: vy },
    omega,
    spinAngle,
  };
}

export function simulateTrajectory(
  kickState: BallState2D,
  windFn: (t: number) => Vec2,
  opts?: { dt?: number; maxTime?: number; endY?: number }
): Vec2[] {
  const dt = opts?.dt ?? 1 / 60;
  const maxTime = opts?.maxTime ?? 8;
  const endY = opts?.endY ?? FIELD.length;
  const points: Vec2[] = [{ ...kickState.position }];
  let state = kickState;
  let t = 0;

  while (t < maxTime && state.position.y < endY) {
    const wind = windFn(t);
    state = integrate2D(state, wind, dt);
    t += dt;
    if (len(state.velocity) < 0.15 && t > 0.4) break;
    points.push({ ...state.position });
  }

  return points;
}

/** Convert world points → SVG path `d` (viewBox space already mapped). */
export function pointsToPathD(points: Vec2[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (const p of rest) {
    d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
  }
  return d;
}

function fmt(n: number) {
  return (Math.round(n * 1000) / 1000).toString();
}

/** Resample polyline to N evenly-spaced points for edit handles. */
export function resamplePath(points: Vec2[], count: number): Vec2[] {
  if (points.length === 0) return [];
  if (points.length === 1 || count <= 1) return [{ ...points[0] }];

  const segLens: number[] = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLens.push(total);
  }
  if (total < 1e-6) return Array.from({ length: count }, () => ({ ...points[0] }));

  const out: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    let s = 1;
    while (s < segLens.length - 1 && segLens[s] < target) s++;
    const a = points[s - 1];
    const b = points[s];
    const segStart = segLens[s - 1];
    const segEnd = segLens[s];
    const u = segEnd > segStart ? (target - segStart) / (segEnd - segStart) : 0;
    out.push({
      x: a.x + (b.x - a.x) * u,
      y: a.y + (b.y - a.y) * u,
    });
  }
  return out;
}

/** Catmull-Rom → cubic Bezier SVG path for a refined look when copying. */
export function pointsToSmoothPathD(points: Vec2[]): string {
  if (points.length < 2) return pointsToPathD(points);
  if (points.length === 2) {
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${fmt(c1x)} ${fmt(c1y)}, ${fmt(c2x)} ${fmt(c2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return d;
}
