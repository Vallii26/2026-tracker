Database Migration – PostgreSQL on Render

This document explains how to migrate the 2026 Stats Tracker from CSV-based storage to a persistent PostgreSQL database hosted on Render.

⸻

Why move to a database?
	•	CSV files are not persistent on Render (lost on redeploy)
	•	PostgreSQL gives:
	•	Persistent storage
	•	Historical queries
	•	Snapshots (6am / 12pm / 6pm / midnight)
	•	Easy analytics later

⸻

1. Create PostgreSQL on Render
	1.	Go to Render Dashboard
	2.	Click New → PostgreSQL
	3.	Name it:

daily-stats-db


	4.	Select Free plan
	5.	Create the database

Render will automatically expose:
	•	DATABASE_URL (as an environment variable)

⚠️ Do not commit credentials to GitHub.

⸻

2. Install PostgreSQL client

npm install pg

Commit the change.

⸻

3. Connect to the database (server.js)

Add near the top of server.js:

import pkg from "pg"
const { Pool } = pkg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
})


⸻

4. Create database tables (one-time setup)

Add this function:

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      date DATE NOT NULL,
      snapshot_type TEXT NOT NULL, -- midnight | snapshot
      poop INT,
      piss INT,
      coffee INT,
      shower INT,
      sick INT,
      workout INT,
      nap INT,
      party INT,
      restaurant_count INT,
      film_count INT,
      show_count INT,
      book_count INT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS named_events (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      date DATE NOT NULL,
      type TEXT NOT NULL, -- restaurant | film | show | book
      name TEXT NOT NULL,
      time TIMESTAMP NOT NULL
    )
  `)

  console.log("Database ready")
}

Call it before starting the server:

await initDB()

(Render supports top-level await with Node 18+)

⸻

5. Replace CSV saving with database inserts

Old (CSV-based)

fs.appendFileSync(...)

New (Database-based)

async function saveDayToDB(user, type = "midnight") {
  const d = dailyState[user]

  await pool.query(
    `INSERT INTO daily_snapshots (
      username, date, snapshot_type,
      poop, piss, coffee, shower, sick,
      workout, nap, party,
      restaurant_count, film_count, show_count, book_count
    ) VALUES (
      $1,$2,$3,
      $4,$5,$6,$7,$8,
      $9,$10,$11,
      $12,$13,$14,$15
    )`,
    [
      user, d.date, type,
      d.poop, d.piss, d.coffee, d.shower, d.sick,
      d.workout, d.nap, d.party,
      d.restaurants.length,
      d.films.length,
      d.shows.length,
      d.books.length
    ]
  )

  // Save named events
  for (const r of d.restaurants) {
    await pool.query(
      `INSERT INTO named_events (username, date, type, name, time)
       VALUES ($1,$2,'restaurant',$3,$4)`,
      [user, d.date, r.name, r.time]
    )
  }

  // Repeat for films, shows, books
}


⸻

6. Update rollover & snapshot logic

Change calls from:

saveDayToCSV(user, "snapshot")

To:

await saveDayToDB(user, "snapshot")

Make sure your interval is async:

setInterval(async () => {
  // rollover + snapshot logic
}, 60 * 1000)


⸻

7. Reading historical data

Replace file-based reads with SQL queries:

const { rows } = await pool.query(
  `SELECT * FROM daily_snapshots
   WHERE username=$1 AND date=$2
   ORDER BY created_at DESC
   LIMIT 1`,
  [user, date]
)

This allows full history across redeploys and devices.

⸻

8. What you gain immediately
	•	✅ Persistent storage (no data loss)
	•	✅ Snapshot history (6am / 12pm / 6pm / midnight)
	•	✅ Multi-user safe
	•	✅ Analytics-ready
	•	✅ CSV export possible later

⸻

9. Recommended next steps
	1.	CSV export endpoint (/export/:user)
	2.	Charts (weekly / monthly)
	3.	Timezone-safe snapshots
	4.	Automated backups

⸻

File name suggestion: DATABASE.md

Commit this file to GitHub so future-you remembers why this exists 🙂