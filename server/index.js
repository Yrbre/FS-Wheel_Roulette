require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const pool = require("./db");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// ---------------------------------------------------------------------------
// GET /api/stats -> info jumlah peserta tersisa & pemenang
// ---------------------------------------------------------------------------
app.get("/api/stats", async (req, res) => {
  try {
    const [statsResult] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM participants WHERE has_won = 0) AS available_count,
        (SELECT COUNT(*) FROM winners) AS winners_count
    `);
    res.json(statsResult[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil statistik" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/participants  -> peserta yang BELUM pernah menang (dengan pagination)
// Query params: page=1 (default), limit=500 (default, max 500)
// ---------------------------------------------------------------------------
app.get("/api/participants", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 500)); // max 500 per page
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      "SELECT id, name FROM participants WHERE has_won = 0 ORDER BY name LIMIT ? OFFSET ?",
      [limit, offset],
    );

    // Get total count untuk info pagination
    const [countResult] = await pool.query(
      "SELECT COUNT(*) as total FROM participants WHERE has_won = 0",
    );

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil data peserta" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/prizes -> daftar hadiah yang stoknya masih ada
// ---------------------------------------------------------------------------
app.get("/api/prizes", async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, stock FROM prizes WHERE stock > 0 ORDER BY id",
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil data hadiah" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/winners -> riwayat pemenang dengan pagination
// Query params: page=1 (default), limit=50 (default, max 100)
// ---------------------------------------------------------------------------
app.get("/api/winners", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const [rows] = await pool.query(
      `
      SELECT w.id, w.round_number, p.name AS participant_name,
             pr.name AS prize_name, w.created_at
      FROM winners w
      JOIN participants p ON p.id = w.participant_id
      JOIN prizes pr ON pr.id = w.prize_id
      ORDER BY w.id DESC
      LIMIT ? OFFSET ?
    `,
      [limit, offset],
    );

    const [countResult] = await pool.query(
      "SELECT COUNT(*) as total FROM winners",
    );

    res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total: countResult[0].total,
        pages: Math.ceil(countResult[0].total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal mengambil riwayat pemenang" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/spin-result
// Body: { participant_name, prize_id, round_number }
// Mencatat hasil satu putaran wheel. Memakai transaction + row lock supaya
// aman kalau ada beberapa request nyaris bersamaan (mencegah 1 orang
// tercatat menang 2x, dan mencegah stok hadiah minus).
// ---------------------------------------------------------------------------
app.post("/api/spin-result", async (req, res) => {
  const { participant_name, prize_id, round_number } = req.body;

  if (!participant_name || !prize_id) {
    return res
      .status(400)
      .json({ error: "participant_name dan prize_id wajib diisi" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Cari peserta berdasarkan nama, kunci baris agar tidak dibaca proses lain
    const [participants] = await conn.query(
      "SELECT id, has_won FROM participants WHERE name = ? FOR UPDATE",
      [participant_name],
    );

    if (participants.length === 0) {
      await conn.rollback();
      return res.status(404).json({
        error: `Peserta "${participant_name}" tidak ditemukan di database`,
      });
    }

    const participant = participants[0];
    if (participant.has_won) {
      await conn.rollback();
      return res.status(409).json({
        error: `${participant_name} sudah pernah menang, tidak bisa menang lagi`,
      });
    }

    // Kunci baris hadiah, pastikan stok masih ada
    const [prizes] = await conn.query(
      "SELECT id, stock FROM prizes WHERE id = ? FOR UPDATE",
      [prize_id],
    );

    if (prizes.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: "Hadiah tidak ditemukan" });
    }
    if (prizes[0].stock <= 0) {
      await conn.rollback();
      return res.status(409).json({ error: "Stok hadiah ini sudah habis" });
    }

    // Catat pemenang
    await conn.query(
      "INSERT INTO winners (participant_id, prize_id, round_number) VALUES (?, ?, ?)",
      [participant.id, prize_id, round_number || 1],
    );

    // Tandai peserta sudah menang & kurangi stok hadiah
    await conn.query("UPDATE participants SET has_won = 1 WHERE id = ?", [
      participant.id,
    ]);
    await conn.query("UPDATE prizes SET stock = stock - 1 WHERE id = ?", [
      prize_id,
    ]);

    await conn.commit();
    res.json({ success: true, participant_id: participant.id });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Gagal menyimpan hasil undian" });
  } finally {
    conn.release();
  }
});

// ---------------------------------------------------------------------------
// POST /api/reset -> reset semua peserta & stok hadiah ke kondisi awal
// (berguna untuk uji coba / mulai sesi undian baru)
// ---------------------------------------------------------------------------
app.post("/api/reset", async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM winners");
    await conn.query("UPDATE participants SET has_won = 0");
    await conn.query("UPDATE prizes SET stock = original_stock");
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: "Gagal reset data" });
  } finally {
    conn.release();
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(
    `Server berjalan di http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`,
  );
  console.log(`Akses dari LAN: http://<IP-ANDA>:${PORT}`);
});
