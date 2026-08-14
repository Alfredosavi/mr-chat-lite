const CLIENT_ID = import.meta.env.VITE_TWITCH_CLIENT_ID?.trim() || "";

const TOKEN_KEY = "mr-chat-lite.twitch-token";
const REFRESH_TOKEN_KEY = "mr-chat-lite.twitch-refresh-token";

const SCOPES = Object.freeze(["user:read:chat"]);

const DEVICE_ENDPOINT = "https://id.twitch.tv/oauth2/device";
const TOKEN_ENDPOINT = "https://id.twitch.tv/oauth2/token";
const VALIDATE_ENDPOINT = "https://id.twitch.tv/oauth2/validate";
const REVOKE_ENDPOINT = "https://id.twitch.tv/oauth2/revoke";

const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

let sessionGeneration = 0;
let refreshState = null;

export function isTwitchConfigured() {
    return CLIENT_ID.length > 0;
}

function requireClientId() {
    if (!CLIENT_ID) {
        console.error("[OAuth] Client ID não configurado.");

        throw new Error(
            "Defina VITE_TWITCH_CLIENT_ID antes de conectar à Twitch.",
        );
    }
}

function requiredString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Resposta OAuth inválida: ${fieldName} ausente.`);
    }

    return value.trim();
}

function positiveNumber(value, fieldName) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Resposta OAuth inválida: ${fieldName} inválido.`);
    }

    return parsed;
}

function normalizeScopes(value) {
    let scopes;

    if (Array.isArray(value)) {
        scopes = value;
    } else if (typeof value === "string") {
        scopes = value.split(/\s+/);
    } else {
        throw new Error("Resposta OAuth inválida: scopes ausentes.");
    }

    const normalized = scopes
        .filter((scope) => typeof scope === "string")
        .map((scope) => scope.trim())
        .filter(Boolean);

    if (normalized.length === 0) {
        throw new Error("Resposta OAuth inválida: scopes ausentes.");
    }

    return [...new Set(normalized)];
}

function assertExactScopes(grantedScopes) {
    const missingScopes = SCOPES.filter(
        (scope) => !grantedScopes.includes(scope),
    );

    const unexpectedScopes = grantedScopes.filter(
        (scope) => !SCOPES.includes(scope),
    );

    if (missingScopes.length > 0 || unexpectedScopes.length > 0) {
        console.error("[OAuth] Token com conjunto de scopes inesperado.", {
            missingScopes,
            unexpectedScopes,
        });

        throw new Error("O token retornado possui permissões inesperadas.");
    }
}

function normalizeVerificationUri(value) {
    const raw = requiredString(value, "verification_uri");

    let url;

    try {
        url = new URL(raw);
    } catch {
        throw new Error("Resposta OAuth inválida: verification_uri inválida.");
    }

    const validPath =
        url.pathname === "/activate" || url.pathname === "/activate/";

    if (
        url.protocol !== "https:" ||
        url.hostname !== "www.twitch.tv" ||
        !validPath
    ) {
        throw new Error("A Twitch retornou uma URL de autorização inesperada.");
    }

    return url.toString();
}

function normalizeDevicePayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Resposta inválida da Twitch ao iniciar autenticação.");
    }

    return {
        device_code: requiredString(payload.device_code, "device_code"),
        user_code: requiredString(payload.user_code, "user_code"),
        verification_uri: normalizeVerificationUri(
            payload.verification_uri_complete || payload.verification_uri,
        ),
        expires_in: positiveNumber(payload.expires_in, "expires_in"),
        interval: positiveNumber(payload.interval, "interval"),
    };
}

function normalizeTokenPair(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Resposta inválida da Twitch ao obter tokens.");
    }

    const accessToken = requiredString(payload.access_token, "access_token");
    const refreshToken = requiredString(payload.refresh_token, "refresh_token");
    const expiresIn = positiveNumber(payload.expires_in, "expires_in");
    const scopes = normalizeScopes(payload.scope);

    assertExactScopes(scopes);

    if (
        payload.token_type !== undefined &&
        String(payload.token_type).toLowerCase() !== "bearer"
    ) {
        throw new Error("Resposta OAuth inválida: token_type inesperado.");
    }

    return {
        accessToken,
        refreshToken,
        expiresIn,
        scopes,
    };
}

function normalizePreparedTokenPair(tokenPair) {
    if (!tokenPair || typeof tokenPair !== "object") {
        throw new Error("Par de tokens OAuth inválido.");
    }

    const accessToken = requiredString(tokenPair.accessToken, "accessToken");
    const refreshToken = requiredString(tokenPair.refreshToken, "refreshToken");
    const expiresIn = positiveNumber(tokenPair.expiresIn, "expiresIn");
    const scopes = normalizeScopes(tokenPair.scopes);

    assertExactScopes(scopes);

    return {
        accessToken,
        refreshToken,
        expiresIn,
        scopes,
    };
}

function persistTokenPair(tokenPair) {
    const normalized = normalizePreparedTokenPair(tokenPair);

    try {
        sessionStorage.setItem(TOKEN_KEY, normalized.accessToken);
        sessionStorage.setItem(REFRESH_TOKEN_KEY, normalized.refreshToken);
    } catch (error) {
        clearTokens();
        throw error;
    }

    console.debug("[OAuth] Tokens armazenados na sessão.", {
        hasAccessToken: true,
        hasRefreshToken: true,
        expiresIn: normalized.expiresIn,
        scopes: normalized.scopes,
    });
}

function clearTokens() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}

function invalidateLocalSession() {
    sessionGeneration += 1;
    clearTokens();
}

function invalidateIfCurrentAccessToken(token) {
    if (token && getAccessToken() === token) {
        invalidateLocalSession();
    }
}

function createOAuthError(message, code = "", status = 0) {
    const error = new Error(message);
    error.name = "TwitchOAuthError";

    if (code) {
        error.code = String(code);
    }

    if (status) {
        error.status = status;
    }

    return error;
}

async function readJson(response) {
    return response.json().catch(() => ({}));
}

export function getAccessToken() {
    return sessionStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
    return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function logout() {
    invalidateLocalSession();
    console.debug("[OAuth] Sessão Twitch local removida.");
}

export async function startDeviceFlow() {
    requireClientId();

    const body = new FormData();

    body.set("client_id", CLIENT_ID);
    body.set("scopes", SCOPES.join(" "));

    console.debug("[OAuth] Iniciando Device Code Flow.", {
        scopes: SCOPES,
    });

    let response;

    try {
        response = await fetch(DEVICE_ENDPOINT, {
            method: "POST",
            body,
            cache: "no-store",
        });
    } catch (error) {
        console.error(
            "[OAuth] Falha de rede ao iniciar Device Code Flow.",
            error,
        );

        throw error;
    }

    const payload = await readJson(response);

    if (!response.ok) {
        console.error("[OAuth] Twitch recusou o início do Device Code Flow.", {
            status: response.status,
            message: payload.message,
        });

        throw createOAuthError(
            "Não foi possível iniciar a autenticação da Twitch.",
            payload.message,
            response.status,
        );
    }

    const device = normalizeDevicePayload(payload);

    console.debug("[OAuth] Device Code criado.", {
        expiresIn: device.expires_in,
        interval: device.interval,
    });

    return device;
}

export async function pollDeviceToken(deviceCode) {
    requireClientId();

    const normalizedDeviceCode = requiredString(deviceCode, "device_code");

    const body = new FormData();

    body.set("client_id", CLIENT_ID);
    body.set("scopes", SCOPES.join(" "));
    body.set("device_code", normalizedDeviceCode);
    body.set("grant_type", DEVICE_GRANT_TYPE);

    let response;

    try {
        response = await fetch(TOKEN_ENDPOINT, {
            method: "POST",
            body,
            cache: "no-store",
        });
    } catch (error) {
        console.error("[OAuth] Falha de rede ao consultar Device Code.", error);

        throw error;
    }

    const payload = await readJson(response);

    if (
        response.status === 400 &&
        payload.message === "authorization_pending"
    ) {
        return {
            status: "pending",
        };
    }

    if (!response.ok) {
        const twitchMessage =
            typeof payload.message === "string" ? payload.message : "";

        console.warn("[OAuth] Device Code recusado pela Twitch.", {
            status: response.status,
            message: twitchMessage,
        });

        if (twitchMessage.toLowerCase().includes("expired")) {
            return {
                status: "expired",
            };
        }

        throw createOAuthError(
            "Não foi possível concluir a autorização da Twitch.",
            twitchMessage,
            response.status,
        );
    }

    const tokenPair = normalizeTokenPair(payload);

    /*
     * Não armazena os tokens aqui.
     *
     * device-auth.js ainda precisa confirmar que esta resposta
     * pertence ao fluxo de autenticação atual.
     */
    return {
        status: "authorized",
        tokenPair,
    };
}

export function commitDeviceAuthorization(tokenPair) {
    const normalized = normalizePreparedTokenPair(tokenPair);

    /*
     * Uma nova autorização inicia uma nova geração de sessão.
     * Isso também invalida qualquer refresh antigo em andamento.
     */
    sessionGeneration += 1;

    persistTokenPair(normalized);

    console.debug("[OAuth] Autenticação Twitch concluída.");
}

async function performRefresh(refreshToken, generation) {
    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
    });

    console.debug("[OAuth] Renovando access token.");

    let response;

    try {
        response = await fetch(TOKEN_ENDPOINT, {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            body,
            cache: "no-store",
        });
    } catch (error) {
        if (generation !== sessionGeneration) {
            return null;
        }

        console.error("[OAuth] Falha de rede ao renovar token.", error);

        throw error;
    }

    /*
     * Enquanto o request estava em andamento, o usuário pode
     * ter feito logout ou iniciado uma nova autenticação.
     */
    if (generation !== sessionGeneration) {
        return null;
    }

    const payload = await readJson(response);

    if (!response.ok) {
        console.warn("[OAuth] Twitch recusou refresh token.", {
            status: response.status,
            message: payload.message,
        });

        /*
         * Só remove a sessão se este ainda for exatamente
         * o refresh token que originou este request.
         */
        if (
            (response.status === 400 || response.status === 401) &&
            getRefreshToken() === refreshToken &&
            generation === sessionGeneration
        ) {
            invalidateLocalSession();
        }

        return null;
    }

    let tokenPair;

    try {
        /*
         * Exigimos access_token + refresh_token novo.
         *
         * Isso é importante porque refresh tokens de clientes
         * públicos no Device Flow são rotacionados.
         */
        tokenPair = normalizeTokenPair(payload);
    } catch (error) {
        console.error("[OAuth] Resposta de refresh inválida.", error);

        if (
            getRefreshToken() === refreshToken &&
            generation === sessionGeneration
        ) {
            invalidateLocalSession();
        }

        return null;
    }

    if (
        generation !== sessionGeneration ||
        getRefreshToken() !== refreshToken
    ) {
        return null;
    }

    persistTokenPair(tokenPair);

    console.debug("[OAuth] Access token renovado.");

    return tokenPair.accessToken;
}

export async function refreshAccessToken() {
    requireClientId();

    const refreshToken = getRefreshToken();

    if (!refreshToken) {
        console.warn("[OAuth] Não existe refresh token.");
        return null;
    }

    const generation = sessionGeneration;

    /*
     * Single-flight:
     *
     * se já houver um refresh acontecendo para esta sessão,
     * todas as chamadas reutilizam a mesma Promise.
     */
    if (refreshState?.generation === generation) {
        return refreshState.promise;
    }

    const promise = performRefresh(refreshToken, generation);

    refreshState = {
        generation,
        promise,
    };

    try {
        return await promise;
    } finally {
        if (refreshState?.promise === promise) {
            refreshState = null;
        }
    }
}

export async function validateToken(
    token = getAccessToken(),
    allowRefresh = true,
) {
    if (!token) {
        console.debug("[OAuth] Nenhum token para validar.");

        return null;
    }

    requireClientId();

    console.debug("[OAuth] Validando token.");

    let response;

    try {
        response = await fetch(VALIDATE_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${token}`,
            },

            cache: "no-store",
        });
    } catch (error) {
        /*
         * Falha de rede não significa token inválido.
         * Portanto não removemos a sessão.
         */
        console.error("[OAuth] Falha de rede ao validar token.", error);

        throw error;
    }

    const payload = await readJson(response);

    if (response.status === 401 && allowRefresh) {
        /*
         * Outra validação concorrente pode já ter renovado o
         * token enquanto esta requisição estava em andamento.
         */
        const currentToken = getAccessToken();

        if (currentToken && currentToken !== token) {
            return validateToken(currentToken, false);
        }

        console.debug("[OAuth] Access token inválido. Tentando refresh.");

        const newToken = await refreshAccessToken();

        if (!newToken) {
            return null;
        }

        return validateToken(newToken, false);
    }

    if (!response.ok) {
        console.warn("[OAuth] Token recusado pela Twitch.", {
            status: response.status,
            message: payload.message,
        });

        if (response.status === 401) {
            /*
             * Não apaga uma sessão nova caso este request
             * esteja validando um token antigo.
             */
            invalidateIfCurrentAccessToken(token);
        }

        return null;
    }

    if (payload.client_id !== CLIENT_ID) {
        console.error("[OAuth] Token pertence a outro Client ID.");

        invalidateIfCurrentAccessToken(token);

        return null;
    }

    let grantedScopes;

    try {
        grantedScopes = normalizeScopes(payload.scopes);

        /*
         * O app exige exatamente os scopes declarados.
         * Um token com permissões adicionais também é rejeitado.
         */
        assertExactScopes(grantedScopes);
    } catch (error) {
        console.error("[OAuth] Token com scopes inválidos.", error);

        invalidateIfCurrentAccessToken(token);

        return null;
    }

    if (
        typeof payload.user_id !== "string" ||
        !payload.user_id ||
        typeof payload.login !== "string" ||
        !payload.login
    ) {
        console.error("[OAuth] Token não representa um usuário válido.");

        invalidateIfCurrentAccessToken(token);

        return null;
    }

    console.debug("[OAuth] Token válido.", {
        login: payload.login,
        userId: payload.user_id,
        expiresIn: payload.expires_in,
        scopes: grantedScopes,
    });

    return {
        ...payload,
        scopes: grantedScopes,
    };
}

export async function disconnectTwitch() {
    const token = getAccessToken();

    if (!token) {
        logout();
        return;
    }

    requireClientId();

    const body = new URLSearchParams({
        client_id: CLIENT_ID,
        token,
    });

    console.debug("[OAuth] Revogando access token.");

    try {
        const response = await fetch(REVOKE_ENDPOINT, {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            body,
            cache: "no-store",
        });

        if (!response.ok) {
            const payload = await readJson(response);

            console.warn("[OAuth] Twitch recusou revogação do token.", {
                status: response.status,
                message: payload.message,
            });
        } else {
            console.debug("[OAuth] Access token revogado na Twitch.");
        }
    } catch (error) {
        /*
         * Mesmo se a revogação remota falhar,
         * removemos a sessão local.
         */
        console.error("[OAuth] Falha de rede ao revogar token.", error);
    } finally {
        logout();
    }
}

export { CLIENT_ID, SCOPES };
