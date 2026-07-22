import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import type { SoccerDials } from '../dials/useSoccerDials';
import type { BallState3D } from '../sim/physics3d';
import { PITCH } from '../sim/physics3d';
import SoccerBall from './SoccerBall';
import Pitch from './Pitch';
import Goal from './Goal';
import ChaseCamera from './ChaseCamera';

interface BallStageProps {
  dials: SoccerDials;
  ball: BallState3D;
  status: 'idle' | 'flight' | 'goal' | 'miss';
}

function Scene({ dials, ball }: BallStageProps) {
  return (
    <>
      <color attach="background" args={['#6fa8d4']} />
      <fog attach="fog" args={['#8eb6d4', 45, 95]} />

      <ambientLight intensity={0.7} />
      <directionalLight
        position={[14, 24, 10]}
        intensity={1.55}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-far={70}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
        color="#fff1d0"
      />
      <hemisphereLight args={['#c5dcff', '#3f5c30', 0.65]} />

      <Pitch />
      <Goal />
      <SoccerBall ball={ball} />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[ball.position.x, 0.015, ball.position.z]}
      >
        <circleGeometry args={[0.32 + Math.max(0, ball.position.y - 0.22) * 0.28, 24]} />
        <meshBasicMaterial color="#142010" transparent opacity={0.3} depthWrite={false} />
      </mesh>

      <ChaseCamera
        ball={ball}
        distance={dials.cam.distance}
        height={dials.cam.height}
        lag={dials.cam.lag}
      />
    </>
  );
}

export default function BallStage(props: BallStageProps) {
  return (
    <Canvas
      className="ball-canvas"
      shadows
      dpr={[1, 1.75]}
      camera={{
        position: [0, 2.4, PITCH.kickZ - 5.5],
        fov: 40,
        near: 0.1,
        far: 120,
      }}
      gl={{
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor('#6fa8d4', 1);
        gl.shadowMap.type = THREE.PCFShadowMap;
        camera.lookAt(0, 1, PITCH.goalZ);
      }}
    >
      <Scene {...props} />
    </Canvas>
  );
}
