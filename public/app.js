const WHEEL_ORIGIN = "https://wheelofnames.com";
const BATCH_SIZE = 10; // jumlah putaran otomatis sekali klik

// Maksimal pemenang yang DITAMPILKAN di panel kanan (yang terbaru dulu),
// supaya tidak perlu scroll jauh. Data lama tetap tersimpan di database.
const MAX_WINNERS_DISPLAYED = 53;

const els = {
  frame: document.getElementById("wheelFrame"),
  prizeSelect: document.getElementById("prizeSelect"),
  btnSpinOnce: document.getElementById("btnSpinOnce"),
  btnSpinBatch: document.getElementById("btnSpinBatch"),
  spinCount: document.getElementById("spinCount"),
  btnReset: document.getElementById("btnReset"),
  status: document.getElementById("statusMsg"),
  winnersList: document.getElementById("winnersList"),
  statParticipants: document.getElementById("statParticipants"),
  statWinners: document.getElementById("statWinners"),
  batchProgress: document.getElementById("batchProgress"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  overlayId: document.getElementById("overlayId"),
  lastWinnerName: document.getElementById("lastWinnerName"), // badge pojok kanan bawah wheel
};

// Permanent overlay defaults (no UI controls)
const OVERLAY_DEFAULT_X = 0;
const OVERLAY_DEFAULT_Y = 0;

let participants = []; // [{id, name, status}] - peserta yang belum menang
let prizes = []; // [{id, name, stock, status}]
let winnersLog = []; // [{id, participant_name, prize_name}] - urut TERBARU dulu
let isSpinning = false;

// ---------------------------------------------------------------------------
// Util: bangun URL wheel dengan parameter minimal (entries via postMessage)
// ---------------------------------------------------------------------------
function buildWheelUrl(names) {
  // Load wheel TANPA entries di URL untuk avoid URL length limit
  // Entries akan di-set via postMessage (support 1500+ participants)
  const params = new URLSearchParams({
    displayWinnerDialog: "false",
    hideOverlayText: "true",
    confetti: "true",
    spinTime: "5",
  });
  return `${WHEEL_ORIGIN}/view?${params.toString()}`;
}

// Set entries ke wheel via postMessage (no URL limit, support 1500+ participants)
//
// PENTING: JANGAN pernah "return" diam-diam saat daftar kosong. Kalau kita tidak
// mengirim setEntries, roda akan tetap memakai entries LAMA (yang bisa berisi
// peserta LS) -> peserta LS bisa keluar sebagai pemenang Grand Prize.
function setWheelEntries(names) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  postToWheel({
    name: "setEntries",
    // kalau benar-benar kosong, kirim placeholder supaya roda kosong secara
    // eksplisit, bukan menyisakan daftar lama
    entries: list.length > 0 ? list : ["(tidak ada peserta)"],
  });
}

// ---------------------------------------------------------------------------
// Aturan eligibility: GRANDPRIZE hanya untuk peserta status PROPER,
// COMMON boleh semua peserta yang belum menang.
//
// PENTING: status dinormalisasi (trim + UPPERCASE) supaya nilai di database
// seperti "Grandprize", "grandprize", "Proper", " PROPER " tetap dikenali.
// Tanpa ini, "Grandprize" !== "GRANDPRIZE" -> hadiah dianggap COMMON -> LS
// ikut masuk roda dan bisa menang Grand Prize.
// ---------------------------------------------------------------------------
function normStatus(s) {
  return String(s || "")
    .trim()
    .toUpperCase();
}

function isGrandPrize(prize) {
  return prize && normStatus(prize.status) === "GRANDPRIZE";
}

function isProper(participant) {
  return normStatus(participant.status) === "PROPER";
}

function getEligiblePool(prizeId) {
  const prize = prizes.find((p) => p.id === Number(prizeId));
  if (!prize) return [];

  if (isGrandPrize(prize)) {
    return participants.filter(isProper);
  }
  return participants; // COMMON -> semua peserta (has_won=0) boleh ikut
}

// Rebuild isi wheel sesuai hadiah yang sedang dipilih saat ini
function refreshWheelForSelectedPrize() {
  const prizeId = els.prizeSelect.value;
  if (!prizeId) return;
  const eligible = getEligiblePool(prizeId);
  setWheelEntries(eligible.map((p) => p.name));
  setStatus(``);
}

// Setiap kali user ganti pilihan hadiah, roda di-rebuild sesuai eligibility
els.prizeSelect.addEventListener("change", () => {
  if (isSpinning) return;
  refreshWheelForSelectedPrize();
});

function postToWheel(message) {
  els.frame.contentWindow.postMessage(message, WHEEL_ORIGIN);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

function refreshStats() {
  // Hitung dari data, bukan dari jumlah <li>, karena daftar pemenang kini
  // berisi header grup per hadiah yang tidak boleh ikut terhitung.
  els.statParticipants.textContent = participants.length || 0;
  els.statWinners.textContent = winnersLog.length;
}

function refreshPrizeSelectStock(prizeId, newStock) {
  const opt = els.prizeSelect.querySelector(`option[value="${prizeId}"]`);
  if (!opt) return;

  if (newStock <= 0) {
    // JANGAN dihapus: kalau opsi dihapus, browser melompat ke opsi lain secara
    // tak terduga dan perpindahan hadiah jadi kacau. Cukup dinonaktifkan.
    opt.textContent = `${opt.dataset.name} (habis)`;
    opt.disabled = true;
  } else {
    opt.textContent = `${opt.dataset.name} (sisa ${newStock})`;
    opt.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Render ulang daftar pemenang, DIKELOMPOKKAN per hadiah.
// Setiap kali hadiah berganti (mis. Doorprize 8 -> Doorprize 7) disisipkan
// header pemisah, sehingga ada "gap" visual yang jelas antar doorprize.
// ---------------------------------------------------------------------------
function renderWinnersList() {
  els.winnersList.innerHTML = "";

  if (winnersLog.length === 0) {
    els.winnersList.innerHTML =
      '<li class="winners-empty">Belum ada pemenang.</li>';
    return;
  }

  // Hanya tampilkan N pemenang TERBARU supaya tidak perlu scroll jauh
  const shown = winnersLog.slice(0, MAX_WINNERS_DISPLAYED);
  const hiddenCount = winnersLog.length - shown.length;

  let currentPrize = null;

  shown.forEach((w) => {
    // Hadiah berganti -> sisipkan header pemisah
    if (w.prize_name !== currentPrize) {
      currentPrize = w.prize_name;

      const header = document.createElement("li");
      header.className = "winners-group";
      const title = document.createElement("span");
      title.className = "winners-group__title";
      title.textContent = currentPrize;
      const count = document.createElement("span");
      count.className = "winners-group__count";
      // hitung dari SELURUH data, bukan hanya yang ditampilkan
      count.textContent =
        winnersLog.filter((x) => x.prize_name === currentPrize).length +
        " pemenang";
      header.appendChild(title);
      header.appendChild(count);
      els.winnersList.appendChild(header);
    }

    els.winnersList.appendChild(buildWinnerRow(w));
  });

  // Catatan kalau ada pemenang lama yang tidak ditampilkan
  if (hiddenCount > 0) {
    const note = document.createElement("li");
    note.className = "winners-note";
    note.textContent = `+${hiddenCount} pemenang sebelumnya tidak ditampilkan (menampilkan ${MAX_WINNERS_DISPLAYED} terbaru).`;
    els.winnersList.appendChild(note);
  }
}

// Bangun satu baris pemenang (nama + tombol hapus)
function buildWinnerRow(w) {
  const li = document.createElement("li");
  li.className = "winner-row";
  li.dataset.winnerId = w.id;

  const info = document.createElement("div");
  info.className = "w-info";
  const nameEl = document.createElement("span");
  nameEl.className = "w-name";
  nameEl.textContent = w.participant_name;
  info.appendChild(nameEl);

  const btn = document.createElement("button");
  btn.className = "w-delete";
  btn.type = "button";
  btn.title = "Batalkan pemenang ini";
  btn.textContent = "\u2715";
  btn.addEventListener("click", () =>
    deleteWinner(w.id, w.participant_name, w.prize_name),
  );

  li.appendChild(info);
  li.appendChild(btn);
  return li;
}

// Tambah pemenang baru ke paling atas, lalu render ulang (agar grouping benar)
function addWinnerToList(name, prizeName, winnerId) {
  winnersLog.unshift({
    id: winnerId,
    participant_name: name,
    prize_name: prizeName,
  });
  renderWinnersList();
}

// ---------------------------------------------------------------------------
// Hapus SATU pemenang: stok hadiah dikembalikan, peserta bisa ikut undian lagi
// ---------------------------------------------------------------------------
async function deleteWinner(winnerId, name, prizeName) {
  if (isSpinning) {
    setStatus("Tunggu sampai putaran selesai sebelum menghapus pemenang.");
    return;
  }
  if (!winnerId) {
    // Ini terjadi kalau pemenang dicatat saat server BELUM mengirim winner_id.
    // Muat ulang dari server supaya barisnya dapat ID, lalu minta user klik lagi.
    console.warn("Baris pemenang tanpa ID, memuat ulang data dari server...");
    setStatus("Menyegarkan data pemenang... silakan klik hapus sekali lagi.");
    await loadData();
    return;
  }

  const ok = confirm(
    `Batalkan kemenangan "${name}" (${prizeName})?\n\n` +
      `Stok hadiah akan dikembalikan +1 dan peserta ini bisa ikut undian lagi.`,
  );
  if (!ok) return;

  toggleButtons(false);
  setStatus(`Menghapus pemenang "${name}"...`);

  try {
    const res = await fetch(`/api/winners/${winnerId}`, { method: "DELETE" });

    if (!res.ok) {
      // 404 di sini biasanya berarti ROUTE-nya belum ada di server
      // (server belum di-restart / index.js belum diganti), bukan datanya hilang.
      const data = await res.json().catch(() => null);
      console.error("DELETE gagal:", res.status, res.statusText, data);

      if (res.status === 404 && !data) {
        throw new Error(
          "Endpoint DELETE /api/winners/:id tidak ditemukan. " +
            "Pastikan server/index.js sudah diperbarui dan server sudah di-restart.",
        );
      }
      throw new Error(
        (data && data.error) || `Gagal menghapus pemenang (HTTP ${res.status})`,
      );
    }

    // Muat ulang semua data: peserta, stok hadiah, riwayat, dan isi roda
    await loadData();
    setStatus(
      `Kemenangan "${name}" dibatalkan. Stok ${prizeName} dikembalikan.`,
    );
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  } finally {
    toggleButtons(true);
  }
}

// Update badge "Pemenang terakhir" di pojok kanan bawah wheel-frame
function setLastWinnerBadge(name) {
  if (!els.lastWinnerName) return;
  els.lastWinnerName.textContent = name && name.trim() ? name : "-";
}

// ---------------------------------------------------------------------------
// Fetch SEMUA participants dari backend (paginated) - support 1500+
// ---------------------------------------------------------------------------
async function fetchAllParticipants() {
  let allParticipants = [];
  let page = 1;
  let totalPages = 1;

  setStatus("Memuat 1512+ participants...");

  while (page <= totalPages) {
    try {
      const res = await fetch(`/api/participants?page=${page}&limit=500`).then(
        (r) => r.json(),
      );
      const data = res.data || res;
      allParticipants = allParticipants.concat(data);

      if (res.pagination) {
        totalPages = res.pagination.pages;
      } else {
        break;
      }
      page++;
    } catch (err) {
      console.error("Error fetching participants page " + page, err);
      break;
    }
  }

  return allParticipants;
}

// ---------------------------------------------------------------------------
// Load data awal dari backend
// ---------------------------------------------------------------------------
async function loadData() {
  try {
    // Fetch SEMUA participants via pagination (bisa 1512+)
    participants = await fetchAllParticipants();

    // Fetch prizes
    const prizeRes = await fetch("/api/prizes").then((r) => r.json());
    prizes = prizeRes;

    // Fetch winners - ambil batch pertama
    const winnersRes = await fetch("/api/winners?page=1&limit=50").then((r) =>
      r.json(),
    );
    const winnersData = winnersRes.data || winnersRes;

    // Setup prize select
    els.prizeSelect.innerHTML = prizes
      .map(
        (p) =>
          `<option value="${p.id}" data-name="${p.name}">${p.name} (sisa ${p.stock})</option>`,
      )
      .join("");

    // Setup winners list (dikelompokkan per hadiah)
    // winnersData dari backend sudah urut TERBARU dulu (ORDER BY w.id DESC)
    winnersLog = winnersData.map((w) => ({
      id: w.id,
      participant_name: w.participant_name,
      prize_name: w.prize_name,
    }));
    renderWinnersList();

    setLastWinnerBadge(
      winnersLog.length > 0 ? winnersLog[0].participant_name : "-",
    );

    // Load wheel dengan URL minimal (entries akan di-set via postMessage)
    els.frame.src = buildWheelUrl();

    // Tunggu frame siap, kemudian set entries sesuai hadiah yang terpilih (default)
    setTimeout(() => {
      refreshWheelForSelectedPrize();
      setStatus(`✅ Ready! participants loaded ke wheel`);
    }, 800);

    refreshStats();
    debugStatuses(); // cetak diagnosa status ke console browser
  } catch (err) {
    console.error("Error loading data:", err);
    setStatus("Gagal memuat data: " + err.message, true);
  }
}

// ---------------------------------------------------------------------------
// DIAGNOSA: buka Console browser (F12) untuk memastikan kolom `status` benar-
// benar terkirim dari backend dan nilainya seperti apa. Kalau `status` muncul
// `undefined`, berarti query SELECT di backend belum menyertakan kolom status.
// ---------------------------------------------------------------------------
function debugStatuses() {
  const prizeInfo = prizes.map((p) => ({
    id: p.id,
    name: p.name,
    status_asli: p.status,
    terdeteksi_grandprize: isGrandPrize(p),
  }));
  console.table(prizeInfo);

  const counts = {};
  participants.forEach((p) => {
    const k = String(p.status);
    counts[k] = (counts[k] || 0) + 1;
  });
  console.log("Jumlah peserta per nilai status:", counts);
  console.log(
    "Total peserta PROPER terdeteksi:",
    participants.filter(isProper).length,
  );

  if (participants.length && participants[0].status === undefined) {
    console.error(
      "MASALAH: kolom `status` TIDAK ada di response /api/participants. " +
        "Tambahkan `status` ke SELECT di backend.",
    );
  }
  if (prizes.length && prizes[0].status === undefined) {
    console.error(
      "MASALAH: kolom `status` TIDAK ada di response /api/prizes. " +
        "Tambahkan `status` ke SELECT di backend. Akibatnya semua hadiah dianggap COMMON " +
        "dan peserta LS bisa memenangkan Grand Prize.",
    );
  }
}

// ---------------------------------------------------------------------------
// Tunggu hasil spin dari iframe (event 'message' -> spinResult)
// ---------------------------------------------------------------------------
function waitForSpinResult() {
  return new Promise((resolve, reject) => {
    function handler(event) {
      if (event.origin !== WHEEL_ORIGIN) return; // penting: validasi origin
      if (event.data && event.data.spinResult) {
        window.removeEventListener("message", handler);
        resolve(event.data.spinResult.text);
      }
    }
    window.addEventListener("message", handler);
    // safety timeout kalau wheel gagal merespon (mis. koneksi lambat)
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Wheel tidak merespon (timeout)."));
    }, 20000);
  });
}

// ---------------------------------------------------------------------------
// Overlay spin: show cycling first-5-letters-of-name while wheel animates
// ---------------------------------------------------------------------------
const SPIN_TIME_MS = 5000; // must match spinTime param in buildWheelUrl
let overlayInterval = null;

// Ambil 5 huruf pertama dari kolom name, huruf besar semua, rapikan spasi
function first5(name) {
  if (!name) return "--";
  return name.trim().slice(0, 5).toUpperCase();
}

function startOverlaySpin() {
  if (!els.overlayId) return;

  // Ambil pool yang sedang eligible untuk hadiah terpilih (PROPER saja saat
  // GRANDPRIZE), supaya nama yang muter-muter konsisten dengan calon pemenang.
  const pool = getEligiblePool(els.prizeSelect.value);
  if (!pool || pool.length === 0) return;

  let lastShown = null;

  // Ambil satu nama ACAK dari pool. Hindari menampilkan teks yang sama dua kali
  // beruntun supaya perubahannya kelihatan jelas (banyak nama berbagi 5 huruf
  // awal yang sama, tanpa ini overlay bisa terlihat "diam"/seolah berpola).
  const pickRandom = () => {
    let text;
    let tries = 0;
    do {
      const p = pool[Math.floor(Math.random() * pool.length)];
      text = first5(p.name);
      tries++;
    } while (text === lastShown && tries < 5 && pool.length > 1);
    lastShown = text;
    return text;
  };

  els.overlayId.textContent = pickRandom();

  // jangan geser/putar overlay selama spin; biarkan tetap di posisinya
  els.overlayId.classList.remove("spin-anim");
  const ox = OVERLAY_DEFAULT_X;
  const oy = OVERLAY_DEFAULT_Y;
  els.overlayId.style.transform = `translate(${ox}px, ${oy}px)`;

  // setiap tick pilih nama ACAK dari pool (bukan berurutan)
  overlayInterval = setInterval(() => {
    els.overlayId.textContent = pickRandom();
  }, 80);
}

function stopOverlaySpin(finalName) {
  if (!els.overlayId) return;
  if (overlayInterval) {
    clearInterval(overlayInterval);
    overlayInterval = null;
  }

  // land on 5 huruf pertama nama pemenang (kalau diketahui)
  if (finalName !== undefined && finalName !== null) {
    els.overlayId.textContent = first5(finalName);
  }
  // reset rotation smoothly
  const ox = OVERLAY_DEFAULT_X;
  const oy = OVERLAY_DEFAULT_Y;
  // keep overlay fixed at the translate offset
  els.overlayId.style.transition = "transform 200ms ease-out";
  els.overlayId.style.transform = `translate(${ox}px, ${oy}px)`;
  setTimeout(() => {
    els.overlayId.style.transition = "";
    els.overlayId.classList.remove("spin-anim");
  }, 700);
}

// ---------------------------------------------------------------------------
// Satu kali putaran penuh: spin -> tangkap pemenang -> simpan ke DB -> update UI
// ---------------------------------------------------------------------------
async function spinOnceAndRecord(prizeId, roundNumber) {
  const prize = prizes.find((p) => p.id === Number(prizeId));
  const grand = isGrandPrize(prize);

  // 1) Bangun pool: kalau GRANDPRIZE -> HANYA peserta PROPER.
  const eligiblePool = getEligiblePool(prizeId);

  if (eligiblePool.length === 0) {
    // Bukan error — cukup info, dan tandai agar batch berhenti dengan tenang.
    return {
      ok: false,
      reason: grand
        ? "Semua peserta PROPER sudah mendapat hadiah."
        : "Semua peserta sudah mendapat hadiah.",
    };
  }

  // 2) Kirim HANYA nama yang eligible ke wheelofnames, lalu tunggu roda
  //    selesai render ulang sebelum diputar. Ini yang menjamin roda hanya
  //    berisi peserta PROPER saat hadiah GRANDPRIZE.
  const eligibleNames = eligiblePool.map((p) => p.name);
  setWheelEntries(eligibleNames);
  await new Promise((r) =>
    setTimeout(r, eligibleNames.length > 200 ? 800 : 350),
  );

  const eligibleSet = new Set(eligibleNames);

  // 3) Putar roda. Kalau (karena timing iframe) hasilnya ternyata di luar pool,
  //    ulangi diam-diam — tanpa menampilkan error apa pun ke operator.
  let winnerName = null;
  for (let attempt = 0; attempt < 5 && winnerName === null; attempt++) {
    if (attempt > 0) {
      // kirim ulang entries eligible sebelum coba lagi
      setWheelEntries(eligibleNames);
      await new Promise((r) => setTimeout(r, 500));
    }

    try {
      startOverlaySpin();
    } catch (e) {
      console.warn("overlay start failed", e);
    }

    let result = null;
    try {
      const resultPromise = waitForSpinResult();
      postToWheel({ name: "spin" });
      result = await resultPromise;
    } catch (e) {
      console.warn("spin attempt gagal/timeout, coba lagi:", e.message);
      continue; // timeout -> coba lagi, jangan tampilkan error
    }

    if (eligibleSet.has(result)) {
      winnerName = result;
    } else {
      console.warn(
        `Hasil roda "${result}" di luar pool eligible, mengulang spin...`,
      );
    }
  }

  // 4) Fallback terakhir (sangat jarang): pilih acak dari pool eligible sendiri,
  //    supaya undian tetap jalan dan tidak pernah menampilkan error.
  if (winnerName === null) {
    winnerName =
      eligibleNames[Math.floor(Math.random() * eligibleNames.length)];
    console.warn("Fallback: pemenang dipilih acak dari pool eligible.");
  }

  // 5) Simpan ke database
  const res = await fetch("/api/spin-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participant_name: winnerName,
      prize_id: Number(prizeId),
      round_number: roundNumber,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error("Gagal menyimpan pemenang:", data.error);
    return { ok: false, reason: data.error || "Gagal menyimpan pemenang." };
  }

  // winner_id dipakai supaya baris pemenang ini langsung punya tombol hapus
  const saved = await res.json().catch(() => ({}));

  // 6) Update state lokal
  participants = participants.filter((p) => p.name !== winnerName);
  refreshWheelForSelectedPrize();

  try {
    stopOverlaySpin(winnerName);
  } catch (e) {
    console.warn("overlay stop failed", e);
  }

  const prizeName = prize ? prize.name : "Hadiah";
  if (prize) {
    prize.stock -= 1;
    refreshPrizeSelectStock(prizeId, prize.stock);
  }

  addWinnerToList(winnerName, prizeName, saved.winner_id);
  setLastWinnerBadge(winnerName);
  refreshStats();

  return { ok: true, winnerName, prizeName };
}

// ---------------------------------------------------------------------------
// Tombol: Putar 1x
// ---------------------------------------------------------------------------
els.btnSpinOnce.addEventListener("click", async () => {
  if (isSpinning) return;
  const prizeId = els.prizeSelect.value;
  if (!prizeId) return setStatus("Pilih hadiah terlebih dahulu.", true);

  isSpinning = true;
  toggleButtons(false);
  setStatus("Memutar wheel...");
  try {
    const result = await spinOnceAndRecord(prizeId, 1);
    if (result.ok) {
      setStatus(`${result.winnerName} menang: ${result.prizeName}`);
    } else {
      // bukan error merah, cukup informasi biasa
      setStatus(result.reason);
    }
  } catch (err) {
    // tidak seharusnya terjadi; jangan tampilkan error mentah ke layar
    console.error(err);
    setStatus("Silakan coba putar lagi.");
  } finally {
    isSpinning = false;
    toggleButtons(true);
  }
});

// ---------------------------------------------------------------------------
// Tombol: Putar Otomatis (dinamis sesuai pilihan user 1-10x)
// ---------------------------------------------------------------------------
els.btnSpinBatch.addEventListener("click", async () => {
  if (isSpinning) return;
  if (!els.prizeSelect.value)
    return setStatus("Pilih hadiah terlebih dahulu.", true);

  isSpinning = true;
  toggleButtons(false);
  els.batchProgress.hidden = false;

  const spinCount = parseInt(els.spinCount.value) || 10;

  for (let round = 1; round <= spinCount; round++) {
    els.progressLabel.textContent = `Ronde ${round} / ${spinCount}`;
    els.progressFill.style.width = `${((round - 1) / spinCount) * 100}%`;

    const prizeId = els.prizeSelect.value;
    const prize = prizes.find((p) => p.id === Number(prizeId));

    // --- STOK HABIS -> BERHENTI (tidak lanjut ke hadiah berikutnya) ---
    if (!prize || prize.stock <= 0) {
      setStatus(
        `Stok ${prize ? prize.name : "hadiah ini"} sudah habis. Undian dihentikan.`,
      );
      break;
    }

    // Tidak ada lagi peserta yang memenuhi syarat -> berhenti juga
    if (getEligiblePool(prizeId).length === 0) {
      const label = isGrandPrize(prize) ? "peserta PROPER" : "peserta";
      setStatus(`Semua ${label} sudah mendapat hadiah. Undian dihentikan.`);
      break;
    }

    setStatus(`Memutar wheel... (ronde ${round} - ${prize.name})`);

    let result;
    try {
      result = await spinOnceAndRecord(prizeId, round);
    } catch (err) {
      console.error(err);
      result = { ok: false, reason: "Terjadi gangguan, undian dihentikan." };
    }

    if (!result.ok) {
      setStatus(result.reason); // info biasa, bukan error merah
      break;
    }
    setStatus(
      `Ronde ${round}: ${result.winnerName} menang ${result.prizeName}`,
    );

    // jeda singkat supaya event wheel settle sebelum spin berikutnya
    await new Promise((r) => setTimeout(r, 250));
  }

  els.progressFill.style.width = "100%";
  isSpinning = false;
  toggleButtons(true);
  setTimeout(() => {
    els.batchProgress.hidden = true;
  }, 1200);
});

// ---------------------------------------------------------------------------
// Tombol: Reset seluruh undian
// ---------------------------------------------------------------------------
els.btnReset.addEventListener("click", async () => {
  if (isSpinning) return;
  if (
    !confirm(
      "Reset semua data undian (peserta, stok hadiah, riwayat pemenang)?",
    )
  )
    return;

  toggleButtons(false);
  try {
    const res = await fetch("/api/reset", { method: "POST" });
    if (!res.ok) throw new Error("Gagal reset");
    await loadData(); // loadData() akan mengembalikan badge ke "-" karena riwayat pemenang sudah kosong
    setStatus("Undian sudah direset.");
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    toggleButtons(true);
  }
});

function toggleButtons(enabled) {
  els.btnSpinOnce.disabled = !enabled;
  els.btnSpinBatch.disabled = !enabled;
  els.spinCount.disabled = !enabled;
  els.btnReset.disabled = !enabled;
  els.prizeSelect.disabled = !enabled;
}

loadData().catch((err) => setStatus("Gagal memuat data: " + err.message, true));

// Apply permanent overlay transform (no UI inputs)
if (els.overlayId) {
  els.overlayId.style.transform = `translate(${OVERLAY_DEFAULT_X}px, ${OVERLAY_DEFAULT_Y}px)`;
}
