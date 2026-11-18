<script>
    import {
        onMount,
        tick,
    } from "svelte";

    import ChatMessage from "./ChatMessage.svelte";
    import { createMessageTracker } from "../../lib/chat/message-tracker.js";

    import {
        chatStore,
    } from "../../lib/chat/runtime.js";

    import {
        CHAT_EVENT_KINDS,
    } from "../../lib/twitch/normalize.js";

    import {
        userBlacklist,
        wordBlacklist,
    } from "../../lib/stores/filters.js";

    import {
        displaySettings,
        CHAT_PAUSE_MODES,
    } from "../../lib/stores/display-settings.js";

    const BOTTOM_THRESHOLD = 24;

    let messagesElement;

    /*
     * Pausa permanente causada pelo usuário
     * ter rolado para cima.
     */
    let manualPaused = false;

    /*
     * Estados temporários.
     */
    let mouseOverChat = false;
    let altPressed = false;
    let temporaryPauseDismissed = false;

    let newMessageCount = 0;

    const messageTracker = createMessageTracker();

    let scrollGeneration = 0;

    $: pauseMode =
        $displaySettings.pauseMode;

    $: temporaryPaused = !temporaryPauseDismissed && (
        (
            (
                pauseMode ===
                    CHAT_PAUSE_MODES.MOUSE ||
                pauseMode ===
                    CHAT_PAUSE_MODES.MOUSE_OR_ALT
            ) &&
            mouseOverChat
        ) ||
        (
            (
                pauseMode ===
                    CHAT_PAUSE_MODES.ALT ||
                pauseMode ===
                    CHAT_PAUSE_MODES.MOUSE_OR_ALT
            ) &&
            altPressed
        ));

    $: chatPaused =
        manualPaused ||
        temporaryPaused;

    $: chatMessages = $chatStore.items
        .filter(
            (item) =>
                item.kind ===
                    CHAT_EVENT_KINDS.MESSAGE &&
                !item.moderation?.deleted,
        )
        .map(
            (item) =>
                item.event,
        );

    $: visibleMessages =
        chatMessages.filter(
            (message) => {
                const blockedByUser =
                    userBlacklist.matchesMessage(
                        message,
                        $userBlacklist,
                    );

                const blockedByWord =
                    wordBlacklist.matchesMessage(
                        message,
                        $wordBlacklist,
                    );

                return (
                    !blockedByUser &&
                    !blockedByWord
                );
            },
        );

    function modeUsesMouse() {
        return (
            pauseMode ===
                CHAT_PAUSE_MODES.MOUSE ||
            pauseMode ===
                CHAT_PAUSE_MODES.MOUSE_OR_ALT
        );
    }

    function modeUsesAlt() {
        return (
            pauseMode ===
                CHAT_PAUSE_MODES.ALT ||
            pauseMode ===
                CHAT_PAUSE_MODES.MOUSE_OR_ALT
        );
    }

    function isTemporaryPauseActive() {
        if (temporaryPauseDismissed) {
            return false;
        }

        return (
            (
                modeUsesMouse() &&
                mouseOverChat
            ) ||
            (
                modeUsesAlt() &&
                altPressed
            )
        );
    }

    function isPausedNow() {
        return (
            manualPaused ||
            isTemporaryPauseActive()
        );
    }

    function isAtBottom() {
        if (!messagesElement) {
            return true;
        }

        const distance =
            messagesElement.scrollHeight -
            messagesElement.scrollTop -
            messagesElement.clientHeight;

        return (
            distance <=
            BOTTOM_THRESHOLD
        );
    }

    function handleScroll() {
        const atBottom =
            isAtBottom();

        /*
         * Rolagem manual continua sendo
         * válida em todos os modos.
         */
        manualPaused =
            !atBottom;

        if (atBottom) {
            newMessageCount = 0;
        }
    }

    function scrollToBottom() {
        if (!messagesElement) {
            return;
        }

        messagesElement.scrollTop =
            messagesElement.scrollHeight;

        manualPaused = false;
        newMessageCount = 0;
    }

    function resumeChat() {
        temporaryPauseDismissed = true;
        scrollGeneration += 1;
        scrollToBottom();
    }

    async function resumeAfterTemporaryPause() {
        /*
         * Se o usuário rolou para cima,
         * mouse/Alt não devem desfazer
         * essa pausa manual.
         */
        if (
            manualPaused ||
            isTemporaryPauseActive()
        ) {
            return;
        }

        const generation =
            ++scrollGeneration;

        await tick();

        if (
            generation !==
                scrollGeneration ||
            manualPaused ||
            isTemporaryPauseActive()
        ) {
            return;
        }

        scrollToBottom();
    }

    function handleMouseEnter() {
        temporaryPauseDismissed = false;
        mouseOverChat = true;
    }

    function handleMouseLeave() {
        mouseOverChat = false;

        void resumeAfterTemporaryPause();
    }

    function handleKeyDown(event) {
        if (
            event.key !== "Alt" ||
            altPressed
        ) {
            return;
        }

        altPressed = true;
        temporaryPauseDismissed = false;
    }

    function handleKeyUp(event) {
        if (event.key !== "Alt") {
            return;
        }

        altPressed = false;

        void resumeAfterTemporaryPause();
    }

    function handleWindowBlur() {
        if (!altPressed) {
            return;
        }

        /*
         * Evita Alt ficar preso caso a
         * janela perca foco enquanto
         * a tecla estiver pressionada.
         */
        altPressed = false;

        void resumeAfterTemporaryPause();
    }

    async function handleMessagesChanged(
        sourceMessages,
        renderedMessages,
    ) {
        const addedCount = messageTracker.update(sourceMessages, renderedMessages);

        if (sourceMessages.length === 0) {
            scrollGeneration += 1;
            manualPaused = false;
            newMessageCount = 0;
            return;
        }

        if (isPausedNow()) {
            newMessageCount += addedCount;
            return;
        }

        const generation =
            ++scrollGeneration;

        await tick();

        if (
            generation !==
                scrollGeneration ||
            isPausedNow()
        ) {
            return;
        }

        scrollToBottom();
    }

    $: void handleMessagesChanged(
        chatMessages,
        visibleMessages,
    );

    onMount(() => {
        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        window.addEventListener(
            "keyup",
            handleKeyUp,
        );

        window.addEventListener(
            "blur",
            handleWindowBlur,
        );

        let mounted = true;
        void tick().then(() => {
            if (mounted) scrollToBottom();
        });

        return () => {
            mounted = false;
            scrollGeneration += 1;
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );

            window.removeEventListener(
                "keyup",
                handleKeyUp,
            );

            window.removeEventListener(
                "blur",
                handleWindowBlur,
            );
        };
    });
</script>

<section
    class="chat"
    aria-label="Chat"
    onmouseenter={handleMouseEnter}
    onmouseleave={handleMouseLeave}
>
    <div
        class="messages"
        bind:this={messagesElement}
        onscroll={handleScroll}
    >
        {#each visibleMessages as message (message.id)}
            <ChatMessage {message} />
        {/each}
    </div>

    {#if chatPaused}
        <button
            class="new-messages"
            type="button"
            onclick={resumeChat}
            aria-label="Chat pausado. Clique para voltar ao final."
        >
            <span>
                Chat pausado
            </span>

            {#if newMessageCount > 0}
                <span class="new-message-count">
                    {newMessageCount}

                    {newMessageCount === 1
                        ? "mensagem nova"
                        : "mensagens novas"}
                </span>
            {/if}
        </button>
    {/if}
</section>

<style>
    .chat {
        position: relative;

        width: 100%;
        height: 100%;
        min-height: 0;
        min-width: 0;

        overflow: hidden;

        background: #141419;

        border: 1px solid
            rgba(255, 255, 255, 0.065);

        border-radius: 12px;

        box-shadow:
            0 8px 30px
            rgba(0, 0, 0, 0.16);
    }

    .messages {
        width: 100%;
        min-width: 0;
        height: 100%;

        padding: 10px 8px;

        overflow-y: auto;
        overflow-x: hidden;

        overscroll-behavior: contain;

        scrollbar-width: thin;
        scrollbar-color:
            #36363f transparent;
    }

    .new-messages {
        position: absolute;

        left: 50%;
        bottom: 12px;

        z-index: 10;

        display: inline-flex;
        align-items: center;

        gap: 8px;

        transform:
            translateX(-50%);

        padding: 6px 11px;

        color: #dedee3;
        background: #24242c;

        border: 1px solid
            rgba(145, 70, 255, 0.32);

        border-radius: 999px;

        box-shadow:
            0 5px 18px
            rgba(0, 0, 0, 0.35);

        font: inherit;
        font-size: 10px;
        font-weight: 500;

        white-space: nowrap;

        cursor: pointer;
    }

    .new-messages:hover {
        color: #fff;

        background: #2d2938;

        border-color:
            rgba(145, 70, 255, 0.5);
    }

    .new-message-count {
        padding-left: 8px;

        color: #cdb7ff;

        border-left: 1px solid
            rgba(255, 255, 255, 0.12);
    }

    .new-messages:focus-visible {
        outline: 2px solid #9f75ff;
        outline-offset: 2px;
    }
</style>
