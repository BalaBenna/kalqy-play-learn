import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RotateCcw } from "lucide-react";

export interface GestureControls {
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
  slide: () => void;
}

interface Props {
  active: boolean; // detect only while true (game playing & tab visible)
  controls: GestureControls;
}

type Status = "idle" | "loading" | "ready" | "denied" | "error";
type Gesture = "left" | "right" | "jump" | "slide" | "none";

const HOLD_MS = 350;
const COOLDOWN_MS = 320;

// Count extended fingers (index, middle, ring, pinky). Thumb excluded.
function countFingers(lm: { x: number; y: number }[]): number {
  if (!lm || lm.length < 21) return 0;
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];
  let c = 0;
  for (let i = 0; i < 4; i++) {
    if (lm[tips[i]].y < lm[pips[i]].y - 0.02) c++;
  }
  return c;
}

function thumbExtended(lm: { x: number; y: number }[]): boolean {
  // Thumb tip 4 vs IP 3: extended if horizontally far from MCP (2)
  return Math.abs(lm[4].x - lm[2].x) > 0.08;
}

// Classify gesture. Returns "none" if uncertain.
// Priority: open palm -> jump, fist -> slide, otherwise use which side of
// the frame the hand is on (user's left hand -> moveLeft, right hand -> moveRight).
// NOTE: camera feed is NOT mirrored at the model; preview is mirrored via CSS.
// In raw frame coords, the user's LEFT hand appears on the right side (x > 0.5).
function classify(lm: { x: number; y: number }[]): Gesture {
  if (!lm || lm.length < 21) return "none";
  const fingers = countFingers(lm);
  const thumb = thumbExtended(lm);

  // Open palm raised -> jump (4 fingers up)
  if (fingers === 4) return "jump";
  // Closed fist -> slide
  if (fingers === 0 && !thumb) return "slide";

  // Otherwise, decide by which hand (side of frame). Use wrist (0) x.
  const wristX = lm[0].x;
  if (wristX > 0.55) return "left";   // user's left hand
  if (wristX < 0.45) return "right";  // user's right hand
  return "none";
}

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function drawHand(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number }[],
  w: number,
  h: number,
  color: string,
) {
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.beginPath();
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
    ctx.stroke();
  }
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function RunnerGestureControl({ active, controls }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  const [status, setStatus] = useState<Status>("idle");
  const [hint, setHint] = useState("Show your hand to control the game.");
  const [current, setCurrent] = useState<Gesture>("none");

  const holdStartRef = useRef<number | null>(null);
  const holdGestureRef = useRef<Gesture>("none");
  const lastFiredRef = useRef<{ g: Gesture; t: number }>({ g: "none", t: 0 });

  const controlsRef = useRef(controls);
  useEffect(() => { controlsRef.current = controls; }, [controls]);

  const initLandmarker = useCallback(async () => {
    if (landmarkerRef.current) return landmarkerRef.current;
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    const lm = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
    landmarkerRef.current = lm;
    return lm;
  }, []);

  const fire = useCallback((g: Gesture) => {
    const c = controlsRef.current;
    if (g === "left") c.moveLeft();
    else if (g === "right") c.moveRight();
    else if (g === "jump") c.jump();
    else if (g === "slide") c.slide();
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
      if (document.hidden || !activeRef.current) {
        // Pause detection: clear holds
        holdStartRef.current = null;
        holdGestureRef.current = "none";
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          process(result);
        } catch {}
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const process = (result: any) => {
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

    const hands: { x: number; y: number }[][] = result?.landmarks ?? [];

    if (hands.length === 0) {
      setHint("Show your hand to control the game.");
      setCurrent("none");
      holdStartRef.current = null;
      holdGestureRef.current = "none";
      return;
    }
    if (hands.length > 1) {
      setHint("Please use only one hand.");
      setCurrent("none");
      holdStartRef.current = null;
      holdGestureRef.current = "none";
      hands.forEach((lm) => drawHand(ctx, lm, w, h, "#f59e0b"));
      return;
    }

    const lm = hands[0];
    const g = classify(lm);
    const color = g === "none" ? "#94a3b8" : "#22c55e";
    drawHand(ctx, lm, w, h, color);
    setCurrent(g);

    if (g === "none") {
      setHint("Left hand ← · Right hand → · Palm ↑ · Fist ↓");
      holdStartRef.current = null;
      holdGestureRef.current = "none";
      return;
    }

    const now = performance.now();
    if (holdGestureRef.current !== g) {
      holdGestureRef.current = g;
      holdStartRef.current = now;
      return;
    }
    const held = now - (holdStartRef.current ?? now);
    setHint(`${labelOf(g)} — hold steady…`);
    if (held >= HOLD_MS) {
      // Cooldown: same gesture cannot fire again until released
      const last = lastFiredRef.current;
      const sinceLast = now - last.t;
      if (last.g === g && sinceLast < 1500) {
        // already fired for this hold; require release (different gesture)
        return;
      }
      if (sinceLast < COOLDOWN_MS) return;
      lastFiredRef.current = { g, t: now };
      fire(g);
    }
  };

  const startCamera = useCallback(async () => {
    setStatus("loading");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      await initLandmarker();
      setStatus("ready");
      loop();
    } catch (err: any) {
      console.error("Gesture camera error", err);
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") setStatus("denied");
      else setStatus("error");
    }
  }, [initLandmarker, loop]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    try { landmarkerRef.current?.close?.(); } catch {}
    landmarkerRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pointer-events-auto w-[200px] overflow-hidden rounded-2xl border-2 border-card bg-card/95 shadow-xl backdrop-blur md:w-[240px]">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-black text-foreground">
        <span className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-primary" /> Gesture
        </span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] ${
          status === "ready" ? "bg-jungle/20 text-jungle" :
          status === "denied" || status === "error" ? "bg-coral/20 text-coral" :
          "bg-muted text-muted-foreground"
        }`}>
          {status === "ready" ? "LIVE" : status.toUpperCase()}
        </span>
      </div>
      <div className="relative aspect-[4/3] w-full bg-black">
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
        {status === "ready" && current !== "none" && (
          <div className="absolute left-1.5 top-1.5 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-black text-primary-foreground">
            {labelOf(current)}
          </div>
        )}
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 p-2 text-center text-white">
            {status === "loading" && (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <div className="text-[11px] font-bold">Loading detector…</div>
              </>
            )}
            {status === "idle" && (
              <button onClick={startCamera} className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground">
                Enable Camera
              </button>
            )}
            {status === "denied" && (
              <>
                <CameraOff className="h-5 w-5" />
                <div className="text-[11px] font-bold">Camera blocked</div>
                <button onClick={startCamera} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground">
                  <RotateCcw className="h-3 w-3" /> Retry Camera Access
                </button>
              </>
            )}
            {status === "error" && (
              <>
                <div className="text-[11px] font-bold">Camera unavailable</div>
                <button onClick={startCamera} className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground">
                  <RotateCcw className="h-3 w-3" /> Try Again
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 text-[10px] font-bold leading-tight text-muted-foreground">
        {hint}
      </div>
    </div>
  );
}

function labelOf(g: Gesture): string {
  switch (g) {
    case "left": return "← Left";
    case "right": return "Right →";
    case "jump": return "↑ Jump";
    case "slide": return "↓ Slide";
    default: return "";
  }
}
