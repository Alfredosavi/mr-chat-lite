const EVENTSUB_URL =
    "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";

const EVENTSUB_HOST = "eventsub.wss.twitch.tv";

const DEFAULT_KEEPALIVE_SECONDS = 30;

const WATCHDOG_GRACE_MS = 2000;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

const MAX_SEEN_MESSAGES = 1000;

export function createEventSubClient({
    onWelcome = async () => {},
    onNotification = () => {},
    onRevocation = () => {},
    onStateChange = () => {},
    onError = () => {},
} = {}) {
    let stopped = true;

    /*
     * socket:
     * conexão EventSub atualmente ativa.
     *
     * handoffSocket:
     * nova conexão criada durante um
     * session_reconnect solicitado pela Twitch.
     */
    let socket = null;
    let handoffSocket = null;

    let reconnectTimer = null;
    let watchdogTimer = null;

    let reconnectAttempt = 0;

    let sessionId = null;

    let keepaliveSeconds = DEFAULT_KEEPALIVE_SECONDS;

    const seenMessages = new Set();

    function safeCallback(callback, ...args) {
        try {
            callback(...args);
        } catch (error) {
            console.error("[EventSub] Callback lançou uma exceção.", error);
        }
    }

    function emitState(status, extra = {}) {
        safeCallback(onStateChange, {
            status,
            sessionId,
            ...extra,
        });
    }

    function emitError(error) {
        console.error("[EventSub] Erro.", error);

        safeCallback(onError, error);
    }

    function validateWebSocketUrl(value) {
        if (typeof value !== "string" || !value) {
            throw new Error("URL EventSub inválida.");
        }

        let parsed;

        try {
            parsed = new URL(value);
        } catch {
            throw new Error("URL EventSub inválida.");
        }

        if (
            parsed.protocol !== "wss:" ||
            parsed.hostname !== EVENTSUB_HOST ||
            parsed.username ||
            parsed.password ||
            (parsed.port && parsed.port !== "443")
        ) {
            throw new Error("URL EventSub inesperada.");
        }

        /*
         * Importante:
         *
         * Validamos usando URL, mas devolvemos
         * exatamente a string original.
         *
         * A Twitch exige que reconnect_url seja
         * utilizada sem modificações.
         */
        return value;
    }

    function safeClose(ws, code = 1000, reason = "") {
        if (!ws) {
            return;
        }

        if (
            ws.readyState === WebSocket.CLOSING ||
            ws.readyState === WebSocket.CLOSED
        ) {
            return;
        }

        try {
            ws.close(code, reason);
        } catch (error) {
            console.warn(
                "[EventSub] Não foi possível fechar o WebSocket.",
                error,
            );
        }
    }

    function clearWatchdog() {
        if (!watchdogTimer) {
            return;
        }

        clearTimeout(watchdogTimer);

        watchdogTimer = null;
    }

    function resetWatchdog() {
        clearWatchdog();

        if (stopped || !socket) {
            return;
        }

        /*
         * Guardamos qual socket este timer
         * está monitorando.
         *
         * Isso impede um timer antigo de
         * fechar uma conexão nova.
         */
        const watchedSocket = socket;

        watchdogTimer = setTimeout(
            () => {
                watchdogTimer = null;

                if (stopped || socket !== watchedSocket) {
                    return;
                }

                console.warn("[EventSub] Keepalive expirou; reconectando.", {
                    sessionId,
                    keepaliveSeconds,
                });

                safeClose(watchedSocket, 1000, "Keepalive timeout");
            },

            keepaliveSeconds * 1000 + WATCHDOG_GRACE_MS,
        );
    }

    function clearReconnectTimer() {
        if (!reconnectTimer) {
            return;
        }

        clearTimeout(reconnectTimer);

        reconnectTimer = null;
    }

    function getReconnectDelay() {
        const exponent = Math.min(reconnectAttempt, 10);

        return Math.min(
            RECONNECT_MAX_DELAY_MS,
            RECONNECT_BASE_DELAY_MS * 2 ** exponent,
        );
    }

    function scheduleReconnect(closeEvent = null) {
        if (stopped || reconnectTimer || handoffSocket) {
            return;
        }

        const delay = getReconnectDelay();

        reconnectAttempt += 1;

        console.warn("[EventSub] Reconexão agendada.", {
            code: closeEvent?.code ?? null,

            reason: closeEvent?.reason || "",

            clean: closeEvent?.wasClean ?? null,

            retryInMs: delay,

            attempt: reconnectAttempt,
        });

        emitState("reconnecting", {
            retryInMs: delay,

            attempt: reconnectAttempt,

            closeCode: closeEvent?.code ?? null,
        });

        reconnectTimer = setTimeout(
            () => {
                reconnectTimer = null;

                if (stopped) {
                    return;
                }

                openPrimary(EVENTSUB_URL);
            },

            delay,
        );
    }

    function rememberMessage(messageId) {
        if (typeof messageId !== "string" || !messageId) {
            return false;
        }

        if (seenMessages.has(messageId)) {
            return true;
        }

        seenMessages.add(messageId);

        if (seenMessages.size > MAX_SEEN_MESSAGES) {
            const oldest = seenMessages.values().next().value;

            seenMessages.delete(oldest);
        }

        return false;
    }

    function normalizeSession(message) {
        const session = message?.payload?.session;

        if (
            !session ||
            typeof session !== "object" ||
            typeof session.id !== "string" ||
            !session.id
        ) {
            throw new Error("Sessão EventSub inválida.");
        }

        const timeout = Number(session.keepalive_timeout_seconds);

        return {
            id: session.id,

            keepaliveSeconds:
                Number.isFinite(timeout) && timeout > 0
                    ? timeout
                    : DEFAULT_KEEPALIVE_SECONDS,
        };
    }

    async function handleWelcome(ws, message, handoff) {
        let session;

        try {
            session = normalizeSession(message);
        } catch (error) {
            emitError(error);

            if (ws === socket || ws === handoffSocket) {
                safeClose(ws, 1000, "Invalid welcome");
            }

            return;
        }

        /*
         * Welcome recebido durante um
         * session_reconnect.
         *
         * As subscriptions já foram migradas
         * pela Twitch. NÃO devemos recriá-las.
         */
        if (handoff) {
            if (ws !== handoffSocket) {
                return;
            }

            const oldSocket = socket;

            socket = ws;
            handoffSocket = null;

            sessionId = session.id;

            keepaliveSeconds = session.keepaliveSeconds;

            reconnectAttempt = 0;

            clearReconnectTimer();
            resetWatchdog();

            console.debug("[EventSub] Migração concluída.", {
                sessionId,
            });

            emitState("connected", {
                reconnected: true,
            });

            /*
             * Somente agora podemos fechar
             * a conexão antiga.
             */
            if (oldSocket && oldSocket !== ws) {
                safeClose(oldSocket, 1000, "Reconnect complete");
            }

            return;
        }

        /*
         * Welcome de uma conexão normal.
         */
        if (ws !== socket) {
            return;
        }

        sessionId = session.id;

        keepaliveSeconds = session.keepaliveSeconds;

        /*
         * O welcome define o timeout.
         * Começamos a monitorá-lo imediatamente.
         */
        resetWatchdog();

        emitState("subscribing");

        try {
            /*
             * O chamador cria aqui as
             * subscriptions desta sessão.
             */
            await onWelcome({
                sessionId,
                keepaliveSeconds,
            });
        } catch (error) {
            /*
             * Enquanto esperávamos a API,
             * outra conexão pode ter assumido
             * o lugar desta.
             *
             * Uma operação antiga nunca pode
             * derrubar a conexão nova.
             */
            if (stopped || ws !== socket) {
                return;
            }

            emitError(error);

            const retryable =
                error?.code === "network_error" ||
                error?.status === 429 ||
                error?.status >= 500;

            if (retryable) {
                // Uma sessão nova exige subscriptions novas.
                socket = null;
                sessionId = null;
                clearWatchdog();
                safeClose(ws, 1000, "Subscription retry");
                scheduleReconnect();
            } else {
                stop();
                emitState("error", { error });
            }

            return;
        }

        /*
         * Mesma proteção após o await.
         */
        if (stopped || ws !== socket) {
            return;
        }

        reconnectAttempt = 0;

        console.debug("[EventSub] Sessão pronta.", {
            sessionId,
        });

        emitState("connected", {
            reconnected: false,
        });
    }

    function handleReconnect(ws, message) {
        if (ws !== socket || handoffSocket) {
            return;
        }

        const reconnectUrl = message?.payload?.session?.reconnect_url;

        let validatedUrl;

        try {
            validatedUrl = validateWebSocketUrl(reconnectUrl);
        } catch (error) {
            emitError(error);
            return;
        }

        console.debug("[EventSub] Twitch solicitou migração da sessão.", {
            sessionId,
        });

        emitState("reconnecting", {
            migration: true,
        });

        /*
         * Não resetamos o watchdog aqui.
         *
         * Segundo o protocolo, somente
         * notification e session_keepalive
         * reiniciam o keepalive.
         */
        openHandoff(validatedUrl);
    }

    function handleNotification(ws, message) {
        if (ws !== socket) {
            return;
        }

        /*
         * Notification conta como atividade
         * válida para o keepalive.
         */
        resetWatchdog();

        const messageId = message?.metadata?.message_id;

        if (rememberMessage(messageId)) {
            console.debug("[EventSub] Notificação duplicada ignorada.", {
                messageId,
            });

            return;
        }

        safeCallback(onNotification, message);
    }

    function handleRevocation(ws, message) {
        if (ws !== socket) {
            return;
        }

        const messageId = message?.metadata?.message_id;

        if (rememberMessage(messageId)) {
            return;
        }

        safeCallback(onRevocation, message);
    }

    async function handleMessage(ws, event, handoff) {
        if (typeof event.data !== "string") {
            console.warn("[EventSub] Frame não textual ignorado.");

            return;
        }

        let message;

        try {
            message = JSON.parse(event.data);
        } catch (error) {
            console.warn("[EventSub] JSON inválido recebido.", error);

            return;
        }

        const messageType = message?.metadata?.message_type;

        switch (messageType) {
            case "session_welcome":
                await handleWelcome(ws, message, handoff);

                break;

            case "session_keepalive":
                /*
                 * Somente o socket principal
                 * controla nosso watchdog.
                 */
                if (ws === socket) {
                    resetWatchdog();
                }

                break;

            case "notification":
                handleNotification(ws, message);

                break;

            case "session_reconnect":
                handleReconnect(ws, message);

                break;

            case "revocation":
                handleRevocation(ws, message);

                break;

            default:
                console.warn("[EventSub] Tipo de mensagem desconhecido.", {
                    messageType,
                });
        }
    }

    function logClose(event, { migration = false } = {}) {
        console.warn("[EventSub] WebSocket fechado.", {
            code: event.code,

            reason: event.reason,

            clean: event.wasClean,

            migration,
        });
    }

    function handleClose(ws, event) {
        if (stopped) {
            return;
        }

        /*
         * Socket antigo já substituído.
         */
        if (ws !== socket && ws !== handoffSocket) {
            return;
        }

        /*
         * A conexão de migração falhou antes
         * de se tornar a principal.
         */
        if (ws === handoffSocket) {
            handoffSocket = null;

            logClose(event, {
                migration: true,
            });

            /*
             * Se o socket antigo ainda estiver
             * vivo, continuamos nele até a Twitch
             * fechá-lo ou solicitar outro fluxo.
             */
            if (socket && socket.readyState !== WebSocket.CLOSED) {
                return;
            }

            scheduleReconnect(event);

            return;
        }

        /*
         * O socket principal caiu.
         */
        if (ws === socket) {
            socket = null;

            sessionId = null;

            clearWatchdog();

            logClose(event);

            /*
             * Durante migração, o socket antigo
             * pode cair antes do novo receber
             * o welcome.
             *
             * Nesse caso aguardamos o handoff.
             */
            if (
                handoffSocket &&
                handoffSocket.readyState !== WebSocket.CLOSED
            ) {
                return;
            }

            scheduleReconnect(event);
        }
    }

    function attachSocket(ws, { handoff = false } = {}) {
        ws.addEventListener("message", (event) => {
            void handleMessage(ws, event, handoff);
        });

        ws.addEventListener("error", () => {
            if (stopped) {
                return;
            }

            emitError(
                new Error(
                    handoff
                        ? "Falha no WebSocket de migração EventSub."
                        : "Falha no WebSocket EventSub.",
                ),
            );
        });

        ws.addEventListener("close", (event) => {
            handleClose(ws, event);
        });
    }

    function openPrimary(url) {
        if (stopped) {
            return;
        }

        let validatedUrl;

        try {
            validatedUrl = validateWebSocketUrl(url);
        } catch (error) {
            emitError(error);

            scheduleReconnect();

            return;
        }

        emitState("connecting");

        let ws;

        try {
            ws = new WebSocket(validatedUrl);
        } catch (error) {
            emitError(error);

            scheduleReconnect();

            return;
        }

        socket = ws;

        attachSocket(ws);
        resetWatchdog();
    }

    function openHandoff(url) {
        if (stopped || handoffSocket) {
            return;
        }

        /*
         * validateWebSocketUrl já foi chamado
         * por handleReconnect, mas mantemos
         * esta função sem depender disso.
         */
        let validatedUrl;

        try {
            validatedUrl = validateWebSocketUrl(url);
        } catch (error) {
            emitError(error);
            return;
        }

        let ws;

        try {
            ws = new WebSocket(validatedUrl);
        } catch (error) {
            emitError(error);
            return;
        }

        handoffSocket = ws;

        attachSocket(ws, {
            handoff: true,
        });
    }

    function connect() {
        /*
         * connect() idempotente.
         */
        if (!stopped) {
            return;
        }

        stopped = false;

        reconnectAttempt = 0;

        seenMessages.clear();

        clearReconnectTimer();
        clearWatchdog();

        openPrimary(EVENTSUB_URL);
    }

    function stop() {
        if (stopped) {
            return;
        }

        stopped = true;

        clearReconnectTimer();
        clearWatchdog();

        const currentSocket = socket;

        const currentHandoff = handoffSocket;

        socket = null;
        handoffSocket = null;

        sessionId = null;

        reconnectAttempt = 0;

        seenMessages.clear();

        safeClose(currentSocket, 1000, "Client stopped");

        safeClose(currentHandoff, 1000, "Client stopped");

        emitState("disconnected");
    }

    return {
        connect,
        stop,
    };
}
