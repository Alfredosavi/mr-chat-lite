import { writable } from "svelte/store";

import { twitchApiRequest } from "./api.js";

const REFRESH_INTERVAL_MS = 60_000;

const EMPTY_STATE = Object.freeze({
    status: "idle",

    broadcasterId: null,

    live: false,

    title: "",
    category: "",

    viewers: null,
    startedAt: null,

    lastUpdatedAt: null,
});

const store = writable(EMPTY_STATE);

let generation = 0;
let refreshTimer = null;
let currentBroadcasterId = null;

function clearRefreshTimer() {
    if (!refreshTimer) {
        return;
    }

    clearInterval(refreshTimer);
    refreshTimer = null;
}

function requiredBroadcasterId(value) {
    const id = String(value ?? "").trim();

    if (!/^\d+$/.test(id)) {
        throw new Error(
            "Broadcaster ID inválido.",
        );
    }

    return id;
}

async function getChannelInfo(
    broadcasterId,
) {
    const payload =
        await twitchApiRequest(
            "channels",
            {
                params: {
                    broadcaster_id:
                        broadcasterId,
                },
            },
        );

    if (!Array.isArray(payload?.data)) {
        throw new Error(
            "Resposta de canal inválida.",
        );
    }

    return payload.data[0] ?? null;
}

async function getStreamInfo(
    broadcasterId,
) {
    const payload =
        await twitchApiRequest(
            "streams",
            {
                params: {
                    user_id:
                        broadcasterId,
                },
            },
        );

    if (!Array.isArray(payload?.data)) {
        throw new Error(
            "Resposta de stream inválida.",
        );
    }

    /*
     * Array vazio significa que o canal
     * está offline.
     */
    return payload.data[0] ?? null;
}

async function refresh(
    broadcasterId,
    expectedGeneration,
) {
    const [
        channelResult,
        streamResult,
    ] = await Promise.allSettled([
        getChannelInfo(
            broadcasterId,
        ),

        getStreamInfo(
            broadcasterId,
        ),
    ]);

    /*
     * O usuário pode ter trocado de canal
     * enquanto as requests estavam em andamento.
     */
    if (
        expectedGeneration !==
        generation
    ) {
        return;
    }

    if (
        channelResult.status ===
            "rejected" &&
        streamResult.status ===
            "rejected"
    ) {
        console.error(
            "[LiveInfo] Não foi possível atualizar informações da live.",
            {
                channel:
                    channelResult.reason,

                stream:
                    streamResult.reason,
            },
        );

        store.update(
            (state) =>
                Object.freeze({
                    ...state,
                    status: "error",
                }),
        );

        return;
    }

    if (
        channelResult.status ===
        "rejected"
    ) {
        console.warn(
            "[LiveInfo] Informações do canal indisponíveis.",
            channelResult.reason,
        );
    }

    if (
        streamResult.status ===
        "rejected"
    ) {
        console.warn(
            "[LiveInfo] Informações da live indisponíveis.",
            streamResult.reason,
        );
    }

    const channel =
        channelResult.status ===
        "fulfilled"
            ? channelResult.value
            : null;

    const stream =
        streamResult.status ===
        "fulfilled"
            ? streamResult.value
            : null;

    const live =
        Boolean(stream);

    /*
     * Quando está ao vivo, preferimos os
     * dados do objeto stream.
     *
     * Offline, channels ainda informa o
     * último título/categoria configurados.
     */
    const title =
        stream?.title ??
        channel?.title ??
        "";

    const category =
        stream?.game_name ??
        channel?.game_name ??
        "";

    const viewers =
        live &&
        Number.isInteger(
            stream?.viewer_count,
        )
            ? stream.viewer_count
            : null;

    const startedAt =
        live &&
        typeof stream?.started_at ===
            "string"
            ? stream.started_at
            : null;

    const status =
        channelResult.status ===
            "fulfilled" &&
        streamResult.status ===
            "fulfilled"
            ? "ready"
            : "partial";

    store.set(
        Object.freeze({
            status,

            broadcasterId,

            live,

            title,
            category,

            viewers,
            startedAt,

            lastUpdatedAt:
                Date.now(),
        }),
    );

    console.log(
        "[LiveInfo] Informações atualizadas.",
        {
            broadcasterId,
            live,
            title,
            category,
            viewers,
            startedAt,
        },
    );
}

export const liveInfo = {
    subscribe: store.subscribe,
};

export async function startLiveInfo(
    broadcasterId,
) {
    const id =
        requiredBroadcasterId(
            broadcasterId,
        );

    const currentGeneration =
        ++generation;

    clearRefreshTimer();

    currentBroadcasterId = id;

    store.set(
        Object.freeze({
            ...EMPTY_STATE,

            status: "loading",
            broadcasterId: id,
        }),
    );

    await refresh(
        id,
        currentGeneration,
    );

    if (
        generation !==
        currentGeneration
    ) {
        return;
    }

    refreshTimer = setInterval(
        () => {
            void refresh(
                id,
                currentGeneration,
            );
        },

        REFRESH_INTERVAL_MS,
    );
}

export function refreshLiveInfo() {
    if (!currentBroadcasterId) {
        return Promise.resolve();
    }

    return refresh(
        currentBroadcasterId,
        generation,
    );
}

export function stopLiveInfo() {
    generation += 1;

    clearRefreshTimer();

    currentBroadcasterId = null;

    store.set(
        EMPTY_STATE,
    );
}
