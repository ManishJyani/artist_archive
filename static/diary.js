// ---------- Elements ----------
const gallery = document.getElementById("gallery");
const track = document.getElementById("track");
const thumb = document.getElementById("thumb");
const empty = document.getElementById("empty");
const filterBar = document.getElementById("filter");
const uploadDialog = document.getElementById("upload-dialog");
const uploadForm = document.getElementById("upload-form");
const uploadMsg = document.getElementById("upload-msg");
const preview = document.getElementById("preview");
const detail = document.getElementById("detail-dialog");
const dView = document.getElementById("d-view");
const dImg = document.getElementById("d-img");
const editForm = document.getElementById("edit-form");
const editMsg = document.getElementById("edit-msg");
const loader = document.getElementById("loader");

const MOODS = { happy: "😊", sad: "😢", calm: "😌", angry: "😠", excited: "🤩" };
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canHover = matchMedia("(hover: hover)").matches;
let currentTag = null;
let currentQuery = "";
let currentEntry = null;
let requestId = 0;
let pending = 0;

// ---------- Helpers ----------
async function api(url, options) {
  loader.hidden = ++pending === 0;
  try {
    const res = await fetch(url, options);
    if (res.status === 401) { location.href = "/"; throw new Error("Not logged in"); }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong");
    return data;
  } finally {
    loader.hidden = --pending === 0;
  }
}

async function busy(btn, fn) {
  btn.disabled = true;
  btn.classList.add("loading");
  try { return await fn(); }
  finally { btn.disabled = false; btn.classList.remove("loading"); }
}

let toastTimer;
function toast(text) {
  const t = document.getElementById("toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2500);
}

function skeletons(n) {
  return Array.from({ length: n }, () => {
    const d = document.createElement("div");
    d.className = "entry skeleton";
    return d;
  });
}

function parseTags(value) {
  return value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}

function cardFor(id) {
  return gallery.querySelector(`.entry[data-id="${id}"]`);
}

// ---------- Mood chips (upload + edit forms) ----------
function setupMoods(input, container) {
  const sync = () => {
    const set = new Set(parseTags(input.value));
    container.querySelectorAll("button").forEach(b => b.classList.toggle("selected", set.has(b.dataset.tag)));
  };
  for (const [name, emoji] of Object.entries(MOODS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip mood";
    b.dataset.tag = name;
    b.textContent = `${emoji} ${name}`;
    b.onclick = () => {
      const tags = parseTags(input.value);
      const i = tags.indexOf(name);
      if (i >= 0) tags.splice(i, 1); else tags.push(name);
      input.value = tags.join(", ");
      sync();
    };
    container.append(b);
  }
  input.addEventListener("input", sync);
  return sync;
}

const syncUploadMoods = setupMoods(uploadForm.elements.tags, document.getElementById("quick-tags"));
const syncEditMoods = setupMoods(editForm.elements.tags, document.getElementById("edit-moods"));

// ---------- Diagonal layout: one big picture, the rest small in the bottom corners ----------
const SIDE = 0.32;                 // size of side pictures vs the main one
let pos = 0;                       // index of the main picture (fractional while swiping)
let lockUntil = 0, dragging = false, moved = false;

const entryCards = () => [...gallery.querySelectorAll(".entry")];
const clamp = (v, n) => Math.max(0, Math.min(n - 1, v));
const stepX = () => {
  const el = gallery.querySelector(".entry");
  return el ? Math.min(gallery.clientWidth * 0.36, el.offsetWidth * 0.85) : 1;
};

function layout() {
  gallery.style.height = `${innerHeight - gallery.getBoundingClientRect().top}px`;
  const list = entryCards(), n = list.length;
  track.hidden = n < 2 || !!gallery.querySelector(".skeleton");
  if (!n) return;
  pos = clamp(pos, n);

  const H = list[0].offsetHeight, SW = gallery.clientWidth, W = list[0].offsetWidth;
  const st = { x: stepX(), x2: Math.min(SW * 0.11, W * 0.3), y: H * 0.5, y2: H * 0.07 };

  list.forEach((el, i) => {
    const d = i - pos, a = Math.abs(d), sign = Math.sign(d);
    const near = Math.min(a, 1), far = Math.max(0, a - 1);
    const scale = a < 1 ? 1 - a * (1 - SIDE) : SIDE * Math.pow(0.8, far);
    el.style.setProperty("--x", `${sign * (near * st.x + far * st.x2)}px`);
    el.style.setProperty("--y", `${near * st.y + far * st.y2}px`);
    el.style.setProperty("--r", `${sign * (near * 8 + far * 3)}deg`);
    el.style.setProperty("--s", scale.toFixed(3));
    el.style.setProperty("--b", (1 - near * 0.3 - far * 0.08).toFixed(3));
    el.style.setProperty("--sat", (1 - near * 0.35).toFixed(3));
    el.style.setProperty("--o", Math.max(0, 1 - far * 0.4).toFixed(3));
    el.style.setProperty("--z", 100 - Math.round(a * 10));
    el.classList.toggle("active", a < 0.5);
  });

  // Position bar
  const w = 100 / n;
  thumb.style.width = `${w}%`;
  thumb.style.left = `${(n > 1 ? pos / (n - 1) : 0) * (100 - w)}%`;
}

function go(i) {
  const next = clamp(Math.round(i), entryCards().length);
  if (next === pos) return;
  pos = next;
  lockUntil = performance.now() + 380;
  layout();
}

// Mouse wheel / trackpad: one picture per gesture
gallery.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  if (performance.now() < lockUntil) return;
  const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
  if (Math.abs(d) < 4) return;
  go(pos + (d > 0 ? 1 : -1));
}, { passive: false });

// Arrow keys
addEventListener("keydown", (ev) => {
  if (detail.open || uploadDialog.open || ev.target.matches("input, textarea")) return;
  if (ev.key === "ArrowRight") go(pos + 1);
  if (ev.key === "ArrowLeft") go(pos - 1);
});

// Swipe / drag: pictures follow your finger, then snap
let startX = 0, startPos = 0;
gallery.addEventListener("pointerdown", (ev) => {
  if (ev.button !== 0) return;
  dragging = true; moved = false; startX = ev.clientX; startPos = pos;
});
addEventListener("pointermove", (ev) => {
  if (!dragging) return;
  const dx = ev.clientX - startX;
  if (!moved && Math.abs(dx) < 5) return;
  moved = true;
  gallery.classList.add("dragging");
  pos = clamp(startPos - dx / (stepX() * 0.75), entryCards().length);
  layout();
});
function endDrag() {
  if (!dragging) return;
  dragging = false;
  gallery.classList.remove("dragging");
  if (moved) { pos = Math.round(pos); layout(); setTimeout(() => (moved = false), 0); }
}
addEventListener("pointerup", endDrag);
addEventListener("pointercancel", endDrag);

// Position bar: tap or drag to jump
function trackIndex(ev) {
  const r = track.getBoundingClientRect(), n = entryCards().length;
  return Math.round(clamp(((ev.clientX - r.left) / r.width) * (n - 1), n));
}
let trackDrag = false;
track.addEventListener("pointerdown", (ev) => {
  trackDrag = true;
  track.setPointerCapture(ev.pointerId);
  track.classList.add("dragging");
  go(trackIndex(ev));
});
track.addEventListener("pointermove", (ev) => { if (trackDrag) go(trackIndex(ev)); });
const endTrack = () => { trackDrag = false; track.classList.remove("dragging"); };
track.addEventListener("pointerup", endTrack);
track.addEventListener("pointercancel", endTrack);

addEventListener("resize", layout);

// ---------- Cards ----------
function chips(tags) {
  return tags.map(t => {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = MOODS[t] ? `${MOODS[t]} ${t}` : "#" + t;
    b.onclick = (ev) => { ev.stopPropagation(); detail.close(); loadEntries(t); };
    return b;
  });
}

// textContent (not innerHTML) so user-written text can't inject HTML/scripts
function card(e) {
  const el = document.createElement("article");
  el.className = "entry";
  el.dataset.id = e.id;

  const img = document.createElement("img");
  img.alt = e.title || "Artwork";
  img.draggable = false;
  img.onload = img.onerror = () => img.classList.add("loaded");
  img.src = e.image_url;

  const body = document.createElement("div");
  body.className = "entry-body";
  const title = document.createElement("h3");
  title.textContent = e.title || "Untitled";
  body.append(title);
  if (e.description) {
    const desc = document.createElement("p");
    desc.className = "entry-desc";
    desc.textContent = e.description;
    body.append(desc);
  }
  const tags = document.createElement("div");
  tags.className = "tags";
  tags.append(...chips(e.tags));
  body.append(tags);
  el.append(img, body);

  // Tap the main picture -> zoom. Tap a side picture -> it becomes the main one.
  el.onclick = () => {
    if (moved) return;
    const i = entryCards().indexOf(el);
    if (Math.round(pos) === i) openDetail(e, el); else go(i);
  };

  // Laptops: hovering a side picture brings it to the middle after 90 ms
  if (canHover) {
    let t;
    el.addEventListener("mouseenter", () => {
      clearTimeout(t);
      t = setTimeout(function tryGo() {
        if (dragging || el.classList.contains("active")) return;
        const wait = lockUntil - performance.now();
        if (wait > 0) { t = setTimeout(tryGo, wait); return; }
        go(entryCards().indexOf(el));
      }, 90);
    });
    el.addEventListener("mouseleave", () => clearTimeout(t));
  }
  return el;
}

async function loadEntries(tag = null, keepPosition = false) {
  currentTag = tag;
  filterBar.hidden = !tag;
  document.getElementById("filter-tag").textContent = tag ? "#" + tag : "";

  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (currentQuery) params.set("q", currentQuery);

  const myId = ++requestId;
  if (!gallery.children.length) { gallery.replaceChildren(...skeletons(5)); pos = 2; layout(); }
  gallery.classList.add("dim");

  let entries;
  try {
    entries = await api("/entries?" + params);
  } catch (err) {
    if (myId === requestId) toast(err.message);
    return;
  } finally {
    if (myId === requestId) gallery.classList.remove("dim");
  }
  if (myId !== requestId) return;

  gallery.replaceChildren(...entries.map(card));
  if (!keepPosition) pos = 0; // newest picture is the main one
  if (detail.open && currentEntry) {
    const c = cardFor(currentEntry.id);
    if (c) c.style.visibility = "hidden";
  }
  layout();

  empty.textContent = (tag || currentQuery) ? "No matching pictures." : "No pictures yet. Tap + to add your first one.";
  empty.hidden = entries.length > 0;
}

// ---------- Zoom: picture flies from its card to the center and back ----------
function fly(fromRect, toEl, reverse) {
  const b = toEl.getBoundingClientRect();
  if (!b.width || !fromRect.width) return null;
  const dx = fromRect.left + fromRect.width / 2 - (b.left + b.width / 2);
  const dy = fromRect.top + fromRect.height / 2 - (b.top + b.height / 2);
  const start = {
    transform: `translate(${dx}px, ${dy}px) scale(${fromRect.width / b.width}, ${fromRect.height / b.height})`,
    borderRadius: "24px",
  };
  const frames = reverse
    ? [{ transform: "none" }, start]
    : [start, { transform: "translate(0, 0) scale(1.04)", offset: 0.7 }, { transform: "none" }];
  return toEl.animate(frames, {
    duration: reverse ? 380 : 520,
    easing: "cubic-bezier(.2, .8, .2, 1)",
    fill: reverse ? "forwards" : "none",
  });
}

function showView(e) {
  currentEntry = e;
  if (dImg.src !== e.image_url) {
    dImg.classList.remove("loaded");
    dImg.onload = dImg.onerror = () => dImg.classList.add("loaded");
    dImg.src = e.image_url;
  }
  document.getElementById("d-title").textContent = e.title || "Untitled";
  document.getElementById("d-date").textContent = new Date(e.created_at).toLocaleDateString();
  document.getElementById("d-desc").textContent = e.description || "";
  document.getElementById("d-tags").replaceChildren(...chips(e.tags));
  dView.hidden = false;
  editForm.hidden = true;
}

async function openDetail(e, cardEl) {
  showView(e);
  const cardImg = cardEl?.querySelector("img");
  const from = cardImg?.getBoundingClientRect();
  detail.showModal();
  if (!cardImg || reduceMotion) return;
  cardEl.style.visibility = "hidden";
  dImg.style.opacity = "0";
  await dImg.decode().catch(() => {});
  dImg.classList.add("loaded");
  dImg.style.opacity = "";
  fly(from, dImg, false);
}

async function closeDetail() {
  if (!detail.open || detail.classList.contains("closing")) return;
  detail.classList.add("closing");
  const cardImg = currentEntry && cardFor(currentEntry.id)?.querySelector("img");
  const anim = !reduceMotion && cardImg ? fly(cardImg.getBoundingClientRect(), dImg, true) : null;
  await (anim ? anim.finished.catch(() => {}) : new Promise(r => setTimeout(r, 250)));
  detail.close();
  anim?.cancel();
}

detail.addEventListener("close", () => {
  detail.classList.remove("closing");
  gallery.querySelectorAll(".entry").forEach(c => (c.style.visibility = ""));
});
detail.addEventListener("cancel", (ev) => { ev.preventDefault(); closeDetail(); });
detail.onclick = (ev) => { if (ev.target === detail) closeDetail(); };
document.getElementById("close-detail").onclick = closeDetail;

// ---------- Edit / download / delete ----------
document.getElementById("edit-btn").onclick = () => {
  editForm.elements.title.value = currentEntry.title || "";
  editForm.elements.description.value = currentEntry.description || "";
  editForm.elements.tags.value = currentEntry.tags.join(", ");
  syncEditMoods();
  editMsg.textContent = "";
  dView.hidden = true;
  editForm.hidden = false;
};
document.getElementById("cancel-edit").onclick = () => showView(currentEntry);

editForm.onsubmit = (ev) => {
  ev.preventDefault();
  editMsg.textContent = "";
  busy(document.getElementById("edit-save"), async () => {
    try {
      const updated = await api(`/entries/${currentEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.elements.title.value,
          description: editForm.elements.description.value,
          tags: parseTags(editForm.elements.tags.value),
        }),
      });
      showView(updated);
      toast("Changes saved ✓");
      loadEntries(currentTag, true);
    } catch (err) {
      editMsg.textContent = err.message;
    }
  });
};

document.getElementById("download-btn").onclick = (ev) => {
  location.href = `/entries/${currentEntry.id}/download`;
  busy(ev.currentTarget, () => new Promise(r => setTimeout(r, 1200)));
};

document.getElementById("delete-btn").onclick = (ev) => {
  if (!confirm("Delete this picture permanently?")) return;
  busy(ev.currentTarget, async () => {
    try {
      await api(`/entries/${currentEntry.id}`, { method: "DELETE" });
      detail.close();
      toast("Picture deleted");
      loadEntries(currentTag, true);
    } catch (err) {
      alert(err.message);
    }
  });
};

// ---------- Upload ----------
document.getElementById("add").onclick = () => {
  uploadForm.reset();
  syncUploadMoods();
  preview.hidden = true;
  uploadMsg.textContent = "";
  uploadDialog.showModal();
};
document.getElementById("cancel-upload").onclick = () => uploadDialog.close();

uploadForm.elements.image.onchange = () => {
  const file = uploadForm.elements.image.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
};

uploadForm.onsubmit = (ev) => {
  ev.preventDefault();
  uploadMsg.textContent = "";
  busy(document.getElementById("save-btn"), async () => {
    try {
      await api("/entries", { method: "POST", body: new FormData(uploadForm) });
      uploadDialog.close();
      toast("Picture saved ✓");
      loadEntries(currentTag);
    } catch (err) {
      uploadMsg.textContent = err.message;
    }
  });
};

// ---------- Header, search, start ----------
api("/auth/me")
  .then(u => (document.getElementById("who").textContent = u.email))
  .catch(() => {});

document.getElementById("logout").onclick = (ev) => {
  busy(ev.currentTarget, async () => {
    await fetch("/auth/logout", { method: "POST" });
    location.href = "/";
  });
};

document.getElementById("clear-filter").onclick = () => loadEntries();

let searchTimer;
document.getElementById("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentQuery = e.target.value.trim();
    loadEntries(currentTag);
  }, 300);
});

loadEntries();