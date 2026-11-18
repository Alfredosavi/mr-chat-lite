import { createEventSubClient } from "../twitch/eventsub.js";

import {
    CHAT_SUBSCRIPTION_TYPES,
    createChatSubscriptions,
} from "../twitch/subscriptions.js";

import { getUserByLogin } from "../twitch/users.js";
import { normalizeEventSubNotification } from "../twitch/normalize.js";

import { createChatStore } from "./store.js";


export class ChatClientError extends Error {
    constructor(message, { code = "chat_client_error" } = {}) {
        super(message);

        this.name = "ChatClientError";
        this.code = code;
    }
}

function requiredChannelLogin(value) {
    if (typeof value !== "string" || !value.trim()) {
        throw new ChatClientError("Canal inválido.", {
            code: "invalid_channel",
        });
    }

    return value.trim();
}

function requiredUserId(value) {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        throw new ChatClientError("User ID inválido.", {
            code: "invalid_user_id",
        });
    }

    return value;
}

function createAbortError() {
    const error = new Error("Operação cancelada.");
    error.name = "AbortError";

    return error;
}

function isAbortError(error) {
    return error?.name === "AbortError";
}

export function createChatClient({
    maxItems = 2000,

    onStateChange = () => {},
    onSubscriptionWarning = () => {},
    onRevocation = () => {},
    onError = () => {},
} = {}) {
    const store = createChatStore({
        maxItems,
    });

    let generation = 0;

    let eventSubClient = null;
    let abortController = null;

    let channel = null;
    let authenticatedUserId = null;

    let state = Object.freeze({
        status: "idle",
        channel: null,
    });

    function safeCallback(callback, ...args) {
        try {
            callback(...args);
        } catch (error) {
            console.error("[ChatClient] Callback lançou uma exceção.", error);
        }
    }

    function emitState(status, extra = {}) {
        state = Object.freeze({
            status,
            channel,
            ...extra,
        });

        safeCallback(onStateChange, state);
    }

    function emitError(error) {
        console.error("[ChatClient] Erro.", error);

        safeCallback(onError, error);
    }

    function isCurrent(id, controller) {
        return id === generation && !controller.signal.aborted;
    }

    function stopCurrentTransport() {
        if (abortController) {
            abortController.abort();
            abortController = null;
        }

        if (eventSubClient) {
            eventSubClient.stop();
            eventSubClient = null;
        }
    }

    async function connect({ channelLogin, userId }) {
        const normalizedChannelLogin = requiredChannelLogin(channelLogin);
        const normalizedUserId = requiredUserId(userId);

        /*
         * Toda nova conexão invalida qualquer
         * operação da anterior.
         */
        const id = ++generation;
        stopCurrentTransport();

        channel = null;
        authenticatedUserId = normalizedUserId;

        /*
         * Canal novo = timeline nova.
         *
         * Reconexões internas do EventSub não
         * passam por connect(), portanto não
         * apagam o histórico.
         */
        store.reset();

        emitState("resolving", {
            channelLogin: normalizedChannelLogin,
        });

        const controller = new AbortController();
        abortController = controller;

        let broadcaster;

        try {
            broadcaster = await getUserByLogin(normalizedChannelLogin, {
                signal: controller.signal,
            });
        } catch (error) {
            /*
             * Troca de canal/logout enquanto
             * GET /users estava em andamento.
             */
            if (!isCurrent(id, controller) || isAbortError(error)) {
                return null;
            }

            if (abortController === controller) {
                abortController = null;
            }

            emitState("error", {
                code: "resolve_failed",
            });

            emitError(error);

            throw error;
        }

        if (!isCurrent(id, controller)) {
            return null;
        }

        if (!broadcaster) {
            const error = new ChatClientError(
                `Canal "${normalizedChannelLogin}" não encontrado.`,
                {
                    code: "channel_not_found",
                },
            );

            if (abortController === controller) {
                abortController = null;
            }

            authenticatedUserId = null;

            emitState("error", {
                code: "channel_not_found",
            });

            emitError(error);

            throw error;
        }

        channel = broadcaster;

        const transport = createEventSubClient({
            async onWelcome({ sessionId }) {
                if (!isCurrent(id, controller)) {
                    throw createAbortError();
                }

                const subscriptions = await createChatSubscriptions({
                    broadcasterUserId: broadcaster.id,
                    userId: normalizedUserId,
                    sessionId,
                    signal: controller.signal,
                });

                /*
                 * A requisição pode terminar
                 * depois de logout/troca de canal.
                 */
                if (!isCurrent(id, controller)) {
                    throw createAbortError();
                }

                if (subscriptions.failed.length > 0) {
                    safeCallback(
                        onSubscriptionWarning,

                        Object.freeze({
                            channel: broadcaster,
                            failed: subscriptions.failed,
                        }),
                    );
                }
            },

            onNotification(message) {
                if (!isCurrent(id, controller)) {
                    return;
                }

                try {
                    const event = normalizeEventSubNotification(message);

                    store.apply(event);
                } catch (error) {
                    /*
                     * Um payload ruim não deve
                     * derrubar todo o WebSocket.
                     */
                    emitError(error);
                }
            },

            onRevocation(message) {
                if (!isCurrent(id, controller)) {
                    return;
                }

                const subscription = message?.payload?.subscription ?? null;

                safeCallback(
                    onRevocation,

                    Object.freeze({
                        channel: broadcaster,
                        subscription,
                        required:
                            subscription?.type ===
                            CHAT_SUBSCRIPTION_TYPES.MESSAGE,
                    }),
                );
            },

            onStateChange(transportState) {
                if (!isCurrent(id, controller)) {
                    return;
                }

                emitState(transportState.status, {
                    sessionId: transportState.sessionId ?? null,
                    retryInMs: transportState.retryInMs ?? null,
                    attempt: transportState.attempt ?? null,
                    migration: transportState.migration === true,
                });
            },

            onError(error) {
                if (!isCurrent(id, controller)) {
                    return;
                }

                emitError(error);
            },
        });

        /*
         * Pode ter ocorrido uma troca enquanto
         * criávamos a instância.
         */
        if (!isCurrent(id, controller)) {
            transport.stop();

            return null;
        }

        eventSubClient = transport;
        transport.connect();

        return broadcaster;
    }

    function disconnect({ reset = true } = {}) {
        /*
         * Invalida imediatamente callbacks e
         * requests da conexão anterior.
         */
        generation += 1;

        stopCurrentTransport();

        channel = null;
        authenticatedUserId = null;

        if (reset) {
            store.reset();
        }

        emitState("disconnected");
    }

    function getChannel() {
        return channel;
    }

    function getAuthenticatedUserId() {
        return authenticatedUserId;
    }

    function getState() {
        return state;
    }

    return {
        connect,
        disconnect,
        store,
        getChannel,
        getAuthenticatedUserId,
        getState,
    };
}
