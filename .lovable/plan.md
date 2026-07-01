
# KALQY v2 — Engagement, Rewards, Kinesthetic Depth & Unified Analytics

This plan responds to three streams of feedback: (1) client engagement/mechanics notes, (2) Frog Jump post-test suggestions, and (3) a new NCF-aligned game plus a role-aware Dashboard + Leaderboard. All work stays client-side (mock data, in-memory), matching the current build.

## 1. Reward System Overhaul (replaces raw "score")

Move away from numeric scores toward child-friendly tokens with clear milestone feedback.

- **Kalqy Coins** (soft currency) + **Sticker Badges** (milestone rewards) + **Streak Sparkles** (repetition/consistency).
- Milestone triggers with animation + voice praise: First Jump, 10 Jumps, 3-in-a-Row, "Frog Master" (all 5 rounds), Daily Streak.
- Replace all "score" text/UI with coin + sticker book. A `RewardEngine` module (`src/lib/rewards.ts`) evaluates events and returns milestone unlocks.
- Confetti + mascot cheer + Web Speech praise ("You earned the Bouncy Bunny sticker!").

## 2. Frog Jump / Animal Walk — Depth Fixes

Direct answers to the tester's questions:

- **Animated animal character per round**: cartoon frog/rabbit/elephant/duck SVG sprite that demonstrates the move with matching voice + sound (frog "ribbit", duck "quack").
- **Jump-height sensitivity (pose mode)**: use MediaPipe pose landmarks (already installed) — measure hip-Y displacement peak; classify Low / Medium / High jump and award 1 / 2 / 3 coins. Show a "Power Meter" that fills with jump height.
- **Bottom horizontal bar clarified**: rename + label it "Round Progress" with round pips (● ● ○ ○ ○). Add a separate "Energy/Power Meter" for movement intensity so the two are distinct.
- **Curiosity ladder**: each round unlocks a new movement style (hop → double-hop → hop + clap → hop + turn) so the child doesn't feel dormant.

## 3. New Game — R2 "Feeling Pond" (NCF Task-2)

From the uploaded curriculum doc, Task-2 Emotion Sets. Age 3–4 band: Happy / Sad / Angry / Scared / Excited / Surprised / Tired / Calm.

- Jungle-pond scene with lotus lily-pads, each showing an emotion emoji + face.
- Kalqy says: "Show me… Happy!" (voice + text, bilingual-ready structure).
- Child answers via: (a) tap, (b) finger-count 1–4 (existing MediaPipe hand code), or (c) mimic the facial expression using the camera (simple happy/sad heuristic via mouth landmarks — optional toggle).
- 6 rounds, mix of "show me" and "why do you feel…" cause-effect prompts for older band.
- Emits reward events + analytics (see §5).

## 4. Role-Aware Dashboard + Leaderboard

Add a lightweight role switch (Kid / Parent / Teacher) — no auth, just a selector in the sidebar. All mock in-memory.

- **Kid view (default)**: current cheerful dashboard, sticker book, "next milestone" card, Kalqy mascot encouragement.
- **Parent view**: per-skill radar chart (Balance / Coordination / Body Awareness / Vocabulary / Emotional Literacy / Numeracy), time-played, streak calendar, milestone timeline.
- **Teacher view**: class leaderboard (mock roster of 8 kids), sortable by coins / streak / skill; per-child drill-down; NCF competency coverage bars.
- Leaderboard is friendly: "Top Explorers of the Week" with mascots, not raw ranks for the youngest kids.

## 5. Unified Analytics Layer

One event bus every game writes to; dashboards read from it.

- `src/lib/analytics.ts` — `logEvent({ game, type, value, skill, ts })` stored in `localStorage` + in-memory.
- Every game reports: session duration, attempts, correct/incorrect, movement intensity, milestones, repetition count.
- Derived metrics: **Usability = time-on-task vs. drop-off**, **Repetition = sessions per game over 7 days**, **Skill progression = rolling avg per competency**.
- Common Dashboard "Inferences" card surfaces auto-generated insights: "Aarav is strongest in Coordination", "Try Feeling Pond — not played this week".

## 6. Sidebar / Navigation Additions

- New nav item: **Feeling Pond** (emotions game).
- New nav item: **Sticker Book** (reward gallery).
- New nav item: **Class View** (visible when role = Teacher).
- Role switcher chip at bottom of sidebar.

## Technical Section

- New files:
  - `src/lib/rewards.ts` — milestone rules, coin math, sticker catalog.
  - `src/lib/analytics.ts` — event log + selectors (`getSkillTrend`, `getUsage`, `getInferences`).
  - `src/lib/roles.ts` + `src/components/kalqy/RoleSwitcher.tsx`.
  - `src/components/kalqy/FeelingPond.tsx` — new emotions game.
  - `src/components/kalqy/StickerBook.tsx`.
  - `src/components/kalqy/Leaderboard.tsx` (Teacher view).
  - `src/components/kalqy/ParentDashboard.tsx` + `KidDashboard.tsx` (split existing `Dashboard.tsx`).
  - `src/components/kalqy/PowerMeter.tsx` — reusable intensity bar.
  - `src/components/kalqy/AnimalMascot.tsx` — animated per-animal SVG.
- Modified:
  - `GameScreen.tsx` — integrate PowerMeter, jump-height scoring via existing pose detector, AnimalMascot, curiosity-ladder rounds, remove numeric score in favor of coin/sticker HUD, label the round-progress bar.
  - `CameraPanel.tsx` — expose hip-Y delta to parent for jump-height classification.
  - `Sidebar.tsx` + `routes/index.tsx` — new views, role switcher.
  - All existing games call `logEvent(...)` + `RewardEngine`.
- Charts via `recharts` (already available through shadcn `chart.tsx`).
- Persistence: `localStorage` only. No backend changes.

## Out of Scope (call out for later phases)

- Real auth / multi-user cloud sync — flagged as Phase 2 (would need Lovable Cloud).
- LKG–6th grade full curriculum build-out — this plan covers the Preschool (3–4) additions plus scaffolding (rewards, analytics, roles, leaderboard) that all future grade bands will plug into.
- Malayalam bilingual voice — structure prepared (i18n-ready strings), audio recorded later.

## Delivery Order

1. Analytics + Rewards libraries (foundation).
2. Refactor Dashboard into Kid/Parent/Teacher + Role switcher + Leaderboard.
3. Frog Jump polish: AnimalMascot, PowerMeter, jump-height scoring, bar labels, curiosity ladder.
4. New Feeling Pond game.
5. Sticker Book view + milestone celebrations wired across all games.
