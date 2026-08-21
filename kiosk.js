// Visitor self-check-in kiosk. No sign-in — posts to the local
// helper endpoint (/api/checkin), which holds its own app-only
// credential server-side and never involves the visitor in auth at all.

const RESET_AFTER_MS = 8000;

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

async function handleSubmit(e) {
  e.preventDefault();
  hideError();

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  const host = hostInput.value.trim();
  if (!name || !phone || !host) return;

  btn.disabled = true;
  try {
    const res = await fetch(window.KIOSK_CONFIG.checkinEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, host }),
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
  confirmName.textContent = name;
  formPanel.classList.add("hidden");
  confirmPanel.classList.remove("hidden");
  form.reset();

  setTimeout(() => {
    confirmPanel.classList.add("hidden");
    formPanel.classList.remove("hidden");
    nameInput.focus();
  }, RESET_AFTER_MS);
}

function showError(text) {
  errorBox.textContent = text;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
}

nameInput.focus();
