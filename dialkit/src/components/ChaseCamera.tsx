import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { BallState3D } from '../sim/physics3d';
import { PITCH } from '../sim/physics3d';

interface ChaseCameraProps {
  ball: BallState3D;
  distance: number;
  height: number;
  lag: number;
}

export default function ChaseCamera({ ball, distance, height, lag }: ChaseCameraProps) {
  const { camera } = useThree();
  const current = useRef(new THREE.Vector3(0, 2.2, PITCH.kickZ - 5));
  const look = useRef(new THREE.Vector3(0, 1, PITCH.goalZ));
  const velDir = useRef(new THREE.Vector3(0, 0, 1));

  useFrame((_, dt) => {
    const pos = ball.position;
    const vel = ball.velocity;
    const speed = Math.hypot(vel.x, vel.y, vel.z);

    if (speed > 0.4) {
      velDir.current.set(vel.x, 0, vel.z).normalize();
    } else {
      // Idle / settled: face the net
      velDir.current.set(0, 0, 1);
    }

    const behind = velDir.current.clone().multiplyScalar(-distance);
    const desired = new THREE.Vector3(
      pos.x + behind.x,
      pos.y + height,
      pos.z + behind.z
    );

    // Keep camera from clipping into the ground
    desired.y = Math.max(0.85, desired.y);

    const alpha = 1 - Math.exp(-dt / Math.max(0.02, lag));
    current.current.lerp(desired, alpha);

    const lookTarget = new THREE.Vector3(
      pos.x + velDir.current.x * 3.5,
      Math.max(0.6, pos.y + 0.35),
      Math.min(PITCH.goalZ + 1.5, pos.z + velDir.current.z * 3.5)
    );
    look.current.lerp(lookTarget, alpha);

    camera.position.copy(current.current);
    camera.lookAt(look.current);
  });

  return null;
}
