import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Camera, RotateCcw, Star, Volume2 } from "lucide-react";

interface Props {
  onBack: () => void;
  onComplete?: (score: number) => void;
}

type Question = {
  prompt: string;
  options: string[]; // 4 options shown as big cards
  correctIndex: number; // 0..3
  emoji?: string;
};

const QUESTIONS: Question[] = [
  { prompt: "Which number is 7?", options: ["5", "7", "3", "9"], correctIndex: 1, emoji: "🔢" },
  { prompt: "How many apples? 🍎🍎🍎", options: ["2", "4", "3", "1"], correctIndex: 2, emoji: "🍎" },
  { prompt: "Which shape has 3 sides?", options: ["⬛ Square", "🔺 Triangle", "⚪ Circle", "⬟ Pentagon"], correctIndex: 1, emoji: "🔺" },
  { prompt: "Which number comes after 4?", options: ["3", "6", "5", "2"], correctIndex: 2, emoji: "➡️" },
  { prompt: "How many stars? ⭐⭐⭐⭐", options: ["3", "2", "5", "4"], correctIndex: 3, emoji: "⭐" },
];

const PRAISE = ["🎉 Kudos!", "🌟 Great Job!", "✨ Awesome!"];
const ENCOURAGE = ["😊 Nice Try!", "💪 Try Again!", "🌈 Almost!"];

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.15;
    window.speechSynthesis.speak(u);
  } catch {}
}

function playTone(freq: number, duration = 0.2, type: OscillatorType = "sine") {
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
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  } catch {}
}

type Status = "idle" | "loading" | "ready" | "denied" | "error";

// Count extended fingers (index, middle, ring, pinky) using landmark y comparison.
// Returns 0..4. Thumb is intentionally excluded so options map 1..4 cleanly.
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

export function FingerGestureQuiz({ onBack, onComplete }: Props) {
  const [qIndex, setQIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<{ type: "correct" | "wrong"; msg: string; choice: number } | null>(null);
  const [phase, setPhase] = useState<"playing" | "end">("playing");
  const [confetti, setConfetti] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const landmarkerRef = useRef<any>(null);
  const lastVideoTimeRef = useRef(-1);

  const [status, setStatus] = useState<Status>("idle");
  const [fingerCount, setFingerCount] = useState<number | null>(null);
  const [hint, setHint] = useState<string>("Show your hand to the camera.");
  const [holdProgress, setHoldProgress] = useState(0); // 0..1
  const holdStartRef = useRef<number | null>(null);
  const holdCountRef = useRef<number | null>(null);
  const lockedRef = useRef(false);

  const question = QUESTIONS[qIndex];
  const totalQuestions = QUESTIONS.length;

  // Speak question on change
  useEffect(() => {
    if (phase === "playing") {
      const t = setTimeout(() => speak(question.prompt), 300);
      return () => clearTimeout(t);
    }
  }, [qIndex, phase, question.prompt]);

  // Lock submission while feedback is shown for correct answers
  useEffect(() => {
    if (feedback?.type === "correct") {
      lockedRef.current = true;
    }
  }, [feedback]);

  const submitAnswer = useCallback(
    (choice: number) => {
      if (lockedRef.current || phase !== "playing") return;
      const isCorrect = choice === question.correctIndex;
      if (isCorrect) {
        lockedRef.current = true;
        const msg = PRAISE[Math.floor(Math.random() * PRAISE.length)];
        setFeedback({ type: "correct", msg, choice });
        setConfetti(true);
        setScore((s) => s + 1);
        playTone(880, 0.15);
        setTimeout(() => playTone(1320, 0.2), 120);
        speak(msg.replace(/[^\w\s]/g, ""));
        setTimeout(() => {
          setConfetti(false);
          setFeedback(null);
          holdStartRef.current = null;
          holdCountRef.current = null;
          setHoldProgress(0);
          if (qIndex + 1 >= totalQuestions) {
            setPhase("end");
            onComplete?.(score + 1);
          } else {
            setQIndex((i) => i + 1);
          }
          lockedRef.current = false;
        }, 2000);
      } else {
        const msg = ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
        setFeedback({ type: "wrong", msg, choice });
        playTone(330, 0.2, "triangle");
        speak(msg.replace(/[^\w\s]/g, ""));
        // Allow immediate retry — clear the highlight after a moment but keep question
        setTimeout(() => {
          setFeedback(null);
          holdStartRef.current = null;
          holdCountRef.current = null;
          setHoldProgress(0);
        }, 1100);
      }
    },
    [phase, qIndex, question.correctIndex, score, totalQuestions, onComplete],
  );

  // Initialize MediaPipe HandLandmarker
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
      numHands: 2,
    });
    landmarkerRef.current = landmarker;
    return landmarker;
  }, []);

  // Start webcam + detection
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
      await video.play();
      await initLandmarker();
      setStatus("ready");
      loop();
    } catch (err: any) {
      console.error("Camera error", err);
      if (err?.name === "NotAllowedError" || err?.name === "SecurityError") setStatus("denied");
      else setStatus("error");
    }
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

  // Detection loop
  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    const tick = () => {
      if (document.hidden) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
        lastVideoTimeRef.current = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, performance.now());
          drawAndCount(result);
        } catch (e) {
          // ignore transient
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
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
    if (hands.length > 1) {
      setFingerCount(null);
      setHint("Please use only one hand.");
      holdStartRef.current = null;
      holdCountRef.current = null;
      setHoldProgress(0);
      // Still draw both for feedback
      hands.forEach((lm) => drawHand(ctx, lm, w, h, "#f59e0b"));
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
      submitAnswer(choice);
    }
  };

  // Mount: auto-request camera
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      window.speechSynthesis?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restart = () => {
    setQIndex(0);
    setScore(0);
    setFeedback(null);
    setPhase("playing");
    lockedRef.current = false;
  };

  const progressPct = useMemo(
    () => Math.round(((qIndex + (phase === "end" ? 1 : 0)) / totalQuestions) * 100),
    [qIndex, phase, totalQuestions],
  );

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-sky/30 via-background to-leaf/30">
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8 md:py-8">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              onBack();
            }}
            className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2 text-sm font-bold text-foreground shadow-sm transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-2 shadow-sm">
            <span className="text-sm font-black text-foreground">
              Q {Math.min(qIndex + 1, totalQuestions)} / {totalQuestions}
            </span>
            <span className="flex items-center gap-1 text-sm font-black text-coral">
              <Star className="h-4 w-4 fill-current" />
              {score}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {phase === "playing" ? (
          <div className="grid flex-1 gap-5 md:grid-cols-[1fr_360px] md:items-start">
            {/* Quiz */}
            <div>
              <div className="mb-5 text-center">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground shadow-sm">
                  <Volume2 className="h-3 w-3" /> Finger Gesture Quiz
                </div>
                <h2 className="text-3xl font-black text-foreground drop-shadow-sm md:text-5xl">
                  {question.emoji} {question.prompt}
                </h2>
                <p className="mt-2 text-sm font-bold text-muted-foreground">
                  Show <span className="text-primary">1, 2, 3 or 4</span> fingers to pick an answer.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 md:gap-5">
                {question.options.map((opt, i) => {
                  const isCorrect = feedback?.type === "correct" && feedback.choice === i;
                  const isWrong = feedback?.type === "wrong" && feedback.choice === i;
                  const isPending = fingerCount === i + 1 && !feedback;
                  return (
                    <button
                      key={i}
                      onClick={() => submitAnswer(i)}
                      disabled={!!feedback && feedback.type === "correct"}
                      className={`relative flex aspect-[5/3] flex-col items-center justify-center gap-2 rounded-3xl border-4 bg-card p-4 text-center shadow-lg transition-all hover:-translate-y-1 active:scale-95 ${
                        isCorrect
                          ? "border-jungle ring-4 ring-jungle/40"
                          : isWrong
                            ? "border-coral ring-4 ring-coral/40"
                            : isPending
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-card hover:border-primary"
                      }`}
                    >
                      <div className="absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground text-sm font-black shadow">
                        {i + 1}
                      </div>
                      <div className="text-3xl font-black text-foreground md:text-5xl">{opt}</div>
                      <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        Show {i + 1} finger{i > 0 ? "s" : ""}
                      </div>
                      {isPending && (
                        <div className="absolute bottom-2 left-3 right-3 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${holdProgress * 100}%` }}
                          />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {feedback && (
                <div
                  className={`animate-pop mt-5 rounded-3xl px-6 py-4 text-center text-2xl font-black shadow-md ${
                    feedback.type === "correct"
                      ? "bg-jungle/15 text-jungle"
                      : "bg-coral/15 text-coral"
                  }`}
                >
                  {feedback.msg}
                </div>
              )}
            </div>

            {/* Camera panel */}
            <div className="rounded-3xl border-4 border-card bg-card p-3 shadow-lg">
              <div className="mb-2 flex items-center gap-2 text-sm font-black text-foreground">
                <Camera className="h-4 w-4 text-primary" /> Hand Camera
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
                    {status === "idle" && (
                      <button
                        onClick={startCamera}
                        className="rounded-2xl bg-primary px-4 py-2 font-black text-primary-foreground"
                      >
                        Allow camera
                      </button>
                    )}
                    {status === "denied" && (
                      <>
                        <div className="text-sm font-bold">
                          Camera access is needed for the Finger Gesture Quiz.
                        </div>
                        <button
                          onClick={startCamera}
                          className="rounded-2xl bg-primary px-4 py-2 font-black text-primary-foreground"
                        >
                          Retry
                        </button>
                      </>
                    )}
                    {status === "error" && (
                      <>
                        <div className="text-sm font-bold">Could not start the camera.</div>
                        <button
                          onClick={startCamera}
                          className="rounded-2xl bg-primary px-4 py-2 font-black text-primary-foreground"
                        >
                          Retry
                        </button>
                      </>
                    )}
                  </div>
                )}
                {status === "ready" && fingerCount !== null && (
                  <div className="absolute right-2 top-2 rounded-2xl bg-black/60 px-3 py-1.5 text-2xl font-black text-white">
                    ☝️ {fingerCount}
                  </div>
                )}
              </div>
              <div className="mt-2 min-h-[2.5rem] text-center text-sm font-bold text-foreground">
                {hint}
              </div>
              {holdProgress > 0 && (
                <div className="mx-2 mb-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${holdProgress * 100}%` }}
                  />
                </div>
              )}
              <p className="px-1 text-[11px] leading-snug text-muted-foreground">
                Tip: hold up 1, 2, 3 or 4 fingers in front of the camera for 1 second.
                You can also tap an answer.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="animate-pop text-center">
              <div className="mb-4 text-7xl">🏆</div>
              <h1 className="mb-2 text-4xl font-black text-foreground md:text-6xl">All done!</h1>
              <p className="mb-6 text-lg font-bold text-foreground/80">
                You scored {score} out of {totalQuestions}.
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  onClick={restart}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  <RotateCcw className="h-4 w-4" /> Play Again
                </button>
                <button
                  onClick={() => {
                    stopCamera();
                    onBack();
                  }}
                  className="rounded-2xl bg-card px-6 py-3 text-lg font-black text-foreground shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  Back to Dashboard
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

function drawHand(
  ctx: CanvasRenderingContext2D,
  lm: { x: number; y: number }[],
  w: number,
  h: number,
  color: string,
) {
  const CONNECTIONS: [number, number][] = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
  ];
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  ctx.fillStyle = "#fff";
  for (const p of lm) {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function Confetti() {
  const pieces = Array.from({ length: 40 });
  const colors = ["#f97316", "#facc15", "#22c55e", "#38bdf8", "#a855f7", "#ef4444"];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const duration = 1.2 + Math.random() * 0.8;
        const color = colors[i % colors.length];
        const size = 6 + Math.random() * 8;
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
