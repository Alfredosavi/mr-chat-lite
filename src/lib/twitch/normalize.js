import { CHAT_SUBSCRIPTION_TYPES } from "./subscriptions.js";

export const CHAT_EVENT_KINDS = Object.freeze({
    MESSAGE: "message",
    MESSAGE_DELETE: "message-delete",
    CLEAR: "clear",
    CLEAR_USER_MESSAGES: "clear-user-messages",
    NOTIFICATION: "notification",
});

export class ChatNormalizeError extends Error {
    constructor(message, { code = "invalid_event" } = {}) {
        super(message);

        this.name = "ChatNormalizeError";
        this.code = code;
    }
}

function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrEmpty(value) {
    return typeof value === "string" ? value : "";
}

function stringOrNull(value) {
    return typeof value === "string" && value ? value : null;
}

function requiredString(value, fieldName) {
    if (typeof value !== "string" || !value) {
        throw new ChatNormalizeError(`Campo Twitch inválido: ${fieldName}.`);
    }

    return value;
}

function normalizeTimestamp(value) {
    const timestamp = requiredString(value, "message_timestamp");

    if (Number.isNaN(Date.parse(timestamp))) {
        throw new ChatNormalizeError("Timestamp EventSub inválido.", {
            code: "invalid_timestamp",
        });
    }

    return timestamp;
}

function normalizeChannel(event) {
    return Object.freeze({
        id: requiredString(event.broadcaster_user_id, "broadcaster_user_id"),

        login: requiredString(
            event.broadcaster_user_login,
            "broadcaster_user_login",
        ),

        displayName: requiredString(
            event.broadcaster_user_name,
            "broadcaster_user_name",
        ),
    });
}

function normalizeSender(event) {
    return Object.freeze({
        id: requiredString(event.chatter_user_id, "chatter_user_id"),
        login: requiredString(event.chatter_user_login, "chatter_user_login"),
        displayName: requiredString(
            event.chatter_user_name,
            "chatter_user_name",
        ),
    });
}

function normalizeNotificationSender(event) {
    return Object.freeze({
        id: stringOrNull(event.chatter_user_id),
        login: stringOrNull(event.chatter_user_login),
        displayName: stringOrNull(event.chatter_user_name),
        anonymous: event.chatter_is_anonymous === true,
    });
}

function normalizeTargetUser(event) {
    return Object.freeze({
        id: requiredString(event.target_user_id, "target_user_id"),
        login: requiredString(event.target_user_login, "target_user_login"),
        displayName: requiredString(event.target_user_name, "target_user_name"),
    });
}

function normalizeColor(value) {
    if (typeof value !== "string") {
        return null;
    }

    const color = value.trim();

    if (!color) {
        return null;
    }

    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
}

function normalizeBadge(badge) {
    if (!isObject(badge)) {
        return null;
    }

    const setId = stringOrNull(badge.set_id);

    const id = stringOrNull(badge.id);

    if (!setId || !id) {
        return null;
    }

    return Object.freeze({
        setId,
        id,
        info: stringOrEmpty(badge.info),
    });
}

function normalizeBadges(value) {
    if (!Array.isArray(value)) {
        return Object.freeze([]);
    }

    return Object.freeze(value.map(normalizeBadge).filter(Boolean));
}

function normalizeNonNegativeInteger(value) {
    const number = Number(value);

    return Number.isInteger(number) && number >= 0 ? number : null;
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) {
        return Object.freeze([]);
    }

    return Object.freeze(
        value.filter((item) => typeof item === "string" && item),
    );
}

function normalizeHttpsUrl(value) {
    if (typeof value !== "string" || !value) {
        return null;
    }

    try {
        const url = new URL(value);

        if (url.protocol !== "https:" || url.username || url.password) {
            return null;
        }

        return value;
    } catch {
        return null;
    }
}

function normalizeFragment(fragment) {
    if (!isObject(fragment)) {
        return Object.freeze({
            type: "text",
            text: "",
        });
    }

    const text = stringOrEmpty(fragment.text);

    switch (fragment.type) {
        case "emote": {
            const emoteId = stringOrNull(fragment.emote?.id);

            if (!emoteId) {
                return Object.freeze({
                    type: "text",
                    text,
                });
            }

            return Object.freeze({
                type: "emote",
                text,
                emoteId,
                emoteSetId: stringOrNull(fragment.emote?.emote_set_id),
                ownerId: stringOrNull(fragment.emote?.owner_id),
                formats: normalizeStringArray(fragment.emote?.format),
            });
        }

        case "mention": {
            const userId = stringOrNull(fragment.mention?.user_id);

            if (!userId) {
                return Object.freeze({
                    type: "text",
                    text,
                });
            }

            return Object.freeze({
                type: "mention",
                text,
                user: Object.freeze({
                    id: userId,
                    login: stringOrNull(fragment.mention?.user_login),
                    displayName: stringOrNull(fragment.mention?.user_name),
                }),
            });
        }

        case "cheermote": {
            const prefix = stringOrNull(fragment.cheermote?.prefix);

            const bits = normalizeNonNegativeInteger(fragment.cheermote?.bits);

            if (!prefix || bits === null) {
                return Object.freeze({
                    type: "text",
                    text,
                });
            }

            return Object.freeze({
                type: "cheermote",
                text,
                prefix,
                bits,
                tier: normalizeNonNegativeInteger(fragment.cheermote?.tier),
            });
        }

        case "gif": {
            const gifId = stringOrNull(fragment.gif?.gif_id);

            const url = normalizeHttpsUrl(fragment.gif?.url);

            if (!gifId || !url) {
                return Object.freeze({
                    type: "text",
                    text,
                });
            }

            return Object.freeze({
                type: "gif",
                text,
                gifId,
                url,
            });
        }

        case "text":
        default:
            /*
             * Tipos desconhecidos continuam
             * sendo exibíveis como texto.
             */
            return Object.freeze({
                type: "text",
                text,
            });
    }
}

function normalizeFragments(value) {
    if (!Array.isArray(value)) {
        return Object.freeze([]);
    }

    return Object.freeze(value.map(normalizeFragment));
}

function normalizeReply(reply) {
    if (!isObject(reply)) {
        return null;
    }

    return Object.freeze({
        parent: Object.freeze({
            messageId: requiredString(
                reply.parent_message_id,
                "reply.parent_message_id",
            ),

            text: stringOrEmpty(reply.parent_message_body),

            user: Object.freeze({
                id: requiredString(
                    reply.parent_user_id,
                    "reply.parent_user_id",
                ),

                login: requiredString(
                    reply.parent_user_login,
                    "reply.parent_user_login",
                ),

                displayName: requiredString(
                    reply.parent_user_name,
                    "reply.parent_user_name",
                ),
            }),
        }),

        thread: Object.freeze({
            messageId: requiredString(
                reply.thread_message_id,
                "reply.thread_message_id",
            ),

            user: Object.freeze({
                id: requiredString(
                    reply.thread_user_id,
                    "reply.thread_user_id",
                ),

                login: requiredString(
                    reply.thread_user_login,
                    "reply.thread_user_login",
                ),

                displayName: requiredString(
                    reply.thread_user_name,
                    "reply.thread_user_name",
                ),
            }),
        }),
    });
}

function normalizeSharedChat(event) {
    const sourceChannelId = stringOrNull(event.source_broadcaster_user_id);

    if (!sourceChannelId) {
        return null;
    }

    return Object.freeze({
        sourceChannel: Object.freeze({
            id: sourceChannelId,
            login: stringOrNull(event.source_broadcaster_user_login),
            displayName: stringOrNull(event.source_broadcaster_user_name),
        }),

        sourceMessageId: stringOrNull(event.source_message_id),
        sourceBadges: normalizeBadges(event.source_badges),
        sourceOnly: event.is_source_only === true,
    });
}

export function normalizeChatMessage(event, timestamp) {
    if (!isObject(event)) {
        throw new ChatNormalizeError("Evento channel.chat.message inválido.");
    }

    return Object.freeze({
        kind: CHAT_EVENT_KINDS.MESSAGE,
        id: requiredString(event.message_id, "message_id"),
        timestamp: normalizeTimestamp(timestamp),
        channel: normalizeChannel(event),
        sender: normalizeSender(event),
        messageType: stringOrEmpty(event.message_type) || "text",
        color: normalizeColor(event.color),
        badges: normalizeBadges(event.badges),
        text: stringOrEmpty(event.message?.text),
        fragments: normalizeFragments(event.message?.fragments),
        cheerBits: normalizeNonNegativeInteger(event.cheer?.bits),
        reply: normalizeReply(event.reply),

        channelPointsCustomRewardId: stringOrNull(
            event.channel_points_custom_reward_id,
        ),

        sharedChat: normalizeSharedChat(event),
    });
}

export function normalizeChatMessageDelete(event, timestamp) {
    if (!isObject(event)) {
        throw new ChatNormalizeError(
            "Evento channel.chat.message_delete inválido.",
        );
    }

    return Object.freeze({
        kind: CHAT_EVENT_KINDS.MESSAGE_DELETE,
        timestamp: normalizeTimestamp(timestamp),
        channel: normalizeChannel(event),
        targetUser: normalizeTargetUser(event),
        targetMessageId: requiredString(event.message_id, "message_id"),
    });
}

export function normalizeChatClear(event, timestamp) {
    if (!isObject(event)) {
        throw new ChatNormalizeError("Evento channel.chat.clear inválido.");
    }

    return Object.freeze({
        kind: CHAT_EVENT_KINDS.CLEAR,
        timestamp: normalizeTimestamp(timestamp),
        channel: normalizeChannel(event),
    });
}

export function normalizeChatClearUserMessages(event, timestamp) {
    if (!isObject(event)) {
        throw new ChatNormalizeError(
            "Evento channel.chat.clear_user_messages inválido.",
        );
    }

    return Object.freeze({
        kind: CHAT_EVENT_KINDS.CLEAR_USER_MESSAGES,
        timestamp: normalizeTimestamp(timestamp),
        channel: normalizeChannel(event),
        targetUser: normalizeTargetUser(event),
    });
}

export function normalizeChatNotification(event, timestamp) {
    if (!isObject(event)) {
        throw new ChatNormalizeError(
            "Evento channel.chat.notification inválido.",
        );
    }

    return Object.freeze({
        kind: CHAT_EVENT_KINDS.NOTIFICATION,
        id: requiredString(event.message_id, "message_id"),
        timestamp: normalizeTimestamp(timestamp),
        channel: normalizeChannel(event),

        /*
         * Notifications podem ser anônimas,
         * portanto usuário não é obrigatório.
         */
        sender: normalizeNotificationSender(event),
        noticeType: requiredString(event.notice_type, "notice_type"),
        systemMessage: stringOrEmpty(event.system_message),
        color: normalizeColor(event.color),
        badges: normalizeBadges(event.badges),
        text: stringOrEmpty(event.message?.text),
        fragments: normalizeFragments(event.message?.fragments),
    });
}

export function normalizeChatEvent(subscriptionType, event, timestamp) {
    switch (subscriptionType) {
        case CHAT_SUBSCRIPTION_TYPES.MESSAGE:
            return normalizeChatMessage(event, timestamp);

        case CHAT_SUBSCRIPTION_TYPES.MESSAGE_DELETE:
            return normalizeChatMessageDelete(event, timestamp);

        case CHAT_SUBSCRIPTION_TYPES.CLEAR:
            return normalizeChatClear(event, timestamp);

        case CHAT_SUBSCRIPTION_TYPES.CLEAR_USER_MESSAGES:
            return normalizeChatClearUserMessages(event, timestamp);

        case CHAT_SUBSCRIPTION_TYPES.NOTIFICATION:
            return normalizeChatNotification(event, timestamp);

        default:
            throw new ChatNormalizeError("Subscription de chat desconhecida.", {
                code: "unsupported_subscription",
            });
    }
}

export function normalizeEventSubNotification(message) {
    if (!isObject(message)) {
        throw new ChatNormalizeError("Notificação EventSub inválida.");
    }

    const subscriptionType = requiredString(
        message.metadata?.subscription_type,
        "metadata.subscription_type",
    );

    const timestamp = requiredString(
        message.metadata?.message_timestamp,
        "metadata.message_timestamp",
    );

    return normalizeChatEvent(
        subscriptionType,
        message.payload?.event,
        timestamp,
    );
}
