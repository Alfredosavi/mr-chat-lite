export function getTwitchEmoteUrl(
    fragment,
) {
    const emoteId =
        String(
            fragment?.emoteId ?? "",
        ).trim();

    if (!emoteId) {
        return null;
    }

    const formats =
        Array.isArray(
            fragment?.formats,
        )
            ? fragment.formats
            : [];

    const format =
        formats.includes("animated")
            ? "animated"
            : "static";

    /*
     * Tema dark porque o app usa fundo escuro.
     *
     * Escala 1.0 = imagem pequena do CDN,
     * suficiente para o tamanho usado no chat.
     */
    return (
        "https://static-cdn.jtvnw.net/" +
        "emoticons/v2/" +
        `${encodeURIComponent(emoteId)}/` +
        `${format}/dark/1.0`
    );
}
