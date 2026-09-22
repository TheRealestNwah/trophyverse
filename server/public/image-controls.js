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

    return { gameCoverMarkup, markCoverImageFailed };
});
