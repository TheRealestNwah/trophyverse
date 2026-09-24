// Applies a saved theme choice before first paint - included as a normal
// (blocking) <script> in <head>, same effect as an inline script but shared
// across every page instead of duplicated in each one.
(function () {
    try {
        var saved = localStorage.getItem("uam-theme");
        if (saved) document.documentElement.setAttribute("data-theme", saved);
    } catch (e) {}
})();

const THEME_KEY = "uam-theme";

function isDarkActive() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function updateThemeToggle() {
    const dark = isDarkActive();
    const moon = document.getElementById("theme-icon-moon");
    const sun = document.getElementById("theme-icon-sun");
    const btn = document.getElementById("theme-toggle-btn");
    if (!moon || !sun || !btn) return;
    moon.classList.toggle("hidden", dark);
    sun.classList.toggle("hidden", !dark);
    btn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

// Broken achievement icons / game covers are rendered with no onerror
// handler (inline event attributes can't be nonce-allowed under CSP) - this
// capturing listener removes them instead, since "error" on <img> doesn't
// bubble.
document.addEventListener(
    "error",
    (event) => {
        const target = event.target;
        if (
            target instanceof HTMLImageElement &&
            (target.classList.contains("achievement-icon") || target.classList.contains("game-cover"))
        ) {
            target.remove();
        }
    },
    true
);

function initThemeToggle() {
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
        const next = isDarkActive() ? "light" : "dark";
        localStorage.setItem(THEME_KEY, next);
        document.documentElement.setAttribute("data-theme", next);
        updateThemeToggle();
    });
    updateThemeToggle();
}
