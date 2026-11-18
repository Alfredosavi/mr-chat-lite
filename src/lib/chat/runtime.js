import { createChatClient } from "./client.js";
import { getCurrentUser } from "../twitch/users.js";
import { clearBadgeCatalog, loadBadgeCatalog } from "../twitch/badges.js";

import { startLiveInfo, stopLiveInfo } from "../twitch/live-info.js";

let connectionPromise = null;

const chatClient = createChatClient({
    onStateChange(state) {
        console.log("[ChatRuntime] Estado do chat.", state);
    },

    onSubscriptionWarning(warning) {
        console.warn(
            "[ChatRuntime] Algumas subscriptions não foram ativadas.",
            warning,
        );
    },

    onRevocation(info) {
        console.warn("[ChatRuntime] Subscription revogada.", info);
    },

    onError(error) {
        console.error("[ChatRuntime] Erro no chat.", error);
    },
});

export const chatStore = chatClient.store;

export async function connectChat({ channelLogin = "" } = {}) {
    /*
     * Evita duas inicializações simultâneas.
     */
    if (connectionPromise) {
        return connectionPromise;
    }

    const promise = (async () => {
        const currentUser = await getCurrentUser();

        const targetChannel =
            String(channelLogin ?? "").trim() || currentUser.login;

        const broadcaster = await chatClient.connect({
            channelLogin: targetChannel,
            userId: currentUser.id,
        });

        if (broadcaster) {
    void loadBadgeCatalog(
        broadcaster.id,
    );

    void startLiveInfo(
        broadcaster.id,
    );
}

        return Object.freeze({
            currentUser,
            broadcaster,
        });
    })();

    connectionPromise = promise;

    try {
        return await promise;
    } finally {
        if (connectionPromise === promise) {
            connectionPromise = null;
        }
    }
}

export function disconnectChat({ reset = true } = {}) {
    connectionPromise = null;

    stopLiveInfo();
    clearBadgeCatalog();

    chatClient.disconnect({
        reset,
    });
}

export function getChatState() {
    return chatClient.getState();
}
