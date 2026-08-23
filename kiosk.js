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
const btnLabel = document.getElementById("checkinBtnLabel");
const btnLabelLoading = document.getElementById("checkinBtnLabel-loading");

const nameInput = document.getElementById("visitorName");
const phoneInput = document.getElementById("visitorPhone");
const emailInput = document.getElementById("visitorEmail");
const hostInput = document.getElementById("visitorHost");
const purposeInput = document.getElementById("visitorPurpose");
const hostResults = document.getElementById("hostResults");

// checkinEndpoint is either a relative dev path ("/api/checkin") or the
// full production Worker URL — either way, its origin plus
// "/directory-search" is the one search URL that's correct in both
// places, without separate local-vs-production path logic.
const directorySearchUrl =
  new URL(window.KIOSK_CONFIG.checkinEndpoint, window.location.href).origin + "/directory-search";
const hostTypeahead = setupDirectoryTypeahead({
  input: hostInput,
  resultsEl: hostResults,
  searchUrl: directorySearchUrl,
});

form.addEventListener("submit", handleSubmit);

// Validates a phone number, enforcing completeness for Ghanaian numbers
// specifically (starting with 0, or the 233 country code) — numbers that
// don't match a Ghana pattern are accepted with just a loose sanity check,
// since visitors legitimately have non-Ghana numbers too.
function validatePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("2330")) {
    return { ok: false, message: "That looks like both a country code (233) and a leading 0 — use one or the other, not both." };
  }
  if (digits.startsWith("0")) {
    if (digits.length !== 10) {
      return {
        ok: false,
        message: `Ghana numbers starting with 0 should have 10 digits total (this has ${digits.length}). If this is actually a foreign number, enter it with your country's + code instead of a leading 0 (e.g. +44 20 7946 0958).`,
      };
    }
    return { ok: true };
  }
  if (digits.startsWith("233")) {
    if (digits.length !== 12) {
      return { ok: false, message: `Ghana numbers with the 233 country code should have 12 digits total (this has ${digits.length}).` };
    }
    return { ok: true };
  }
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, message: "That doesn't look like a complete phone number." };
  }
  return { ok: true };
}

function isValidEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(str || "").trim());
}

// ---------------------------------------------------------------
// Directory typeahead — "who are you here to see?" is required to
// resolve to a real org account, not free text (people without an
// Entra account, e.g. an outside contractor, aren't a valid "host" —
// only staff with accounts can be visited). Backed by the Worker's
// (or, locally, server.js's) /directory-search endpoint, which needs
// User.Read.All (Application) on the robot app registration.
// ---------------------------------------------------------------
function setupDirectoryTypeahead({ input, resultsEl, searchUrl }) {
  let selected = null;
  let debounceHandle = null;
  let activeIndex = -1;
  let currentResults = [];
  let requestSeq = 0; // guards against a slow earlier request overwriting a newer one

  function closeList() {
    resultsEl.classList.add("hidden");
    resultsEl.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
    currentResults = [];
  }

  function setActive(i) {
    activeIndex = i;
    resultsEl.querySelectorAll(".typeahead-option").forEach((li, idx) => {
      li.classList.toggle("active", idx === i);
    });
    const activeEl = resultsEl.querySelector(".typeahead-option.active");
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function selectResult(i) {
    const r = currentResults[i];
    if (!r) return;
    selected = r;
    input.value = r.displayName;
    closeList();
  }

  function renderResults(results) {
    currentResults = results;
    activeIndex = -1;
    if (results.length === 0) {
      resultsEl.innerHTML = '<li class="typeahead-empty">No matches — check the spelling, or ask the front desk.</li>';
      resultsEl.classList.remove("hidden");
      input.setAttribute("aria-expanded", "true");
      return;
    }
    resultsEl.innerHTML = results
      .map(
        (r, i) => `<li class="typeahead-option" role="option" id="typeahead-opt-${i}">
          <span class="typeahead-option-name"></span>
          <span class="typeahead-option-meta"></span>
        </li>`
      )
      .join("");
    // Text set via textContent, not string-interpolated into the HTML
    // above — a directory display name is still untrusted input as far
    // as this page is concerned, so it shouldn't be able to inject markup.
    resultsEl.querySelectorAll(".typeahead-option").forEach((li, i) => {
      li.querySelector(".typeahead-option-name").textContent = results[i].displayName;
      li.querySelector(".typeahead-option-meta").textContent = results[i].jobTitle || results[i].mail;
      // mousedown, not click — it fires before the input's blur handler,
      // so a mouse/touch selection isn't cancelled by blur closing the
      // list first.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectResult(i);
      });
    });
    resultsEl.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }

  async function runSearch(q) {
    const seq = ++requestSeq;
    try {
      const res = await fetch(`${searchUrl}?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (seq !== requestSeq) return; // a newer keystroke has already started a fresher request
      renderResults((data && data.results) || []);
    } catch {
      if (seq !== requestSeq) return;
      renderResults([]);
    }
  }

  input.addEventListener("input", () => {
    selected = null; // typing after a selection invalidates it
    const q = input.value.trim();
    clearTimeout(debounceHandle);
    if (q.length < 2) {
      closeList();
      return;
    }
    debounceHandle = setTimeout(() => runSearch(q), 250);
  });

  input.addEventListener("keydown", (e) => {
    if (resultsEl.classList.contains("hidden") || currentResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, currentResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectResult(activeIndex);
    } else if (e.key === "Escape") {
      closeList();
    }
  });

  input.addEventListener("blur", () => setTimeout(closeList, 100));

  return {
    isValidSelection: () => !!selected && selected.displayName === input.value.trim(),
    clear: () => {
      selected = null;
      closeList();
    },
  };
}

let idleHandle = null;
function armIdleReset() {
  clearTimeout(idleHandle);
  idleHandle = setTimeout(() => {
    form.reset();
    hostTypeahead.clear();
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
  const email = emailInput.value.trim();
  const host = hostInput.value.trim();
  const purpose = purposeInput.value;
  if (!name || !phone || !host || !purpose) return;

  if (!hostTypeahead.isValidSelection()) {
    showError("Please choose a name from the list for who you're here to see.");
    hostInput.focus();
    return;
  }

  const phoneCheck = validatePhone(phone);
  if (!phoneCheck.ok) {
    showError(phoneCheck.message);
    return;
  }
  if (email && !isValidEmail(email)) {
    showError("That email address doesn't look complete — please check it and try again.");
    return;
  }

  btn.disabled = true;
  btnLabel.classList.add("hidden");
  btnLabelLoading.classList.remove("hidden");
  try {
    const turnstileToken = getTurnstileToken();
    const res = await fetch(window.KIOSK_CONFIG.checkinEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email, host, purpose, turnstileToken }),
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
    btnLabel.classList.remove("hidden");
    btnLabelLoading.classList.add("hidden");
  }
}

function showConfirmation(name) {
  clearTimeout(idleHandle);
  confirmName.textContent = name;
  formPanel.classList.add("hidden");
  confirmPanel.classList.remove("hidden");
  form.reset();
  hostTypeahead.clear();
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
  // Restart the shake even if an error box is already showing (e.g. two
  // rejections in a row) — removing then re-adding the class in the next
  // frame forces the animation to replay instead of being a no-op.
  errorBox.classList.remove("shake");
  void errorBox.offsetWidth; // force reflow so the removal above "takes"
  errorBox.classList.add("shake");
  // On short tablet viewports / with the on-screen keyboard open, the error
  // can land below the fold. Bring it into view instead of leaving it
  // scrolled off-frame where a visitor would never notice it.
  errorBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function hideError() {
  errorBox.classList.add("hidden");
}

nameInput.focus();
