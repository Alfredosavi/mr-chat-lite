import { writable } from "svelte/store";

const STORAGE_KEY =
    "mr-chat-lite.settings.channel-login";

function normalizeChannelLogin(value) {
    const login = String(value ?? "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();

    /*
     * Vazio significa:
     * usar a própria conta autenticada.
     */
    if (!login) {
        return "";
    }

    if (!/^[a-z0-9_]+$/.test(login)) {
        throw new Error(
            "Nome de canal inválido.",
        );
    }

    return login;
}

function loadChannelLogin() {
    if (typeof localStorage === "undefined") {
        return "";
    }

    try {
        return normalizeChannelLogin(
            localStorage.getItem(
                STORAGE_KEY,
            ) ?? "",
        );
    } catch (error) {
        console.warn(
            "[ChannelSettings] Configuração de canal inválida.",
            error,
        );

        return "";
    }
}

const initialChannelLogin =
    loadChannelLogin();

let currentChannelLogin =
    initialChannelLogin;

const { subscribe, set } = writable(
    initialChannelLogin,
);

function save(value) {
    const normalized =
        normalizeChannelLogin(value);

    currentChannelLogin =
        normalized;

    set(normalized);

    if (
        typeof localStorage !==
        "undefined"
    ) {
        if (normalized) {
            localStorage.setItem(
                STORAGE_KEY,
                normalized,
            );
        } else {
            localStorage.removeItem(
                STORAGE_KEY,
            );
        }
    }

    console.log(
        "[ChannelSettings] Canal salvo.",
        {
            channelLogin:
                normalized || "(conta autenticada)",
        },
    );

    return normalized;
}

function getChannelLogin() {
    return currentChannelLogin;
}

export const channelSettings = {
    subscribe,
    save,
    getChannelLogin,
    normalize: normalizeChannelLogin,
};
