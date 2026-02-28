console.log("🚀 TAP 2 EAT SERVER STARTING...");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();
const cors = require("cors");

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://tap-2-eat-qgle.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));
app.use(express.json());

// ==========================================
// NEON POSTGRESQL CONNECTION (PROPER)
// ==========================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Test DB connection safely
pool.query("SELECT NOW()")
  .then(res => console.log("✅ Neon Connected:", res.rows[0].now))
  .catch(err => {
    console.error("❌ Database Error:", err.message);
    process.exit(1);
  });

// ==========================================
// MIDDLEWARES
// ==========================================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided." });

  try {
    req.user = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Token invalid." });
  }
};

const adminOnly = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided." });

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.role !== "admin") return res.status(403).json({ message: "Admin only." });
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token invalid." });
  }
};

// ==========================================
// AUTH
// ==========================================
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Email already registered." });

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3)",
      [name || "Student", email, hashed]
    );

    res.status(201).json({ message: "Account created." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Registration failed." });
  }
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: "Invalid credentials." });

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: "student" },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({ token, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Login error." });
  }
});

app.post("/owner-login", async (req, res) => {
  const { mkey } = req.body;

  try {
    const result = await pool.query(
      "SELECT * FROM owner WHERE mkey = $1",
      [mkey]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ message: "Invalid Master Key." });

    const token = jwt.sign(
      { role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Admin login error." });
  }
});

// ==========================================
// MENU
// ==========================================
app.get("/menu", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM menu ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Menu fetch failed." });
  }
});

app.post("/menu", adminOnly, async (req, res) => {
  const { name, price, category, stock, prep_time } = req.body;

  try {
    await pool.query(
      "INSERT INTO menu (name, price, category, stock, prep_time) VALUES ($1,$2,$3,$4,$5)",
      [name, price, category || "General", stock || 20, prep_time || 15]
    );

    res.status(201).json({ message: "Menu item added." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Insert failed." });
  }
});

// ==========================================
// ORDERS BASIC
// ==========================================
app.get("/public/now-serving", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT MAX(token_number) AS now_serving FROM orders WHERE status='Ready' AND created_at::date=CURRENT_DATE"
    );

    res.json({ nowServing: result.rows[0].now_serving || "--" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Now serving error." });
  }
});

app.get("/admin/revenue", adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT SUM(total_amount) AS revenue, COUNT(*) AS count FROM orders WHERE created_at::date=CURRENT_DATE"
    );

    res.json({
      todayRevenue: result.rows[0].revenue || 0,
      todayOrdersCount: result.rows[0].count || 0,
      peakHour: "12:00 PM"
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Revenue error." });
  }
});

// ==========================================
// START SERVER
// ==========================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});