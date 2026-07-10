const WHEEL_ORIGIN = "https://wheelofnames.com";
const BATCH_SIZE = 10; // jumlah putaran otomatis sekali klik

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

let participants = []; // [{id, name}] - SEMUA peserta (1512+)
let prizes = []; // [{id, name, stock}]
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
function setWheelEntries(names) {
  if (!names || names.length === 0) return;
  postToWheel({
    name: "setEntries",
    entries: names,
  });
}

function postToWheel(message) {
  els.frame.contentWindow.postMessage(message, WHEEL_ORIGIN);
}

function setStatus(msg, isError = false) {
  els.status.textContent = msg;
  els.status.classList.toggle("error", isError);
}

function refreshStats() {
  // Display total participants and winners count
  els.statParticipants.textContent = participants.length || 0;
  els.statWinners.textContent = document.querySelectorAll(
    ".winners-list li:not(.winners-empty)",
  ).length;
}

function refreshPrizeSelectStock(prizeId, newStock) {
  const opt = els.prizeSelect.querySelector(`option[value="${prizeId}"]`);
  if (opt) {
    if (newStock <= 0) {
      opt.remove();
    } else {
      opt.textContent = `${opt.dataset.name} (sisa ${newStock})`;
    }
  }
}

function addWinnerToList(name, prizeName) {
  const emptyMsg = els.winnersList.querySelector(".winners-empty");
  if (emptyMsg) emptyMsg.remove();

  const li = document.createElement("li");
  li.innerHTML = `<span class="w-name">${name}</span><span class="w-prize">${prizeName}</span>`;
  els.winnersList.prepend(li);
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

    // Setup winners list
    els.winnersList.innerHTML = "";
    if (winnersData.length === 0) {
      els.winnersList.innerHTML =
        '<li class="winners-empty">Belum ada pemenang.</li>';
      setLastWinnerBadge("-"); // belum ada pemenang sama sekali
    } else {
      winnersData.forEach((w) =>
        addWinnerToList(w.participant_name, w.prize_name),
      );
      // winnersData diasumsikan terurut dari yang terbaru -> tampilkan pemenang paling baru
      setLastWinnerBadge(winnersData[0].participant_name);
    }

    // Load wheel dengan URL minimal (entries akan di-set via postMessage)
    els.frame.src = buildWheelUrl();

    // Tunggu frame siap, kemudian set semua entries sekali saja
    setTimeout(() => {
      setWheelEntries(participants.map((p) => p.name));
      setStatus(
        `✅ Ready! ${participants.length} participants loaded ke wheel`,
      );
    }, 800);

    refreshStats();
  } catch (err) {
    console.error("Error loading data:", err);
    setStatus("Gagal memuat data: " + err.message, true);
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
let overlayIndex = 0;

// Ambil 5 huruf pertama dari kolom name, huruf besar semua, rapikan spasi
function first5(name) {
  if (!name) return "--";
  return name.trim().slice(0, 5).toUpperCase();
}

function startOverlaySpin() {
  if (!els.overlayId || participants.length === 0) return;
  // rapidly cycle through participant names (5 huruf pertama) to simulate spinning
  overlayIndex = Math.floor(Math.random() * participants.length);
  els.overlayId.textContent = participants[overlayIndex]
    ? first5(participants[overlayIndex].name)
    : "--";

  // do NOT rotate or move the overlay while spinning; keep it fixed
  els.overlayId.classList.remove("spin-anim");
  const ox = OVERLAY_DEFAULT_X;
  const oy = OVERLAY_DEFAULT_Y;
  els.overlayId.style.transform = `translate(${ox}px, ${oy}px)`;

  overlayInterval = setInterval(() => {
    overlayIndex = (overlayIndex + 1) % participants.length;
    const p = participants[overlayIndex];
    els.overlayId.textContent = p ? first5(p.name) : "--";
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
  if (participants.length === 0)
    throw new Error("Semua peserta sudah pernah menang.");

  const resultPromise = waitForSpinResult();
  // start overlay animation while wheel spins
  try {
    startOverlaySpin();
  } catch (e) {
    console.warn("overlay start failed", e);
  }
  postToWheel({ name: "spin" });
  const winnerName = await resultPromise; // <-- ini nama pemenang yang diambil dari event spinResult wheel

  const res = await fetch("/api/spin-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participant_name: winnerName,
      prize_id: Number(prizeId),
      round_number: roundNumber,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gagal menyimpan pemenang");

  // Update state lokal: hapus pemenang dari daftar peserta di wheel
  participants = participants.filter((p) => p.name !== winnerName);
  postToWheel({ name: "removeWinner" });
  // stop overlay dan tampilkan 5 huruf pertama nama pemenang
  try {
    stopOverlaySpin(winnerName);
  } catch (e) {
    console.warn("overlay stop failed", e);
  }

  // Update stok hadiah lokal
  const prize = prizes.find((p) => p.id === Number(prizeId));
  const prizeName = prize ? prize.name : "Hadiah";
  if (prize) {
    prize.stock -= 1;
    refreshPrizeSelectStock(prizeId, prize.stock);
  }

  addWinnerToList(winnerName, prizeName);
  setLastWinnerBadge(winnerName); // <-- tampilkan nama pemenang terbaru di pojok kanan bawah wheel
  refreshStats();

  return { winnerName, prizeName };
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
    const { winnerName, prizeName } = await spinOnceAndRecord(prizeId, 1);
    setStatus(`${winnerName} menang: ${prizeName}`);
  } catch (err) {
    setStatus(err.message, true);
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
  const prizeId = els.prizeSelect.value;
  if (!prizeId) return setStatus("Pilih hadiah terlebih dahulu.", true);

  isSpinning = true;
  toggleButtons(false);
  els.batchProgress.hidden = false;

  const spinCount = parseInt(els.spinCount.value) || 10;

  for (let round = 1; round <= spinCount; round++) {
    els.progressLabel.textContent = `Ronde ${round} / ${spinCount}`;
    els.progressFill.style.width = `${((round - 1) / spinCount) * 100}%`;

    const prize = prizes.find((p) => p.id === Number(prizeId));
    if (!prize || prize.stock <= 0) {
      setStatus(
        "Stok hadiah ini sudah habis, undian otomatis dihentikan.",
        true,
      );
      break;
    }
    if (participants.length === 0) {
      setStatus("Semua peserta sudah mendapat hadiah.", true);
      break;
    }

    try {
      setStatus(`Memutar wheel... (ronde ${round})`);
      const { winnerName, prizeName } = await spinOnceAndRecord(prizeId, round);
      setStatus(`Ronde ${round}: ${winnerName} menang ${prizeName}`);
    } catch (err) {
      setStatus(`Ronde ${round} gagal: ${err.message}`, true);
      break;
    }

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
