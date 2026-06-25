import { useEffect, useRef, useState, useCallback } from "react";
import { Camera, CameraOff, Eye, Activity, Sparkles, Loader2, ShieldAlert, RotateCw } from "lucide-react";

export type CameraMode = "off" | "preview" | "motion" | "pose";

interface CameraPanelProps {
  mode: CameraMode;
  onModeChange: (m: CameraMode) => void;
  onMovementDetected?: () => void;
  active?: boolean; // gate detection (e.g. only during playing phase & no feedback)
}

export function CameraPanel({ mode, onModeChange, onMovementDetected, active }: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFireRef = useRef<number>(0);
  const detectorRef = useRef<any>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const prevKpRef = useRef<Array<{ x: number; y: number }> | null>(null);
  const [status, setStatus] = useState<string>("");
  const [activity, setActivity] = useState(0); // 0..1 meter
  const [loadingModel, setLoadingModel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<"idle" | "prompting" | "granted" | "denied">("idle");
  const [retryNonce, setRetryNonce] = useState(0);

  // Check existing permission state when a camera mode is selected
  useEffect(() => {
    if (mode === "off") return;
    const anyNav = navigator as any;
    if (anyNav?.permissions?.query) {
      anyNav.permissions
        .query({ name: "camera" })
        .then((res: PermissionStatus) => {
          if (res.state === "granted") setPermission("granted");
          else if (res.state === "denied") setPermission("denied");
          else setPermission("idle");
        })
        .catch(() => {});
    }
  }, [mode]);

  // Start / stop webcam based on mode (only after permission is granted or user clicks Allow)
  useEffect(() => {
    let cancelled = false;
    async function startCam() {
      if (mode === "off") return;
      if (permission !== "granted") return; // wait for explicit allow
      try {
        setError(null);
        setStatus("Starting camera…");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 480, height: 360, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus(mode === "preview" ? "Camera on" : "Watching for movement…");
      } catch (e: any) {
        const msg = e?.name === "NotAllowedError"
          ? "Camera access blocked"
          : e?.message || "Could not start camera";
        setError(msg);
        setPermission("denied");
      }
    }
    startCam();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, permission, retryNonce]);

  const requestPermission = useCallback(async () => {
    setError(null);
    setPermission("prompting");
    setStatus("Asking for camera permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: "user" },
        audio: false,
      });
      // stop here — the startCam effect will create the real stream
      stream.getTracks().forEach((t) => t.stop());
      setPermission("granted");
    } catch (e: any) {
      const msg = e?.name === "NotAllowedError"
        ? "Camera access blocked"
        : e?.message || "Could not start camera";
      setError(msg);
      setPermission("denied");
    }
  }, []);

  const retry = useCallback(() => {
    setError(null);
    setRetryNonce((n) => n + 1);
    requestPermission();
  }, [requestPermission]);

  // Cleanup stream when going off
  useEffect(() => {
    if (mode === "off") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      prevFrameRef.current = null;
      prevKpRef.current = null;
      setActivity(0);
      setStatus("");
    }
  }, [mode]);

  // Load pose detector lazily
  useEffect(() => {
    let cancelled = false;
    async function loadPose() {
      if (mode !== "pose" || detectorRef.current) return;
      setLoadingModel(true);
      setStatus("Loading AI model…");
      try {
        const tf = await import("@tensorflow/tfjs-core");
        await import("@tensorflow/tfjs-backend-webgl");
        const pd = await import("@tensorflow-models/pose-detection");
        await tf.ready();
        const det = await pd.createDetector(pd.SupportedModels.MoveNet, {
          modelType: pd.movenet.modelType.SINGLEPOSE_LIGHTNING,
        });
        if (cancelled) return;
        detectorRef.current = det;
        setStatus("Watching your moves…");
      } catch (e: any) {
        setError("Could not load pose model");
        onModeChange("motion");
      } finally {
        setLoadingModel(false);
      }
    }
    loadPose();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Detection loop
  useEffect(() => {
    if (mode === "off" || mode === "preview") return;
    let running = true;

    const tick = async () => {
      if (!running) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        if (mode === "motion") {
          runMotion(video, canvas);
        } else if (mode === "pose" && detectorRef.current) {
          await runPose(video);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      running = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, active]);

  const fireMovement = () => {
    const now = Date.now();
    if (now - lastFireRef.current < 1500) return;
    if (!active) return;
    lastFireRef.current = now;
    onMovementDetected?.();
  };

  const runMotion = (video: HTMLVideoElement, canvas: HTMLCanvasElement) => {
    const w = 64;
    const h = 48;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    const frame = ctx.getImageData(0, 0, w, h).data;
    const prev = prevFrameRef.current;
    if (prev) {
      let diff = 0;
      for (let i = 0; i < frame.length; i += 16) {
        diff += Math.abs(frame[i] - prev[i]);
      }
      const normalized = Math.min(1, diff / 8000);
      setActivity(normalized);
      if (normalized > 0.35) fireMovement();
    }
    prevFrameRef.current = new Uint8ClampedArray(frame);
  };

  const runPose = async (video: HTMLVideoElement) => {
    try {
      const poses = await detectorRef.current.estimatePoses(video, { flipHorizontal: true });
      if (!poses.length) return;
      const kp = poses[0].keypoints
        .filter((k: any) => k.score > 0.3)
        .map((k: any) => ({ x: k.x, y: k.y }));
      const prev = prevKpRef.current;
      if (prev && prev.length && kp.length) {
        const n = Math.min(prev.length, kp.length);
        let total = 0;
        for (let i = 0; i < n; i++) {
          total += Math.hypot(kp[i].x - prev[i].x, kp[i].y - prev[i].y);
        }
        const avg = total / n;
        const normalized = Math.min(1, avg / 40);
        setActivity(normalized);
        if (normalized > 0.45) fireMovement();
      }
      prevKpRef.current = kp;
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="rounded-3xl border-4 border-card bg-card/90 p-3 shadow-lg backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <Camera className="h-3.5 w-3.5" />
          Camera
        </div>
        <div className="flex gap-1">
          <ModeBtn icon={<CameraOff className="h-3.5 w-3.5" />} label="Off" active={mode === "off"} onClick={() => onModeChange("off")} />
          <ModeBtn icon={<Eye className="h-3.5 w-3.5" />} label="See me" active={mode === "preview"} onClick={() => onModeChange("preview")} />
          <ModeBtn icon={<Activity className="h-3.5 w-3.5" />} label="Motion" active={mode === "motion"} onClick={() => onModeChange("motion")} />
          <ModeBtn icon={<Sparkles className="h-3.5 w-3.5" />} label="AI Pose" active={mode === "pose"} onClick={() => onModeChange("pose")} />
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black/80">
        {mode === "off" ? (
          <div className="flex h-full w-full items-center justify-center text-center text-xs font-bold text-white/70">
            <div>
              <CameraOff className="mx-auto mb-1 h-6 w-6" />
              Tap a mode to turn on the camera
            </div>
          </div>
        ) : permission !== "granted" ? (
          <div className="flex h-full w-full items-center justify-center p-4 text-center text-white">
            <div className="max-w-[220px] space-y-2">
              {permission === "denied" ? (
                <>
                  <ShieldAlert className="mx-auto h-7 w-7 text-coral" />
                  <div className="text-xs font-black">Camera access blocked</div>
                  <div className="text-[10px] font-bold text-white/70">
                    Allow camera in your browser's address bar, then tap retry.
                  </div>
                  <button
                    onClick={retry}
                    className="mx-auto mt-1 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow"
                  >
                    <RotateCw className="h-3 w-3" /> Retry
                  </button>
                </>
              ) : (
                <>
                  <Camera className="mx-auto h-7 w-7 text-jungle" />
                  <div className="text-xs font-black">Let Kalqy see you move!</div>
                  <div className="text-[10px] font-bold text-white/70">
                    We use your camera only on this device — nothing is recorded.
                  </div>
                  <button
                    onClick={requestPermission}
                    disabled={permission === "prompting"}
                    className="mx-auto mt-1 flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow disabled:opacity-60"
                  >
                    {permission === "prompting" ? (
                      <><Loader2 className="h-3 w-3 animate-spin" /> Asking…</>
                    ) : (
                      <><Camera className="h-3 w-3" /> Allow camera</>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="h-full w-full -scale-x-100 object-cover"
            />
            {loadingModel && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs font-bold text-white">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading AI…
              </div>
            )}
            {(mode === "motion" || mode === "pose") && (
              <div className="absolute bottom-1.5 left-1.5 right-1.5">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30">
                  <div
                    className="h-full rounded-full bg-jungle transition-all"
                    style={{ width: `${Math.round(activity * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </>
        )}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {(status || error) && (
        <div className={`mt-2 text-center text-[11px] font-bold ${error ? "text-coral" : "text-muted-foreground"}`}>
          {error || status}
        </div>
      )}
    </div>
  );
}

function ModeBtn({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
