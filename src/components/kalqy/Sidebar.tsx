import { useState } from "react";
import {
  LayoutDashboard,
  Gamepad2,
  Sticker as StickerIcon,
  Trophy,
  Settings,
  ChevronDown,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import type { Role } from "@/lib/roles";
import { RoleSwitcher } from "./RoleSwitcher";

export type View =
  | "dashboard"
  | "game"
  | "finger-quiz"
  | "endless-runner"
  | "math-adventure"
  | "voice-quiz"
  | "feeling-pond"
  | "clean-earth"
  | "sticker-book"
  | "leaderboard";

interface SidebarProps {
  view: View;
  onNavigate: (view: View) => void;
  role: Role;
  onRoleChange: (r: Role) => void;
}

const ageGroups: {
  label: string;
  games: { name: string; active: boolean; view?: View }[];
}[] = [
  {
    label: "Preschool 3–4",
    games: [
      { name: "Animal Walk Adventure", active: true, view: "game" },
      { name: "Feeling Pond (Emotions)", active: true, view: "feeling-pond" },
      { name: "Finger Gesture Quiz", active: true, view: "finger-quiz" },
      { name: "Endless Runner", active: true, view: "endless-runner" },
      { name: "Math Adventure", active: true, view: "math-adventure" },
      { name: "Say the Word (Voice)", active: true, view: "voice-quiz" },
      { name: "Colour Hunt", active: false },
      { name: "Shape Catcher", active: false },
    ],
  },
  { label: "LKG 4–5", games: [] },
  {
    label: "UKG 5–6",
    games: [
      { name: "Clean Earth Hero 🌍", active: true, view: "clean-earth" },
    ],
  },
];

export function Sidebar({ view, onNavigate, role, onRoleChange }: SidebarProps) {
  const [gamesOpen, setGamesOpen] = useState(true);
  const [openAge, setOpenAge] = useState<string | null>("Preschool 3–4");

  return (
    <aside className="hidden md:flex w-[260px] shrink-0 flex-col gap-2 border-r border-border bg-sidebar p-4">
      <div className="flex items-center gap-2 px-2 pb-2">
        <div className="grid h-10 w-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-md">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xl font-black tracking-tight text-foreground">KALQY</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Move · Play · Learn
          </div>
        </div>
      </div>

      <div className="mx-1 mb-2 rounded-3xl bg-gradient-to-br from-sunshine to-coral p-3 text-foreground shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-background/70 text-2xl animate-bounce-soft">
            🦊
          </div>
          <div className="min-w-0">
            <div className="text-sm font-extrabold">Hi, I'm Kalqy!</div>
            <div className="truncate text-xs opacity-80">Ready to play?</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <NavItem
          icon={<LayoutDashboard className="h-4 w-4" />}
          label="Dashboard"
          active={view === "dashboard"}
          onClick={() => onNavigate("dashboard")}
        />
        <NavItem
          icon={<StickerIcon className="h-4 w-4" />}
          label="Sticker Book"
          active={view === "sticker-book"}
          onClick={() => onNavigate("sticker-book")}
        />
        {role === "teacher" && (
          <NavItem
            icon={<Trophy className="h-4 w-4" />}
            label="Leaderboard"
            active={view === "leaderboard"}
            onClick={() => onNavigate("leaderboard")}
          />
        )}

        <button
          onClick={() => setGamesOpen((v) => !v)}
          className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <span className="flex items-center gap-3">
            <Gamepad2 className="h-4 w-4" />
            Games
          </span>
          {gamesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {gamesOpen && (
          <div className="ml-2 flex flex-col gap-1 border-l-2 border-sidebar-border pl-2">
            {ageGroups.map((age) => (
              <div key={age.label}>
                <button
                  onClick={() => setOpenAge(openAge === age.label ? null : age.label)}
                  className="flex w-full items-center justify-between rounded-xl px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-sidebar-accent"
                >
                  <span>{age.label}</span>
                  {openAge === age.label ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
                {openAge === age.label && (
                  <div className="mt-1 flex flex-col gap-0.5">
                    {age.games.length === 0 && (
                      <span className="px-2 py-1 text-[11px] italic text-muted-foreground">
                        Coming soon
                      </span>
                    )}
                    {age.games.map((g) => {
                      const target = g.view ?? "game";
                      const isActive = g.active && view === target;
                      return (
                        <button
                          key={g.name}
                          disabled={!g.active}
                          onClick={() => g.active && onNavigate(target)}
                          className={`flex items-center justify-between rounded-xl px-2 py-1.5 text-left text-xs font-semibold transition-all ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow"
                              : g.active
                                ? "text-foreground hover:bg-sidebar-accent"
                                : "cursor-not-allowed text-muted-foreground/60"
                          }`}
                        >
                          <span className="truncate">{g.name}</span>
                          {!g.active && (
                            <span className="ml-2 shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase">
                              Soon
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <NavItem icon={<Settings className="h-4 w-4" />} label="Settings" disabled />
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <RoleSwitcher role={role} onChange={onRoleChange} />
        <div className="rounded-2xl bg-secondary p-3 text-xs text-secondary-foreground">
          <div className="font-extrabold">NEP 2020</div>
          <div className="opacity-75">Foundational Stage aligned</div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-bold transition-all ${
        active
          ? "bg-primary text-primary-foreground shadow-md"
          : disabled
            ? "cursor-not-allowed text-muted-foreground/60"
            : "text-sidebar-foreground hover:bg-sidebar-accent"
      }`}
    >
      {icon}
      {label}
      {disabled && (
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase text-muted-foreground">
          Soon
        </span>
      )}
    </button>
  );
}
