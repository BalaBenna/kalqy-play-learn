import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Play,
  RotateCw,
  Check,
  X,
  Camera,
  CameraOff,
  RotateCcw,
  Volume2,
  Coins,
  Heart,
} from "lucide-react";
import { logEvent } from "@/lib/analytics";
import { addCoins, unlockSticker, tickStreak } from "@/lib/rewards";

/* ------------------------- Content ------------------------- */

interface VocabItem {
  emoji: string;
  word: string; // correct English word
  distractors: string[];
}

const WORDS: VocabItem[] = [
  { emoji: "🍎", word: "Apple", distractors: ["Ball", "Banana", "Ant"] },
  { emoji: "🐶", word: "Dog", distractors: ["Cat", "Cow", "Duck"] },
  { emoji: "🐱", word: "Cat", distractors: ["Dog", "Rat", "Bat"] },
  { emoji: "🚗", word: "Car", distractors: ["Bus", "Cup", "Bag"] },
  { emoji: "🌞", word: "Sun", distractors: ["Star", "Moon", "Sky"] },
  { emoji: "🌙", word: "Moon", distractors: ["Sun", "Ball", "Milk"] },
  { emoji: "🐟", word: "Fish", distractors: ["Frog", "Bird", "Dish"] },
  { emoji: "🍌", word: "Banana", distractors: ["Apple", "Bandana", "Onion"] },
  { emoji: "🎈", word: "Balloon", distractors: ["Bell", "Bottle", "Book"] },
  { emoji: "🏠", word: "House", distractors: ["Horse", "Hat", "Bus"] },
  { emoji: "🌳", word: "Tree", distractors: ["Three", "Green", "Leaf"] },
  { emoji: "🐘", word: "Elephant", distractors: ["Egg", "Envelope", "Eagle"] },
  { emoji: "🥛", word: "Milk", distractors: ["Water", "Mango", "Silk"] },
  { emoji: "👟", word: "Shoe", distractors: ["Sock", "Shirt", "Show"] },
  { emoji: "📚", word: "Book", distractors: ["Boot", "Box", "Cook"] },
];

const ROUNDS = 6;
const START_LIVES = 5;
const START_TIME = 20;

/* --------------------------- Helpers --------------------------- */

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 1.15;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch {}
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* --------------------- Face Lane Cam (2 zones) --------------------- */

type FaceStatus = "idle" | "loading" | "ready" | "denied" | "error";
type Side = "left" | "right" | null;

function FaceLaneCam({
  active,
  onSide,
}: {
  active: boolean;
  onSide: (side: "left" | "right") => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastSideRef = useRef<Side>(null);
  const lastFiredRef = useRef(0);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const onSideRef = useRef(onSide);
  useEffect(() => {
    onSideRef.current = onSide;
  }, [onSide]);

  const [status, setStatus] = useState<FaceStatus>("idle");
  const [side, setSide] = useState<Side>(null);

  const init = useCallback(async () => {
    if (detectorRef.current) return;
    const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    detectorRef.current = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
    });
  }, []);

  const loop = useCallback(() => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const det = detectorRef.current;
      if (!video || !canvas || !det) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (document.hidden || !activeRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const res = det.detectForVideo(video, performance.now());
          process(res);
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

    const dets = result?.detections ?? [];
    if (!dets.length) {
      setSide(null);
      lastSideRef.current = null;
      return;
    }
    // Use the biggest face
    const best = dets.reduce((a: any, b: any) =>
      (a.boundingBox?.width ?? 0) > (b.boundingBox?.width ?? 0) ? a : b,
    );
    const bb = best.boundingBox;
    if (!bb) return;
    // originX/originY/width/height are in pixels
    const cx = (bb.originX + bb.width / 2) / w; // 0..1 in raw video coords
    // Video is CSS mirrored: raw right (cx>0.5) = kid's LEFT side of screen (WRONG button on left)
    // We want: kid moves head LEFT (screen left) -> "left" answer
    // Screen x = 1 - cx (because of -scale-x-100)
    const screenX = 1 - cx;
    let newSide: "left" | "right";
    const DEAD = 0.08;
    if (screenX < 0.5 - DEAD) newSide = "left";
    else if (screenX > 0.5 + DEAD) newSide = "right";
    else {
      setSide(null);
      lastSideRef.current = null;
      // draw dot
      ctx.fillStyle = "#fbbf24";
      ctx.beginPath();
      ctx.arc(cx * w, (bb.originY + bb.height / 2) / h * h, 16, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // draw face box + dot
    ctx.strokeStyle = newSide === "right" ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 4;
    ctx.strokeRect(bb.originX, bb.originY, bb.width, bb.height);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(cx * w, (bb.originY + bb.height / 2), 10, 0, Math.PI * 2);
    ctx.fill();

    setSide(newSide);
    const now = performance.now();
    if (newSide !== lastSideRef.current && now - lastFiredRef.current > 400) {
      lastSideRef.current = newSide;
      lastFiredRef.current = now;
      onSideRef.current(newSide);
    }
  };

  const start = useCallback(async () => {
    setStatus("loading");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      streamRef.current = s;
      const v = videoRef.current;
      if (!v) return;
      v.srcObject = s;
      try {
        await v.play();
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        throw e;
      }
      await init();
      setStatus("ready");
      loop();
    } catch (err: any) {
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") setStatus("denied");
      else setStatus("error");
    }
  }, [init, loop]);

  useEffect(() => {
    start();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        detectorRef.current?.close?.();
      } catch {}
      detectorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-full max-w-md overflow-hidden rounded-3xl border-4 border-card bg-card/95 shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 text-xs font-black">
        <span className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-primary" /> Face Aim — move your head!
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] ${
            status === "ready"
              ? "bg-jungle/20 text-jungle"
              : status === "denied" || status === "error"
                ? "bg-coral/20 text-coral"
                : "bg-muted text-muted-foreground"
          }`}
        >
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
        {/* Two-zone overlay */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-2">
          <div
            className={`flex items-center justify-center border-r-2 border-white/40 transition-colors ${
              side === "left" ? "bg-coral/50" : "bg-coral/10"
            }`}
          >
            <div className="rounded-2xl bg-black/50 px-3 py-1.5 text-center">
              <X className="mx-auto h-6 w-6 text-white" />
              <div className="text-[11px] font-black text-white">WRONG</div>
            </div>
          </div>
          <div
            className={`flex items-center justify-center transition-colors ${
              side === "right" ? "bg-leaf/50" : "bg-leaf/10"
            }`}
          >
            <div className="rounded-2xl bg-black/50 px-3 py-1.5 text-center">
              <Check className="mx-auto h-6 w-6 text-white" />
              <div className="text-[11px] font-black text-white">RIGHT</div>
            </div>
          </div>
        </div>
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-4 text-center text-white">
            {status === "loading" && (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <div className="text-xs font-bold">Loading face camera…</div>
              </>
            )}
            {status === "denied" && (
              <>
                <CameraOff className="h-6 w-6" />
                <div className="text-xs font-bold">Camera blocked</div>
                <button
                  onClick={start}
                  className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </>
            )}
            {status === "error" && (
              <button
                onClick={start}
                className="rounded-full bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" /> Try again
              </button>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 text-[11px] font-bold leading-tight text-muted-foreground">
        Lean your head LEFT for ❌ Wrong · RIGHT for ✅ Right
      </div>
    </div>
  );
}

/* ---------------------------- Game ---------------------------- */

type Phase = "start" | "playing" | "over";

interface Question {
  item: VocabItem;
  shown: string; // label displayed
  isCorrect: boolean;
}

function buildQuestion(item: VocabItem): Question {
  const isCorrect = Math.random() < 0.5;
  const shown = isCorrect
    ? item.word
    : item.distractors[Math.floor(Math.random() * item.distractors.length)];
  return { item, shown, isCorrect };
}

interface Props {
  onBack: () => void;
  onComplete?: (r: { correct: number; total: number; coins: number }) => void;
}

export function VocabFaceQuiz({ onBack, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<Question[]>([]);
  const [lives, setLives] = useState(START_LIVES);
  const [correct, setCorrect] = useState(0);
  const [coins, setCoinsUi] = useState(0);
  const [streak, setStreak] = useState(0);
  const [timeLeft, setTimeLeft] = useState(START_TIME);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "bad"; text: string; key: number } | null>(
    null,
  );
  const [answered, setAnswered] = useState(false);

  const current = queue[round];

  const start = useCallback(() => {
    const items = shuffle(WORDS).slice(0, ROUNDS);
    const qs = items.map(buildQuestion);
    setQueue(qs);
    setRound(0);
    setLives(START_LIVES);
    setCorrect(0);
    setCoinsUi(0);
    setStreak(0);
    setAnswered(false);
    setFeedback(null);
    setTimeLeft(START_TIME);
    setPhase("playing");
    logEvent({ game: "vocab-face", type: "session-start" });
    tickStreak();
    setTimeout(() => speakQuestion(qs[0]), 400);
  }, []);

  const speakQuestion = (q: Question) => {
    speak(`Is this a ${q.shown}? Lean right for yes, left for no.`);
  };

  const handleAnswer = useCallback(
    (chosen: "right" | "left") => {
      if (answered || !current) return;
      setAnswered(true);
      const said = chosen === "right"; // "right" = "yes, it's correct"
      const isRight = said === current.isCorrect;
      if (isRight) {
        const earn = 3 + Math.min(3, streak);
        setCoinsUi((c) => c + earn);
        setCorrect((c) => c + 1);
        setStreak((s) => s + 1);
        setFeedback({ kind: "ok", text: `Great! +${earn} 🪙`, key: Date.now() });
        addCoins(earn, { game: "vocab-face", label: "vocab-correct" });
        logEvent({
          game: "vocab-face",
          type: "correct",
          skill: "vocabulary",
          value: 1,
          label: current.item.word,
        });
        logEvent({
          game: "vocab-face",
          type: "movement",
          skill: "coordination",
          value: 0.4,
          label: "head-turn",
        });
        speak("Yes! Well done.");
      } else {
        setLives((l) => l - 1);
        setStreak(0);
        setFeedback({
          kind: "bad",
          text: `Oops! This is a ${current.item.word}.`,
          key: Date.now(),
        });
        logEvent({
          game: "vocab-face",
          type: "wrong",
          skill: "vocabulary",
          label: current.item.word,
        });
        speak(`This is a ${current.item.word}.`);
      }

      setTimeout(
        () => {
          setAnswered(false);
          setFeedback(null);
          setTimeLeft(START_TIME);
          if (!isRight && lives - 1 <= 0) {
            endGame();
            return;
          }
          if (round + 1 >= ROUNDS) {
            endGame();
            return;
          }
          setRound((r) => {
            const nr = r + 1;
            setTimeout(() => queue[nr] && speakQuestion(queue[nr]), 300);
            return nr;
          });
        },
        isRight ? 1800 : 2600,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answered, current, streak, lives, round, queue],
  );

  const endGame = useCallback(() => {
    setPhase("over");
    logEvent({ game: "vocab-face", type: "session-end" });
    if (correct >= 5) unlockSticker("word-wizard", "vocab-face");
    onComplete?.({ correct, total: ROUNDS, coins });
    if (correct / ROUNDS >= 0.7) speak("Word wizard! Amazing vocabulary.");
    else speak("Good try! Let's learn more words.");
  }, [correct, coins, onComplete]);

  // Timer
  useEffect(() => {
    if (phase !== "playing" || answered) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        const nt = t - 0.1;
        if (nt <= 0) {
          // treat as wrong
          handleAnswer(current?.isCorrect ? "left" : "right");
          return 0;
        }
        return nt;
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, answered, round]);

  // Keyboard fallback
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing" || answered) return;
      if (e.key === "ArrowLeft") handleAnswer("left");
      else if (e.key === "ArrowRight") handleAnswer("right");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answered, handleAnswer]);

  /* ---------- Screens ---------- */

  if (phase === "start") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky/30 via-background to-sunshine/30 p-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-bold shadow hover:shadow-md"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mx-auto max-w-2xl rounded-3xl border-4 border-card bg-card p-8 text-center shadow-xl">
          <div className="mb-2 text-6xl">📖✨</div>
          <h1 className="mb-2 text-3xl font-black">Vocab Face Quiz</h1>
          <p className="mb-6 text-muted-foreground">
            Look at the picture and the word. Lean your head <b className="text-leaf">RIGHT</b> if it
            matches, or <b className="text-coral">LEFT</b> if it's wrong!
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 text-left text-sm font-semibold">
            <div className="rounded-2xl bg-leaf/15 p-3">
              <Check className="mb-1 h-5 w-5 text-leaf" /> Lean RIGHT = Correct
            </div>
            <div className="rounded-2xl bg-coral/15 p-3">
              <X className="mb-1 h-5 w-5 text-coral" /> Lean LEFT = Wrong
            </div>
          </div>
          <button
            onClick={start}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-8 py-3 text-lg font-black text-primary-foreground shadow-lg hover:scale-105 transition-transform"
          >
            <Play className="h-5 w-5" /> Start
          </button>
        </div>
      </div>
    );
  }

  if (phase === "over") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky/30 via-background to-sunshine/30 p-6">
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm font-bold shadow"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="mx-auto max-w-2xl rounded-3xl border-4 border-card bg-card p-8 text-center shadow-xl">
          <div className="mb-2 text-6xl">🏆</div>
          <h1 className="mb-1 text-3xl font-black">Great job!</h1>
          <p className="mb-6 text-muted-foreground">You finished the Vocab Face Quiz.</p>
          <div className="mb-6 grid grid-cols-3 gap-3 text-center">
            <Stat label="Correct" value={`${correct}/${ROUNDS}`} />
            <Stat label="Coins" value={`${coins}`} />
            <Stat label="Lives left" value={`${lives}`} />
          </div>
          <div className="flex justify-center gap-3">
            <button
              onClick={start}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-black text-primary-foreground shadow"
            >
              <RotateCw className="h-4 w-4" /> Play again
            </button>
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-full bg-secondary px-6 py-2.5 font-black text-secondary-foreground"
            >
              Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // playing
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky/30 via-background to-sunshine/30 p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm font-bold shadow"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2 text-sm font-black">
          <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 shadow">
            <Coins className="h-4 w-4 text-sunshine" /> {coins}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-card px-3 py-1.5 shadow">
            <Heart className="h-4 w-4 text-coral" /> {lives}
          </div>
          <div className="rounded-full bg-card px-3 py-1.5 shadow">
            {round + 1}/{ROUNDS}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
        {/* Question card */}
        <div className="rounded-3xl border-4 border-card bg-card p-6 text-center shadow-xl">
          <div className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
            Does this word match?
          </div>
          <div className="mb-3 text-[8rem] leading-none animate-pop" key={current?.item.emoji + round}>
            {current?.item.emoji}
          </div>
          <div
            className={`mx-auto mb-4 inline-block rounded-2xl px-6 py-3 text-4xl font-black shadow-inner ${
              feedback?.kind === "ok"
                ? "bg-leaf/25 text-leaf"
                : feedback?.kind === "bad"
                  ? "bg-coral/25 text-coral"
                  : "bg-secondary"
            }`}
          >
            {current?.shown}
          </div>
          <button
            onClick={() => current && speak(current.shown)}
            className="mx-auto flex items-center gap-1.5 rounded-full bg-secondary px-4 py-1.5 text-xs font-black text-secondary-foreground"
          >
            <Volume2 className="h-3.5 w-3.5" /> Hear the word
          </button>

          {/* Timer bar */}
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(timeLeft / START_TIME) * 100}%` }}
            />
          </div>

          {feedback && (
            <div
              key={feedback.key}
              className={`mt-4 rounded-2xl px-4 py-2 text-sm font-black animate-pop ${
                feedback.kind === "ok" ? "bg-leaf/20 text-leaf" : "bg-coral/20 text-coral"
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Tap fallback */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              disabled={answered}
              onClick={() => handleAnswer("left")}
              className="flex items-center justify-center gap-2 rounded-2xl bg-coral px-4 py-3 text-sm font-black text-white shadow disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Wrong
            </button>
            <button
              disabled={answered}
              onClick={() => handleAnswer("right")}
              className="flex items-center justify-center gap-2 rounded-2xl bg-leaf px-4 py-3 text-sm font-black text-white shadow disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Right
            </button>
          </div>
        </div>

        {/* Face camera */}
        <div className="flex items-start justify-center">
          <FaceLaneCam
            active={phase === "playing" && !answered}
            onSide={(s) => handleAnswer(s)}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary p-3">
      <div className="text-xs font-bold uppercase text-muted-foreground">{label}</div>
      <div className="text-2xl font-black">{value}</div>
    </div>
  );
}
