import { createRoot } from "react-dom/client";
import { THEME } from "./config/theme";
import App from "./App.tsx";
import "./index.css";

// __BUILD_ID__ is replaced at build time via vite.config.ts → define.
declare const __BUILD_ID__: string;

// One-time stale-state purge after a deploy.
//
// Why this exists: index.html used to be served without Cache-Control,
// so browsers (Mac Chrome / Safari especially) cached it heuristically
// and kept showing old asset hashes after a deploy. Combined with MSAL
// caching tokens + redirect URI in localStorage, users got stuck in a
// state where login bounced to a 404 they couldn't recover from
// without manually clearing site data.
//
// Going forward nginx serves index.html with no-store, so the page
// itself is always fresh. But we still need a one-time fix for users
// already carrying stale state. This block compares the bundle's
// build ID to whatever the browser remembers; on first load after a
// new deploy, it wipes both storages and reloads. After the reload,
// the new build ID is stored, the user is on the new bundle with a
// clean MSAL cache, and subsequent loads are no-ops.
const BUILD_ID_KEY = "velox-build-id";
try {
    const stored = localStorage.getItem(BUILD_ID_KEY);
    if (stored !== __BUILD_ID__) {
        // Drop everything: MSAL accounts, our analyst/chatbot session
        // ids, anything else. Then mark this build as known and reload
        // so the new bundle starts from a clean slate.
        localStorage.clear();
        try { sessionStorage.clear(); } catch { /* ignore */ }
        localStorage.setItem(BUILD_ID_KEY, __BUILD_ID__);
        if (stored !== null) {
            // Only reload when we *replaced* a previous build id —
            // first-ever visit (stored === null) doesn't need a reload,
            // we just write the marker and continue.
            location.reload();
            // Stop further script execution while the reload is in flight.
            throw new Error("Reloading after build change");
        }
    }
} catch (err) {
    // localStorage can throw in private/incognito modes with quotas
    // disabled — don't let that break the app boot.
    if (err instanceof Error && err.message === "Reloading after build change") throw err;
    console.warn("[Boot] Build-ID check failed (continuing):", err);
}

// Apply theme to <html> so CSS :root[data-theme] selectors activate
document.documentElement.setAttribute("data-theme", THEME);

// Set favicon and page title based on theme
document.title = THEME === "siriusai" ? "SiriusAI" : "DLX";
const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
if (favicon) {
    const themedFavicon = THEME === "siriusai" ? "favicon_sirius.ico" : "dlx-logo.png";
    favicon.href = `${import.meta.env.BASE_URL}${themedFavicon}`;
}

createRoot(document.getElementById("root")!).render(<App />);
