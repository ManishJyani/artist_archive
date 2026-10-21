const msg = document.getElementById("msg");

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Invalid input");
  return data;
}

// Already logged in? Go straight to the diary
fetch("/auth/me").then(r => { if (r.ok) location.href = "/static/diary.html"; });

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {
    email: document.getElementById("email").value,
    password: document.getElementById("password").value,
  };
   const btn = e.submitter;
  btn.classList.add("loading");
  btn.disabled = true;
  try {
    if (btn.dataset.action === "signup") await post("/auth/signup", body);
    await post("/auth/login", body);
    location.href = "/static/diary.html";
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.classList.remove("loading");
    btn.disabled = false;
  }
});