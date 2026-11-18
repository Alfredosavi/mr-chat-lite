import { writable } from "svelte/store";

const STORAGE_KEY = "mr-chat-lite.saved-messages";
export const MAX_SAVED_MESSAGES = 50;

function loadSavedMessages() {
    if (typeof localStorage === "undefined") {
        return [];
    }

    try {
        const stored = localStorage.getItem(STORAGE_KEY);

        if (!stored) {
            return [];
        }

        const parsed = JSON.parse(stored);

        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.warn(
            "[SavedMessages] Não foi possível carregar mensagens salvas.",
            error,
        );

        return [];
    }
}

function createSavedMessagesStore() {
    const { subscribe, update, set } = writable(loadSavedMessages());

    function persist(messages) {
        if (typeof localStorage === "undefined") {
            return;
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
        } catch (error) {
            console.error(
                "[SavedMessages] Não foi possível salvar no localStorage.",
                error,
            );
        }
    }

    function getMessageKey(message) {
        if (message.id) {
            return message.id;
        }

        return [message.time, message.name, message.text].join("|");
    }

    function save(message) {
        let saved = false;

        update((messages) => {
            const key = getMessageKey(message);

            const alreadySaved = messages.some((item) => item.key === key);

            if (alreadySaved) {
                return messages;
            }

            if (messages.length >= MAX_SAVED_MESSAGES) {
                console.warn(
                    `[SavedMessages] Limite de ${MAX_SAVED_MESSAGES} mensagens atingido.`,
                );

                return messages;
            }

            const nextMessages = [
                ...messages,
                {
                    key,

                    message: {
                        ...message,
                    },

                    savedAt: Date.now(),
                },
            ];

            persist(nextMessages);

            saved = true;

            console.log("[SavedMessages] Mensagem salva.", {
                key,
                message,
            });

            return nextMessages;
        });

        return saved;
    }

    function remove(key) {
        update((messages) => {
            const nextMessages = messages.filter((saved) => saved.key !== key);

            persist(nextMessages);

            return nextMessages;
        });
    }

    function clear() {
        set([]);

        if (typeof localStorage !== "undefined") {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    function isSaved(message, messages) {
        const key = getMessageKey(message);

        return messages.some((saved) => saved.key === key);
    }

    return {
        subscribe,
        save,
        remove,
        clear,
        isSaved,
        getMessageKey,
    };
}

export const savedMessages = createSavedMessagesStore();
