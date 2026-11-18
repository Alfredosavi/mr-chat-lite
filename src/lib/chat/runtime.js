import { createChatClient } from "./client.js";
import { getCurrentUser } from "../twitch/users.js";
import { clearBadgeCatalog, loadBadgeCatalog } from "../twitch/badges.js";

import { startLiveInfo, stopLiveInfo } from "../twitch/live-info.js";

let connectionPromise = null;
let connectionController = null;
let generation = 0;

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

    const id = ++generation;
    const controller = new AbortController();
    connectionController = controller;

    function assertCurrent() {
        if (id !== generation || controller.signal.aborted) {
            throw new DOMException("Operação cancelada.", "AbortError");
        }
    }

    const promise = (async () => {
        const currentUser = await getCurrentUser({ signal: controller.signal });
        assertCurrent();

        const targetChannel =
            String(channelLogin ?? "").trim() || currentUser.login;

        const broadcaster = await chatClient.connect({
            channelLogin: targetChannel,
            userId: currentUser.id,
        });

        assertCurrent();

        if (!broadcaster) {
            throw new DOMException("Operação cancelada.", "AbortError");
        }

        void loadBadgeCatalog(broadcaster.id);
        void startLiveInfo(broadcaster.id);

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
            connectionController = null;
        }
    }
}

export function disconnectChat({ reset = true } = {}) {
    generation += 1;
    connectionController?.abort();
    connectionController = null;
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
