import * as THREE from "three";
import { useState, useEffect, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Image, Environment, Text } from "@react-three/drei";
import { easing } from "maath";
import type { Team } from "./types";
import { API_BASE_URL } from "./api/config";
import { logoUrl } from "./teamLogo";
import { flipImageHorizontally } from "./flipImage";
import "./util";
import "./TeamPickerScreen.css";
import googleSansFlexUrl from "./assets/fonts/GoogleSansFlex-Regular.woff";

interface TeamPickerScreenProps {
  onSelect: (team: Team) => void;
  onBack: () => void;
}

// Drag state lives outside components so Rig's useFrame can read it every frame
const drag = { targetY: 0, isDragging: false, lastX: 0 };

function TeamPickerScreen({ onSelect, onBack }: TeamPickerScreenProps) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);
  // The backend is on a free tier that spins down after inactivity - the
  // first request after that can take 30-60s while it wakes back up. A
  // plain "Loading teams..." with no explanation looks identical to a
  // hung/broken page, so swap the message after a few seconds instead of
  // leaving the user guessing.
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    const slowLoadTimer = setTimeout(() => setSlowLoad(true), 4000);

    fetch(`${API_BASE_URL}/teams`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
      })
      .then((data: Team[]) => setTeams(data))
      .catch((err) => setError(err.message))
      .finally(() => clearTimeout(slowLoadTimer));

    return () => clearTimeout(slowLoadTimer);
  }, []);

  return (
    <div
      className="picker-body"
      // touch-action: none is required here, not just a nice-to-have - without
      // it, mobile browsers treat this drag gesture as a page scroll and
      // swallow the pointermove events before onPointerMove below ever sees
      // them (same reason tap-to-select can feel unreliable on touch too).
      style={{ position: "relative", width: "100%", height: "100vh", touchAction: "none" }}
      onPointerDown={(e) => { drag.isDragging = true; drag.lastX = e.clientX; }}
      onPointerMove={(e) => {
        if (!drag.isDragging) return;
        drag.targetY -= (e.clientX - drag.lastX) * 0.004;
        drag.lastX = e.clientX;
      }}
      onPointerUp={() => { drag.isDragging = false; }}
      onPointerLeave={() => { drag.isDragging = false; }}
      onPointerCancel={() => { drag.isDragging = false; }}
      onWheel={(e) => { drag.targetY -= e.deltaY * 0.002; }}
    >
      <div className="picker-back-wrap">
        <button className="picker-back" onClick={onBack}>&larr; Back</button>
      </div>

      <div className="picker-title-wrap">
        <h1 className="picker-title">Pick your favorite team</h1>
        <p className="picker-subtitle">Drag or scroll to rotate, click a logo to select</p>
      </div>

      {error && (
        <div className="picker-status" style={{ position: "absolute", top: 100, width: "100%", textAlign: "center" }}>
          Failed to load teams: {error}
        </div>
      )}

      {!error && teams.length === 0 && (
        <div
          className="picker-status"
          style={{
            position: "absolute",
            top: 100,
            width: "100%",
            textAlign: "center",
            padding: "0 24px",
          }}
        >
          {slowLoad ? (
            <span style={{ display: "inline-block", maxWidth: 420 }}>
              Still getting the teams - our server may be waking up after sitting idle,
              which can take up to a minute on the first visit. Hang tight, or refresh in a bit.
            </span>
          ) : (
            "Loading teams..."
          )}
        </div>
      )}

      {teams.length > 0 && (
        <Canvas camera={{ position: [0, 0, 100], fov: 15 }} style={{ touchAction: "none" }}>

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
  onSelect: (team: Team) => void;
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
  onSelect: (team: Team) => void;
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
    onSelect(team);
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