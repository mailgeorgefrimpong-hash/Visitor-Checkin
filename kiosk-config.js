// Where the kiosk sends check-ins.
// - For local testing against server.js, leave this as the relative path.
// - Once deployed to GitHub Pages, change this to your Cloudflare Worker's
//   URL (see cloudflare-worker/README.md) and re-publish this file.
window.KIOSK_CONFIG = {
  checkinEndpoint: "https://vms-checkin.24hplus-vms.workers.dev",

  // Optional bot/abuse protection (Cloudflare Turnstile). Leave null until
  // you've set up a Turnstile widget in the Cloudflare dashboard — this is
  // the PUBLIC site key (safe to expose here). The matching SECRET key goes
  // server-side only, as the Worker's TURNSTILE_SECRET_KEY variable — see
  // cloudflare-worker/README.md. Both must be set together, or neither.
  turnstileSiteKey: null,
};
