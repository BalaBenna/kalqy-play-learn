import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Mic, MicOff, RotateCcw, Star, Volume2 } from "lucide-react";

interface Props {
  onBack: () => void;
  onComplete?: (score: number) => void;
}

type Item = {
  name: string;
  emoji: string;
  accept: string[]; // acceptable spoken words (lowercased)
  hint: string;
};

const ITEMS: Item[] = [
  { name: "Apple", emoji: "🍎", accept: ["apple", "apples", "apel"], hint: "A red fruit" },
  { name: "Dog", emoji: "🐶", accept: ["dog", "doggy", "puppy"], hint: "Says woof!" },
  { name: "Ball", emoji: "⚽", accept: ["ball", "football", "soccer ball"], hint: "You can kick it" },
  { name: "Sun", emoji: "☀️", accept: ["sun", "sunshine"], hint: "Shines in the sky" },
  { name: "Cat", emoji: "🐱", accept: ["cat", "kitty", "kitten"], hint: "Says meow!" },
  { name: "Banana", emoji: "🍌", accept: ["banana", "bananas"], hint: "A yellow fruit" },
  { name: "Car", emoji: "🚗", accept: ["car", "cars"], hint: "It has wheels" },
  { name: "Fish", emoji: "🐟", accept: ["fish", "fishy"], hint: "Swims in water" },
];

const PRAISE = ["🎉 Great job!", "🌟 Awesome!", "✨ Well done!", "👏 Fantastic!"];
const ENCOURAGE = ["😊 Try again!", "💪 You can do it!", "🌈 Almost!"];

function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd?.();
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1.15;
    if (onEnd) u.onend = () => onEnd();
    window.speechSynthesis.speak(u);
  } catch {
    onEnd?.();
  }
}

function playTone(freq: number, duration = 0.2, type: OscillatorType = "sine") {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
    setTimeout(() => ctx.close(), (duration + 0.15) * 1000);
  } catch {}
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type Phase = "idle" | "listening" | "correct" | "wrong" | "done";

export function VoiceObjectQuiz({ onBack, onComplete }: Props) {
  const [round, setRound] = useState(0);
  const [items] = useState(() => shuffle(ITEMS).slice(0, 5));
  const [phase, setPhase] = useState<Phase>("idle");
  const [heard, setHeard] = useState("");
  const [stars, setStars] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [supported, setSupported] = useState(true);
  const [permError, setPermError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const current = items[round];
  const isDone = round >= items.length;

  useEffect(() => {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    recognitionRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {}
    };
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {}
  }, []);

  const checkMatch = useCallback(
    (transcript: string, item: Item) => {
      const t = transcript.toLowerCase().trim();
      if (!t) return false;
      return item.accept.some((w) => t.includes(w));
    },
    [],
  );

  const startListening = useCallback(() => {
    if (!current || phase === "listening" || phase === "correct") return;
    const rec = recognitionRef.current;
    if (!rec) return;
    setHeard("");
    setPermError(null);
    setPhase("listening");

    let finalMatched = false;

    rec.onresult = (e: any) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      const combined = (finalText || interim).trim();
      setHeard(combined);

      // check across alternatives too
      let matched = false;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        for (let a = 0; a < r.length; a++) {
          if (checkMatch(r[a].transcript, current)) {
            matched = true;
            break;
          }
        }
        if (matched) break;
      }

      if (matched && !finalMatched) {
        finalMatched = true;
        try {
          rec.stop();
        } catch {}
      }
    };

    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setPermError("Microphone permission denied. Please allow mic access.");
      } else if (e.error === "no-speech") {
        setPermError("I didn't hear anything. Try again!");
      }
      setPhase("idle");
    };

    rec.onend = () => {
      setAttempts((a) => a + 1);
      if (finalMatched) {
        setStars((s) => s + 1);
        setPhase("correct");
        playTone(660, 0.15);
        setTimeout(() => playTone(880, 0.2), 150);
        const praise = PRAISE[Math.floor(Math.random() * PRAISE.length)];
        speak(`${praise} It's a ${current.name}!`, () => {
          setTimeout(() => {
            setRound((r) => r + 1);
            setPhase("idle");
            setHeard("");
          }, 400);
        });
      } else {
        setPhase("wrong");
        playTone(220, 0.25, "square");
        const enc = ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
        speak(`${enc} Say ${current.name}.`);
        setTimeout(() => setPhase("idle"), 1400);
      }
    };

    try {
      rec.start();
    } catch (err) {
      setPhase("idle");
    }
  }, [current, phase, checkMatch]);

  // announce new item
  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => {
      speak(`What is this? Say the name.`);
    }, 350);
    return () => clearTimeout(t);
  }, [round, current]);

  useEffect(() => {
    if (isDone) {
      speak(`Amazing! You earned ${stars} stars!`);
      onComplete?.(stars);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDone]);

  const restart = () => {
    stopListening();
    setRound(0);
    setStars(0);
    setAttempts(0);
    setHeard("");
    setPhase("idle");
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-100 via-amber-50 to-rose-100 p-4 md:p-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-2 text-sm font-bold text-foreground shadow hover:bg-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-2 text-sm font-bold shadow">
            <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> {stars} / {items.length}
          </div>
        </div>

        <div className="rounded-3xl bg-white/90 p-6 shadow-xl md:p-10">
          <h1 className="mb-2 text-center text-2xl font-black tracking-tight text-foreground md:text-4xl">
            🎤 Say the Word!
          </h1>
          <p className="mb-6 text-center text-sm font-semibold text-muted-foreground md:text-base">
            Look at the picture and say its name out loud.
          </p>

          {!supported && (
            <div className="mb-6 rounded-2xl bg-rose-100 p-4 text-center text-sm font-semibold text-rose-800">
              Voice recognition isn't supported in this browser. Try Chrome or Edge on desktop / Android.
            </div>
          )}

          {isDone ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="text-7xl">🏆</div>
              <div className="text-3xl font-black">All done!</div>
              <div className="text-lg font-semibold text-muted-foreground">
                You earned <span className="text-amber-500">{stars}</span> stars in {attempts} tries.
              </div>
              <div className="flex gap-3">
                <button
                  onClick={restart}
                  className="flex items-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-primary-foreground shadow-lg hover:opacity-90"
                >
                  <RotateCcw className="h-4 w-4" /> Play Again
                </button>
                <button
                  onClick={onBack}
                  className="rounded-2xl bg-secondary px-6 py-3 font-bold text-secondary-foreground shadow hover:opacity-90"
                >
                  Home
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Round {round + 1} of {items.length}
              </div>

              <div
                className={`mx-auto mb-6 grid aspect-square w-full max-w-[320px] place-items-center rounded-[2rem] shadow-inner transition-all ${
                  phase === "correct"
                    ? "bg-emerald-100 ring-4 ring-emerald-400 scale-105"
                    : phase === "wrong"
                      ? "bg-rose-100 ring-4 ring-rose-300"
                      : "bg-gradient-to-br from-sky-100 to-indigo-100"
                }`}
              >
                <div className="text-[11rem] leading-none drop-shadow-md">{current.emoji}</div>
              </div>

              <div className="mb-4 text-center text-sm font-semibold text-muted-foreground">
                💡 Hint: {current.hint}
              </div>

              <div className="mb-4 min-h-[3rem] rounded-2xl bg-slate-50 p-3 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  I heard
                </div>
                <div className="text-lg font-bold text-foreground">
                  {heard || <span className="text-muted-foreground/60">…</span>}
                </div>
              </div>

              {permError && (
                <div className="mb-4 rounded-xl bg-amber-100 p-3 text-center text-sm font-semibold text-amber-900">
                  {permError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  disabled={!supported || phase === "correct"}
                  onClick={phase === "listening" ? stopListening : startListening}
                  className={`flex items-center gap-2 rounded-2xl px-6 py-4 text-lg font-black shadow-lg transition-all disabled:opacity-50 ${
                    phase === "listening"
                      ? "animate-pulse bg-rose-500 text-white"
                      : "bg-primary text-primary-foreground hover:scale-105"
                  }`}
                >
                  {phase === "listening" ? (
                    <>
                      <MicOff className="h-5 w-5" /> Listening…
                    </>
                  ) : (
                    <>
                      <Mic className="h-5 w-5" /> Tap & Say it
                    </>
                  )}
                </button>
                <button
                  onClick={() => speak(current.name)}
                  className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-foreground shadow hover:bg-slate-50"
                >
                  <Volume2 className="h-4 w-4" /> Hear it
                </button>
              </div>

              {phase === "correct" && (
                <div className="mt-6 text-center text-2xl font-black text-emerald-600 animate-bounce">
                  ✅ Yes! It's a {current.name}!
                </div>
              )}
              {phase === "wrong" && (
                <div className="mt-6 text-center text-xl font-black text-rose-600">
                  🙈 Try again! Say "{current.name}"
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
