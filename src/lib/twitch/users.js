import { twitchApiRequest, TwitchApiError } from "./api.js";

function normalizeLogin(login) {
    if (typeof login !== "string") {
        throw new TwitchApiError("Login do canal inválido.", {
            code: "invalid_login",
        });
    }

    const normalized = login.trim().replace(/^@+/, "").toLowerCase();

    if (!normalized) {
        throw new TwitchApiError("Informe o nome do canal.", {
            code: "invalid_login",
        });
    }

    if (!/^[a-z0-9_]+$/.test(normalized)) {
        throw new TwitchApiError("Login do canal inválido.", {
            code: "invalid_login",
        });
    }

    return normalized;
}

function normalizeUser(user) {
    if (!user || typeof user !== "object") {
        throw new TwitchApiError("Resposta de usuário inválida.", {
            code: "invalid_response",
        });
    }

    if (
        typeof user.id !== "string" ||
        !user.id ||
        typeof user.login !== "string" ||
        !user.login ||
        typeof user.display_name !== "string" ||
        !user.display_name
    ) {
        throw new TwitchApiError("Resposta de usuário inválida.", {
            code: "invalid_response",
        });
    }

    return Object.freeze({
        id: user.id,
        login: user.login,
        displayName: user.display_name,

        profileImageUrl:
            typeof user.profile_image_url === "string"
                ? user.profile_image_url
                : "",

        broadcasterType:
            typeof user.broadcaster_type === "string"
                ? user.broadcaster_type
                : "",
    });
}

export async function getUserByLogin(login, { signal = undefined } = {}) {
    const normalizedLogin = normalizeLogin(login);

    const payload = await twitchApiRequest("users", {
        params: {
            login: normalizedLogin,
        },

        signal,
    });

    if (!Array.isArray(payload?.data)) {
        throw new TwitchApiError("Resposta inválida da Twitch.", {
            code: "invalid_response",
        });
    }

    if (payload.data.length === 0) {
        return null;
    }

    console.log("[Twitch API] Usuário encontrado:", payload.data[0]);
    return normalizeUser(payload.data[0]);
}

export async function getCurrentUser({
    signal = undefined,
} = {}) {
    const payload = await twitchApiRequest("users", {
        signal,
    });

    if (!Array.isArray(payload?.data)) {
        throw new TwitchApiError(
            "Resposta inválida da Twitch.",
            {
                code: "invalid_response",
            },
        );
    }

    if (payload.data.length !== 1) {
        throw new TwitchApiError(
            "Não foi possível identificar o usuário autenticado.",
            {
                code: "current_user_not_found",
            },
        );
    }

    console.log(
        "[Twitch API] Usuário autenticado:",
        payload.data[0],
    );

    return normalizeUser(payload.data[0]);
}
