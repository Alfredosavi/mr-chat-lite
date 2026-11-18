const FALLBACK_NAME_COLOR = "#b69cff";
const CHAT_BACKGROUND = "#141419";

function normalizeHex(value) {
    const color = String(value ?? "").trim();

    return /^#[0-9a-fA-F]{6}$/.test(color)
        ? color.toLowerCase()
        : null;
}

function hexToRgb(hex) {
    return {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
    };
}

function rgbToHex({ r, g, b }) {
    return (
        "#" +
        [r, g, b]
            .map((value) =>
                Math.round(value)
                    .toString(16)
                    .padStart(2, "0"),
            )
            .join("")
    );
}

function linearize(value) {
    const channel = value / 255;

    return channel <= 0.04045
        ? channel / 12.92
        : Math.pow(
              (channel + 0.055) / 1.055,
              2.4,
          );
}

function luminance(hex) {
    const { r, g, b } = hexToRgb(hex);

    return (
        0.2126 * linearize(r) +
        0.7152 * linearize(g) +
        0.0722 * linearize(b)
    );
}

function contrastRatio(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);

    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (
        (lighter + 0.05) /
        (darker + 0.05)
    );
}

function mixWithWhite(
    hex,
    amount,
) {
    const { r, g, b } =
        hexToRgb(hex);

    return rgbToHex({
        r: r + (255 - r) * amount,
        g: g + (255 - g) * amount,
        b: b + (255 - b) * amount,
    });
}

export function getNameColor(
    twitchColor,
    {
        readable = false,
        background = CHAT_BACKGROUND,
        minContrast = 4.5,
    } = {},
) {
    const color =
        normalizeHex(twitchColor) ??
        FALLBACK_NAME_COLOR;

    if (!readable) {
        return color;
    }

    const normalizedBackground =
        normalizeHex(background) ??
        CHAT_BACKGROUND;

    if (
        contrastRatio(
            color,
            normalizedBackground,
        ) >= minContrast
    ) {
        return color;
    }

    /*
     * Procura a menor quantidade possível
     * de branco necessária para atingir
     * o contraste desejado.
     */
    let low = 0;
    let high = 1;

    for (let i = 0; i < 16; i += 1) {
        const middle =
            (low + high) / 2;

        const candidate =
            mixWithWhite(
                color,
                middle,
            );

        if (
            contrastRatio(
                candidate,
                normalizedBackground,
            ) >= minContrast
        ) {
            high = middle;
        } else {
            low = middle;
        }
    }

    return mixWithWhite(
        color,
        high,
    );
}
