import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { SoccerDials } from '../dials/useSoccerDials';
import type { BallState2D, Vec2 } from '../sim/physics2d';
import { FIELD } from '../sim/physics2d';
import SoccerBall, { pathToWorld } from './SoccerBall';

interface BallStageProps {
  dials: SoccerDials;
  ball: BallState2D;
  path: Vec2[];
}

function PathRibbon({ path, loft }: { path: Vec2[]; loft: number }) {
  const points = useMemo(() => {
    if (path.length < 2) return null;
    return path.map(
      (p) => pathToWorld(p.x, p.y, loft, FIELD.length)
    );
  }, [path, loft]);

  if (!points) return null;

  return (
    <Line
      points={points}
      color="#ff6b35"
      lineWidth={2}
      transparent
      opacity={0.55}
    />
  );
}

function Scene({ dials, ball, path }: BallStageProps) {
  const loft = dials.kick.launchAngleDeg;

  return (
    <>
      <color attach="background" args={['#0c0e12']} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[4, 8, 3]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-3, 2, -4]} intensity={0.35} color="#a8c4ff" />

      <Suspense fallback={null}>
        <Environment preset="studio" environmentIntensity={0.7} />
      </Suspense>

      <PathRibbon path={path} loft={loft} />
      <SoccerBall ball={ball} loft={loft} fieldLength={FIELD.length} />

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.45}
        scale={28}
        blur={2.4}
        far={12}
        resolution={512}
        color="#000000"
      />

      {/* Soft floor cue — not a pitch, just grounds the shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshBasicMaterial color="#0c0e12" />
      </mesh>
    </>
  );
}

export default function BallStage(props: BallStageProps) {
  return (
    <Canvas
      className="ball-canvas"
      shadows
      camera={{ position: [5.5, 4.2, 9], fov: 38, near: 0.1, far: 80 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ camera }) => {
        camera.lookAt(0, 1.2, 0);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
