// Where the kiosk sends check-ins.
// - For local testing against server.js, leave this as the relative path.
// - Once deployed to GitHub Pages, change this to your Cloudflare Worker's
//   URL (see cloudflare-worker/README.md) and re-publish this file.
window.KIOSK_CONFIG = {
  checkinEndpoint: "/api/checkin",
};
