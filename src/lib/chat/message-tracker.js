// Mantém apenas os IDs do buffer atual, inclusive os ocultos por filtros.
export function createMessageTracker() {
    let previousIds = new Set();

    return {
        update(sourceMessages, visibleMessages) {
            const added = visibleMessages.filter(
                (message) => !previousIds.has(message.id),
            ).length;

            previousIds = new Set(sourceMessages.map((message) => message.id));

            return added;
        },
    };
}
