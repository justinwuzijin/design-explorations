import { useMemo } from 'react';
import * as THREE from 'three';
import { PITCH } from '../sim/physics3d';

export default function Goal() {
  const net = useMemo(() => createNetTexture(), []);
  const w = PITCH.goalWidth;
  const h = PITCH.goalHeight;
  const d = PITCH.goalDepth;
  const z = PITCH.goalZ;
  const postR = 0.06;

  return (
    <group position={[0, 0, z]}>
      {/* Posts + crossbar */}
      <mesh position={[-w / 2, h / 2, 0]} castShadow>
        <cylinderGeometry args={[postR, postR, h, 16]} />
        <meshStandardMaterial color="#f7f7f2" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[w / 2, h / 2, 0]} castShadow>
        <cylinderGeometry args={[postR, postR, h, 16]} />
        <meshStandardMaterial color="#f7f7f2" roughness={0.35} metalness={0.15} />
      </mesh>
      <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[postR, postR, w + postR * 2, 16]} />
        <meshStandardMaterial color="#f7f7f2" roughness={0.35} metalness={0.15} />
      </mesh>

      {/* Back supports */}
      <mesh position={[-w / 2, h * 0.45, d * 0.55]} rotation={[0.55, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, d * 1.15, 12]} />
        <meshStandardMaterial color="#ecece8" roughness={0.4} />
      </mesh>
      <mesh position={[w / 2, h * 0.45, d * 0.55]} rotation={[0.55, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.04, d * 1.15, 12]} />
        <meshStandardMaterial color="#ecece8" roughness={0.4} />
      </mesh>

      {/* Net planes */}
      <mesh position={[0, h / 2, d * 0.95]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          map={net}
          transparent
          opacity={0.55}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[-w / 2, h / 2, d / 2]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial
          map={net}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[w / 2, h / 2, d / 2]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[d, h]} />
        <meshStandardMaterial
          map={net}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, h, d / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          map={net}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
          roughness={0.9}
        />
      </mesh>

      {/* Goal line mark */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[w, 0.1]} />
        <meshBasicMaterial color="#f5f5f0" />
      </mesh>
    </group>
  );
}

function createNetTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(235,235,230,0.85)';
  ctx.lineWidth = 1.5;
  const step = 14;
  for (let x = 0; x <= size; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
    ctx.stroke();
  }
  for (let y = 0; y <= size; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
