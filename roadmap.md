2026 Stats Tracker – Roadmap

Format: Markdown (.md)

This file is intended to be saved and versioned as ROADMAP.md in the project root.

This roadmap turns the current working prototype into a robust, low-maintenance personal tracking system for two users across all of 2026.

⸻

Phase 0 — Baseline (DONE ✅)

Goal: Working local app that appends daily rows to CSV
	•	Node.js + Express backend
	•	Mobile-friendly web UI
	•	CSV file creation with headers
	•	Manual daily submission

This phase proves the concept and data format.

⸻

Phase 1 — User Separation (FOUNDATION)

Goal: Two users, two CSV files

Backend
	•	Define static users (no OAuth yet)
	•	mikel → mikel.csv
	•	brother → brother.csv
	•	Simple login endpoint (username + password)
	•	Session stored via cookie or in-memory token
	•	Route all writes to the authenticated user’s CSV

Frontend
	•	Login screen (username + password)
	•	Persist session (localStorage or cookie)
	•	Redirect to main UI after login

Exit criteria:
	•	Both users can log in
	•	Each user writes to their own CSV

⸻

Phase 2 — Daily State Buffer (CORE CHANGE)

Goal: Stop writing directly to CSV

Concept
	•	Maintain an in-memory daily state per user
	•	UI actions mutate state, not CSV

Data Structure

DailyState[user] = {
  date,
  poop,
  piss,
  coffee,
  sick,
  workout,
  nap,
  restaurants: [],
  films: [],
  shows: []
}

Backend
	•	Initialize daily state on login or server start
	•	Endpoints like:
	•	POST /increment/piss
	•	POST /toggle/workout
	•	POST /add/restaurant

Exit criteria:
	•	Counters update live
	•	No CSV writes during the day

⸻

Phase 3 — Increment-Based UX (REAL-TIME TRACKING)

Goal: Track events as they happen

UI Changes
	•	Big + buttons for:
	•	Piss
	•	Poop
	•	Coffee
	•	Toggle buttons for:
	•	Sick
	•	Workout
	•	Nap

Rules
	•	Each press updates daily state immediately
	•	UI always reflects current counts

Exit criteria:
	•	Bathroom / coffee events are one tap
	•	No forms for common actions

⸻

Phase 4 — Named Events & Integer Counts

Goal: Go beyond binary tracking

Affected Metrics
	•	Restaurants
	•	Films
	•	TV Shows
	•	Party
	•	Reading

Behavior
	•	+ opens modal
	•	User enters name (and optional notes)
	•	Entry stored as object with timestamp

Counting
	•	CSV stores counts only
	•	Names stored separately (see Phase 6)

Exit criteria:
	•	Counts increase
	•	Names are preserved

⸻

Phase 5 — Midnight Rollover Automation

Goal: Automatic daily save + reset

Logic
	•	Server checks every minute
	•	If date changes:
	•	Snapshot daily state
	•	Append one row to CSV
	•	Reset counters
	•	Start new day

CSV Role
	•	Clean daily aggregates
	•	One row per day per user

Exit criteria:
	•	No manual “save day” action
	•	New day starts at 00:00

⸻

Phase 6 — Detailed Daily Logs (JSON)

Goal: Preserve metadata without polluting CSV

Storage
	•	logs/{user}-{date}.json

Contents
	•	Full daily state
	•	Names, timestamps, notes

Reason
	•	CSV = analytics
	•	JSON = history

Exit criteria:
	•	CSV is clean
	•	Full detail is recoverable

⸻

Phase 7 — Crash Safety & Persistence

Goal: No data loss

Backend
	•	Persist dailyState to state.json on each change
	•	Reload state on server start
	•	Save on SIGINT / shutdown

Exit criteria:
	•	Server restarts do not lose counts

⸻

Phase 8 — Mobile UX Polish

Goal: Make it effortless
	•	One-hand layout
	•	Large tap targets
	•	Visual feedback on tap
	•	Current-day summary at top
	•	Prevent accidental double taps

Exit criteria:
	•	Can be used half-asleep

⸻

Phase 9 — Hosting & PWA

Goal: Use anywhere
	•	Deploy to Railway / Render
	•	Enable HTTPS
	•	Add PWA manifest
	•	Add to Home Screen support

Exit criteria:
	•	Works outside home Wi-Fi
	•	Feels like a real app

⸻

Phase 10 — Optional Future Ideas

(Not required for 2026 success)
	•	Monthly summary view
	•	Brother comparison dashboard
	•	CSV auto-download
	•	Export JSON → CSV
	•	Clerk / OAuth upgrade
	•	Graphs

⸻

Guiding Principles
	•	Never miss data > perfect data
	•	CSV stays boring
	•	JSON keeps the fun
	•	Add features only if friction stays low

⸻

This roadmap is intentionally linear.
Finish one phase fully before starting the next.