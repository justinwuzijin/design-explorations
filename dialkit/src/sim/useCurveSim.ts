import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoccerDials } from '../dials/useSoccerDials';
import {
  createInitialState2D,
  getWind2D,
  integrate2D,
  kick2D,
  resamplePath,
  type BallState2D,
  type Vec2,
  FIELD,
} from './physics2d';

export type PlayPhase = 'idle' | 'playing' | 'done';

export interface CurveSim {
  ball: BallState2D;
  path: Vec2[];
  phase: PlayPhase;
  setPath: (pts: Vec2[]) => void;
  kick: () => void;
  reset: () => void;
  followPath: (pts: Vec2[]) => void;
}

export function useCurveSim(dials: SoccerDials): CurveSim {
  const [ball, setBall] = useState<BallState2D>(() => createInitialState2D());
  const [path, setPath] = useState<Vec2[]>([]);
  const [phase, setPhase] = useState<PlayPhase>('idle');

  const ballRef = useRef(ball);
  const pathRef = useRef(path);
  const phaseRef = useRef(phase);
  const dialsRef = useRef(dials);
  const followIdx = useRef(0);
  const followPts = useRef<Vec2[]>([]);
  const raf = useRef(0);
  const lastT = useRef(0);
  const elapsed = useRef(0);

  ballRef.current = ball;
  pathRef.current = path;
  phaseRef.current = phase;
  dialsRef.current = dials;

  const stopLoop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
  }, []);

  const reset = useCallback(() => {
    stopLoop();
    const s = createInitialState2D();
    setBall(s);
    setPhase('idle');
    followIdx.current = 0;
    followPts.current = [];
    elapsed.current = 0;
  }, [stopLoop]);

  const kick = useCallback(() => {
    const d = dialsRef.current;
    stopLoop();
    elapsed.current = 0;

    if (d.path.mode === 'draw' || d.path.mode === 'edit') {
      const pts = pathRef.current;
      if (pts.length < 2) {
        setPhase('idle');
        return;
      }
      followPts.current = pts;
      followIdx.current = 0;
      setBall({
        ...createInitialState2D(),
        position: { ...pts[0] },
        omega: -d.kick.sideSpin * 0.55,
      });
      setPhase('playing');
      return;
    }

    // Physics mode: live Magnus integrate; trail samples as it flies
    const kicked = kick2D(
      d.kick.power,
      d.kick.aimX,
      d.kick.sideSpin,
      d.kick.launchAngleDeg
    );
    setPath([{ ...kicked.position }]);
    setBall(kicked);
    setPhase('playing');
  }, [stopLoop]);

  const followPath = useCallback(
    (pts: Vec2[]) => {
      setPath(pts);
      followPts.current = pts;
      followIdx.current = 0;
      if (pts.length) {
        setBall({
          ...createInitialState2D(),
          position: { ...pts[0] },
          omega: -dialsRef.current.kick.sideSpin * 0.55,
        });
      }
    },
    []
  );

  // Animation loop
  useEffect(() => {
    if (phase !== 'playing') {
      stopLoop();
      return;
    }

    lastT.current = performance.now();

    const tick = (now: number) => {
      const d = dialsRef.current;
      if (d.time.freeze) {
        lastT.current = now;
        raf.current = requestAnimationFrame(tick);
        return;
      }

      let dt = ((now - lastT.current) / 1000) * d.time.timeScale;
      lastT.current = now;
      dt = Math.min(dt, 0.05);
      elapsed.current += dt;

      if (d.path.mode === 'physics') {
        const wind = getWind2D(
          d.wind.strength,
          d.wind.directionDeg,
          d.wind.gust,
          elapsed.current
        );
        const next = integrate2D(ballRef.current, wind, dt);
        setBall(next);

        // Append trail sample
        setPath((prev) => {
          const last = prev[prev.length - 1];
          if (
            !last ||
            Math.hypot(next.position.x - last.x, next.position.y - last.y) > 0.08
          ) {
            return [...prev, { ...next.position }];
          }
          return prev;
        });

        if (
          next.position.y >= FIELD.length ||
          (Math.hypot(next.velocity.x, next.velocity.y) < 0.2 &&
            elapsed.current > 0.5)
        ) {
          setPhase('done');
          return;
        }
      } else {
        // Follow path (draw / edit) with spin from sideSpin + path curvature
        const pts = followPts.current;
        if (pts.length < 2) {
          setPhase('done');
          return;
        }

        const speed = d.kick.power * 0.35 * d.time.timeScale;
        let idx = followIdx.current;
        let distBudget = speed * dt;
        let x = ballRef.current.position.x;
        let y = ballRef.current.position.y;
        let spin = ballRef.current.spinAngle;
        let omega = -d.kick.sideSpin * 0.55;

        while (distBudget > 0 && idx < pts.length - 1) {
          const a = pts[idx];
          const b = pts[idx + 1];
          const seg = Math.hypot(b.x - a.x, b.y - a.y) || 1e-6;
          const dx = b.x - x;
          const dy = b.y - y;
          const remain = Math.hypot(dx, dy);

          // Curvature-ish: add omega from heading change
          if (idx > 0) {
            const prev = pts[idx - 1];
            const h1 = Math.atan2(a.y - prev.y, a.x - prev.x);
            const h2 = Math.atan2(b.y - a.y, b.x - a.x);
            let dh = h2 - h1;
            while (dh > Math.PI) dh -= Math.PI * 2;
            while (dh < -Math.PI) dh += Math.PI * 2;
            omega += dh * 8;
          }

          if (remain <= distBudget) {
            distBudget -= remain;
            x = b.x;
            y = b.y;
            idx++;
            followIdx.current = idx;
          } else {
            const u = distBudget / remain;
            x += dx * u;
            y += dy * u;
            distBudget = 0;
          }
        }

        spin += omega * dt;
        setBall({
          position: { x, y },
          velocity: { x: 0, y: speed },
          omega,
          spinAngle: spin,
        });

        if (followIdx.current >= pts.length - 1) {
          setPhase('done');
          return;
        }
      }

      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return stopLoop;
  }, [phase, stopLoop]);

  useEffect(() => {
    const onKick = () => kick();
    const onReset = () => {
      reset();
      if (dialsRef.current.path.mode === 'physics') setPath([]);
    };
    window.addEventListener('soccer:kick', onKick);
    window.addEventListener('soccer:reset', onReset);
    return () => {
      window.removeEventListener('soccer:kick', onKick);
      window.removeEventListener('soccer:reset', onReset);
    };
  }, [kick, reset]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        kick();
      } else if (e.key === 'r' || e.key === 'R') {
        reset();
        if (dialsRef.current.path.mode === 'physics') setPath([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kick, reset]);

  // When entering edit mode, resample current path into drag handles once
  const prevMode = useRef(dials.path.mode);
  useEffect(() => {
    if (dials.path.mode === 'edit' && prevMode.current !== 'edit') {
      const pts = pathRef.current;
      if (pts.length > 2) setPath(resamplePath(pts, 12));
    }
    prevMode.current = dials.path.mode;
  }, [dials.path.mode]);

  return {
    ball,
    path,
    phase,
    setPath,
    kick,
    reset,
    followPath,
  };
}
