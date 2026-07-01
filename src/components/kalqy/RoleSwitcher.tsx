import { UserRound, Users, GraduationCap } from "lucide-react";
import type { Role } from "@/lib/roles";

interface Props {
  role: Role;
  onChange: (r: Role) => void;
}

const OPTS: { id: Role; label: string; icon: React.ReactNode }[] = [
  { id: "kid", label: "Kid", icon: <UserRound className="h-3.5 w-3.5" /> },
  { id: "parent", label: "Parent", icon: <Users className="h-3.5 w-3.5" /> },
  { id: "teacher", label: "Teacher", icon: <GraduationCap className="h-3.5 w-3.5" /> },
];

export function RoleSwitcher({ role, onChange }: Props) {
  return (
    <div className="rounded-2xl border-2 border-sidebar-border bg-card/60 p-1.5">
      <div className="mb-1 px-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        View as
      </div>
      <div className="flex gap-1">
        {OPTS.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-black transition-all ${
              role === o.id
                ? "bg-primary text-primary-foreground shadow"
                : "text-foreground hover:bg-sidebar-accent"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
