import express from "express"
import pkg from "pg"

const { Pool } = pkg

const app = express()
app.use(express.json())
app.use(express.static("public"))

/* =====================
   DATABASE
===================== */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : false
})

/* =====================
   USERS (still in-memory)
===================== */
const USERS = {
  mikel: { password: "1234" },
  eneko: { password: "valladares" },
  ana: { password: "5678" }
}

/* =====================
   IN-MEMORY STATE (live day)
===================== */
const dailyState = {}

/* =====================
   HELPERS
===================== */
function today() {
  return new Date().toISOString().slice(0, 10)
}

function initUser(user) {
  dailyState[user] = {
    date: today(),
    poop: 0,
    piss: 0,
    coffee: 0,
    shower: 0,
    sick: 0,
    workout: 0,
    nap: 0,
    party: 0,
    restaurants: [],
    films: [],
    shows: [],
    books: [],
    lastSnapshotHour: null
  }
}

/* =====================
   DATABASE INIT
===================== */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS daily_snapshots (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      date DATE NOT NULL,
      snapshot_type TEXT NOT NULL,
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
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      time TIMESTAMP NOT NULL
    )
  `)

  console.log("Database ready")
}

/* =====================
   AUTH
===================== */
app.post("/login", (req, res) => {
  const { user, password } = req.body
  if (!USERS[user] || USERS[user].password !== password) {
    return res.status(401).json({ error: "Invalid credentials" })
  }

  if (!dailyState[user]) initUser(user)
  res.json({ ok: true, user })
})

/* =====================
   STATE ENDPOINTS
===================== */
app.get("/state/:user", (req, res) => {
  const { user } = req.params
  if (!dailyState[user]) return res.status(404).end()
  res.json(dailyState[user])
})

app.get("/state/:user/:date", async (req, res) => {
  const { user, date } = req.params

  if (date === today() && dailyState[user]) {
    return res.json(dailyState[user])
  }

  const { rows } = await pool.query(
    `SELECT * FROM daily_snapshots
     WHERE username=$1 AND date=$2
     ORDER BY created_at DESC
     LIMIT 1`,
    [user, date]
  )

  if (rows.length === 0) {
    return res.json({ date, readOnly: true })
  }

  res.json(rows[0])
})

/* =====================
   MUTATIONS
===================== */

// INCREMENT numeric field
app.post("/increment/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).end()
  if (typeof dailyState[user][field] !== "number")
    return res.status(400).json({ error: "Not numeric" })

  dailyState[user][field]++
  res.json(dailyState[user])
})

// DECREMENT numeric field (never below 0)
app.post("/decrement/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).json({ error: "User not found" })
  if (typeof dailyState[user][field] !== "number")
    return res.status(400).json({ error: "Not numeric" })

  dailyState[user][field] = Math.max(0, dailyState[user][field] - 1)
  res.json(dailyState[user])
})

// TOGGLE numeric field (0 ↔ 1)
app.post("/toggle/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).end()
  if (typeof dailyState[user][field] !== "number")
    return res.status(400).json({ error: "Not numeric" })

  dailyState[user][field] = dailyState[user][field] ? 0 : 1
  res.json(dailyState[user])
})

// ADD named item to array field
app.post("/add/:user/:type", (req, res) => {
  const { user, type } = req.params
  const { name } = req.body

  if (!dailyState[user]) return res.status(404).end()
  if (!Array.isArray(dailyState[user][type]))
    return res.status(400).json({ error: "Invalid type" })

  dailyState[user][type].push({
    name,
    time: new Date().toISOString()
  })

  res.json(dailyState[user])
})

/* =====================
   SAVE TO DATABASE
===================== */
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

  for (const typeName of ["restaurants", "films", "shows", "books"]) {
    for (const item of d[typeName]) {
      await pool.query(
        `INSERT INTO named_events (username, date, type, name, time)
         VALUES ($1,$2,$3,$4,$5)`,
        [user, d.date, typeName.slice(0, -1), item.name, item.time]
      )
    }
  }
}

function resetDailyState(user) {
  initUser(user)
}

/* =====================
   ROLLOVER & SNAPSHOTS
===================== */
setInterval(async () => {
  const now = new Date()
  const hh = now.getHours()
  const mm = now.getMinutes()
  const todayStr = today()

  for (const user in dailyState) {
    // MIDNIGHT
    const midnightHours = [1]
    if (midnightHours.includes(hh) && mm >= 0 && mm <= 1) {
      if (dailyState[user].lastSnapshotHour !== hh) {
        await saveDayToDB(user, "midnight")
        resetDailyState(user)
        continue
      }
    }

    // SNAPSHOTS
    const snapshotHours = [4, 7, 10, 13, 16, 19, 22]
    if (snapshotHours.includes(hh) && mm >= 0 && mm <= 1) {
      if (dailyState[user].lastSnapshotHour !== hh) {
        await saveDayToDB(user, "snapshot")
        dailyState[user].lastSnapshotHour = hh
      }
    }
  }
}, 60 * 1000)

/* =====================
   START SERVER
===================== */
await initDB()

async function loadLastSnapshot(user) {
  const todayStr = today()

  // get the latest snapshot for today
  const { rows } = await pool.query(
    `SELECT *
     FROM daily_snapshots
     WHERE username=$1 AND date=$2
     ORDER BY created_at DESC
     LIMIT 1`,
    [user, todayStr]
  )

  if (rows.length === 0) {
    // No snapshot today, start from 0
    initUser(user)
    return
  }

  const snapshot = rows[0]

  dailyState[user] = {
    date: snapshot.date,
    poop: snapshot.poop,
    piss: snapshot.piss,
    coffee: snapshot.coffee,
    shower: snapshot.shower,
    sick: snapshot.sick,
    workout: snapshot.workout,
    nap: snapshot.nap,
    party: snapshot.party,
    restaurants: [],
    films: [],
    shows: [],
    books: [],
    lastSnapshotHour: null
  }

  // load named events for today
  const { rows: events } = await pool.query(
    `SELECT * FROM named_events
     WHERE username=$1 AND date=$2`,
    [user, todayStr]
  )

  for (const ev of events) {
    // pluralize type to match dailyState keys
    const key = ev.type + "s"
    if (dailyState[user][key]) {
      dailyState[user][key].push({
        name: ev.name,
        time: ev.time
      })
    }
  }
}

for (const user of Object.keys(USERS)) {
  await loadLastSnapshot(user)
}

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000")
})