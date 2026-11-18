import { writable } from "svelte/store";

import { CHAT_EVENT_KINDS } from "../twitch/normalize.js";

import { resolveThread } from "./threads.js";

const DEFAULT_MAX_ITEMS = 2000;

function positiveInteger(value, fallback) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function freezeModeration({ reason, timestamp, targetUser = null }) {
    return Object.freeze({
        deleted: true,
        reason,
        timestamp,
        targetUser,
    });
}

export function createChatStore({ maxItems = DEFAULT_MAX_ITEMS } = {}) {
    const limit = positiveInteger(maxItems, DEFAULT_MAX_ITEMS);

    let items = [];
    let sequence = 0;
    let lastEventAt = null;

    /*
     * messageId → posição no buffer.
     */
    const messageIndex = new Map();

    /*
     * Proteção adicional contra inserção
     * duplicada mesmo que EventSub já faça
     * deduplicação.
     */
    const contentKeys = new Set();

    const store = writable(
        Object.freeze({
            items: Object.freeze([]),
            size: 0,
            lastEventAt: null,
        }),
    );

    function createState() {
        return Object.freeze({
            items: Object.freeze([...items]),
            size: items.length,
            lastEventAt,
        });
    }

    function publish(timestamp) {
        if (typeof timestamp === "string" && timestamp) {
            lastEventAt = timestamp;
        }

        store.set(createState());
    }

    function rebuildIndexes() {
        messageIndex.clear();
        contentKeys.clear();

        items.forEach((item, index) => {
            if (item.kind === CHAT_EVENT_KINDS.MESSAGE && item.event?.id) {
                messageIndex.set(item.event.id, index);
            }

            if (
                (item.kind === CHAT_EVENT_KINDS.MESSAGE ||
                    item.kind === CHAT_EVENT_KINDS.NOTIFICATION) &&
                item.event?.id
            ) {
                contentKeys.add(`${item.kind}:${item.event.id}`);
            }
        });
    }

    function prune() {
        if (items.length <= limit) {
            return;
        }

        const removeCount = items.length - limit;
        items = items.slice(removeCount);
        rebuildIndexes();
    }

    function appendContent(event) {
        const key = `${event.kind}:${event.id}`;

        if (contentKeys.has(key)) {
            return false;
        }

        const item = Object.freeze({
            key,
            kind: event.kind,
            event,
            moderation: null,
        });

        items.push(item);
        contentKeys.add(key);

        if (event.kind === CHAT_EVENT_KINDS.MESSAGE) {
            messageIndex.set(event.id, items.length - 1);
        }

        return true;
    }

    function appendModerationEvent(event) {
        sequence += 1;

        items.push(
            Object.freeze({
                key: `moderation:${sequence}`,
                kind: event.kind,
                event,
                moderation: null,
            }),
        );
    }

    function markMessageDeleted(
        index,
        { reason, timestamp, targetUser = null },
    ) {
        const item = items[index];

        if (!item || item.kind !== CHAT_EVENT_KINDS.MESSAGE) {
            return false;
        }

        /*
         * Mantemos a primeira causa específica
         * de remoção.
         *
         * Ex.: message-delete é mais útil que
         * um clear posterior.
         */
        if (item.moderation) {
            return false;
        }

        items[index] = Object.freeze({
            ...item,

            moderation: freezeModeration({
                reason,
                timestamp,
                targetUser,
            }),
        });

        return true;
    }

    function applyMessageDelete(event) {
        const index = messageIndex.get(event.targetMessageId);

        let affected = 0;

        if (index !== undefined) {
            affected = markMessageDeleted(index, {
                reason: CHAT_EVENT_KINDS.MESSAGE_DELETE,
                timestamp: event.timestamp,
                targetUser: event.targetUser,
            })
                ? 1
                : 0;
        }

        appendModerationEvent(event);

        return affected;
    }

    function applyClearUserMessages(event) {
        let affected = 0;

        items.forEach((item, index) => {
            if (item.kind !== CHAT_EVENT_KINDS.MESSAGE) {
                return;
            }

            if (item.event.sender?.id !== event.targetUser.id) {
                return;
            }

            if (
                markMessageDeleted(index, {
                    reason: CHAT_EVENT_KINDS.CLEAR_USER_MESSAGES,
                    timestamp: event.timestamp,
                    targetUser: event.targetUser,
                })
            ) {
                affected += 1;
            }
        });

        appendModerationEvent(event);

        return affected;
    }

    function applyClear(event) {
        let affected = 0;

        items.forEach((item, index) => {
            if (item.kind !== CHAT_EVENT_KINDS.MESSAGE) {
                return;
            }

            if (
                markMessageDeleted(index, {
                    reason: CHAT_EVENT_KINDS.CLEAR,
                    timestamp: event.timestamp,
                })
            ) {
                affected += 1;
            }
        });

        appendModerationEvent(event);

        return affected;
    }

    function apply(event) {
        if (!event || typeof event !== "object") {
            throw new TypeError("Evento de chat inválido.");
        }

        let affectedMessages = 0;
        let inserted = true;

        switch (event.kind) {
            case CHAT_EVENT_KINDS.MESSAGE:
            case CHAT_EVENT_KINDS.NOTIFICATION:
                inserted = appendContent(event);

                /*
                 * Duplicata não precisa publicar
                 * um novo estado.
                 */
                if (!inserted) {
                    return Object.freeze({
                        applied: false,
                        reason: "duplicate",

                        affectedMessages: 0,
                    });
                }
                break;

            case CHAT_EVENT_KINDS.MESSAGE_DELETE:
                affectedMessages = applyMessageDelete(event);
                break;

            case CHAT_EVENT_KINDS.CLEAR_USER_MESSAGES:
                affectedMessages = applyClearUserMessages(event);
                break;

            case CHAT_EVENT_KINDS.CLEAR:
                affectedMessages = applyClear(event);
                break;

            default:
                throw new TypeError(
                    `Tipo de evento de chat desconhecido: ${String(event.kind)}`,
                );
        }

        prune();

        /*
         * prune() pode alterar todos os índices.
         *
         * Quando não houve prune, substituir um
         * item mantém os índices existentes.
         */
        publish(event.timestamp);

        return Object.freeze({
            applied: true,
            affectedMessages,
        });
    }

    function getMessage(messageId) {
        if (typeof messageId !== "string" || !messageId) {
            return null;
        }

        const index = messageIndex.get(messageId);

        if (index === undefined) {
            return null;
        }

        return items[index] ?? null;
    }

    function getThread(messageId) {
        return resolveThread(items, messageId);
    }

    function getState() {
        return createState();
    }

    function reset() {
        items = [];
        sequence = 0;
        lastEventAt = null;

        messageIndex.clear();
        contentKeys.clear();

        publish(null);
    }

    return {
        subscribe: store.subscribe,
        apply,
        getMessage,
        getThread,
        getState,
        reset,
    };
}
