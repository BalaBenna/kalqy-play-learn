import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  ArrowLeft,
  Camera,
  Coins,
  Gem,
  RotateCcw,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  VolumeX,
} from "lucide-react";

interface Props {
  onBack: () => void;
  onComplete?: (stats: { correct: number; total: number; coins: number; gems: number }) => void;
}

type Difficulty = "beginner" | "intermediate" | "advanced";

interface Question {
  prompt: string;
  options: number[];
  correctIndex: number;
  op: "+" | "-" | "×" | "÷";
}

const PRAISE = ["Awesome!", "Fantastic!", "You're a Math Star!", "Kudos!", "Great Job!"];
const ENCOURAGE = ["Nice Try!", "You Can Do It!", "Let's Try Again!"];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeQuestion(diff: Difficulty): Question {
  let a = 0,
    b = 0,
    answer = 0;
  let op: Question["op"] = "+";
  if (diff === "beginner") {
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "+") {
      a = rand(0, 10);
      b = rand(0, 10 - a);
      answer = a + b;
    } else {
      a = rand(1, 10);
      b = rand(0, a);
      answer = a - b;
    }
  } else if (diff === "intermediate") {
    const r = Math.random();
    if (r < 0.4) {
      op = "+";
      a = rand(2, 20);
      b = rand(2, 20);
      answer = a + b;
    } else if (r < 0.7) {
      op = "-";
      a = rand(5, 20);
      b = rand(1, a);
      answer = a - b;
    } else {
      op = "×";
      a = rand(1, 10);
      b = rand(1, 10);
      answer = a * b;
    }
  } else {
    const r = Math.random();
    if (r < 0.4) {
      op = "×";
      a = rand(2, 12);
      b = rand(2, 12);
      answer = a * b;
    } else if (r < 0.7) {
      op = "÷";
      b = rand(2, 10);
      answer = rand(2, 10);
      a = b * answer;
    } else {
      op = Math.random() < 0.5 ? "+" : "-";
      a = rand(10, 50);
      b = rand(5, op === "-" ? a : 50);
      answer = op === "+" ? a + b : a - b;
    }
  }
  const distractors = new Set<number>();
  while (distractors.size < 3) {
    const delta = rand(-Math.max(2, Math.floor(answer / 3) + 1), Math.max(3, Math.floor(answer / 3) + 2));
    const cand = answer + delta;
    if (cand !== answer && cand >= 0 && !distractors.has(cand)) distractors.add(cand);
  }
  const opts = shuffle([answer, ...distractors]);
  return {
    prompt: `${a} ${op} ${b} = ?`,
    options: opts,
    correctIndex: opts.indexOf(answer),
    op,
  };
}

function speak(text: string, muted: boolean) {
  if (muted) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.25;
    window.speechSynthesis.speak(u);
  } catch {}
}

function playTone(freq: number, duration = 0.18, type: OscillatorType = "sine", muted = false) {
  if (muted) return;
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch {}
}

function successChime(muted: boolean) {
  playTone(660, 0.12, "sine", muted);
  setTimeout(() => playTone(880, 0.12, "sine", muted), 100);
  setTimeout(() => playTone(1175, 0.2, "sine", muted), 220);
}

// ---------- Finger counting ----------
function countFingers(landmarks: { x: number; y: number }[]): number {
  if (!landmarks || landmarks.length < 21) return 0;
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  let count = 0;
  for (let i = 0; i < 4; i++) {
    if (landmarks[tips[i]].y < landmarks[pips[i]].y - 0.02) count++;
  }
  return count;
}

const HAND_EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

function drawHand(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number }[],
  w: number,
  h: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of HAND_EDGES) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

type Status = "idle" | "loading" | "ready" | "denied" | "error";

// ---------- 3D Scene ----------
function useThreeScene(mountRef: React.RefObject<HTMLDivElement | null>) {
  const apiRef = useRef<{
    celebrate: () => void;
    encourage: () => void;
    setTalking: (b: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = null;

    // Rainbow sky as gradient via fog + colored hemisphere light
    const hemi = new THREE.HemisphereLight(0xffd7f5, 0x88ffcf, 1.1);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(4, 8, 5);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 1.6, 5.2);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(8, 48),
      new THREE.MeshStandardMaterial({ color: 0x7ed957 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);

    // Flowers + grass tufts
    for (let i = 0; i < 40; i++) {
      const r = 2 + Math.random() * 5;
      const a = Math.random() * Math.PI * 2;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 0.25),
        new THREE.MeshStandardMaterial({ color: 0x2f9e44 }),
      );
      stem.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r);
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(Math.random(), 0.8, 0.6),
        }),
      );
      head.position.copy(stem.position);
      head.position.y += 0.18;
      scene.add(stem);
      scene.add(head);
    }

    // Trees
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 5.5;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.22, 1.2),
        new THREE.MeshStandardMaterial({ color: 0x8b5a2b }),
      );
      trunk.position.set(Math.cos(a) * r, 0.6, Math.sin(a) * r);
      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x2fb344 }),
      );
      leaves.position.copy(trunk.position);
      leaves.position.y += 1.1;
      scene.add(trunk);
      scene.add(leaves);
    }

    // Clouds
    const clouds: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
      for (let j = 0; j < 4; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.3, 12, 12), mat);
        s.position.set(j * 0.5 - 0.6, Math.random() * 0.1, 0);
        g.add(s);
      }
      g.position.set(-6 + i * 3, 3.5 + Math.random(), -3 - Math.random() * 2);
      scene.add(g);
      clouds.push(g as any);
    }

    // Toy blocks
    const blockColors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb084ff];
    for (let i = 0; i < 5; i++) {
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.4, 0.4),
        new THREE.MeshStandardMaterial({ color: blockColors[i] }),
      );
      block.position.set(-3 + i * 1.4, 0.2, -2.5);
      scene.add(block);
    }

    // Balloons
    const balloons: THREE.Mesh[] = [];
    const balloonColors = [0xff5d8f, 0xffd166, 0x4cc9f0, 0x9b5de5, 0x06d6a0];
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 16),
        new THREE.MeshStandardMaterial({ color: balloonColors[i], roughness: 0.4 }),
      );
      b.position.set(2.5 + (i % 2) * 0.4, 2 + i * 0.3, -2 + i * 0.3);
      scene.add(b);
      balloons.push(b);
    }

    // ---- Cartoon character (stylized friendly mascot) ----
    const char = new THREE.Group();
    char.position.set(-3, 0, 0.5);

    const skin = new THREE.MeshStandardMaterial({ color: 0xffd6a5, roughness: 0.6 });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x4cc9f0 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x3a86ff });
    const black = new THREE.MeshStandardMaterial({ color: 0x222 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xd00050 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.5, 4, 12), shirt);
    body.position.y = 0.85;
    char.add(body);

    const legL = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.4, 4, 8), pants);
    legL.position.set(-0.16, 0.3, 0);
    char.add(legL);
    const legR = legL.clone();
    legR.position.x = 0.16;
    char.add(legR);

    const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), shirt);
    armL.position.set(-0.42, 0.95, 0);
    char.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.42;
    char.add(armR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), skin);
    head.position.y = 1.55;
    char.add(head);

    // Hair cap
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2e2a }));
    hair.position.y = 1.62;
    char.add(hair);

    // Eyes
    const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 12), white);
    eyeWhiteL.position.set(-0.13, 1.6, 0.32);
    char.add(eyeWhiteL);
    const eyeWhiteR = eyeWhiteL.clone();
    eyeWhiteR.position.x = 0.13;
    char.add(eyeWhiteR);
    const pupilL = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), black);
    pupilL.position.set(-0.13, 1.6, 0.39);
    char.add(pupilL);
    const pupilR = pupilL.clone();
    pupilR.position.x = 0.13;
    char.add(pupilR);

    // Cheeks
    const cheekMat = new THREE.MeshStandardMaterial({ color: 0xff9aa2 });
    const cheekL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), cheekMat);
    cheekL.position.set(-0.22, 1.5, 0.3);
    char.add(cheekL);
    const cheekR = cheekL.clone();
    cheekR.position.x = 0.22;
    char.add(cheekR);

    // Mouth (smiley arc using torus segment)
    const mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.025, 8, 16, Math.PI),
      mouthMat,
    );
    mouth.position.set(0, 1.46, 0.34);
    mouth.rotation.z = Math.PI;
    char.add(mouth);

    scene.add(char);

    // Particles (stars / confetti)
    const particleGroup = new THREE.Group();
    scene.add(particleGroup);

    type Particle = {
      mesh: THREE.Mesh;
      vel: THREE.Vector3;
      life: number;
      spin: number;
    };
    const particles: Particle[] = [];

    const spawnBurst = (origin: THREE.Vector3, color?: number) => {
      const colors = [0xffd166, 0xff6b6b, 0x4cc9f0, 0x9b5de5, 0x06d6a0];
      for (let i = 0; i < 40; i++) {
        const c = color ?? colors[i % colors.length];
        const m = new THREE.Mesh(
          new THREE.TetrahedronGeometry(0.08),
          new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.3 }),
        );
        m.position.copy(origin);
        particleGroup.add(m);
        particles.push({
          mesh: m,
          vel: new THREE.Vector3(
            (Math.random() - 0.5) * 3,
            2 + Math.random() * 2.5,
            (Math.random() - 0.5) * 2,
          ),
          life: 1.6,
          spin: (Math.random() - 0.5) * 8,
        });
      }
    };

    // Butterflies
    const flies: { mesh: THREE.Mesh; t: number; r: number; speed: number; y: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.18, 6),
        new THREE.MeshStandardMaterial({ color: 0xff70a6 }),
      );
      scene.add(m);
      flies.push({
        mesh: m,
        t: Math.random() * Math.PI * 2,
        r: 1.5 + Math.random() * 2,
        speed: 0.6 + Math.random() * 0.5,
        y: 1.2 + Math.random() * 1.2,
      });
    }

    // Animation state
    const state = {
      mood: "idle" as "idle" | "walking-in" | "celebrate" | "encourage" | "wave",
      moodT: 0,
      talking: false,
      walkPhase: 0,
    };

    state.mood = "walking-in";

    apiRef.current = {
      celebrate: () => {
        state.mood = "celebrate";
        state.moodT = 0;
        spawnBurst(new THREE.Vector3(char.position.x, 1.8, char.position.z));
        // Release balloons upward
        for (const b of balloons) {
          b.userData.release = true;
        }
      },
      encourage: () => {
        state.mood = "encourage";
        state.moodT = 0;
      },
      setTalking: (b: boolean) => {
        state.talking = b;
      },
    };

    const resize = () => {
      if (!mount) return;
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let rafId = 0;
    let last = performance.now();
    const clock = new THREE.Clock();
    let blinkTimer = 0;
    let nextBlink = 2 + Math.random() * 3;

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = clock.getElapsedTime();

      // Clouds drift
      for (const c of clouds) {
        c.position.x += dt * 0.15;
        if (c.position.x > 7) c.position.x = -7;
      }
      // Butterflies
      for (const f of flies) {
        f.t += dt * f.speed;
        f.mesh.position.set(
          Math.cos(f.t) * f.r + 1.5,
          f.y + Math.sin(f.t * 2) * 0.2,
          Math.sin(f.t) * f.r - 1,
        );
        f.mesh.rotation.z = Math.sin(t * 8) * 0.6;
      }

      // Balloon release
      for (const b of balloons) {
        if (b.userData.release) {
          b.position.y += dt * 1.5;
          if (b.position.y > 8) {
            b.position.y = 2 + Math.random();
            b.userData.release = false;
          }
        } else {
          b.position.y += Math.sin(t * 1.5 + b.position.x) * dt * 0.1;
        }
      }

      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        p.vel.y -= dt * 4;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin * dt;
        p.mesh.rotation.y += p.spin * dt;
        if (p.life <= 0) {
          particleGroup.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
        }
      }

      // Blink
      blinkTimer += dt;
      const blinking = blinkTimer > nextBlink && blinkTimer < nextBlink + 0.12;
      if (blinkTimer > nextBlink + 0.12) {
        blinkTimer = 0;
        nextBlink = 2 + Math.random() * 3;
      }
      eyeWhiteL.scale.y = eyeWhiteR.scale.y = blinking ? 0.1 : 1;
      pupilL.scale.y = pupilR.scale.y = blinking ? 0.1 : 1;

      // Talking mouth + smile (scale on Y)
      if (state.talking) {
        const m = 1 + Math.abs(Math.sin(t * 12)) * 0.6;
        mouth.scale.set(1, m, 1);
      } else {
        mouth.scale.set(1, 1, 1);
      }

      // Mood animations
      state.moodT += dt;
      // Idle: gentle bob
      char.position.y = Math.sin(t * 2) * 0.04;

      if (state.mood === "walking-in") {
        const target = 0;
        char.position.x += (target - char.position.x) * Math.min(1, dt * 1.6);
        state.walkPhase += dt * 8;
        legL.rotation.x = Math.sin(state.walkPhase) * 0.6;
        legR.rotation.x = -Math.sin(state.walkPhase) * 0.6;
        armL.rotation.x = -Math.sin(state.walkPhase) * 0.5;
        armR.rotation.x = Math.sin(state.walkPhase) * 0.5;
        if (Math.abs(char.position.x - target) < 0.05) {
          state.mood = "wave";
          state.moodT = 0;
          legL.rotation.x = legR.rotation.x = 0;
        }
      } else if (state.mood === "wave") {
        armR.rotation.z = -Math.PI / 1.4;
        armR.rotation.x = Math.sin(state.moodT * 8) * 0.5;
        if (state.moodT > 1.5) {
          armR.rotation.z = 0;
          armR.rotation.x = 0;
          state.mood = "idle";
        }
      } else if (state.mood === "celebrate") {
        // Jump + clap
        const jump = Math.abs(Math.sin(state.moodT * 6)) * 0.4;
        char.position.y = jump;
        armL.rotation.z = Math.PI / 2 + Math.sin(state.moodT * 12) * 0.4;
        armR.rotation.z = -Math.PI / 2 - Math.sin(state.moodT * 12) * 0.4;
        char.rotation.y = Math.sin(state.moodT * 4) * 0.3;
        if (state.moodT > 2) {
          armL.rotation.z = 0;
          armR.rotation.z = 0;
          char.rotation.y = 0;
          state.mood = "idle";
        }
      } else if (state.mood === "encourage") {
        // Gentle nod + raised hand
        armR.rotation.z = -Math.PI / 2.5;
        head.rotation.x = Math.sin(state.moodT * 4) * 0.2;
        if (state.moodT > 1.5) {
          armR.rotation.z = 0;
          head.rotation.x = 0;
          state.mood = "idle";
        }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      scene.traverse((o: any) => {
        if (o.geometry) o.geometry.dispose?.();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m: any) => m.dispose?.());
          else o.material.dispose?.();
        }
      });
    };
  }, [mountRef]);

  return apiRef;
}

// ---------- Main component ----------
export function MathAdventure({ onBack, onComplete }: Props) {
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [muted, setMuted] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionNum, setQuestionNum] = useState(0);
  const totalQuestions = 10;
  const [correct, setCorrect] = useState(0);
  const [coins, setCoins] = useState(0);
  const [gems, setGems] = useState(0);
  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "correct" | "wrong"; msg: string; choice: number } | null>(null);
  const [phase, setPhase] = useState<"select" | "playing" | "end">("select");
  const [confetti, setConfetti] = useState(false);

  const sceneMountRef = useRef<HTMLDivElement | null>(null);
  const sceneApiRef = useThreeScene(sceneMountRef);

  // Camera + landmarker
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);
  const [status, setStatus] = useState<Status>("idle");
  const [fingerCount, setFingerCount] = useState<number | null>(null);
  const [hint, setHint] = useState<string>("Show 1, 2, 3, or 4 fingers.");
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const holdCountRef = useRef<number | null>(null);
  const lockedRef = useRef(false);
  const questionRef = useRef<Question | null>(null);
  questionRef.current = question;
  const submitAnswerRef = useRef<(choice: number) => void>(() => {});
  const drawAndCountRef = useRef<(result: any) => void>(() => {});

  const startGame = (diff: Difficulty) => {
    setDifficulty(diff);
    setCorrect(0);
    setCoins(0);
    setGems(0);
    setXp(0);
    setStreak(0);
    setQuestionNum(0);
    const q = makeQuestion(diff);
    setQuestion(q);
    setPhase("playing");
    setTimeout(() => {
      sceneApiRef.current?.setTalking(true);
      speak(`Hi! Let's solve some fun math questions together! ${q.prompt}`, muted);
      setTimeout(() => sceneApiRef.current?.setTalking(false), 3500);
    }, 600);
  };

  // Speak each new question
  useEffect(() => {
    if (phase !== "playing" || !question) return;
    if (questionNum === 0) return; // first one spoken via startGame
    sceneApiRef.current?.setTalking(true);
    speak(question.prompt.replace("×", "times").replace("÷", "divided by"), muted);
    const t = setTimeout(() => sceneApiRef.current?.setTalking(false), 1800);
    return () => clearTimeout(t);
  }, [question, questionNum, phase, muted, sceneApiRef]);

  const submitAnswer = useCallback(
    (choice: number) => {
      const q = questionRef.current;
      if (!q || lockedRef.current || phase !== "playing") return;
      const isCorrect = choice === q.correctIndex;
      if (isCorrect) {
        lockedRef.current = true;
        const msg = PRAISE[Math.floor(Math.random() * PRAISE.length)];
        setFeedback({ type: "correct", msg, choice });
        setConfetti(true);
        setCorrect((c) => c + 1);
        setCoins((c) => c + 10);
        setXp((x) => x + 20);
        setStreak((s) => s + 1);
        if ((correct + 1) % 5 === 0) setGems((g) => g + 1);
        successChime(muted);
        sceneApiRef.current?.celebrate();
        speak(msg, muted);
        setTimeout(() => {
          setConfetti(false);
          setFeedback(null);
          holdStartRef.current = null;
          holdCountRef.current = null;
          setHoldProgress(0);
          if (questionNum + 1 >= totalQuestions) {
            setPhase("end");
            onComplete?.({
              correct: correct + 1,
              total: totalQuestions,
              coins: coins + 10,
              gems: gems + ((correct + 1) % 5 === 0 ? 1 : 0),
            });
          } else {
            setQuestionNum((n) => n + 1);
            setQuestion(makeQuestion(difficulty!));
          }
          lockedRef.current = false;
        }, 2000);
      } else {
        const msg = ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
        setFeedback({ type: "wrong", msg, choice });
        setStreak(0);
        playTone(330, 0.2, "triangle", muted);
        sceneApiRef.current?.encourage();
        speak(msg, muted);
        setTimeout(() => {
          setFeedback(null);
          holdStartRef.current = null;
          holdCountRef.current = null;
          setHoldProgress(0);
        }, 1300);
      }
    },
    [phase, questionNum, correct, coins, gems, muted, difficulty, onComplete, sceneApiRef],
  );

  // Camera
  const initLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    const landmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
    landmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  const startCamera = useCallback(async () => {
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {}
      await initLandmarker();
      setStatus("ready");
      loop();
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") setStatus("denied");
      else setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initLandmarker]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try {
      landmarkerRef.current?.close?.();
    } catch {}
    landmarkerRef.current = null;
  }, []);

  const loop = useCallback(() => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const landmarker = landmarkerRef.current;
      if (!video || !canvas || !landmarker) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          drawAndCountRef.current(result);
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawAndCount = (result: any) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 480;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const hands: { x: number; y: number; z: number }[][] = result?.landmarks ?? [];
    if (hands.length === 0) {
      setFingerCount(null);
      setHint("Show your hand to the camera.");
      holdStartRef.current = null;
      holdCountRef.current = null;
      setHoldProgress(0);
      return;
    }
    const lm = hands[0];
    drawHand(ctx, lm, w, h, "#22c55e");
    const count = countFingers(lm);
    setFingerCount(count);
    if (count < 1 || count > 4) {
      setHint(count === 0 ? "Hold up 1–4 fingers." : "Use 1, 2, 3, or 4 fingers.");
      holdStartRef.current = null;
      holdCountRef.current = null;
      setHoldProgress(0);
      return;
    }
    setHint(`Detected ${count} finger${count > 1 ? "s" : ""} — hold steady…`);
    if (lockedRef.current) {
      holdStartRef.current = null;
      holdCountRef.current = null;
      setHoldProgress(0);
      return;
    }
    const now = performance.now();
    if (holdCountRef.current !== count) {
      holdCountRef.current = count;
      holdStartRef.current = now;
      setHoldProgress(0);
      return;
    }
    const elapsed = now - (holdStartRef.current ?? now);
    const HOLD_MS = 1000;
    setHoldProgress(Math.min(1, elapsed / HOLD_MS));
    if (elapsed >= HOLD_MS) {
      const choice = count - 1;
      holdStartRef.current = null;
      holdCountRef.current = null;
      setHoldProgress(0);
      const q = questionRef.current;
      if (q && choice < q.options.length) submitAnswerRef.current(choice);
    }
  };
  submitAnswerRef.current = submitAnswer;
  drawAndCountRef.current = drawAndCount;

  useEffect(() => {
    if (phase === "playing") startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const accuracy = useMemo(
    () => (questionNum === 0 ? 0 : Math.round((correct / Math.max(1, questionNum + (phase === "end" ? 1 : 0))) * 100)),
    [correct, questionNum, phase],
  );

  const restart = () => {
    setPhase("select");
    setDifficulty(null);
    setQuestion(null);
    setFeedback(null);
    lockedRef.current = false;
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-[#ffd6f0] via-[#cfe9ff] to-[#d6f5d6]">
      {/* Floating background blobs */}
      <div className="pointer-events-none absolute inset-0 select-none text-5xl opacity-40">
        <div className="absolute left-6 top-8 animate-bounce-soft">☁️</div>
        <div className="absolute right-12 top-16">🌈</div>
        <div className="absolute bottom-20 left-12">🌸</div>
        <div className="absolute bottom-8 right-8 animate-bounce-soft">🎈</div>
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              onBack();
            }}
            className="flex items-center gap-2 rounded-2xl bg-card/90 px-4 py-2 text-sm font-bold text-foreground shadow-sm backdrop-blur transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Pill icon={<Star className="h-4 w-4 fill-current" />} value={correct} color="text-sunshine" />
            <Pill icon={<Coins className="h-4 w-4" />} value={coins} color="text-amber-500" />
            <Pill icon={<Gem className="h-4 w-4" />} value={gems} color="text-sky-500" />
            <Pill icon={<Trophy className="h-4 w-4" />} value={xp + " XP"} color="text-violet-500" />
            <button
              onClick={() => setMuted((m) => !m)}
              className="flex items-center gap-1 rounded-2xl bg-card/90 px-3 py-2 text-sm font-black shadow-sm backdrop-blur transition-all hover:scale-105 active:scale-95"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {phase === "select" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-3xl rounded-3xl border-4 border-card bg-card/90 p-6 text-center shadow-xl backdrop-blur md:p-10">
              <div className="mb-3 text-6xl">🧮</div>
              <h1 className="text-4xl font-black text-foreground md:text-5xl">Math Adventure</h1>
              <p className="mt-2 text-base font-bold text-muted-foreground md:text-lg">
                Solve fun math problems with your fingers! ✋
              </p>
              <div className="mt-8 grid gap-4 md:grid-cols-3">
                <LevelCard
                  emoji="🌱"
                  title="Beginner"
                  desc="Add & subtract up to 10"
                  onClick={() => startGame("beginner")}
                  gradient="from-emerald-300 to-emerald-500"
                />
                <LevelCard
                  emoji="🚀"
                  title="Intermediate"
                  desc="Bigger sums & ×1–10"
                  onClick={() => startGame("intermediate")}
                  gradient="from-sky-300 to-sky-500"
                />
                <LevelCard
                  emoji="🧙"
                  title="Advanced"
                  desc="× ÷ and mixed magic"
                  onClick={() => startGame("advanced")}
                  gradient="from-fuchsia-300 to-fuchsia-500"
                />
              </div>
              <p className="mt-6 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <Sparkles className="mr-1 inline h-3 w-3" /> Camera + voice powered · Ages 4–10
              </p>
            </div>
          </div>
        )}

        {phase === "playing" && question && (
          <div className="grid flex-1 gap-5 lg:grid-cols-[1fr_360px] lg:items-start">
            <div className="flex flex-col gap-4">
              {/* 3D Scene */}
              <div className="relative overflow-hidden rounded-3xl border-4 border-card bg-gradient-to-b from-sky-200 via-pink-100 to-emerald-100 shadow-xl">
                <div ref={sceneMountRef} className="h-[280px] w-full md:h-[340px]" />
                <div className="pointer-events-none absolute left-4 top-4 rounded-2xl bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-wider text-foreground shadow">
                  🦊 Kalqy the Math Buddy
                </div>
                {feedback?.type === "correct" && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="animate-pop rounded-3xl bg-white/90 px-6 py-4 text-3xl font-black text-emerald-600 shadow-2xl md:text-4xl">
                      🎉 {feedback.msg}
                    </div>
                  </div>
                )}
                {feedback?.type === "wrong" && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="animate-pop rounded-3xl bg-white/90 px-6 py-4 text-2xl font-black text-pink-500 shadow-2xl md:text-3xl">
                      🤗 {feedback.msg}
                    </div>
                  </div>
                )}
              </div>

              {/* Question */}
              <div className="rounded-3xl border-4 border-card bg-card/95 p-5 text-center shadow-lg backdrop-blur md:p-6">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-primary">
                  <Volume2 className="h-3 w-3" /> Question {questionNum + 1} of {totalQuestions}
                </div>
                <h2 className="text-5xl font-black text-foreground drop-shadow-sm md:text-7xl">
                  {question.prompt}
                </h2>
                <p className="mt-2 text-sm font-bold text-muted-foreground">
                  Show <span className="text-primary">1, 2, 3, or 4</span> fingers to pick an answer.
                </p>
              </div>

              {/* Options */}
              <div className="grid grid-cols-2 gap-4 md:gap-5">
                {question.options.map((opt, i) => {
                  const isCorrect = feedback?.type === "correct" && feedback.choice === i;
                  const isWrong = feedback?.type === "wrong" && feedback.choice === i;
                  const isPending = fingerCount === i + 1 && !feedback;
                  const gradients = [
                    "from-rose-400 to-rose-500",
                    "from-amber-400 to-amber-500",
                    "from-sky-400 to-sky-500",
                    "from-emerald-400 to-emerald-500",
                  ];
                  return (
                    <button
                      key={i}
                      onClick={() => submitAnswer(i)}
                      disabled={!!feedback && feedback.type === "correct"}
                      className={`relative flex aspect-[5/3] flex-col items-center justify-center gap-2 rounded-3xl border-4 bg-gradient-to-br ${gradients[i]} p-4 text-center text-white shadow-xl transition-all hover:-translate-y-1 hover:rotate-1 active:scale-95 ${
                        isCorrect
                          ? "border-white ring-4 ring-emerald-300 scale-105"
                          : isWrong
                            ? "border-white ring-4 ring-rose-300 animate-pop"
                            : isPending
                              ? "border-white ring-4 ring-white/70"
                              : "border-white/40"
                      }`}
                    >
                      <div className="absolute left-3 top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-base font-black text-foreground shadow-lg">
                        {i + 1}
                      </div>
                      <div className="text-5xl font-black drop-shadow-md md:text-6xl">{opt}</div>
                      <div className="text-[10px] font-black uppercase tracking-wider opacity-90">
                        Show {i + 1} finger{i > 0 ? "s" : ""}
                      </div>
                      {isPending && (
                        <div className="absolute bottom-2 left-3 right-3 h-2 overflow-hidden rounded-full bg-white/30">
                          <div
                            className="h-full rounded-full bg-white transition-all"
                            style={{ width: `${holdProgress * 100}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Camera panel */}
            <div className="rounded-3xl border-4 border-card bg-card/95 p-3 shadow-lg backdrop-blur">
              <div className="mb-2 flex items-center justify-between gap-2 text-sm font-black text-foreground">
                <span className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-primary" /> Hand Camera
                </span>
                {fingerCount !== null && (
                  <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">
                    {fingerCount} ✋
                  </span>
                )}
              </div>
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
                  playsInline
                  muted
                />
                <canvas
                  ref={canvasRef}
                  className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
                />
                {status !== "ready" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 p-4 text-center text-white">
                    {status === "loading" && (
                      <>
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                        <div className="text-sm font-bold">Loading hand detector…</div>
                      </>
                    )}
                    {status === "denied" && (
                      <>
                        <div className="text-2xl">📷</div>
                        <div className="text-sm font-bold">Camera blocked.</div>
                        <button
                          onClick={startCamera}
                          className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-black"
                        >
                          Retry
                        </button>
                      </>
                    )}
                    {status === "error" && (
                      <>
                        <div className="text-sm font-bold">Camera unavailable.</div>
                        <button
                          onClick={startCamera}
                          className="rounded-xl bg-white px-3 py-1.5 text-xs font-black text-black"
                        >
                          Try Again
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 text-center text-xs font-bold text-muted-foreground">{hint}</div>
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4].map((n) => (
                  <div
                    key={n}
                    className={`rounded-xl border-2 px-1 py-1 text-center text-xs font-black transition-all ${
                      fingerCount === n
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    {["☝️", "✌️", "🤟", "🖖"][n - 1]} {n}
                  </div>
                ))}
              </div>

              {/* Mini parent dashboard */}
              <div className="mt-4 rounded-2xl bg-muted/40 p-3 text-xs">
                <div className="mb-1 font-black uppercase tracking-wider text-muted-foreground">
                  Live Stats
                </div>
                <Row label="Answered" value={`${questionNum}/${totalQuestions}`} />
                <Row label="Accuracy" value={`${accuracy}%`} />
                <Row label="Streak" value={`${streak} 🔥`} />
                <Row label="Coins" value={String(coins)} />
                <Row label="Gems" value={String(gems)} />
              </div>
            </div>
          </div>
        )}

        {phase === "end" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-pop w-full max-w-xl rounded-3xl border-4 border-card bg-card/95 p-8 text-center shadow-2xl backdrop-blur">
              <div className="mb-3 text-7xl">🏆</div>
              <h1 className="text-4xl font-black text-foreground md:text-5xl">You Did It!</h1>
              <p className="mt-2 text-base font-bold text-muted-foreground">
                You're a Math Star! ⭐
              </p>
              <div className="my-6 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Correct" value={`${correct}/${totalQuestions}`} icon="✅" />
                <Stat label="Coins" value={String(coins)} icon="🪙" />
                <Stat label="Gems" value={String(gems)} icon="💎" />
                <Stat label="XP" value={String(xp)} icon="🏆" />
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => difficulty && startGame(difficulty)}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" /> Play Again
                </button>
                <button
                  onClick={restart}
                  className="rounded-2xl bg-card px-6 py-3 text-lg font-black text-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  Change Level
                </button>
                <button
                  onClick={onBack}
                  className="rounded-2xl bg-muted px-6 py-3 text-lg font-black text-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {confetti && <Confetti />}
    </div>
  );
}

function Pill({ icon, value, color }: { icon: React.ReactNode; value: React.ReactNode; color: string }) {
  return (
    <div className={`flex items-center gap-1.5 rounded-2xl bg-card/90 px-3 py-2 text-sm font-black shadow-sm backdrop-blur ${color}`}>
      {icon}
      <span>{value}</span>
    </div>
  );
}

function LevelCard({
  emoji,
  title,
  desc,
  onClick,
  gradient,
}: {
  emoji: string;
  title: string;
  desc: string;
  onClick: () => void;
  gradient: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`group rounded-3xl bg-gradient-to-br ${gradient} p-6 text-left text-white shadow-xl transition-all hover:-translate-y-1 hover:rotate-1 active:scale-95`}
    >
      <div className="text-5xl drop-shadow-md">{emoji}</div>
      <div className="mt-3 text-2xl font-black">{title}</div>
      <div className="mt-1 text-sm font-bold opacity-90">{desc}</div>
      <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-white/25 px-3 py-1 text-xs font-black uppercase tracking-wider">
        Start ▶
      </div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="font-bold text-muted-foreground">{label}</span>
      <span className="font-black text-foreground">{value}</span>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="rounded-2xl bg-muted/50 p-3">
      <div className="text-2xl">{icon}</div>
      <div className="mt-1 text-xl font-black text-foreground">{value}</div>
      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 60 });
  const colors = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ef4444", "#ec4899"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 1.4 + Math.random() * 1;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 10;
        return (
          <div
            key={i}
            style={{
              left: `${left}%`,
              top: "-10vh",
              width: size,
              height: size,
              background: color,
              animation: `confetti-fall ${duration}s ${delay}s linear forwards`,
              borderRadius: i % 3 === 0 ? "50%" : "2px",
            }}
            className="absolute"
          />
        );
      })}
    </div>
  );
}
