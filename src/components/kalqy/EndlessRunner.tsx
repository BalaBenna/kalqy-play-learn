import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { ArrowLeft, Play, RotateCw, Coins, Trophy, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { RunnerGestureControl } from "./RunnerGestureControl";

interface EndlessRunnerProps {
  onBack: () => void;
  onComplete?: (score: number, coins: number) => void;
}

type Phase = "start" | "playing" | "over";

const LANES = [-2, 0, 2];
const LANE_WIDTH = 2;
const GRAVITY = -55;
const JUMP_V = 15;
const SLIDE_TIME = 0.7;
const BASE_SPEED = 12;
const SPEED_GROWTH = 0.2; // per second
const SPAWN_GAP = 12;
const BASE_SPAWN_INTERVAL = SPAWN_GAP / BASE_SPEED;

export function EndlessRunner({ onBack, onComplete }: EndlessRunnerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("start");
  const [score, setScore] = useState(0);
  const [coins, setCoins] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("kalqy-runner-best") || 0);
  });

  const stateRef = useRef({
    phase: "start" as Phase,
    lane: 1,
    targetX: 0,
    y: 0,
    vy: 0,
    sliding: false,
    slideT: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    distance: 0,
    coins: 0,
    spawnT: 0,
    coinSpawnT: 0,
  });

  const ctrlRef = useRef<{
    move: (dir: -1 | 1) => void;
    jump: () => void;
    slide: () => void;
    start: () => void;
    resetWorld: () => void;
  } | null>(null);

  const start = useCallback(() => {
    stateRef.current = {
      phase: "playing",
      lane: 1,
      targetX: 0,
      y: 0,
      vy: 0,
      sliding: false,
      slideT: 0,
      speed: BASE_SPEED,
      elapsed: 0,
      distance: 0,
      coins: 0,
      spawnT: 0,
      coinSpawnT: 0,
    };
    ctrlRef.current?.resetWorld();
    setScore(0);
    setCoins(0);
    setPhase("playing");
  }, []);

  useEffect(() => {
    stateRef.current.phase = phase;
  }, [phase]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 30, 90);

    const camera = new THREE.PerspectiveCamera(60, mount.clientWidth / mount.clientHeight, 0.1, 200);
    camera.position.set(0, 5, -8);
    camera.lookAt(0, 1.5, 10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    // Lights
    const hemi = new THREE.HemisphereLight(0xffffff, 0x88aa55, 0.9);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(8, 20, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -15;
    sun.shadow.camera.right = 15;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    scene.add(sun);

    // Ground (scrolling tiles)
    const groundGeo = new THREE.PlaneGeometry(8, 20);
    const groundMatA = new THREE.MeshStandardMaterial({ color: 0xf4a261 });
    const groundMatB = new THREE.MeshStandardMaterial({ color: 0xe9c46a });
    const grounds: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(groundGeo, i % 2 ? groundMatA : groundMatB);
      g.rotation.x = -Math.PI / 2;
      g.position.z = i * 20;
      g.receiveShadow = true;
      scene.add(g);
      grounds.push(g);
    }

    // Lane stripes
    for (let i = 0; i < 30; i++) {
      const stripe = new THREE.Mesh(
        new THREE.PlaneGeometry(0.1, 1.2),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      stripe.rotation.x = -Math.PI / 2;
      stripe.position.set(-1, 0.01, i * 5);
      stripe.userData.stripe = true;
      scene.add(stripe);
      const s2 = stripe.clone();
      s2.position.x = 1;
      scene.add(s2);
    }

    // Side scenery (trees)
    const trees: THREE.Group[] = [];
    function makeTree() {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b })
      );
      trunk.position.y = 0.75;
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(1, 2.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d8a3e })
      );
      top.position.y = 2.5;
      top.castShadow = true;
      g.add(trunk, top);
      return g;
    }
    for (let i = 0; i < 20; i++) {
      const t = makeTree();
      t.position.set(i % 2 ? 6 : -6, 0, i * 8);
      scene.add(t);
      trees.push(t);
    }

    // Player (cute fox-like character)
    const player = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff8c42 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.7), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), bodyMat);
    head.position.set(0, 1.45, 0.05);
    head.castShadow = true;
    const earL = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 4), bodyMat);
    earL.position.set(-0.25, 1.95, 0);
    const earR = earL.clone();
    earR.position.x = 0.25;
    const muzzle = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.3, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    muzzle.position.set(0, 1.35, 0.45);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), eyeMat);
    eyeL.position.set(-0.18, 1.55, 0.4);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.18;
    const legMat = new THREE.MeshStandardMaterial({ color: 0xd96a2a });
    const legFL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.5, 0.22), legMat);
    legFL.position.set(-0.25, 0.15, 0.2);
    const legFR = legFL.clone();
    legFR.position.x = 0.25;
    const legBL = legFL.clone();
    legBL.position.z = -0.2;
    const legBR = legFR.clone();
    legBR.position.z = -0.2;
    player.add(body, head, earL, earR, muzzle, eyeL, eyeR, legFL, legFR, legBL, legBR);
    player.position.set(0, 0, 4);
    scene.add(player);

    // Obstacle + coin pools
    type Obstacle = { mesh: THREE.Mesh; kind: "low" | "high"; lane: number };
    const obstacles: Obstacle[] = [];
    type Coin = { mesh: THREE.Mesh; lane: number };
    const coinObjs: Coin[] = [];

    const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const lowMat = new THREE.MeshStandardMaterial({ color: 0xd62828 });
    const barGeo = new THREE.BoxGeometry(1.8, 0.3, 0.4);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x6a4c93 });
    const coinGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.6, roughness: 0.3, emissive: 0x553300 });

    function spawnObstacle(z: number) {
      const kind: "low" | "high" = Math.random() < 0.65 ? "low" : "high";
      const lane = Math.floor(Math.random() * 3);
      let mesh: THREE.Mesh;
      if (kind === "low") {
        mesh = new THREE.Mesh(boxGeo, lowMat);
        mesh.position.set(LANES[lane], 0.6, z);
      } else {
        mesh = new THREE.Mesh(barGeo, barMat);
        mesh.position.set(LANES[lane], 1.9, z);
      }
      mesh.castShadow = true;
      scene.add(mesh);
      obstacles.push({ mesh, kind, lane });
    }
    function spawnCoinRow(z: number) {
      const lane = Math.floor(Math.random() * 3);
      const count = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const m = new THREE.Mesh(coinGeo, coinMat);
        m.rotation.x = Math.PI / 2;
        m.position.set(LANES[lane], 1, z + i * 1.6);
        scene.add(m);
        coinObjs.push({ mesh: m, lane });
      }
    }
    // pre-seed some
    for (let z = 25; z < 120; z += 12) {
      if (Math.random() < 0.7) spawnObstacle(z);
      if (Math.random() < 0.5) spawnCoinRow(z + 4);
    }

    // Controls
    const move = (dir: -1 | 1) => {
      const st = stateRef.current;
      if (st.phase !== "playing") return;
      st.lane = Math.max(0, Math.min(2, st.lane + dir));
      st.targetX = LANES[st.lane];
    };
    const jump = () => {
      const st = stateRef.current;
      if (st.phase !== "playing") return;
      if (st.y <= 0.01 && !st.sliding) {
        st.vy = JUMP_V;
      }
    };
    const slide = () => {
      const st = stateRef.current;
      if (st.phase !== "playing") return;
      if (st.y <= 0.01) {
        st.sliding = true;
        st.slideT = SLIDE_TIME;
      }
    };
    const resetWorld = () => {
      for (const o of obstacles) scene.remove(o.mesh);
      obstacles.length = 0;
      for (const c of coinObjs) scene.remove(c.mesh);
      coinObjs.length = 0;
      player.position.set(0, 0, 4);
      player.rotation.x = 0;
      player.scale.y = 1;
      // Re-seed obstacles ahead of the player
      for (let z = 25; z < 120; z += 12) {
        if (Math.random() < 0.7) spawnObstacle(z);
        if (Math.random() < 0.5) spawnCoinRow(z + 4);
      }
    };
    ctrlRef.current = { move, jump, slide, start, resetWorld };

    // Keyboard
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") move(-1);
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") move(1);
      else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
        e.preventDefault();
        jump();
      } else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") slide();
    };
    window.addEventListener("keydown", onKey);

    // Touch swipe
    let tx = 0, ty = 0, tracking = false;
    const onTS = (e: TouchEvent) => {
      const t = e.touches[0];
      tx = t.clientX; ty = t.clientY; tracking = true;
    };
    const onTE = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - tx;
      const dy = t.clientY - ty;
      if (Math.abs(dx) < 25 && Math.abs(dy) < 25) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) move(1); else move(-1);
      } else {
        if (dy < 0) jump(); else slide();
      }
    };
    const dom = renderer.domElement;
    dom.addEventListener("touchstart", onTS, { passive: true });
    dom.addEventListener("touchend", onTE, { passive: true });

    // Resize
    const onResize = () => {
      if (!mount) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // Loop
    const clock = new THREE.Clock();
    let raf = 0;
    let animT = 0;

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(0.05, clock.getDelta());
      const s = stateRef.current;

      if (s.phase === "playing") {
        s.elapsed += dt;
        s.speed = BASE_SPEED + s.elapsed * SPEED_GROWTH;
        const adv = s.speed * dt;
        s.distance += adv;

        // Smooth lane shift
        player.position.x += (s.targetX - player.position.x) * Math.min(1, dt * 12);

        // Jump physics
        if (s.y > 0 || s.vy > 0) {
          s.vy += GRAVITY * dt;
          s.y += s.vy * dt;
          if (s.y < 0) { s.y = 0; s.vy = 0; }
        }
        player.position.y = s.y;

        // Slide
        if (s.sliding) {
          s.slideT -= dt;
          if (s.slideT <= 0) s.sliding = false;
        }
        player.scale.y = s.sliding ? 0.5 : 1;
        player.rotation.x = s.sliding ? -0.3 : 0;

        // Leg run animation
        animT += dt * 10;
        const swing = Math.sin(animT) * 0.5;
        legFL.position.z = 0.2 + swing * 0.2;
        legFR.position.z = 0.2 - swing * 0.2;
        legBL.position.z = -0.2 - swing * 0.2;
        legBR.position.z = -0.2 + swing * 0.2;

        // Scroll world
        for (const g of grounds) {
          g.position.z -= adv;
          if (g.position.z < -15) g.position.z += grounds.length * 20;
        }
        scene.children.forEach((c: any) => {
          if (c.userData?.stripe) {
            c.position.z -= adv;
            if (c.position.z < -10) c.position.z += 150;
          }
        });
        for (const t of trees) {
          t.position.z -= adv;
          if (t.position.z < -10) t.position.z += 160;
        }

        // Move obstacles
        for (let i = obstacles.length - 1; i >= 0; i--) {
          const o = obstacles[i];
          o.mesh.position.z -= adv;
          if (o.mesh.position.z < -5) {
            scene.remove(o.mesh);
            obstacles.splice(i, 1);
            continue;
          }
          // collision
          if (Math.abs(o.mesh.position.z - player.position.z) < 0.9 && o.lane === s.lane) {
            if (o.kind === "low" && s.y < 1.2) {
              endGame();
            } else if (o.kind === "high" && !s.sliding) {
              endGame();
            }
          }
        }
        // Coins
        for (let i = coinObjs.length - 1; i >= 0; i--) {
          const c = coinObjs[i];
          c.mesh.position.z -= adv;
          c.mesh.rotation.y += dt * 5;
          if (c.mesh.position.z < -5) {
            scene.remove(c.mesh);
            coinObjs.splice(i, 1);
            continue;
          }
          if (
            c.lane === s.lane &&
            Math.abs(c.mesh.position.z - player.position.z) < 0.8 &&
            Math.abs(c.mesh.position.y - (player.position.y + 0.8)) < 1.2
          ) {
            scene.remove(c.mesh);
            coinObjs.splice(i, 1);
            s.coins += 1;
            setCoins(s.coins);
          }
        }

        // Spawn ahead
        s.spawnT -= dt;
        if (s.spawnT <= 0) {
          spawnObstacle(110);
          s.spawnT = Math.max(0.55, SPAWN_GAP / s.speed);
        }
        s.coinSpawnT -= dt;
        if (s.coinSpawnT <= 0) {
          spawnCoinRow(110);
          s.coinSpawnT = 1.6 + Math.random() * 1.2;
        }

        // Update score periodically
        setScore(Math.floor(s.distance));
      }

      renderer.render(scene, camera);
    };

    function endGame() {
      const s = stateRef.current;
      if (s.phase !== "playing") return;
      s.phase = "over";
      const finalScore = Math.floor(s.distance);
      const finalCoins = s.coins;
      setPhase("over");
      setScore(finalScore);
      setBest((b) => {
        const nb = Math.max(b, finalScore);
        if (typeof window !== "undefined") localStorage.setItem("kalqy-runner-best", String(nb));
        return nb;
      });
      onComplete?.(finalScore, finalCoins);
    }

    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("touchstart", onTS);
      dom.removeEventListener("touchend", onTE);
      renderer.dispose();
      if (dom.parentNode) dom.parentNode.removeChild(dom);
      scene.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.());
          else o.material.dispose?.();
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden bg-gradient-to-b from-sky-300 to-sky-100">
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 p-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full bg-card/95 px-4 py-2 text-sm font-black text-foreground shadow-lg backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-2 text-sm font-black shadow-lg backdrop-blur">
            <Coins className="h-4 w-4 text-sunshine" /> {coins}
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-2 text-sm font-black shadow-lg backdrop-blur">
            <Trophy className="h-4 w-4 text-coral" /> {score}m
          </div>
        </div>
      </div>

      {/* Canvas mount */}
      <div ref={mountRef} className="absolute inset-0" />

      {/* AI gesture controls (camera) — active during gameplay */}
      {phase === "playing" && (
        <div className="absolute right-3 top-16 z-20 md:top-20">
          <RunnerGestureControl
            active={phase === "playing"}
            controls={{
              moveLeft: () => ctrlRef.current?.move(-1),
              moveRight: () => ctrlRef.current?.move(1),
              jump: () => ctrlRef.current?.jump(),
              slide: () => ctrlRef.current?.slide(),
            }}
          />
        </div>
      )}

      {/* Mobile touch controls */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-between p-4 md:hidden">
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={() => ctrlRef.current?.move(-1)}
              className="grid h-14 w-14 place-items-center rounded-full bg-card/90 text-foreground shadow-lg backdrop-blur"
              aria-label="Left"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={() => ctrlRef.current?.jump()}
              className="grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
              aria-label="Jump"
            >
              <ChevronUp className="h-6 w-6" />
            </button>
            <button
              onClick={() => ctrlRef.current?.slide()}
              className="grid h-14 w-14 place-items-center rounded-full bg-secondary text-secondary-foreground shadow-lg"
              aria-label="Slide"
            >
              <ChevronDown className="h-6 w-6" />
            </button>
          </div>
          <div className="pointer-events-auto flex flex-col gap-2">
            <button
              onClick={() => ctrlRef.current?.move(1)}
              className="grid h-14 w-14 place-items-center rounded-full bg-card/90 text-foreground shadow-lg backdrop-blur"
              aria-label="Right"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* Start overlay */}
      {phase === "start" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/40 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-3xl border-4 border-card bg-card p-6 text-center shadow-2xl">
            <div className="text-5xl">🦊💨</div>
            <h1 className="mt-2 text-3xl font-black text-foreground">Endless Runner</h1>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              Dodge obstacles, grab coins, run as far as you can!
            </p>
            <div className="my-4 grid grid-cols-2 gap-2 text-left text-xs font-bold text-muted-foreground">
              <div className="rounded-xl bg-secondary p-2"><span className="text-foreground">←→ / A D</span> · Switch lane</div>
              <div className="rounded-xl bg-secondary p-2"><span className="text-foreground">↑ / Space</span> · Jump</div>
              <div className="rounded-xl bg-secondary p-2"><span className="text-foreground">↓ / S</span> · Slide</div>
              <div className="rounded-xl bg-secondary p-2"><span className="text-foreground">Swipe</span> · On mobile</div>
            </div>
            <button
              onClick={start}
              className="mx-auto flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-black text-primary-foreground shadow-lg transition-transform hover:scale-105"
            >
              <Play className="h-5 w-5" /> Start Running
            </button>
            {best > 0 && (
              <div className="mt-3 text-xs font-bold text-muted-foreground">
                Best: <span className="text-foreground">{best}m</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game over overlay */}
      {phase === "over" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/50 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-3xl border-4 border-card bg-card p-6 text-center shadow-2xl">
            <div className="text-5xl">🏁</div>
            <h2 className="mt-2 text-3xl font-black text-foreground">Run Complete!</h2>
            <div className="my-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-secondary p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Distance</div>
                <div className="text-2xl font-black text-foreground">{score}m</div>
              </div>
              <div className="rounded-2xl bg-secondary p-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Coins</div>
                <div className="text-2xl font-black text-foreground">{coins}</div>
              </div>
            </div>
            <div className="mb-4 text-xs font-bold text-muted-foreground">
              Best: <span className="text-foreground">{best}m</span>
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={start}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow"
              >
                <RotateCw className="h-4 w-4" /> Run Again
              </button>
              <button
                onClick={onBack}
                className="flex items-center gap-2 rounded-full bg-secondary px-5 py-2.5 text-sm font-black text-secondary-foreground shadow"
              >
                <ArrowLeft className="h-4 w-4" /> Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
