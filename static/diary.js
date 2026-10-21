const gallery = document.getElementById("gallery");
const empty = document.getElementById("empty");
const filterBar = document.getElementById("filter");
const uploadDialog = document.getElementById("upload-dialog");
const uploadForm = document.getElementById("upload-form");
const uploadMsg = document.getElementById("upload-msg");
const preview = document.getElementById("preview");
const detail = document.getElementById("detail-dialog");
let currentTag = null;

const MOODS = { happy: "😊", sad: "😢", calm: "😌", angry: "😠", love: "❤️" };
const tagsInput = uploadForm.tags;
const quick = document.getElementById("quick-tags");

function currentTags() {
  return tagsInput.value.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}

// Highlight a mood if it's already in the tags box
function syncMoods() {
  const set = new Set(currentTags());
  quick.querySelectorAll("button").forEach(b => b.classList.toggle("selected", set.has(b.dataset.tag)));
}

for (const [name, emoji] of Object.entries(MOODS)) {
  const b = document.createElement("button");
  b.type = "button"; // so tapping it doesn't submit the form
  b.className = "chip mood";
  b.dataset.tag = name;
  b.textContent = `${emoji} ${name}`;
  b.onclick = () => {
    const tags = currentTags();
    const i = tags.indexOf(name);
    if (i >= 0) tags.splice(i, 1); else tags.push(name);
    tagsInput.value = tags.join(", ");
    syncMoods();
  };
  quick.append(b);
}
tagsInput.addEventListener("input", syncMoods);

// Sends you to login on 401 and shows the server's error messages
async function api(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) { location.href = "/"; throw new Error("Not logged in"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong");
  return data;
}

// Tag buttons: tap one to show only pictures with that tag
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
  const img = document.createElement("img");
  img.src = e.image_url;
  img.alt = e.title || "Artwork";
  img.loading = "lazy";
  const body = document.createElement("div");
  body.className = "entry-body";
  const title = document.createElement("h3");
  title.textContent = e.title || "Untitled";
  const tags = document.createElement("div");
  tags.className = "tags";
  tags.append(...chips(e.tags));
  body.append(title, tags);
  el.append(img, body);
  el.onclick = () => openDetail(e);
  return el;
}

let currentQuery = "";
let requestId = 0;

async function loadEntries(tag = null) {
  currentTag = tag;
  filterBar.hidden = !tag;
  document.getElementById("filter-tag").textContent = tag ? "#" + tag : "";

  const params = new URLSearchParams();
  if (tag) params.set("tag", tag);
  if (currentQuery) params.set("q", currentQuery);

  const myId = ++requestId;
  const entries = await api("/entries?" + params);
  if (myId !== requestId) return; // a newer search already started; ignore this one

  gallery.replaceChildren(...entries.map(card));
  empty.textContent = (tag || currentQuery) ? "No matching pictures." : "No pictures yet. Tap + to add your first one.";
  empty.hidden = entries.length > 0;
}

function openDetail(e) {
  document.getElementById("d-img").src = e.image_url;
  document.getElementById("d-title").textContent = e.title || "Untitled";
  document.getElementById("d-date").textContent = new Date(e.created_at).toLocaleDateString();
  document.getElementById("d-desc").textContent = e.description || "";
  document.getElementById("d-tags").replaceChildren(...chips(e.tags));
  detail.showModal();
}

// Upload
document.getElementById("add").onclick = () => {
  uploadForm.reset();
  syncMoods();
  preview.hidden = true;
  uploadMsg.textContent = "";
  uploadDialog.showModal();
};
document.getElementById("cancel-upload").onclick = () => uploadDialog.close();

uploadForm.image.onchange = () => {
  const file = uploadForm.image.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
};

uploadForm.onsubmit = async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById("save-btn");
  btn.disabled = true;
  btn.textContent = "Uploading...";
  uploadMsg.textContent = "";
  try {
    // FormData sends the file + fields as multipart; don't set Content-Type yourself
    await api("/entries", { method: "POST", body: new FormData(uploadForm) });
    uploadDialog.close();
    loadEntries(currentTag);
  } catch (err) {
    uploadMsg.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Save";
  }
};

// Detail view: close with the button or by tapping outside
document.getElementById("close-detail").onclick = () => detail.close();
detail.onclick = (ev) => { if (ev.target === detail) detail.close(); };

// Header
api("/auth/me").then(u => (document.getElementById("who").textContent = u.email));
document.getElementById("logout").onclick = async () => {
  await fetch("/auth/logout", { method: "POST" });
  location.href = "/";
};
document.getElementById("clear-filter").onclick = () => loadEntries();

// Wait until the user stops typing for 300 ms, then search (one API call, not one per letter)
let searchTimer;
document.getElementById("search").addEventListener("input", (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentQuery = e.target.value.trim();
    loadEntries(currentTag);
  }, 300);
});

loadEntries();