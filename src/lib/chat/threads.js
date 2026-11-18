import { CHAT_EVENT_KINDS } from "../twitch/normalize.js";

function isMessageItem(item) {
    return (
        item?.kind === CHAT_EVENT_KINDS.MESSAGE &&
        typeof item.event?.id === "string" &&
        item.event.id
    );
}

export function resolveThread(items, messageId) {
    if (!Array.isArray(items) || typeof messageId !== "string" || !messageId) {
        return null;
    }

    const selected = items.find(
        (item) => isMessageItem(item) && item.event.id === messageId,
    );

    if (!selected) {
        return null;
    }

    const reply = selected.event.reply;

    /*
     * Mensagem sem reply é a própria raiz
     * da eventual thread.
     */
    const rootMessageId = reply?.thread?.messageId || selected.event.id;

    const messages = items.filter((item) => {
        if (!isMessageItem(item)) {
            return false;
        }

        if (item.event.id === rootMessageId) {
            return true;
        }

        return item.event.reply?.thread?.messageId === rootMessageId;
    });

    const availableIds = new Set(messages.map((item) => item.event.id));

    /*
     * Se a mensagem respondida aconteceu
     * antes de o Mr Chat Lite conectar,
     * talvez ela não exista no buffer.
     *
     * A Twitch ainda fornece o texto do parent.
     */
    const missingParent =
        reply?.parent && !availableIds.has(reply.parent.messageId)
            ? reply.parent
            : null;

    /*
     * Para a raiz a Twitch fornece ID/usuário,
     * mas não necessariamente o texto.
     */
    const missingRoot =
        reply?.thread && !availableIds.has(rootMessageId)
            ? Object.freeze({
                  messageId: rootMessageId,
                  user: reply.thread.user,
              })
            : null;

    return Object.freeze({
        rootMessageId,
        selectedMessageId: selected.event.id,
        messages: Object.freeze([...messages]),
        missingParent,
        missingRoot,
    });
}
