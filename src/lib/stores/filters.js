import { writable } from "svelte/store";

const USER_BLACKLIST_STORAGE_KEY = "mr-chat-lite.filters.user-blacklist";

const WORD_BLACKLIST_STORAGE_KEY = "mr-chat-lite.filters.word-blacklist";

export const MAX_BLACKLIST_USERS = 25;
export const MAX_BLACKLIST_WORDS = 50;

function normalizeLogin(value) {
    return String(value ?? "")
        .trim()
        .replace(/^@+/, "")
        .toLowerCase();
}

function normalizeTerm(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function normalizeUser({ id = "", login = "", displayName = "" } = {}) {
    const normalizedId = String(id ?? "").trim();
    const normalizedLogin = normalizeLogin(login);

    return {
        id: normalizedId || null,
        login: normalizedLogin,
        displayName: String(displayName ?? "").trim() || normalizedLogin,
    };
}

function getUserKey(user) {
    if (user.id) {
        return `id:${user.id}`;
    }

    return `login:${user.login}`;
}

function sameUser(a, b) {
    if (a.id && b.id && a.id === b.id) {
        return true;
    }

    return Boolean(a.login && b.login && a.login === b.login);
}

function getMessageUser(message) {
    return normalizeUser({
        id: message?.sender?.id ?? message?.userId ?? "",

        login:
            message?.sender?.login ??
            message?.userLogin ??
            message?.login ??
            message?.name ??
            "",

        displayName:
            message?.sender?.displayName ??
            message?.userDisplayName ??
            message?.displayName ??
            message?.name ??
            "",
    });
}

function loadUserBlacklist() {
    if (typeof localStorage === "undefined") {
        return [];
    }

    try {
        const stored = localStorage.getItem(USER_BLACKLIST_STORAGE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(
            "[Filters] Não foi possível carregar a blacklist de usuários.",
            error,
        );

        return [];
    }
}

function loadWordBlacklist() {
    if (typeof localStorage === "undefined") {
        return [];
    }

    try {
        const stored = localStorage.getItem(WORD_BLACKLIST_STORAGE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(
            "[Filters] Não foi possível carregar a blacklist de palavras.",
            error,
        );

        return [];
    }
}

function persistUserBlacklist(entries) {
    if (typeof localStorage === "undefined") {
        return;
    }

    try {
        localStorage.setItem(
            USER_BLACKLIST_STORAGE_KEY,
            JSON.stringify(entries),
        );
    } catch (error) {
        console.error(
            "[Filters] Não foi possível salvar a blacklist de usuários.",
            error,
        );
    }
}

function persistWordBlacklist(entries) {
    if (typeof localStorage === "undefined") {
        return;
    }

    try {
        localStorage.setItem(
            WORD_BLACKLIST_STORAGE_KEY,
            JSON.stringify(entries),
        );
    } catch (error) {
        console.error(
            "[Filters] Não foi possível salvar a blacklist de palavras.",
            error,
        );
    }
}

function createUserBlacklistStore() {
    const { subscribe, update, set } = writable(loadUserBlacklist());

    function addUser(user) {
        const normalized = normalizeUser(user);

        if (!normalized.id && !normalized.login) {
            return false;
        }

        let added = false;

        update((entries) => {
            const exists = entries.some((entry) => sameUser(entry, normalized));

            if (exists) {
                return entries;
            }

            if (entries.length >= MAX_BLACKLIST_USERS) {
                console.warn(
                    `[Filters] Limite de ${MAX_BLACKLIST_USERS} usuários na blacklist atingido.`,
                );

                return entries;
            }

            const nextEntries = [
                ...entries,
                {
                    ...normalized,
                    key: getUserKey(normalized),
                    addedAt: Date.now(),
                },
            ];

            persistUserBlacklist(nextEntries);

            added = true;

            console.log("[Filters] Usuário adicionado à blacklist.", {
                user: normalized,
            });

            return nextEntries;
        });

        return added;
    }

    function addLogin(login) {
        return addUser({
            login,
            displayName: login,
        });
    }

    function addMessageUser(message) {
        return addUser(getMessageUser(message));
    }

    function remove(key) {
        update((entries) => {
            const nextEntries = entries.filter((entry) => entry.key !== key);

            persistUserBlacklist(nextEntries);

            return nextEntries;
        });
    }

    function clear() {
        set([]);

        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(USER_BLACKLIST_STORAGE_KEY);
        }
    }

    function matchesMessage(message, entries) {
        const user = getMessageUser(message);

        return entries.some((entry) => sameUser(entry, user));
    }

    return {
        subscribe,

        addLogin,
        addMessageUser,

        remove,
        clear,

        matchesMessage,
    };
}

function createWordBlacklistStore() {
    const { subscribe, update, set } = writable(loadWordBlacklist());

    function add(term) {
        const originalTerm = String(term ?? "").trim();
        const normalizedTerm = normalizeTerm(term);

        if (!normalizedTerm) {
            return false;
        }

        let added = false;

        update((entries) => {
            const exists = entries.some(
                (entry) => entry.normalizedTerm === normalizedTerm,
            );

            if (exists) {
                return entries;
            }

            if (entries.length >= MAX_BLACKLIST_WORDS) {
                console.warn(
                    `[Filters] Limite de ${MAX_BLACKLIST_WORDS} palavras na blacklist atingido.`,
                );

                return entries;
            }

            const nextEntries = [
                ...entries,
                {
                    key: `term:${normalizedTerm}`,
                    term: originalTerm,
                    normalizedTerm,
                    addedAt: Date.now(),
                },
            ];

            persistWordBlacklist(nextEntries);

            added = true;

            console.log("[Filters] Palavra adicionada à blacklist.", {
                term: originalTerm,
            });

            return nextEntries;
        });

        return added;
    }

    function remove(key) {
        update((entries) => {
            const nextEntries = entries.filter((entry) => entry.key !== key);

            persistWordBlacklist(nextEntries);

            return nextEntries;
        });
    }

    function clear() {
        set([]);

        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(WORD_BLACKLIST_STORAGE_KEY);
        }
    }

    function matchesMessage(message, entries) {
        const text = normalizeTerm(message?.text);

        if (!text) {
            return false;
        }

        return entries.some((entry) => text.includes(entry.normalizedTerm));
    }

    return {
        subscribe,

        add,
        remove,
        clear,

        matchesMessage,
    };
}

export const userBlacklist = createUserBlacklistStore();

export const wordBlacklist = createWordBlacklistStore();
