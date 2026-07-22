import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoccerDials } from '../dials/useSoccerDials';
import {
  createIdleBall,
  integrate3D,
  isGoal,
  launchBall,
  PITCH,
  randomShotParams,
  type BallState3D,
  type ShotParams,
} from './physics3d';

export interface ShotSim {
  ball: BallState3D;
  status: 'idle' | 'flight' | 'goal' | 'miss';
  kick: () => void;
  reset: () => void;
}

export function useShotSim(dials: SoccerDials): ShotSim {
  const [ball, setBall] = useState<BallState3D>(() => createIdleBall());
  const [status, setStatus] = useState<ShotSim['status']>('idle');

  const ballRef = useRef(ball);
  const statusRef = useRef(status);
  const dialsRef = useRef(dials);
  const lastShot = useRef<ShotParams | null>(null);
  const autoTimer = useRef<number | null>(null);

  ballRef.current = ball;
  statusRef.current = status;
  dialsRef.current = dials;

  const clearAuto = () => {
    if (autoTimer.current != null) {
      window.clearTimeout(autoTimer.current);
      autoTimer.current = null;
    }
  };

  const kick = useCallback(() => {
    clearAuto();
    const d = dialsRef.current;
    const base: ShotParams = {
      power: d.shot.power,
      loftDeg: d.shot.loftDeg,
      aimX: d.shot.aimX,
      curve: d.shot.curve,
    };
    const params = d.shot.varyDirections ? randomShotParams(base) : base;
    lastShot.current = params;
    const next = launchBall(params);
    ballRef.current = next;
    statusRef.current = 'flight';
    setBall(next);
    setStatus('flight');
  }, []);

  const reset = useCallback(() => {
    clearAuto();
    const idle = createIdleBall();
    ballRef.current = idle;
    statusRef.current = 'idle';
    setBall(idle);
    setStatus('idle');
  }, []);

  useEffect(() => {
    let raf = 0;
    let prev = performance.now();

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const rawDt = Math.min(0.05, (now - prev) / 1000);
      prev = now;

      const d = dialsRef.current;
      if (d.time.freeze) return;
      // idle / miss / settled goal — wait for next kick
      if (statusRef.current === 'idle' || statusRef.current === 'miss') return;
      if (
        statusRef.current === 'goal' &&
        !ballRef.current.spinning &&
        ballRef.current.grounded &&
        autoTimer.current != null
      ) {
        return;
      }

      const dt = rawDt * d.time.timeScale;
      let next = ballRef.current;
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        next = integrate3D(next, h);
      }

      ballRef.current = next;
      setBall(next);

      let scored = statusRef.current === 'goal';
      if (
        !scored &&
        next.position.z >= PITCH.goalZ &&
        next.position.y <= PITCH.goalHeight + 0.15 &&
        Math.abs(next.position.x) <= PITCH.goalWidth * 0.5 + 0.1
      ) {
        scored = true;
        statusRef.current = 'goal';
        setStatus('goal');
      }

      const done =
        (!next.spinning && next.grounded) ||
        next.position.z > 26 ||
        next.position.y < -1;

      if (done) {
        const ended: ShotSim['status'] = scored || isGoal(next) ? 'goal' : 'miss';
        statusRef.current = ended;
        setStatus(ended);

        if (d.shot.autoReplay && autoTimer.current == null) {
          autoTimer.current = window.setTimeout(() => kick(), ended === 'goal' ? 950 : 700);
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearAuto();
    };
  }, [kick]);

  useEffect(() => {
    const onKick = () => kick();
    const onReset = () => reset();
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        kick();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
      }
    };
    window.addEventListener('soccer:kick', onKick);
    window.addEventListener('soccer:reset', onReset);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('soccer:kick', onKick);
      window.removeEventListener('soccer:reset', onReset);
      window.removeEventListener('keydown', onKey);
    };
  }, [kick, reset]);

  // Auto-start first shot
  useEffect(() => {
    const t = window.setTimeout(() => kick(), 400);
    return () => window.clearTimeout(t);
  }, [kick]);

  return { ball, status, kick, reset };
}
