import { twitchApiRequest, TwitchApiError } from "./api.js";

export const CHAT_SUBSCRIPTION_TYPES = Object.freeze({
    MESSAGE: "channel.chat.message",
    MESSAGE_DELETE: "channel.chat.message_delete",
    CLEAR: "channel.chat.clear",
    CLEAR_USER_MESSAGES: "channel.chat.clear_user_messages",
    NOTIFICATION: "channel.chat.notification",
});

const CHAT_SUBSCRIPTIONS = Object.freeze([
    Object.freeze({
        type: CHAT_SUBSCRIPTION_TYPES.MESSAGE,
        version: "1",
        required: true,
    }),

    Object.freeze({
        type: CHAT_SUBSCRIPTION_TYPES.MESSAGE_DELETE,
        version: "1",
        required: false,
    }),

    Object.freeze({
        type: CHAT_SUBSCRIPTION_TYPES.CLEAR,
        version: "1",
        required: false,
    }),

    Object.freeze({
        type: CHAT_SUBSCRIPTION_TYPES.CLEAR_USER_MESSAGES,
        version: "1",
        required: false,
    }),

    Object.freeze({
        type: CHAT_SUBSCRIPTION_TYPES.NOTIFICATION,
        version: "1",
        required: false,
    }),
]);

function requiredString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
        throw new TwitchApiError(`${fieldName} inválido.`, {
            code: "invalid_subscription",
        });
    }

    return value.trim();
}

function requiredUserId(value, fieldName) {
    const normalized = requiredString(value, fieldName);

    if (!/^\d+$/.test(normalized)) {
        throw new TwitchApiError(`${fieldName} inválido.`, {
            code: "invalid_subscription",
        });
    }

    return normalized;
}

function normalizeSubscription(subscription) {
    if (
        !subscription ||
        typeof subscription !== "object" ||
        typeof subscription.id !== "string" ||
        !subscription.id ||
        typeof subscription.status !== "string" ||
        !subscription.status ||
        typeof subscription.type !== "string" ||
        !subscription.type
    ) {
        throw new TwitchApiError("Resposta EventSub inválida.", {
            code: "invalid_response",
        });
    }

    return Object.freeze({
        id: subscription.id,

        status: subscription.status,

        type: subscription.type,

        version:
            typeof subscription.version === "string"
                ? subscription.version
                : "",

        cost: Number.isFinite(subscription.cost) ? subscription.cost : 0,
    });
}

function normalizeSubscriptionError(error) {
    if (error instanceof TwitchApiError) {
        return Object.freeze({
            code: error.code,
            status: error.status,
        });
    }

    return Object.freeze({
        code: "unknown_error",
        status: 0,
    });
}

export async function createEventSubSubscription({
    type,
    version,
    condition,
    sessionId,
    signal = undefined,
}) {
    const normalizedType = requiredString(type, "Subscription type");

    const normalizedVersion = requiredString(version, "Subscription version");

    const normalizedSessionId = requiredString(
        sessionId,
        "EventSub session ID",
    );

    if (
        !condition ||
        typeof condition !== "object" ||
        Array.isArray(condition)
    ) {
        throw new TwitchApiError("Condição EventSub inválida.", {
            code: "invalid_subscription",
        });
    }

    const requestBody = {
        type: normalizedType,

        version: normalizedVersion,

        condition,

        transport: {
            method: "websocket",

            session_id: normalizedSessionId,
        },
    };

    const payload = await twitchApiRequest("eventsub/subscriptions", {
        method: "POST",

        headers: {
            "Content-Type": "application/json",
        },

        body: JSON.stringify(requestBody),

        signal,
    });

    if (!Array.isArray(payload?.data) || payload.data.length !== 1) {
        throw new TwitchApiError("Resposta EventSub inválida.", {
            code: "invalid_response",
        });
    }

    const subscription = normalizeSubscription(payload.data[0]);

    if (subscription.status !== "enabled") {
        throw new TwitchApiError(
            "A subscription EventSub não foi habilitada.",
            {
                code: "subscription_not_enabled",
            },
        );
    }

    return subscription;
}

function createChatCondition(broadcasterUserId, userId) {
    const broadcasterId = requiredUserId(
        broadcasterUserId,
        "Broadcaster User ID",
    );

    const authenticatedUserId = requiredUserId(userId, "User ID");

    return Object.freeze({
        broadcaster_user_id: broadcasterId,

        user_id: authenticatedUserId,
    });
}

function createChatSubscription(definition, condition, sessionId, signal) {
    return createEventSubSubscription({
        type: definition.type,

        version: definition.version,

        condition,
        sessionId,
        signal,
    });
}

export async function createChatSubscriptions({
    broadcasterUserId,
    userId,
    sessionId,
    signal = undefined,
}) {
    const normalizedSessionId = requiredString(
        sessionId,
        "EventSub session ID",
    );

    const condition = createChatCondition(broadcasterUserId, userId);

    const requiredDefinition = CHAT_SUBSCRIPTIONS.find((item) => item.required);

    const optionalDefinitions = CHAT_SUBSCRIPTIONS.filter(
        (item) => !item.required,
    );

    /*
     * A subscription principal é criada
     * primeiro.
     *
     * Se ela falhar, não há motivo para
     * continuar criando recursos auxiliares.
     */
    const required = await createChatSubscription(
        requiredDefinition,
        condition,
        normalizedSessionId,
        signal,
    );

    /*
     * As subscriptions complementares são
     * independentes entre si.
     *
     * Falhar uma não deve cancelar as outras.
     */
    const settled = await Promise.allSettled(
        optionalDefinitions.map((definition) =>
            createChatSubscription(
                definition,
                condition,
                normalizedSessionId,
                signal,
            ),
        ),
    );

    const optional = settled.map((result, index) => {
        const definition = optionalDefinitions[index];

        if (result.status === "fulfilled") {
            return Object.freeze({
                type: definition.type,

                status: "enabled",

                subscription: result.value,

                error: null,
            });
        }

        return Object.freeze({
            type: definition.type,

            status: "failed",

            subscription: null,

            error: normalizeSubscriptionError(result.reason),
        });
    });

    const enabled = Object.freeze([
        required,

        ...optional
            .filter((item) => item.status === "enabled")
            .map((item) => item.subscription),
    ]);

    const failed = Object.freeze(
        optional.filter((item) => item.status === "failed"),
    );

    return Object.freeze({
        required,
        optional: Object.freeze(optional),

        enabled,
        failed,
    });
}
