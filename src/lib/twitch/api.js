import {
    CLIENT_ID,
    getAccessToken,
    refreshAccessToken,
} from "../auth/twitch.js";

const HELIX_ORIGIN = "https://api.twitch.tv";
const HELIX_BASE_PATH = "/helix/";

export class TwitchApiError extends Error {
    constructor(message, { status = 0, code = "api_error" } = {}) {
        super(message);

        this.name = "TwitchApiError";
        this.status = status;
        this.code = code;
    }
}

function requireClientId() {
    if (!CLIENT_ID) {
        throw new TwitchApiError("Twitch Client ID não configurado.", {
            code: "client_not_configured",
        });
    }
}

function requireToken() {
    const token = getAccessToken();

    if (!token) {
        throw new TwitchApiError("Usuário não autenticado.", {
            status: 401,
            code: "not_authenticated",
        });
    }

    return token;
}

function buildHelixUrl(path, params = {}) {
    if (typeof path !== "string" || !path.trim()) {
        throw new TwitchApiError("Endpoint Twitch inválido.", {
            code: "invalid_endpoint",
        });
    }

    const normalizedPath = path.trim().replace(/^\/+/, "");

    /*
     * Esta função aceita somente caminhos relativos
     * da Helix.
     */
    if (normalizedPath.includes("://") || normalizedPath.startsWith("//")) {
        throw new TwitchApiError("Endpoint Twitch inválido.", {
            code: "invalid_endpoint",
        });
    }

    const url = new URL(`${HELIX_BASE_PATH}${normalizedPath}`, HELIX_ORIGIN);

    /*
     * Defesa adicional para evitar envio acidental
     * do Authorization para outro host.
     */
    if (
        url.protocol !== "https:" ||
        url.hostname !== "api.twitch.tv" ||
        !url.pathname.startsWith(HELIX_BASE_PATH)
    ) {
        throw new TwitchApiError("Endpoint Twitch inválido.", {
            code: "invalid_endpoint",
        });
    }

    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) {
            continue;
        }

        url.searchParams.append(key, String(value));
    }

    return url;
}

async function readJson(response) {
    if (response.status === 204) {
        return null;
    }

    return response.json().catch(() => null);
}

function errorCodeFromStatus(status) {
    switch (status) {
        case 400:
            return "bad_request";

        case 401:
            return "unauthorized";

        case 403:
            return "forbidden";

        case 404:
            return "not_found";

        case 409:
            return "conflict";

        case 429:
            return "rate_limited";

        default:
            return status >= 500 ? "twitch_unavailable" : "api_error";
    }
}

async function performRequest(url, { method, body, headers, signal, token }) {
    const requestHeaders = new Headers(headers);

    requestHeaders.set("Authorization", `Bearer ${token}`,);
    requestHeaders.set("Client-Id", CLIENT_ID,);

    return fetch(url, {
        method,
        headers: requestHeaders,
        body,
        signal,
        cache: "no-store",
    });
}

export async function twitchApiRequest(
    path,
    {
        method = "GET",
        params = {},
        body = undefined,
        headers = {},
        signal = undefined,
        allowRefresh = true,
    } = {},
) {
    requireClientId();

    const url = buildHelixUrl(path, params);

    const token = requireToken();

    let response;

    try {
        response = await performRequest(url, {
            method,
            body,
            headers,
            signal,
            token,
        });
    } catch (error) {
        if (error?.name === "AbortError") {
            throw error;
        }

        console.error("[Twitch API] Falha de rede.", error);

        throw new TwitchApiError("Não foi possível acessar a Twitch.", {
            code: "network_error",
        });
    }

    /*
     * O access token pode expirar entre as
     * validações periódicas da sessão.
     */
    if (response.status === 401 && allowRefresh) {
        const newToken = await refreshAccessToken();

        if (!newToken) {
            throw new TwitchApiError("Sessão Twitch inválida.", {
                status: 401,
                code: "session_invalid",
            });
        }

        return twitchApiRequest(path, {
            method,
            params,
            body,
            headers,
            signal,
            allowRefresh: false,
        });
    }

    const payload = await readJson(response);

    if (!response.ok) {
        const code = errorCodeFromStatus(response.status);

        console.warn("[Twitch API] Requisição recusada.", {
            method,
            path,
            status: response.status,
            code,
        });

        throw new TwitchApiError("A Twitch recusou a requisição.", {
            status: response.status,
            code,
        });
    }

    return payload;
}
