/** Simple 3D ballistics with drag + Magnus curve. */

export const BALL_R = 0.22;

export const PITCH = {
  length: 42,
  width: 28,
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2,
  /** Kick-off spot (behind the ball) → goal at +Z */
  kickZ: -16,
  goalZ: 18,
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface BallState3D {
  position: Vec3;
  velocity: Vec3;
  /** Angular velocity (rad/s). */
  omega: Vec3;
  spinning: boolean;
  grounded: boolean;
}

export interface ShotParams {
  power: number;
  loftDeg: number;
  aimX: number;
  curve: number;
}

const G = 9.81;
const DRAG = 0.12;
const MAGNUS = 0.028;
const RESTITUTION = 0.42;
const FRICTION = 0.82;

export function createIdleBall(): BallState3D {
  return {
    position: { x: 0, y: BALL_R, z: PITCH.kickZ },
    velocity: { x: 0, y: 0, z: 0 },
    omega: { x: 0, y: 0, z: 0 },
    spinning: false,
    grounded: true,
  };
}

export function launchBall(params: ShotParams): BallState3D {
  const speed = 12 + params.power * 0.55;
  const loft = (params.loftDeg * Math.PI) / 180;
  const aim = Math.atan2(params.aimX, PITCH.goalZ - PITCH.kickZ);

  const horiz = speed * Math.cos(loft);
  const vx = Math.sin(aim) * horiz;
  const vz = Math.cos(aim) * horiz;
  const vy = speed * Math.sin(loft);

  // Curve dial: negative = bend left, positive = bend right (topspin-side)
  const spinY = -params.curve * 0.55;
  const spinSide = params.curve * 0.35;

  return {
    position: { x: params.aimX * 0.08, y: BALL_R, z: PITCH.kickZ },
    velocity: { x: vx, y: vy, z: vz },
    omega: { x: -vz * 1.8, y: spinY, z: vx * 1.8 + spinSide },
    spinning: true,
    grounded: false,
  };
}

function len(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function integrate3D(state: BallState3D, dt: number): BallState3D {
  if (!state.spinning && state.grounded) return state;

  const speed = len(state.velocity);
  if (speed < 0.35 && state.position.y <= BALL_R + 0.01) {
    return {
      ...state,
      velocity: { x: 0, y: 0, z: 0 },
      omega: scale(state.omega, 0.5),
      spinning: false,
      grounded: true,
      position: { ...state.position, y: BALL_R },
    };
  }

  const drag = scale(state.velocity, -DRAG * speed);
  const magnus = scale(cross(state.omega, state.velocity), MAGNUS);
  const accel = add(add({ x: 0, y: -G, z: 0 }, drag), magnus);

  let velocity = add(state.velocity, scale(accel, dt));
  let position = add(state.position, scale(velocity, dt));
  let omega = scale(state.omega, Math.exp(-0.35 * dt));
  let grounded = false;

  if (position.y < BALL_R) {
    position = { ...position, y: BALL_R };
    if (velocity.y < 0) {
      velocity = {
        x: velocity.x * FRICTION,
        y: -velocity.y * RESTITUTION,
        z: velocity.z * FRICTION,
      };
      omega = scale(omega, 0.7);
      if (Math.abs(velocity.y) < 0.8) {
        velocity = { ...velocity, y: 0 };
        grounded = true;
      }
    }
  }

  // Soft side walls so the ball stays near the pitch
  const halfW = PITCH.width * 0.5 - BALL_R;
  if (position.x < -halfW) {
    position = { ...position, x: -halfW };
    velocity = { ...velocity, x: Math.abs(velocity.x) * 0.4 };
  } else if (position.x > halfW) {
    position = { ...position, x: halfW };
    velocity = { ...velocity, x: -Math.abs(velocity.x) * 0.4 };
  }

  return {
    position,
    velocity,
    omega,
    spinning: true,
    grounded,
  };
}

export function randomShotParams(base: ShotParams): ShotParams {
  const side = Math.random() < 0.5 ? -1 : 1;
  return {
    power: clamp(base.power + (Math.random() - 0.5) * 10, 8, 40),
    loftDeg: clamp(base.loftDeg + (Math.random() - 0.5) * 14, 6, 42),
    aimX: clamp((Math.random() - 0.5) * 5.5 * side, -3.2, 3.2),
    curve: clamp((Math.random() * 0.55 + 0.35) * side * 28, -40, 40),
  };
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}

/** True when the ball has crossed the goal line inside the posts. */
export function isGoal(state: BallState3D): boolean {
  const { position } = state;
  if (position.z < PITCH.goalZ - 0.15) return false;
  if (position.y > PITCH.goalHeight) return false;
  if (Math.abs(position.x) > PITCH.goalWidth * 0.5) return false;
  return true;
}
