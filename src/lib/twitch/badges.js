import { writable } from "svelte/store";

import { twitchApiRequest } from "./api.js";

const EMPTY_BADGES = Object.freeze({});

const EMPTY_STATE = Object.freeze({
    status: "idle",
    broadcasterId: null,
    badges: EMPTY_BADGES,
});

const store = writable(EMPTY_STATE);

let loadGeneration = 0;

let globalCache = null;
let globalPromise = null;

const channelCache = new Map();

function badgeKey(setId, id) {
    return `${setId}:${id}`;
}

function normalizeHttpsUrl(value) {
    if (typeof value !== "string" || !value) {
        return null;
    }

    try {
        const url = new URL(value);

        if (
            url.protocol !== "https:" ||
            url.username ||
            url.password
        ) {
            return null;
        }

        return value;
    } catch {
        return null;
    }
}

function normalizeBadgeSets(value) {
    if (!Array.isArray(value)) {
        return Object.freeze({});
    }

    const result = {};

    for (const set of value) {
        if (
            !set ||
            typeof set !== "object" ||
            typeof set.set_id !== "string" ||
            !Array.isArray(set.versions)
        ) {
            continue;
        }

        for (const version of set.versions) {
            if (
                !version ||
                typeof version !== "object" ||
                typeof version.id !== "string"
            ) {
                continue;
            }

            /*
             * Usamos 2x para manter boa definição
             * mesmo renderizando pequeno no chat.
             */
            const imageUrl =
                normalizeHttpsUrl(version.image_url_2x) ??
                normalizeHttpsUrl(version.image_url_1x);

            if (!imageUrl) {
                continue;
            }

            const key = badgeKey(
                set.set_id,
                version.id,
            );

            result[key] = Object.freeze({
                key,

                setId: set.set_id,
                id: version.id,

                imageUrl,

                title:
                    typeof version.title === "string"
                        ? version.title
                        : "",

                description:
                    typeof version.description === "string"
                        ? version.description
                        : "",
            });
        }
    }

    return Object.freeze(result);
}

async function fetchGlobalBadges() {
    const payload = await twitchApiRequest(
        "chat/badges/global",
    );

    return normalizeBadgeSets(payload?.data);
}

async function fetchChannelBadges(
    broadcasterId,
) {
    const payload = await twitchApiRequest(
        "chat/badges",
        {
            params: {
                broadcaster_id:
                    broadcasterId,
            },
        },
    );

    return normalizeBadgeSets(payload?.data);
}

async function getGlobalBadges() {
    if (globalCache) {
        return globalCache;
    }

    if (globalPromise) {
        return globalPromise;
    }

    globalPromise = fetchGlobalBadges();

    try {
        globalCache = await globalPromise;

        return globalCache;
    } finally {
        globalPromise = null;
    }
}

async function getChannelBadges(
    broadcasterId,
) {
    if (channelCache.has(broadcasterId)) {
        return channelCache.get(
            broadcasterId,
        );
    }

    const badges =
        await fetchChannelBadges(
            broadcasterId,
        );

    channelCache.set(
        broadcasterId,
        badges,
    );

    return badges;
}

export const badgeCatalog = {
    subscribe: store.subscribe,
};

export async function loadBadgeCatalog(
    broadcasterId,
) {
    if (
        typeof broadcasterId !== "string" ||
        !broadcasterId
    ) {
        return;
    }

    const generation =
        ++loadGeneration;

    store.set(
        Object.freeze({
            status: "loading",
            broadcasterId,
            badges: EMPTY_BADGES,
        }),
    );

    const [
        globalResult,
        channelResult,
    ] = await Promise.allSettled([
        getGlobalBadges(),
        getChannelBadges(
            broadcasterId,
        ),
    ]);

    /*
     * Outra conexão foi iniciada enquanto
     * os catálogos estavam carregando.
     */
    if (generation !== loadGeneration) {
        return;
    }

    const globalBadges =
        globalResult.status === "fulfilled"
            ? globalResult.value
            : EMPTY_BADGES;

    const channelBadges =
        channelResult.status === "fulfilled"
            ? channelResult.value
            : EMPTY_BADGES;

    if (globalResult.status === "rejected") {
        console.warn(
            "[Badges] Catálogo global indisponível.",
            globalResult.reason,
        );
    }

    if (channelResult.status === "rejected") {
        console.warn(
            "[Badges] Catálogo do canal indisponível.",
            channelResult.reason,
        );
    }

    /*
     * Canal por último para prevalecer
     * caso exista a mesma combinação.
     */
    const badges = Object.freeze({
        ...globalBadges,
        ...channelBadges,
    });

    const status =
        globalResult.status === "fulfilled" &&
        channelResult.status === "fulfilled"
            ? "ready"
            : Object.keys(badges).length > 0
              ? "partial"
              : "error";

    store.set(
        Object.freeze({
            status,
            broadcasterId,
            badges,
        }),
    );

    console.log(
        "[Badges] Catálogo carregado.",
        {
            broadcasterId,
            count:
                Object.keys(badges).length,
            status,
        },
    );
}

export function clearBadgeCatalog() {
    loadGeneration += 1;

    store.set(EMPTY_STATE);
}

export function resolveBadge(
    catalog,
    setId,
    id,
) {
    if (
        !catalog?.badges ||
        typeof setId !== "string" ||
        typeof id !== "string"
    ) {
        return null;
    }

    return (
        catalog.badges[
            badgeKey(setId, id)
        ] ?? null
    );
}
