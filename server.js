import express from "express"
import fs from "fs"
import path from "path"

const app = express()
app.use(express.json())
app.use(express.static("public"))

/* =====================
   USERS
===================== */
const USERS = {
  mikel: { password: "1234", csv: "mikel.csv" },
  eneko: { password: "valladares", csv: "eneko.csv" },
  ana: { password: "5678", csv: "ana.csv" }
}

/* =====================
   IN-MEMORY STATE
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
    books: []
  }

  const file = USERS[user].csv
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      "Date,Poop,Piss,Shower,Sick,Workout,Nap,Party,Coffee,RestaurantCount,FilmCount,TVCount,BookCount\n"
    )
  }

  // ensure logs folder exists
  if (!fs.existsSync("logs")) fs.mkdirSync("logs")
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

app.get("/state/:user/:date", (req, res) => {
  const { user, date } = req.params

  // if today, return live state
  if (date === today() && dailyState[user]) {
    return res.json(dailyState[user])
  }

  // check logs
  const logFile = path.join("logs", `${user}-${date}.json`)
  if (fs.existsSync(logFile)) {
    const data = JSON.parse(fs.readFileSync(logFile))
    return res.json(data)
  }

  // if no log, return empty structure (read-only)
  res.json({
    date,
    poop: 0, piss: 0, coffee: 0, shower: 0, sick: 0, workout: 0, nap: 0, party: 0,
    restaurants: [], films: [], shows: [], books: [],
    readOnly: true // flag to disable editing
  })
})

app.post("/increment/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).end()
  if (typeof dailyState[user][field] !== "number")
    return res.status(400).json({ error: "Not a numeric field" })

  dailyState[user][field] += 1
  res.json(dailyState[user])
})

// Decrement numeric counter
app.post("/decrement/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).json({ error: "User not found" })
  if (!(field in dailyState[user])) return res.status(400).json({ error: "Invalid field" })

  // Make sure it’s a number field
  if (typeof dailyState[user][field] === "number") {
    dailyState[user][field] = Math.max(0, dailyState[user][field] - 1) // no negative counts
  }

  res.json({ ok: true, value: dailyState[user][field] })
})

app.post("/toggle/:user/:field", (req, res) => {
  const { user, field } = req.params
  if (!dailyState[user]) return res.status(404).end()
  if (typeof dailyState[user][field] !== "number")
    return res.status(400).json({ error: "Not a toggle field" })

  dailyState[user][field] = dailyState[user][field] ? 0 : 1
  res.json(dailyState[user])
})

app.post("/add/:user/:type", (req, res) => {
  const { user, type } = req.params
  const { name } = req.body
  if (!dailyState[user]) return res.status(404).end()
  if (!Array.isArray(dailyState[user][type]))
    return res.status(400).json({ error: "Invalid type" })

  dailyState[user][type].push({ name, time: new Date().toISOString() })
  res.json(dailyState[user])
})

/* =====================
   MIDNIGHT & SNAPSHOT ROLLOVER
===================== */

function saveDayToCSV(user, type = "midnight") {
  const d = dailyState[user]
  const file = USERS[user].csv

  // append CSV row
  const row = `${d.date},${d.poop},${d.piss},${d.shower},${d.sick},${d.workout},${d.nap},${d.party},${d.coffee},${d.restaurants.length},${d.films.length},${d.shows.length},${d.books.length},${type}\n`
  fs.appendFileSync(file, row)

  // save full JSON log
  const logFile = path.join("logs", `${user}-${d.date}-${type}.json`)
  fs.writeFileSync(logFile, JSON.stringify(d, null, 2))
}

function resetDailyState(user) {
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
    lastSnapshotHour: null // track last snapshot to avoid duplicates
  }
}

// check every minute
setInterval(() => {
  const now = new Date()
  const hh = now.getHours()
  const mm = now.getMinutes()
  const todayStr = today()

  for (const user in dailyState) {
    // MIDNIGHT ROLLOVER
    if (dailyState[user].date !== todayStr) {
      saveDayToCSV(user, "midnight")
      resetDailyState(user)
      console.log(`Saved and reset ${user} for new day ${todayStr}`)
      continue
    }

    // SNAPSHOT saves at 6AM, 12PM, 6PM
    const snapshotHours = [3, 6, 9, 12, 15, 18, 21]
    if (snapshotHours.includes(hh) && mm >= 0 && mm < 1) {
      // prevent multiple saves in the same hour
      if (dailyState[user].lastSnapshotHour !== hh) {
        saveDayToCSV(user, "snapshot")
        dailyState[user].lastSnapshotHour = hh
        console.log(`Saved snapshot for ${user} at ${hh}:00`)
      }
    }
  }
}, 60 * 1000) // every minute

/* =====================
   START SERVER
===================== */
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000")
})