# Graph Report - scoter  (2026-11-11)

## Corpus Check
- 141 files · ~127,560 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 21 file(s) not represented in the graph (top: .xml 8, (none) 5, .properties 2)

## Summary
- 1233 nodes · 4433 edges · 42 communities (32 shown, 10 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 24 edges (avg confidence: 0.85)
- Token cost: 64,690 input · 0 output

## Community Hubs (Navigation)
- Core Store & DB Hub
- Finance & Investments UI
- Agenda & Activities
- App Routing & Screens
- Dialogs, Catalog & Transfer
- Courage Trail Engine
- IndexedDB Schema & Backup
- Courage Home & Game UI
- Docs & Widget Concepts
- Courage Domain Model
- Build Tooling Deps
- Courage Forms UI
- Workout Session & Timer
- Stats Bucketing
- Charts (Recharts)
- Android Widget Provider
- Android Setup Activity
- Android Unlock Service
- Weekly Boss 3D
- TS App Config
- Today Missions & XP UI
- Supabase & Widget Link
- Courage Dashboard Stats
- TS Node Config
- Stock Quotes (brapi)
- XP & Levels
- Progress Stats Charts
- Home Heatmap & Tiles
- Boss & Mission Generation
- Performance Skills
- Runtime Dependencies
- NPM Scripts
- Widget HTTP Client
- Lint Config
- TS Root Config

## God Nodes (most connected - your core abstractions)
1. `Button()` - 70 edges
2. `useApp()` - 70 edges
3. `db()` - 67 edges
4. `nowISO()` - 61 edges
5. `Card()` - 58 edges
6. `react` - 55 edges
7. `Section()` - 50 edges
8. `Header()` - 47 edges
9. `date-fns` - 36 edges
10. `App()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Coragem - Minhas frases` --conceptually_related_to--> `Coragem area - escada do medo (/coragem)`  [EXTRACTED]
  android-widget/README.md → README.md
- `widget_phrases(p_token) function (016_widget.sql)` --conceptually_related_to--> `supabase/schema.sql and migrations`  [INFERRED]
  android-widget/README.md → README.md
- `Lot` --references--> `InvestmentBuy`  [EXTRACTED]
  src/lib/invest.ts → src/lib/types.ts
- `BuyResult` --references--> `InvestmentBuy`  [EXTRACTED]
  src/lib/invest.ts → src/lib/types.ts
- `Widget connection code (base64url of {u,k,t})` --references--> `Lifegram PWA`  [EXTRACTED]
  android-widget/README.md → README.md

## Import Cycles
- 2-file cycle: `src/lib/trackCarisma.ts -> src/lib/tracks.ts -> src/lib/trackCarisma.ts`

## Hyperedges (group relationships)
- **Local-first offline-tolerant architecture** — readme_local_first_indexeddb, readme_outbox_sync_queue, readme_supabase_cloud_sync, readme_absolute_anchored_timer [INFERRED 0.85]
- **Coragem adaptive trail system** — readme_trail_map, readme_adaptive_trail, readme_trail_calibration, readme_self_esteem_levels [EXTRACTED 1.00]
- **Widget phrase fetch flow** — android_widget_readme_connection_code, android_widget_readme_widget_phrases_rpc, android_widget_readme_minhas_frases, android_widget_readme_phrase_rotation [EXTRACTED 1.00]

## Communities (42 total, 10 thin omitted)

### Community 0 - "Core Store & DB Hub"
Cohesion: 0.05
Nodes (122): react-dom, BodyWeightPrompt(), toggleActivity(), clampScore(), addRejection(), changeScore(), completeAttempt(), createGoal() (+114 more)

### Community 1 - "Finance & Investments UI"
Cohesion: 0.05
Nodes (97): CapitalLines(), cardTone(), ChartModeToggle(), DirectionOnly(), GearIcon(), KIND_HINT, KindPicker(), KindTag() (+89 more)

### Community 2 - "Agenda & Activities"
Cohesion: 0.05
Nodes (94): date-fns, CheckButton(), NextActivityCard(), QuestRow(), XPBurst(), ACTIVITY_ICONS, ACTIVITY_XP, activityXP() (+86 more)

### Community 3 - "App Routing & Screens"
Cohesion: 0.07
Nodes (92): react, react-router-dom, ActivityForm, Agenda, App(), AssetDetail, BottomNav(), BuyForm (+84 more)

### Community 4 - "Dialogs, Catalog & Transfer"
Cohesion: 0.07
Nodes (49): CatalogSearch(), CategoryRow(), DataTransfer(), ModeButton(), DialogHost(), DurationField(), MUSCLE_LABEL, NumberField() (+41 more)

### Community 5 - "Courage Trail Engine"
Cohesion: 0.10
Nodes (50): masterSteps(), registerTrackAttempt(), skipTrackStep(), CALIBRATION, CalibrationQuestion, isCalibrated(), PACE_LABEL, pacesFromAnswers() (+42 more)

### Community 6 - "IndexedDB Schema & Backup"
Cohesion: 0.13
Nodes (37): Backup, WorkoutDB, PortfolioInput, MissionInput, AppState, FinanceTaxSettings, ActiveItem, ActiveWorkout (+29 more)

### Community 7 - "Courage Home & Game UI"
Cohesion: 0.13
Nodes (32): GoalBar(), ContextPicker(), Phase, STAGE_TONE, ThreeSeconds(), setRejectionContext(), badgeFor(), contextBreakdown() (+24 more)

### Community 8 - "Docs & Widget Concepts"
Cohesion: 0.07
Nodes (30): APK build (gradlew assembleRelease, debug-key signed), Widget connection code (base64url of {u,k,t}), Lifegram Frases Android widget, Coragem - Minhas frases, Phrase rotation (screen off, tap, every 30 min), widget_phrases(p_token) function (016_widget.sql), index.html SPA entry, /src/main.tsx module entry (+22 more)

### Community 9 - "Courage Domain Model"
Cohesion: 0.13
Nodes (30): AttemptPoint, completedOf(), Confidence, ConfidenceLevel, confidenceOf(), DistributionPoint, evaluateGoal(), GoalEvaluation (+22 more)

### Community 10 - "Build Tooling Deps"
Cohesion: 0.10
Nodes (29): devDependencies, oxlint@^1.81.0, tailwindcss@^4.3.3, @tailwindcss/vite@^4.3.3, @types/node@^24.13.3, @types/react@^19.2.18, @types/react-dom@^19.2.7, @types/three@^0.170.0 (+21 more)

### Community 11 - "Courage Forms UI"
Cohesion: 0.14
Nodes (27): ChipSelect(), DataWarning(), Field(), inputClass, SCORE_HINT, ScoreBadge(), ScorePicker(), scoreTone() (+19 more)

### Community 12 - "Workout Session & Timer"
Cohesion: 0.15
Nodes (27): RestTimer(), bestSet(), compareSets(), formatClock(), formatWeight(), setLabel(), keepScreenAwake(), notificationsSupported() (+19 more)

### Community 13 - "Stats Bucketing"
Cohesion: 0.10
Nodes (28): Bucket, bucketize(), bucketLabel(), bucketStart(), computeScheduleStreak(), computeStreak(), epley1RM(), ExerciseSessionPoint (+20 more)

### Community 14 - "Charts (Recharts)"
Cohesion: 0.10
Nodes (25): recharts@^3.10.1, recharts, AveragePoint, AverageScoreLine(), axisTick, CapitalChartPoint, CountBars(), CountPoint (+17 more)

### Community 15 - "Android Widget Provider"
Cohesion: 0.23
Nodes (4): PhraseWidget, Config, Phrase, Store

### Community 17 - "Android Unlock Service"
Cohesion: 0.13
Nodes (3): BootReceiver, UnlockService, BroadcastReceiver

### Community 18 - "Weekly Boss 3D"
Cohesion: 0.13
Nodes (22): BodyShape, bodyShape(), Boss3D(), BossApi, createBoss(), Props, radialTexture(), rimMaterial() (+14 more)

### Community 20 - "TS App Config"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 21 - "Today Missions & XP UI"
Cohesion: 0.20
Nodes (15): LevelCard(), MissionCard(), StatPill(), COLORS, Piece, PRCelebration(), Mission, onlyNaos() (+7 more)

### Community 22 - "Supabase & Widget Link"
Cohesion: 0.18
Nodes (13): anonKey, PHOTO_BUCKET, SIGNED_URL_TTL, supabase, SUPABASE_ANON_KEY, SUPABASE_URL, url, base64Url() (+5 more)

### Community 24 - "Courage Dashboard Stats"
Cohesion: 0.19
Nodes (16): attemptsPerWeek(), OverallStats, PATTERN_MIN_ATTEMPTS, PatternGroup, scoreDistribution(), weekKey(), weeklyStreak(), COURAGE_PEOPLE_LABEL (+8 more)

### Community 25 - "TS Node Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 26 - "Stock Quotes (brapi)"
Cohesion: 0.30
Nodes (12): AUTO_REFRESH_MS, BrapiQuote, brapiToken(), fetchQuote(), isB3Ticker(), lastQuoteRefresh(), MissingToken, QuoteRefresh (+4 more)

### Community 27 - "XP & Levels"
Cohesion: 0.24
Nodes (13): stageOf(), stageToday(), computeXP(), levelOf(), iso(), now, reg(), titleOf() (+5 more)

### Community 28 - "Progress Stats Charts"
Cohesion: 0.30
Nodes (13): SessionBars(), WeightLine(), exerciseSessionPoints(), linearTrend(), logE1RM(), movingAverage(), parseLocalDate(), setVolume() (+5 more)

### Community 29 - "Home Heatmap & Tiles"
Cohesion: 0.33
Nodes (11): Heatmap(), Delta(), StatTile(), formatDuration(), formatVolume(), heatmapDays(), periodDelta(), routinesForDay() (+3 more)

### Community 30 - "Boss & Mission Generation"
Cohesion: 0.31
Nodes (12): creatureOf(), generateBoss(), pick(), weekSeed(), dailyMissions(), oldestRoutine(), PERFECT_DAY_XP, PerfectDays (+4 more)

### Community 31 - "Performance Skills"
Cohesion: 0.23
Nodes (11): VolumeBars(), overallStats(), ACCENT_RING, ACCENT_TEXT, SKILL_AREAS, SkillArea, SkillId, SkillSnapshot (+3 more)

### Community 32 - "Runtime Dependencies"
Cohesion: 0.18
Nodes (11): dependencies, date-fns@^4.4.0, idb@^8.0.3, react@^19.2.8, react-dom@^19.2.8, react-router-dom@^7.18.4, @supabase/supabase-js@^2.116.0, three@^0.170.0 (+3 more)

### Community 33 - "NPM Scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, test:watch

### Community 35 - "Lint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

## Knowledge Gaps
- **9 isolated node(s):** `Contextual bottom navigation bar`, `Timed and compound (block) exercises`, `Trail calibration - 14 questions (src/lib/trackCalibration.ts)`, `40 self-esteem levels (2 per chapter)`, `Coragem dashboard with CSV/JSON export (/coragem/painel)` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 251 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `App Routing & Screens` to `Core Store & DB Hub`, `Finance & Investments UI`, `Agenda & Activities`, `Dialogs, Catalog & Transfer`, `Courage Trail Engine`, `Courage Home & Game UI`, `Build Tooling Deps`, `Courage Forms UI`, `Workout Session & Timer`, `Charts (Recharts)`, `Weekly Boss 3D`, `Today Missions & XP UI`, `Courage Dashboard Stats`, `Stock Quotes (brapi)`, `Progress Stats Charts`, `Home Heatmap & Tiles`, `Boss & Mission Generation`, `Performance Skills`, `Runtime Dependencies`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `Contextual bottom navigation bar`, `Timed and compound (block) exercises`, `Trail calibration - 14 questions (src/lib/trackCalibration.ts)` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Store & DB Hub` be split into smaller, more focused modules?**
  _Cohesion score 0.05297247281980107 - nodes in this community are weakly interconnected._
- **Why does `date-fns` connect `Agenda & Activities` to `Runtime Dependencies`, `Core Store & DB Hub`, `Finance & Investments UI`, `App Routing & Screens`, `Courage Home & Game UI`, `Courage Domain Model`, `Build Tooling Deps`, `Courage Forms UI`, `Workout Session & Timer`, `Stats Bucketing`, `Charts (Recharts)`, `Today Missions & XP UI`, `Stock Quotes (brapi)`, `Progress Stats Charts`, `Home Heatmap & Tiles`, `Boss & Mission Generation`, `Performance Skills`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **Should `Finance & Investments UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05125858123569794 - nodes in this community are weakly interconnected._
- **Why does `vitest` connect `Build Tooling Deps` to `Finance & Investments UI`, `Agenda & Activities`, `Dialogs, Catalog & Transfer`, `Courage Trail Engine`, `IndexedDB Schema & Backup`, `Courage Home & Game UI`, `Courage Domain Model`, `Stats Bucketing`, `Supabase & Widget Link`, `Stock Quotes (brapi)`, `XP & Levels`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Should `Agenda & Activities` be split into smaller, more focused modules?**
  _Cohesion score 0.05176085176085176 - nodes in this community are weakly interconnected._