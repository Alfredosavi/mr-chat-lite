import { writable } from "svelte/store";

const STORAGE_KEY = "mr-chat-lite.settings.display";

export const CHAT_PAUSE_MODES = Object.freeze({
    SCROLL: "scroll",
    ALT: "alt",
    MOUSE: "mouse",
    MOUSE_OR_ALT: "mouse-or-alt",
});

export const CHAT_FONT_OPTIONS = Object.freeze([
    {
        value: "twitch",
        label: "Twitch",
    },
    {
        value: "system",
        label: "Sistema",
    },
    {
        value: "arial",
        label: "Arial",
    },
    {
        value: "verdana",
        label: "Verdana",
    },
    {
        value: "tahoma",
        label: "Tahoma",
    },
    {
        value: "trebuchet",
        label: "Trebuchet MS",
    },
    {
        value: "georgia",
        label: "Georgia",
    },
    {
        value: "monospace",
        label: "Monospace",
    },
]);

export const MIN_CHAT_FONT_SIZE = 10;
export const MAX_CHAT_FONT_SIZE = 24;

const FONT_FAMILIES = Object.freeze({
    twitch: 'Inter, "Noto Sans Arabic", Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif',
    system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    arial: "Arial, sans-serif",
    verdana: "Verdana, sans-serif",
    tahoma: "Tahoma, sans-serif",
    trebuchet: '"Trebuchet MS", sans-serif',
    georgia: "Georgia, serif",
    monospace: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
});

const VALID_PAUSE_MODES = new Set(Object.values(CHAT_PAUSE_MODES));

const VALID_FONTS = new Set(CHAT_FONT_OPTIONS.map((font) => font.value));

const BOOLEAN_OPTIONS = new Set([
    "showTimestamp",
    "showTwitchEmotes",
    "showEmoji",
    "showBadges",
    "readableNameColors",
]);

const DEFAULT_SETTINGS = Object.freeze({
    showTimestamp: true,
    showTwitchEmotes: true,
    showEmoji: true,
    showBadges: true,

    pauseMode: CHAT_PAUSE_MODES.SCROLL,

    readableNameColors: false,

    nicknameFont: "twitch",
    nicknameFontSize: 14,

    messageFont: "twitch",
    messageFontSize: 14,
});

function normalizePauseMode(value) {
    return VALID_PAUSE_MODES.has(value) ? value : DEFAULT_SETTINGS.pauseMode;
}

function normalizeFont(value, fallback) {
    return VALID_FONTS.has(value) ? value : fallback;
}

function normalizeFontSize(value, fallback) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return fallback;
    }

    return Math.min(
        MAX_CHAT_FONT_SIZE,
        Math.max(MIN_CHAT_FONT_SIZE, Math.round(number)),
    );
}

function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};

    return Object.freeze({
        showTimestamp:
            typeof source.showTimestamp === "boolean"
                ? source.showTimestamp
                : DEFAULT_SETTINGS.showTimestamp,

        showTwitchEmotes:
            typeof source.showTwitchEmotes === "boolean"
                ? source.showTwitchEmotes
                : DEFAULT_SETTINGS.showTwitchEmotes,

        showEmoji:
            typeof source.showEmoji === "boolean"
                ? source.showEmoji
                : DEFAULT_SETTINGS.showEmoji,

        showBadges:
            typeof source.showBadges === "boolean"
                ? source.showBadges
                : DEFAULT_SETTINGS.showBadges,

        pauseMode: normalizePauseMode(source.pauseMode),

        readableNameColors:
            typeof source.readableNameColors === "boolean"
                ? source.readableNameColors
                : DEFAULT_SETTINGS.readableNameColors,

        nicknameFont: normalizeFont(
            source.nicknameFont,
            DEFAULT_SETTINGS.nicknameFont,
        ),

        nicknameFontSize: normalizeFontSize(
            source.nicknameFontSize,
            DEFAULT_SETTINGS.nicknameFontSize,
        ),

        messageFont: normalizeFont(
            source.messageFont,
            DEFAULT_SETTINGS.messageFont,
        ),

        messageFontSize: normalizeFontSize(
            source.messageFontSize,
            DEFAULT_SETTINGS.messageFontSize,
        ),
    });
}

function loadSettings() {
    if (typeof localStorage === "undefined") {
        return DEFAULT_SETTINGS;
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);

        if (!raw) {
            return DEFAULT_SETTINGS;
        }

        return normalizeSettings(JSON.parse(raw));
    } catch (error) {
        console.warn("[DisplaySettings] Configuração inválida.", error);

        return DEFAULT_SETTINGS;
    }
}

let current = loadSettings();

const { subscribe, set } = writable(current);

function persist() {
    if (typeof localStorage === "undefined") {
        return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

function normalizeOption(name, value) {
    if (BOOLEAN_OPTIONS.has(name)) {
        return Boolean(value);
    }

    switch (name) {
        case "pauseMode":
            return normalizePauseMode(value);

        case "nicknameFont":
            return normalizeFont(value, DEFAULT_SETTINGS.nicknameFont);

        case "messageFont":
            return normalizeFont(value, DEFAULT_SETTINGS.messageFont);

        case "nicknameFontSize":
            return normalizeFontSize(value, DEFAULT_SETTINGS.nicknameFontSize);

        case "messageFontSize":
            return normalizeFontSize(value, DEFAULT_SETTINGS.messageFontSize);

        default:
            return undefined;
    }
}

function setOption(name, value) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, name)) {
        return false;
    }

    const normalizedValue = normalizeOption(name, value);

    if (normalizedValue === undefined) {
        return false;
    }

    current = Object.freeze({
        ...current,
        [name]: normalizedValue,
    });

    persist();
    set(current);

    return true;
}

function toggle(name) {
    if (!BOOLEAN_OPTIONS.has(name)) {
        return false;
    }

    return setOption(name, !current[name]);
}

function reset() {
    current = DEFAULT_SETTINGS;

    if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
    }

    set(current);

    console.log(
        "[DisplaySettings] Configurações restauradas para os padrões.",
    );
}

export function getChatFontFamily(font) {
    return FONT_FAMILIES[font] ?? FONT_FAMILIES.system;
}

export const displaySettings = {
    subscribe,
    set: setOption,
    toggle,
    reset,

    get() {
        return current;
    },
};
