import * as THREE from "three";
import { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Image, Environment, Text } from "@react-three/drei";
import { easing } from "maath";
import type { Team } from "./types";
import { API_BASE_URL } from "./api/config";
import { flipImageHorizontally } from "./flipImage";
import "./util";
import "./TeamPickerScreen.css";
import googleSansFlexUrl from "./assets/fonts/GoogleSansFlex-Regular.woff";

interface TeamPickerScreenProps {
  onSelect: (teamId: number) => void;
  onBack: () => void;
}

// Drag state lives outside components so Rig's useFrame can read it every frame
const drag = { targetY: 0, isDragging: false, lastX: 0 };

function logoUrl(team: Team): string {
  if (!team.abbreviation) return "";
  return `https://a.espncdn.com/i/teamlogos/wnba/500/${team.abbreviation.toLowerCase()}.png`;
}

function TeamPickerScreen({ onSelect, onBack }: TeamPickerScreenProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/teams`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
      })
      .then((data: Team[]) => setTeams(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div
      className="picker-body"
      style={{ position: "relative", width: "100%", height: "100vh" }}
      onPointerDown={(e) => { drag.isDragging = true; drag.lastX = e.clientX; }}
      onPointerMove={(e) => {
        if (!drag.isDragging) return;
        drag.targetY -= (e.clientX - drag.lastX) * 0.004;
        drag.lastX = e.clientX;
      }}
      onPointerUp={() => { drag.isDragging = false; }}
      onPointerLeave={() => { drag.isDragging = false; }}
      onWheel={(e) => { drag.targetY -= e.deltaY * 0.002; }}
    >
      <div style={{ position: "absolute", top: 16, left: 16, zIndex: 10 }}>
        <button className="picker-back" onClick={onBack}>&larr; Back</button>
      </div>

      <div
        style={{
          position: "absolute",
          top: 16,
          width: "100%",
          textAlign: "center",
          zIndex: 10,
          pointerEvents: "none",
        }}
      >
        <h1 className="picker-title">Pick your favorite team</h1>
        <p className="picker-subtitle">Drag or scroll to rotate, click a logo to select</p>
      </div>

      {error && (
        <div className="picker-status" style={{ position: "absolute", top: 100, width: "100%", textAlign: "center" }}>
          Failed to load teams: {error}
        </div>
      )}

      {!error && teams.length === 0 && (
        <div className="picker-status" style={{ position: "absolute", top: 100, width: "100%", textAlign: "center" }}>
          Loading teams...
        </div>
      )}

      {teams.length > 0 && (
        <Canvas camera={{ position: [0, 0, 100], fov: 15 }}>

          <fog attach="fog" args={["#a79", 8.5, 12]} />
          <Rig rotation={[0, 0, 0.15]}>
            <Carousel teams={teams} onSelect={onSelect} />
          </Rig>
          <Environment preset="dawn" blur={0.5} />
        </Canvas>
      )}
    </div>
  );
}

function Rig(props: any) {
  const ref = useRef<any>(null);

  useFrame((state, delta) => {
    easing.damp(ref.current.rotation, "y", -drag.targetY, 0.15, delta);
    state.events.update?.();
    easing.damp3(
      state.camera.position,
      [-state.pointer.x * 2, state.pointer.y + 1.5, 10],
      0.3,
      delta
    );
    state.camera.lookAt(0, 0, 0);
  });

  return <group ref={ref} {...props} />;
}

interface CarouselProps {
  teams: Team[];
  onSelect: (teamId: number) => void;
}

function Carousel({ teams, onSelect }: CarouselProps) {
  const radius = 2;
  const count = teams.length;
  return (
    <>
      {teams.map((team, i) => (
        <Card
          key={team.id}
          team={team}
          onSelect={onSelect}
          position={[
            Math.sin((i / count) * Math.PI * 2) * radius,
            0,
            Math.cos((i / count) * Math.PI * 2) * radius,
          ]}
          rotation={[0, Math.PI + (i / count) * Math.PI * 2, 0]}
        />
      ))}
    </>
  );
}

interface CardProps {
  team: Team;
  onSelect: (teamId: number) => void;
  position: [number, number, number];
  rotation: [number, number, number];
}

function Card({ team, onSelect, ...props }: CardProps) {
  const groupRef = useRef<any>(null);
  const ref = useRef<any>(null);
  const [hovered, hover] = useState(false);
  const [flippedUrl, setFlippedUrl] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    flipImageHorizontally(logoUrl(team))
      .then((url) => {
        if (!cancelled) setFlippedUrl(url);
      })
      .catch(() => {
        if (!cancelled) setFlippedUrl(logoUrl(team));
      });
    return () => {
      cancelled = true;
    };
  }, [team]);

  const pointerOver = (e: any) => {
    e.stopPropagation();
    hover(true);
  };
  const pointerOut = () => hover(false);

  const handleSelect = (e: any) => {
    e.stopPropagation(); // 👈 This stops the click from bleeding through to items behind it
    onSelect(team.id);
  };


  useFrame((_state: any, delta: number) => {
    easing.damp3(groupRef.current.scale, hovered ? 1.15 : 1, 0.1, delta);
    easing.damp(ref.current.material, "radius", hovered ? 0 : 0.2, 0.2, delta);
    easing.damp(ref.current.material, "zoom", hovered ? 1.1 : 1, 0.2, delta);
  });

  if (!flippedUrl) return null;

  return (
    <group ref={groupRef} {...props}>
      <Image
        ref={ref}
        url={flippedUrl}
        transparent
        side={THREE.DoubleSide}
        onPointerOver={pointerOver}
        onPointerOut={pointerOut}
        onClick={handleSelect}
      >
        {/* @ts-expect-error - bentPlaneGeometry is registered via extend() in util.tsx */}
        <bentPlaneGeometry args={[0.1, 0.6, 0.6, 20, 20]} />
      </Image>
      <Text
        position={[0, -0.5, 0]}
        scale={[-1, 1, 1]}
        fontSize={0.08}
        color="#6d5b4f"
        anchorX="center"
        anchorY="middle"
        font={googleSansFlexUrl}
      >
        {team.name}
      </Text>
    </group>
  );
}

export default TeamPickerScreen;