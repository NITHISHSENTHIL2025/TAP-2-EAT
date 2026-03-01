console.log("🚀 TAP 2 EAT SERVER STARTING...");

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const { Pool } = require("pg");

const app = express();

// ==========================
// CORS
// ==========================
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://tap-2-eat-qgle.vercel.app"
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

app.use(express.json());

// ==========================
// DATABASE
// ==========================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

pool.query("SELECT NOW()")
  .then(res => console.log("✅ Neon Connected:", res.rows[0].now))
  .catch(err => {
    console.error("❌ Database Error:", err.message);
    process.exit(1);
  });

// ==========================
// MIDDLEWARES
// ==========================
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


function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: "Invalid token" });
    }

    req.user = user;
    next();
  });
}

const adminOnly = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided." });

  try {
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    if (decoded.role !== "admin")
      return res.status(403).json({ message: "Admin only." });

    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Token invalid." });
  }
};

// ==========================
// AUTH
// ==========================
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ message: "Email already exists." });

    const hashed = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (name,email,password) VALUES ($1,$2,$3)",
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
    const result = await pool.query("SELECT * FROM users WHERE email=$1", [email]);
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
      "SELECT * FROM owner WHERE mkey=$1",
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

// ==========================
// MENU
// ==========================
app.get("/menu", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM menu ORDER BY name ASC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: "Menu fetch failed." });
  }
});

app.post("/menu", adminOnly, async (req, res) => {
  const { name, price, category, stock, prep_time } = req.body;

  try {
    await pool.query(
      "INSERT INTO menu (name,price,category,stock,prep_time) VALUES ($1,$2,$3,$4,$5)",
      [name, price, category || "General", stock || 20, prep_time || 15]
    );

    res.status(201).json({ message: "Menu item added." });
  } catch (err) {
    res.status(500).json({ message: "Insert failed." });
  }
});

// ==========================
// CASHFREE ORDER CREATE
// ==========================
app.post("/create-cashfree-order", authMiddleware, async (req, res) => {
  const { items, returnUrl } = req.body;

  try {
    const totalAmount = items.reduce(
      (sum, item) => sum + (Number(item.price) * (item.quantity || 1)),
      0
    );

    const orderId = "ORDER_" + Date.now();

    const response = await axios.post(
      "https://api.cashfree.com/pg/orders",
      {
        order_id: orderId,
        order_amount: totalAmount,
        order_currency: "INR",
        customer_details: {
  customer_id: req.user.id.toString(),
  customer_email: req.user.email,
  customer_name: req.user.name,
  customer_phone: "8072528506"
},
        order_meta: {
   return_url: "https://tap-2-eat-qgle.vercel.app?order_id={order_id}"
}
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
          "x-api-version": "2022-09-01"
        }
      }
    );

    res.json({
      payment_session_id: response.data.payment_session_id,
      environment: "production"
    });

  } catch (err) {
    console.error("Cashfree Error:", err.response?.data || err.message);
    res.status(500).json({ message: "Cashfree order creation failed." });
  }
});

// ==========================
// VERIFY PAYMENT
// ==========================
app.post("/verify-cashfree-payment", authenticateToken, async (req, res) => {
  try {
    const { order_id, items, pickupTime, prepTimeTotal } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: "Missing order_id" });
    }

    // 🔹 1. Verify with Cashfree
    const verifyResponse = await fetch(
      `https://api.cashfree.com/pg/orders/${order_id}`,
      {
        method: "GET",
        headers: {
          "x-client-id": process.env.CASHFREE_APP_ID,
          "x-client-secret": process.env.CASHFREE_SECRET_KEY,
          "x-api-version": "2022-09-01"
        }
      }
    );

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok || verifyData.order_status !== "PAID") {
      return res.status(400).json({ message: "Payment not verified" });
    }

    // 🔹 2. Insert into YOUR actual table structure
    const insertQuery = `
      INSERT INTO orders
      (user_name, user_email, items, total_amount, payment_id, status, pickup_time, prep_time_total)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `;

    await pool.query(insertQuery, [
      req.user.name,                  // from JWT
      req.user.email,                 // from JWT
      JSON.stringify(items),          // jsonb
      verifyData.order_amount,
      verifyData.cf_order_id,
      "Preparing",
      pickupTime || "ASAP",
      prepTimeTotal || 15
    ]);

    return res.status(200).json({ message: "Order stored successfully" });

  } catch (error) {
    console.error("VERIFY ERROR:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ==========================
// ORDERS
// ==========================
app.get("/my-orders", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders WHERE user_email = $1 ORDER BY created_at DESC",
      [req.user.email]
    );

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("MY-ORDERS ERROR:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

app.get("/admin/orders", adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM orders ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Admin fetch failed." });
  }
});

app.put("/admin/orders/:id/status", adminOnly, async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  try {
    await pool.query(
      "UPDATE orders SET status=$1 WHERE id=$2",
      [status, id]
    );
    res.json({ message: "Status updated." });
  } catch {
    res.status(500).json({ message: "Update failed." });
  }
});

// ==========================
// NOW SERVING
// ==========================
app.get("/public/now-serving", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT MAX(token_number) AS now_serving FROM orders WHERE status='Ready'"
    );

    res.json({ nowServing: result.rows[0].now_serving || "--" });
  } catch {
    res.status(500).json({ message: "Now serving error." });
  }
});

// ==========================
// SERVER
// ==========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});