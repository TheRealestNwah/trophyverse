(function (root, factory) {
    const controls = factory();
    if (typeof module === "object" && module.exports) module.exports = controls;
    if (root) root.ImageControls = controls;
})(typeof window !== "undefined" ? window : undefined, function () {
    function escapeAttribute(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll('"', "&quot;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
    }

    function gameCoverMarkup(imageUrl) {
        const hasCover = Boolean(imageUrl);
        const image = hasCover
            ? `<img class="game-cover" src="${escapeAttribute(imageUrl)}" alt="" loading="lazy" />`
            : "";

        return `
            <button type="button" class="game-cover-wrap${hasCover ? " has-cover" : ""}"
                aria-label="Change game cover" title="Change game cover">
                ${image}
                <span class="game-cover-placeholder" aria-hidden="true">
                    <span class="game-cover-placeholder-icon">+</span>
                    <span>Add</span>
                </span>
            </button>
        `;
    }

    function markCoverImageFailed(image) {
        image.hidden = true;
        image.closest(".game-cover-wrap")?.classList.remove("has-cover");
    }

    const ICON_RETRY_DELAY_MS = 2000;

    // One retry covers transient failures (network blips, CDN hiccups). An
    // icon that still fails becomes the same placeholder used for achievements
    // with no icon, so the row keeps its shape and the click-to-change-icon
    // target stays in place.
    function handleAchievementIconError(image, schedule = setTimeout) {
        if (!image.dataset.retried) {
            image.dataset.retried = "true";
            const src = image.src;
            schedule(() => {
                if (image.isConnected) image.src = src;
            }, ICON_RETRY_DELAY_MS);
            return;
        }
        const placeholder = image.ownerDocument.createElement("div");
        placeholder.className = "achievement-icon";
        image.replaceWith(placeholder);
    }

    // Inline onerror attributes can't be nonce-allowed under CSP, so icon
    // errors are caught here with a capturing listener ("error" on <img>
    // doesn't bubble).
    if (typeof document !== "undefined") {
        document.addEventListener(
            "error",
            (event) => {
                const target = event.target;
                if (target instanceof HTMLImageElement && target.classList.contains("achievement-icon")) {
                    handleAchievementIconError(target);
                }
            },
            true
        );
    }

    return { gameCoverMarkup, markCoverImageFailed, handleAchievementIconError };
});
