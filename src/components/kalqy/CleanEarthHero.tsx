import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Play,
  RotateCw,
  Coins,
  Heart,
  Flame,
  Trophy,
  Volume2,
  Camera,
  CameraOff,
  RotateCcw,
} from "lucide-react";
import { logEvent } from "@/lib/analytics";
import { addCoins, unlockSticker, tickStreak } from "@/lib/rewards";
import { CLASS_ROSTER } from "@/lib/roles";

/* ------------------------- Game content ------------------------- */

type BinKey = "compost" | "recycle" | "landfill";

interface TrashItem {
  emoji: string;
  name: string;
  correct: BinKey;
  hint: string;
}

const BINS: { key: BinKey; label: string; emoji: string; color: string; ring: string }[] = [
  { key: "compost", label: "Wet Waste", emoji: "🥬", color: "bg-leaf", ring: "ring-leaf" },
  { key: "recycle", label: "Dry Waste", emoji: "♻️", color: "bg-sky", ring: "ring-sky" },
  { key: "landfill", label: "Other Waste", emoji: "🗑️", color: "bg-coral", ring: "ring-coral" },
];

const TRASH: TrashItem[] = [
  { emoji: "🍌", name: "banana peel", correct: "compost", hint: "Food scraps are Wet Waste." },
  { emoji: "🍎", name: "apple core", correct: "compost", hint: "Fruit goes in Wet Waste." },
  { emoji: "🥕", name: "carrot", correct: "compost", hint: "Veggies go in Wet Waste." },
  { emoji: "🍂", name: "leaves", correct: "compost", hint: "Leaves are Wet Waste." },
  { emoji: "📰", name: "newspaper", correct: "recycle", hint: "Paper is Dry Waste." },
  { emoji: "📦", name: "cardboard box", correct: "recycle", hint: "Cardboard is Dry Waste." },
  { emoji: "🥤", name: "plastic cup", correct: "recycle", hint: "Plastic is Dry Waste." },
  { emoji: "🍾", name: "glass bottle", correct: "recycle", hint: "Bottles are Dry Waste." },
  { emoji: "🧻", name: "used tissue", correct: "landfill", hint: "Tissues go in Other Waste." },
  { emoji: "🪥", name: "old toothbrush", correct: "landfill", hint: "Toothbrush is Other Waste." },
];

const ROUNDS = 6;
const START_LIVES = 5;
const START_TIME = 22; // seconds per item — gentle pace for preschoolers
const MIN_TIME = 18;



/* --------------------------- Helpers --------------------------- */

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.8;
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

/* --------------------- Hand-tracking (3 zones) --------------------- */

type HandStatus = "idle" | "loading" | "ready" | "denied" | "error";

function HandLaneCam({
  active,
  onLane,
}: {
  active: boolean;
  onLane: (lane: 0 | 1 | 2) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const lastLaneRef = useRef<0 | 1 | 2 | null>(null);
  const lastFiredRef = useRef(0);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const [status, setStatus] = useState<HandStatus>("idle");
  const [lane, setLane] = useState<0 | 1 | 2 | null>(null);

  const onLaneRef = useRef(onLane);
  useEffect(() => {
    onLaneRef.current = onLane;
  }, [onLane]);

  const init = useCallback(async () => {
    if (landmarkerRef.current) return;
    const { FilesetResolver, HandLandmarker } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm",
    );
    landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 1,
    });
  }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init]);

  const loop = useCallback(() => {
    const tick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const lm = landmarkerRef.current;
      if (!video || !canvas || !lm) {
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
          const res = lm.detectForVideo(video, performance.now());
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

    const hands: { x: number; y: number }[][] = result?.landmarks ?? [];
    if (!hands.length) {
      setLane(null);
      lastLaneRef.current = null;
      return;
    }
    const pts = hands[0];
    const xs = [0, 5, 9, 13, 17].map((i) => pts[i].x);
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length;
    // Video is CSS-mirrored: rawX>0.6 = kid's LEFT hand => lane 0 (Compost, left bin)
    let newLane: 0 | 1 | 2;
    if (avgX > 0.62) newLane = 0;
    else if (avgX < 0.38) newLane = 2;
    else newLane = 1;

    // draw dot
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.arc(avgX * w, pts[9].y * h, 14, 0, Math.PI * 2);
    ctx.fill();

    setLane(newLane);
    const now = performance.now();
    if (newLane !== lastLaneRef.current && now - lastFiredRef.current > 250) {
      lastLaneRef.current = newLane;
      lastFiredRef.current = now;
      onLaneRef.current(newLane);
    }
  };

  useEffect(() => {
    start();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        landmarkerRef.current?.close?.();
      } catch {}
      landmarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="w-[190px] overflow-hidden rounded-2xl border-2 border-card bg-card/95 shadow-xl backdrop-blur md:w-[230px]">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-black">
        <span className="flex items-center gap-1.5">
          <Camera className="h-3.5 w-3.5 text-primary" /> Hand Aim
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
        {/* Zone overlay */}
        <div className="pointer-events-none absolute inset-0 grid grid-cols-3">
          <div className={`border-r border-white/20 ${lane === 0 ? "bg-leaf/40" : ""}`} />
          <div className={`border-r border-white/20 ${lane === 1 ? "bg-sky/40" : ""}`} />
          <div className={lane === 2 ? "bg-coral/40" : ""} />
        </div>
        {status !== "ready" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 p-2 text-center text-white">
            {status === "loading" && (
              <>
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <div className="text-[11px] font-bold">Loading…</div>
              </>
            )}
            {status === "denied" && (
              <>
                <CameraOff className="h-5 w-5" />
                <div className="text-[11px] font-bold">Camera blocked</div>
                <button
                  onClick={start}
                  className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground"
                >
                  <RotateCcw className="h-3 w-3" /> Retry
                </button>
              </>
            )}
            {status === "error" && (
              <button
                onClick={start}
                className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-black text-primary-foreground"
              >
                <RotateCcw className="mr-1 inline h-3 w-3" /> Try again
              </button>
            )}
          </div>
        )}
      </div>
      <div className="px-3 py-1.5 text-[10px] font-bold leading-tight text-muted-foreground">
        Move your hand: LEFT · MIDDLE · RIGHT to aim
      </div>
    </div>
  );
}

/* ---------------------------- Game ---------------------------- */

type Phase = "start" | "playing" | "over";

interface Feedback {
  kind: "ok" | "bad";
  text: string;
  key: number;
}

interface Props {
  onBack: () => void;
  onComplete?: (r: { correct: number; total: number; coins: number }) => void;
}

export function CleanEarthHero({ onBack, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("start");
  const [round, setRound] = useState(0);
  const [queue, setQueue] = useState<TrashItem[]>([]);
  const [lane, setLane] = useState<0 | 1 | 2>(1);
  const [lives, setLives] = useState(START_LIVES);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [coins, setCoinsUi] = useState(0);
  const [timeLeft, setTimeLeft] = useState(START_TIME);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const current = queue[round];
  const totalTime = useMemo(
    () => Math.max(MIN_TIME, START_TIME - round * 0.35),
    [round],
  );

  /* ---------- lifecycle ---------- */

  const start = useCallback(() => {
    const q = shuffle(TRASH).slice(0, ROUNDS);
    setQueue(q);
    setRound(0);
    setLives(START_LIVES);
    setCorrect(0);
    setStreak(0);
    setBestStreak(0);
    setCoinsUi(0);
    setLane(1);
    setAnswered(false);
    setFeedback(null);
    setShowHint(false);
    setTimeLeft(START_TIME);
    setPhase("playing");
    logEvent({ game: "clean-earth", type: "session-start" });
    tickStreak();
    setTimeout(() => speak(`Where does the ${q[0].name} go?`), 250);
  }, []);

  // Timer
  useEffect(() => {
    if (phase !== "playing" || answered) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        const nt = t - 0.1;
        if (nt <= 0) {
          handleAnswer(null); // time out
          return 0;
        }
        return nt;
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, answered, round]);

  const handleAnswer = useCallback(
    (chosen: BinKey | null) => {
      if (answered || !current) return;
      setAnswered(true);
      const isRight = chosen === current.correct;
      if (isRight) {
        const bonus = 1 + Math.min(3, Math.floor(streak / 2));
        const earn = 2 + bonus;
        setCoinsUi((c) => c + earn);
        setCorrect((c) => c + 1);
        setStreak((s) => {
          const ns = s + 1;
          setBestStreak((b) => Math.max(b, ns));
          return ns;
        });
        setFeedback({ kind: "ok", text: `Nice sorting! +${earn} 🪙`, key: Date.now() });
        setConfetti((n) => n + 1);
        addCoins(earn, { game: "clean-earth", label: "sort-correct" });
        logEvent({
          game: "clean-earth",
          type: "correct",
          skill: "environmental",
          value: 1,
          label: current.name,
        });
        logEvent({
          game: "clean-earth",
          type: "movement",
          skill: "coordination",
          value: 0.5,
          label: "hand-aim",
        });
        speak("Great sorting!");
      } else {
        setLives((l) => l - 1);
        setStreak(0);
        const rightBin = BINS.find((b) => b.key === current.correct)!;
        setFeedback({
          kind: "bad",
          text: chosen ? `Oops! ${current.hint}` : `Too slow! ${current.hint}`,
          key: Date.now(),
        });
        setShowHint(true);
        logEvent({
          game: "clean-earth",
          type: "wrong",
          skill: "environmental",
          label: current.name,
        });
        speak(`This goes in ${rightBin.label}.`);
      }

      // advance
      setTimeout(
        () => {
          setShowHint(false);
          setAnswered(false);
          setFeedback(null);
          setLane(1);
          setTimeLeft(Math.max(MIN_TIME, START_TIME - (round + 1) * 0.35));
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
            setTimeout(() => queue[nr] && speak(`Where does the ${queue[nr].name} go?`), 150);
            return nr;
          });
        },
        isRight ? 1100 : 1600,
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answered, current, streak, lives, round, queue],
  );

  const endGame = useCallback(() => {
    setPhase("over");
    logEvent({ game: "clean-earth", type: "session-end" });
    const accuracy = correct / ROUNDS;
    if (correct >= 6) {
      unlockSticker("earth-hero", "clean-earth");
    }
    if (bestStreak >= 5) {
      unlockSticker("streak-star", "clean-earth");
    }
    onComplete?.({ correct, total: ROUNDS, coins });
    if (accuracy >= 0.7) speak("Amazing! You're a true Earth Hero.");
    else speak("Good try. Let's play again and save the Earth!");
  }, [correct, bestStreak, coins, onComplete]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "playing" || answered) return;
      if (e.key === "1" || e.key === "ArrowLeft") setLane(0);
      else if (e.key === "2" || e.key === "ArrowDown") setLane(1);
      else if (e.key === "3" || e.key === "ArrowRight") setLane(2);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleAnswer(BINS[lane].key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, answered, lane, handleAnswer]);

  /* -------- Rank preview -------- */
  const myRank = useMemo(() => {
    const all = [...CLASS_ROSTER, { id: "me", name: "You", avatar: "🦊", coins, stickers: 0, streak: 0, topSkill: "" }];
    all.sort((a, b) => b.coins - a.coins);
    return all.findIndex((k) => k.id === "me") + 1;
  }, [coins]);

  /* ============================ Render ============================ */

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gradient-to-b from-sky/40 via-leaf/30 to-jungle/30">
      {/* Backdrop scenery */}
      <div className="pointer-events-none absolute inset-0 opacity-25">
        <div className="absolute left-6 top-10 text-6xl">🌳</div>
        <div className="absolute right-8 top-16 text-5xl">☁️</div>
        <div className="absolute left-1/3 top-6 text-5xl">☁️</div>
        <div className="absolute right-12 bottom-40 text-6xl">🌻</div>
        <div className="absolute left-16 bottom-32 text-5xl">🌿</div>
      </div>

      {/* Top bar */}
      <div className="relative z-20 flex flex-wrap items-center gap-2 p-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 rounded-full bg-card/95 px-4 py-2 text-sm font-black text-foreground shadow-lg backdrop-blur"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Chip icon={<Coins className="h-4 w-4 text-sunshine" />}>{coins}</Chip>
          <Chip icon={<Flame className="h-4 w-4 text-coral" />}>{streak}</Chip>
          <Chip icon={<Heart className="h-4 w-4 text-destructive" />}>
            {"❤".repeat(Math.max(0, lives))}
            {"🤍".repeat(Math.max(0, START_LIVES - lives))}
          </Chip>
          <Chip icon={<Trophy className="h-4 w-4 text-primary" />}>
            {round + (phase === "playing" ? 1 : 0)}/{ROUNDS}
          </Chip>
        </div>
      </div>

      {/* Camera panel */}
      {phase === "playing" && (
        <div className="absolute right-3 top-16 z-20 md:top-20">
          <HandLaneCam active={phase === "playing" && !answered} onLane={(l) => setLane(l)} />
        </div>
      )}

      {/* Timer bar */}
      {phase === "playing" && current && (
        <div className="relative z-10 mx-auto mt-2 h-3 w-[92%] max-w-3xl overflow-hidden rounded-full bg-white/60 shadow-inner">
          <div
            className={`h-full rounded-full transition-all duration-100 ${
              timeLeft / totalTime > 0.4 ? "bg-leaf" : timeLeft / totalTime > 0.2 ? "bg-sunshine" : "bg-destructive"
            }`}
            style={{ width: `${Math.max(0, (timeLeft / totalTime) * 100)}%` }}
          />
        </div>
      )}

      {/* Playfield */}
      {phase === "playing" && current && (
        <div className="relative z-10 mx-auto mt-4 flex max-w-3xl flex-col items-center px-4 pb-40">
          {/* Question */}
          <div className="flex items-center gap-2 rounded-2xl bg-card/90 px-4 py-2 text-sm font-black text-foreground shadow backdrop-blur md:text-base">
            <button
              onClick={() => speak(`Where does the ${current.name} go?`)}
              className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"
              aria-label="Hear again"
            >
              <Volume2 className="h-4 w-4" />
            </button>
            Where does the <span className="text-primary">{current.name}</span> go?
          </div>

          {/* Falling item */}
          <div
            key={round}
            className="relative mt-4 h-56 w-full max-w-md md:h-72"
            style={{ perspective: "600px" }}
          >
            <div
              className="absolute top-0 flex h-32 w-32 items-center justify-center rounded-full bg-white/70 text-7xl shadow-xl transition-all duration-500 md:h-40 md:w-40 md:text-8xl"
              style={{
                left: `calc(${["16%", "50%", "84%"][lane]} - 4rem)`,
                transform: `translateY(${answered ? "70%" : "0%"}) rotate(${answered ? 20 : 0}deg)`,
              }}
            >
              <span className="animate-bounce-soft">{current.emoji}</span>
            </div>
          </div>

          {/* Feedback bubble */}
          {feedback && (
            <div
              key={feedback.key}
              className={`animate-pop mt-2 rounded-full px-5 py-2 text-sm font-black shadow-lg ${
                feedback.kind === "ok"
                  ? "bg-leaf text-white"
                  : "bg-destructive text-destructive-foreground"
              }`}
            >
              {feedback.text}
            </div>
          )}

          {showHint && (
            <div className="mt-2 rounded-2xl bg-sunshine/70 px-4 py-1.5 text-xs font-bold text-foreground shadow">
              Correct bin: {BINS.find((b) => b.key === current.correct)!.label}
            </div>
          )}
        </div>
      )}

      {/* Bins */}
      {phase === "playing" && current && (
        <div className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-3 gap-3 border-t-4 border-jungle/40 bg-gradient-to-t from-jungle/40 to-transparent p-3 md:gap-6 md:p-6">
          {BINS.map((b, i) => {
            const isSelected = i === lane;
            const isCorrect = showHint && b.key === current.correct;
            return (
              <button
                key={b.key}
                onClick={() => {
                  setLane(i as 0 | 1 | 2);
                  handleAnswer(b.key);
                }}
                disabled={answered}
                className={`group relative flex flex-col items-center justify-end gap-1 rounded-3xl border-4 p-4 text-center shadow-lg transition-all md:p-6 ${
                  b.color
                } ${
                  isSelected
                    ? `ring-4 ring-offset-2 ring-offset-background scale-105 ${b.ring}`
                    : "border-white/40"
                } ${isCorrect ? "animate-pop border-white" : ""} disabled:opacity-70`}
              >
                <div className="text-4xl md:text-5xl">{b.emoji}</div>
                <div className="text-sm font-black uppercase tracking-wider text-white drop-shadow md:text-base">
                  {b.label}
                </div>
                <div className="text-[10px] font-bold text-white/90 md:text-xs">
                  Press {i + 1}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Confetti */}
      {confetti > 0 && (
        <div key={confetti} className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="absolute text-2xl"
              style={{
                left: `${5 + Math.random() * 90}%`,
                top: "-5%",
                animation: `confetti-fall ${1.3 + Math.random() * 1.2}s ease-in ${Math.random() * 0.3}s forwards`,
              }}
            >
              {["✨", "🌟", "🍃", "💚", "♻️", "🎉"][i % 6]}
            </span>
          ))}
        </div>
      )}

      {/* Start overlay */}
      {phase === "start" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/40 backdrop-blur-sm">
          <div className="mx-4 max-w-lg rounded-3xl border-4 border-card bg-card p-6 text-center shadow-2xl">
            <div className="text-6xl">🌍♻️</div>
            <h1 className="mt-2 text-3xl font-black">Clean Earth Hero</h1>
            <p className="mt-1 text-sm font-bold text-muted-foreground">
              Sort {ROUNDS} items into the right bin. Earn coins, build streaks, save the planet!
            </p>
            <div className="my-4 grid grid-cols-3 gap-2 text-[11px] font-bold">
              {BINS.map((b) => (
                <div key={b.key} className={`rounded-2xl p-2 text-white ${b.color}`}>
                  <div className="text-2xl">{b.emoji}</div>
                  <div>{b.label}</div>
                </div>
              ))}
            </div>
            <div className="mb-4 grid grid-cols-2 gap-2 text-left text-[11px] font-bold text-muted-foreground">
              <div className="rounded-xl bg-secondary p-2">
                <span className="text-foreground">✋ Hand:</span> Left · Middle · Right
              </div>
              <div className="rounded-xl bg-secondary p-2">
                <span className="text-foreground">⌨ Keys:</span> 1, 2, 3
              </div>
              <div className="rounded-xl bg-secondary p-2">
                <span className="text-foreground">👆 Tap:</span> Any bin
              </div>
              <div className="rounded-xl bg-secondary p-2">
                <span className="text-foreground">🎯 Goal:</span> Beat 6/10
              </div>
            </div>
            <button
              onClick={start}
              className="mx-auto flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-base font-black text-primary-foreground shadow-lg transition-transform hover:scale-105"
            >
              <Play className="h-5 w-5" /> Start Saving
            </button>
          </div>
        </div>
      )}

      {/* Game over */}
      {phase === "over" && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-background/50 backdrop-blur-sm">
          <div className="mx-4 max-w-lg rounded-3xl border-4 border-card bg-card p-6 text-center shadow-2xl">
            <div className="text-6xl">{correct >= 8 ? "🏆" : correct >= 6 ? "🌍" : "🌱"}</div>
            <h2 className="mt-2 text-3xl font-black">
              {correct >= 8 ? "Earth Champion!" : correct >= 6 ? "Great Sorting!" : "Keep Trying!"}
            </h2>
            <div className="my-4 grid grid-cols-3 gap-2">
              <Stat label="Correct" value={`${correct}/${ROUNDS}`} />
              <Stat label="Coins" value={coins} />
              <Stat label="Best Streak" value={bestStreak} />
            </div>
            <div className="mb-4 rounded-2xl bg-sunshine/30 p-3 text-sm font-bold text-foreground">
              🏅 Class rank preview: <span className="text-primary">#{myRank}</span> of {CLASS_ROSTER.length + 1}
            </div>
            <div className="mb-4 rounded-2xl bg-secondary p-3 text-left text-xs font-semibold text-muted-foreground">
              <div className="mb-1 font-black uppercase text-foreground">Insight</div>
              {correct >= 8
                ? "Excellent environmental awareness. Try a harder round next time!"
                : correct >= 6
                  ? "Good sorting instincts. Compost vs Recycle is your strength."
                  : "Practice makes perfect. Replay to learn which bin each item belongs to."}
            </div>
            <div className="flex justify-center gap-2">
              <button
                onClick={start}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-black text-primary-foreground shadow"
              >
                <RotateCw className="h-4 w-4" /> Play Again
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

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-card/95 px-3 py-1.5 text-sm font-black shadow-lg backdrop-blur">
      {icon}
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-secondary p-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-black text-foreground">{value}</div>
    </div>
  );
}
