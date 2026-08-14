import {
    disconnectTwitch,
    getAccessToken,
    isTwitchConfigured,
    logout as logoutTwitch,
    validateToken,
} from "./twitch.js";

const DEFAULT_VALIDATION_INTERVAL_MS = 60 * 60 * 1000;
const DEFAULT_RETRY_INTERVAL_MS = 60 * 1000;

export const SESSION_STATUS = Object.freeze({
    IDLE: "idle",
    CHECKING: "checking",
    AUTHENTICATED: "authenticated",
    UNAUTHENTICATED: "unauthenticated",
    UNAVAILABLE: "unavailable",
    MISCONFIGURED: "misconfigured",
    DISCONNECTING: "disconnecting",
});

function positiveDelay(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createAuthSession({
    onUpdate = () => {},
    validationIntervalMs = DEFAULT_VALIDATION_INTERVAL_MS,
    retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS,
} = {}) {
    const validationInterval = positiveDelay(
        validationIntervalMs,
        DEFAULT_VALIDATION_INTERVAL_MS,
    );

    const retryInterval = positiveDelay(
        retryIntervalMs,
        DEFAULT_RETRY_INTERVAL_MS,
    );

    let destroyed = false;
    let started = false;

    let operationId = 0;

    let validationTimer = null;
    let validationPromise = null;

    let state = {
        status: SESSION_STATUS.IDLE,
        user: null,
        lastValidatedAt: null,
        validationError: null,
    };

    function getState() {
        return {
            ...state,

            user: state.user
                ? {
                      ...state.user,
                  }
                : null,
        };
    }

    function emit(patch) {
        if (destroyed) {
            return;
        }

        state = {
            ...state,
            ...patch,
        };

        try {
            onUpdate(getState());
        } catch (error) {
            console.error(
                "[Session] Erro ao notificar mudança de estado.",
                error,
            );
        }
    }

    function clearValidationTimer() {
        if (!validationTimer) {
            return;
        }

        clearTimeout(validationTimer);
        validationTimer = null;
    }

    function scheduleValidation(delayMs) {
        clearValidationTimer();

        if (destroyed) {
            return;
        }

        validationTimer = setTimeout(() => {
            void revalidate({
                background: true,
            });
        }, delayMs);
    }

    async function performValidation(id, background) {
        if (!isTwitchConfigured()) {
            emit({
                status: SESSION_STATUS.MISCONFIGURED,
                user: null,
                validationError: null,
            });

            return getState();
        }

        const token = getAccessToken();

        if (!token) {
            emit({
                status: SESSION_STATUS.UNAUTHENTICATED,
                user: null,
                lastValidatedAt: null,
                validationError: null,
            });

            return getState();
        }

        const wasAuthenticated = state.status === SESSION_STATUS.AUTHENTICATED;

        /*
         * Em validações periódicas não queremos fazer a
         * interface voltar para "carregando".
         */
        if (!background && !wasAuthenticated) {
            emit({
                status: SESSION_STATUS.CHECKING,
                validationError: null,
            });
        }

        let payload;

        try {
            payload = await validateToken(token);
        } catch (error) {
            /*
             * Uma operação mais recente tornou esta
             * resposta irrelevante.
             */
            if (destroyed || id !== operationId) {
                return getState();
            }

            /*
             * Falha de rede não significa que o token
             * ficou inválido.
             */
            console.error("[Session] Falha ao validar a sessão Twitch.", error);

            if (wasAuthenticated) {
                /*
                 * A sessão já havia sido validada antes.
                 *
                 * Mantemos o usuário autenticado, mas
                 * registramos que a última validação
                 * falhou por rede.
                 */
                emit({
                    status: SESSION_STATUS.AUTHENTICATED,

                    validationError: "network",
                });
            } else {
                /*
                 * Na inicialização ainda não conseguimos
                 * afirmar se o token é válido.
                 */
                emit({
                    status: SESSION_STATUS.UNAVAILABLE,

                    user: null,
                    validationError: "network",
                });
            }

            scheduleValidation(retryInterval);

            return getState();
        }

        if (destroyed || id !== operationId) {
            return getState();
        }

        /*
         * validateToken() retorna null quando a sessão
         * realmente não pode mais ser utilizada.
         */
        if (!payload) {
            emit({
                status: SESSION_STATUS.UNAUTHENTICATED,

                user: null,
                lastValidatedAt: null,
                validationError: null,
            });

            return getState();
        }

        const validatedAt = Date.now();

        emit({
            status: SESSION_STATUS.AUTHENTICATED,

            user: {
                id: payload.user_id,
                login: payload.login,
            },

            lastValidatedAt: validatedAt,
            validationError: null,
        });

        scheduleValidation(validationInterval);

        return getState();
    }

    function revalidate({ background = false, force = false } = {}) {
        if (destroyed) {
            return Promise.resolve(getState());
        }

        /*
         * Evita duas validações normais concorrentes.
         */
        if (validationPromise && !force) {
            return validationPromise;
        }

        clearValidationTimer();

        /*
         * Toda nova operação recebe um ID.
         *
         * Se uma resposta antiga chegar depois,
         * ela será ignorada.
         */
        const id = ++operationId;

        const promise = performValidation(id, background);

        validationPromise = promise;

        return promise.finally(() => {
            if (validationPromise === promise) {
                validationPromise = null;
            }
        });
    }

    function handleVisibilityChange() {
        if (document.visibilityState !== "visible") {
            return;
        }

        /*
         * Se a inicialização falhou por rede,
         * tenta novamente quando o usuário
         * volta para a página.
         */
        if (state.status === SESSION_STATUS.UNAVAILABLE) {
            void revalidate();
            return;
        }

        /*
         * Navegadores podem suspender timers de abas
         * em background. Quando a aba volta, verificamos
         * se já passou o intervalo.
         */
        if (
            state.status === SESSION_STATUS.AUTHENTICATED &&
            state.lastValidatedAt !== null &&
            Date.now() - state.lastValidatedAt >= validationInterval
        ) {
            void revalidate({
                background: true,
            });
        }
    }

    function handleOnline() {
        if (
            state.status === SESSION_STATUS.UNAVAILABLE ||
            state.validationError === "network"
        ) {
            void revalidate({
                background: state.status === SESSION_STATUS.AUTHENTICATED,
            });
        }
    }

    function attachBrowserListeners() {
        if (typeof document !== "undefined") {
            document.addEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        }

        if (typeof window !== "undefined") {
            window.addEventListener("online", handleOnline);
        }
    }

    function detachBrowserListeners() {
        if (typeof document !== "undefined") {
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange,
            );
        }

        if (typeof window !== "undefined") {
            window.removeEventListener("online", handleOnline);
        }
    }

    function start() {
        if (destroyed) {
            throw new Error("A sessão já foi destruída.");
        }

        if (!started) {
            started = true;
            attachBrowserListeners();
        }

        /*
         * A Twitch exige validação quando
         * a aplicação inicia.
         */
        return revalidate({
            force: true,
        });
    }

    function logout() {
        if (destroyed) {
            return;
        }

        /*
         * Invalida qualquer validação que
         * ainda esteja em andamento.
         */
        operationId += 1;
        validationPromise = null;

        clearValidationTimer();

        logoutTwitch();

        emit({
            status: SESSION_STATUS.UNAUTHENTICATED,

            user: null,
            lastValidatedAt: null,
            validationError: null,
        });
    }

    async function disconnect() {
        if (destroyed) {
            return getState();
        }

        const id = ++operationId;
        validationPromise = null;

        clearValidationTimer();

        emit({
            status: SESSION_STATUS.DISCONNECTING,

            validationError: null,
        });

        try {
            await disconnectTwitch();
        } catch (error) {
            /*
             * Mesmo se houver algum erro antes do
             * revoke remoto, garantimos que a sessão
             * local seja removida.
             */
            console.error("[Session] Falha ao desvincular Twitch.", error);

            logoutTwitch();
        }

        if (destroyed || id !== operationId) {
            return getState();
        }

        emit({
            status: SESSION_STATUS.UNAUTHENTICATED,

            user: null,
            lastValidatedAt: null,
            validationError: null,
        });

        return getState();
    }

    function destroy() {
        if (destroyed) {
            return;
        }

        operationId += 1;
        validationPromise = null;

        clearValidationTimer();
        detachBrowserListeners();

        destroyed = true;
        started = false;
    }

    return {
        start,
        revalidate,

        logout,
        disconnect,

        destroy,

        getState,
    };
}
