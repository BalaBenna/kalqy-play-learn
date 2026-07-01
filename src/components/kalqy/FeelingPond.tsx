import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, RotateCcw, Volume2 } from "lucide-react";
import { logEvent } from "@/lib/analytics";
import { addCoins, unlockSticker } from "@/lib/rewards";

interface Emotion {
  id: string;
  label: string;
  emoji: string;
}

const EMOTIONS: Emotion[] = [
  { id: "happy", label: "Happy", emoji: "😊" },
  { id: "sad", label: "Sad", emoji: "😢" },
  { id: "angry", label: "Angry", emoji: "😠" },
  { id: "scared", label: "Scared", emoji: "😨" },
  { id: "excited", label: "Excited", emoji: "🤩" },
  { id: "calm", label: "Calm", emoji: "😌" },
];

const CAUSE_PROMPTS: Record<string, string[]> = {
  happy: ["someone gives you a hug", "you eat your favorite fruit"],
  sad: ["your balloon flies away", "a friend leaves"],
  angry: ["someone breaks your toy"],
  scared: ["you hear a loud noise"],
  excited: ["you are going to the park"],
  calm: ["you listen to a soft song"],
};

const ROUNDS = 6;

function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.2;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

interface Props {
  onBack: () => void;
  onComplete: (stars: number) => void;
}

export function FeelingPond({ onBack, onComplete }: Props) {
  const [round, setRound] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [done, setDone] = useState(false);
  const startedAt = useRef(Date.now());

  const sequence = useMemo(() => {
    const arr: Emotion[] = [];
    for (let i = 0; i < ROUNDS; i++)
      arr.push(EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)]);
    return arr;
  }, []);

  const current = sequence[round];
  const prompt = useMemo(() => {
    const ex = CAUSE_PROMPTS[current?.id]?.[0];
    return ex && Math.random() > 0.5
      ? `How do you feel when ${ex}?`
      : `Show me… ${current?.label}!`;
  }, [round, current]);

  useEffect(() => {
    logEvent({ game: "feeling-pond", type: "session-start" });
    return () => {
      logEvent({ game: "feeling-pond", type: "session-end" });
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (done || !current) return;
    const t = setTimeout(() => speak(prompt), 250);
    return () => clearTimeout(t);
  }, [round, prompt, current, done]);

  const pick = (e: Emotion) => {
    if (feedback || done) return;
    const ok = e.id === current.id;
    logEvent({
      game: "feeling-pond",
      type: ok ? "correct" : "wrong",
      skill: "emotional",
      label: e.id,
    });
    if (ok) {
      setFeedback("correct");
      setCorrect((c) => c + 1);
      addCoins(2, { game: "feeling-pond", label: "correct-emotion" });
      unlockSticker("kind-heart", "feeling-pond");
      speak(`Yes! That's ${e.label}!`);
      setTimeout(() => {
        setFeedback(null);
        if (round + 1 >= ROUNDS) {
          setDone(true);
          onComplete(correct + 1);
        } else setRound((r) => r + 1);
      }, 1200);
    } else {
      setFeedback("wrong");
      speak(`That's ${e.label}. Try ${current.label}!`);
      setTimeout(() => setFeedback(null), 1000);
    }
  };

  return (
    <div className="relative min-h-full overflow-hidden bg-gradient-to-b from-sky/40 via-sky/20 to-leaf/50">
      <div className="pointer-events-none absolute inset-0 select-none text-5xl opacity-30">
        <div className="absolute left-6 top-6">🌸</div>
        <div className="absolute right-8 top-8">🌿</div>
        <div className="absolute bottom-8 left-10">💧</div>
        <div className="absolute bottom-6 right-6">🪷</div>
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-4 py-6 md:px-8 md:py-8">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => {
              window.speechSynthesis?.cancel();
              onBack();
            }}
            className="flex items-center gap-2 rounded-2xl bg-card/90 px-4 py-2 text-sm font-bold shadow-sm backdrop-blur transition-all hover:scale-105"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {!done && (
            <div className="rounded-2xl bg-card/90 px-4 py-2 text-sm font-black shadow-sm backdrop-blur">
              Round {round + 1} / {ROUNDS}
            </div>
          )}
        </div>

        {done ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center animate-pop">
            <div className="mb-4 text-7xl">🪷</div>
            <h1 className="mb-2 text-4xl font-black md:text-5xl">Beautiful feelings!</h1>
            <p className="mb-6 text-lg font-bold text-foreground/80">
              You named {correct} of {ROUNDS} correctly.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setRound(0);
                  setCorrect(0);
                  setDone(false);
                  startedAt.current = Date.now();
                }}
                className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 text-lg font-black text-primary-foreground shadow-lg transition-all hover:scale-105"
              >
                <RotateCcw className="h-4 w-4" /> Play Again
              </button>
              <button
                onClick={onBack}
                className="rounded-2xl bg-card px-6 py-3 text-lg font-black shadow-lg transition-all hover:scale-105"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-card/90 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground shadow-sm backdrop-blur">
                <Volume2 className="h-3 w-3" /> Listen & Tap a Lily-Pad
              </div>
              <h2 className="text-3xl font-black text-foreground drop-shadow-sm md:text-4xl">
                {prompt}
              </h2>
              {feedback === "correct" && (
                <div className="mt-4 animate-pop text-2xl font-black text-jungle">🌟 Great feeling!</div>
              )}
              {feedback === "wrong" && (
                <div className="mt-4 animate-pop text-2xl font-black text-coral">💭 Try again</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-5">
              {EMOTIONS.map((e) => (
                <button
                  key={e.id}
                  disabled={!!feedback}
                  onClick={() => pick(e)}
                  className="group flex aspect-square flex-col items-center justify-center gap-2 rounded-full border-4 border-card bg-gradient-to-br from-jungle/20 to-leaf/40 p-4 shadow-lg transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl active:scale-95 disabled:opacity-60"
                >
                  <div className="text-6xl transition-transform group-hover:scale-110 md:text-7xl">
                    {e.emoji}
                  </div>
                  <div className="text-base font-black md:text-lg">{e.label}</div>
                </button>
              ))}
            </div>

            {/* Round progress pips */}
            <div className="mt-8 flex items-center justify-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                Round Progress
              </span>
              {Array.from({ length: ROUNDS }).map((_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full ${
                    i < round ? "bg-jungle" : i === round ? "bg-sunshine" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
