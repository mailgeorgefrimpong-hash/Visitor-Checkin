// Visitor self-check-in kiosk. No sign-in — posts to the local
// helper endpoint (/api/checkin), which holds its own app-only
// credential server-side and never involves the visitor in auth at all.

const RESET_AFTER_MS = 8000;
// If a visitor starts typing and walks away without submitting, clear the
// form after this long so the next person never sees the previous
// visitor's partially-typed name/phone/host sitting in the fields.
const IDLE_RESET_MS = 60000;

const formPanel = document.getElementById("kioskForm");
const confirmPanel = document.getElementById("kioskConfirm");
const form = document.getElementById("checkinForm");
const btn = document.getElementById("checkinBtn");
const errorBox = document.getElementById("kioskError");
const confirmName = document.getElementById("confirmName");

const nameInput = document.getElementById("visitorName");
const phoneInput = document.getElementById("visitorPhone");
const hostInput = document.getElementById("visitorHost");

form.addEventListener("submit", handleSubmit);

let idleHandle = null;
function armIdleReset() {
  clearTimeout(idleHandle);
  idleHandle = setTimeout(() => {
    form.reset();
    hideError();
  }, IDLE_RESET_MS);
}
form.addEventListener("input", armIdleReset);
armIdleReset();

async function handleSubmit(e) {
  e.preventDefault();
  hideError();

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const host = hostInput.value.trim();
  if (!name || !phone || !host) return;

  btn.disabled = true;
  try {
    const turnstileToken = getTurnstileToken();
    const res = await fetch(window.KIOSK_CONFIG.checkinEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, host, turnstileToken }),
    });
    const data = await res.json();

    if (!res.ok || !data.ok) {
      showError(data.message || "Something went wrong. Please ask the front desk to check you in.");
      return;
    }

    showConfirmation(name);
  } catch (err) {
    showError("Couldn't reach the front desk system. Please ask the front desk to check you in.");
  } finally {
    btn.disabled = false;
  }
}

function showConfirmation(name) {
  clearTimeout(idleHandle);
  confirmName.textContent = name;
  formPanel.classList.add("hidden");
  confirmPanel.classList.remove("hidden");
  form.reset();
  resetTurnstile();

  setTimeout(() => {
    confirmPanel.classList.add("hidden");
    formPanel.classList.remove("hidden");
    nameInput.focus();
    armIdleReset();
  }, RESET_AFTER_MS);
}

// Turnstile (bot/abuse protection) is optional — only active if
// kiosk-config.js sets a turnstileSiteKey. See cloudflare-worker/README.md.
function getTurnstileToken() {
  const input = document.querySelector('[name="cf-turnstile-response"]');
  return input ? input.value : undefined;
}

function resetTurnstile() {
  if (window.turnstile && window.KIOSK_CONFIG.turnstileSiteKey) {
    window.turnstile.reset();
  }
}

function initTurnstile() {
  const siteKey = window.KIOSK_CONFIG.turnstileSiteKey;
  const container = document.getElementById("turnstileContainer");
  if (!siteKey || !container) return;

  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);

  container.classList.remove("hidden");
  container.dataset.sitekey = siteKey;
  container.className = container.className + " cf-turnstile";
}
initTurnstile();

function showError(text) {
  errorBox.textContent = text;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

nameInput.focus();
