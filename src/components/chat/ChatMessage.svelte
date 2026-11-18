<script>
    import { onMount, tick } from "svelte";

    import { savedMessages } from "../../lib/stores/saved-messages.js";
    import { userBlacklist } from "../../lib/stores/filters.js";

    import { badgeCatalog, resolveBadge } from "../../lib/twitch/badges.js";
    import { getTwitchEmoteUrl } from "../../lib/twitch/emotes.js";

    import {
        displaySettings,
        getChatFontFamily,
    } from "../../lib/stores/display-settings.js";

    import { getNameColor } from "../../lib/chat/name-color.js";

    export let message;

    const emojiSegmenter =
        typeof Intl.Segmenter === "function"
            ? new Intl.Segmenter(undefined, {
                  granularity: "grapheme",
              })
            : null;

    const emojiPattern =
        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\u20E3]/u;

    function removeEmoji(value) {
        const text = String(value ?? "");

        if (!text) {
            return "";
        }

        if (!emojiSegmenter) {
            return text.replace(/\p{Extended_Pictographic}/gu, "");
        }

        let result = "";

        for (const { segment } of emojiSegmenter.segment(text)) {
            if (!emojiPattern.test(segment)) {
                result += segment;
            }
        }

        return result;
    }

    function displayText(value) {
        const text = String(value ?? "");

        if ($displaySettings.showEmoji) {
            return text;
        }

        return removeEmoji(text);
    }

    let menuOpen = false;

    let wrapperElement;
    let messageElement;
    let menuElement;

    let menuX = 0;
    let menuY = 0;

    function formatTime(timestamp) {
        const date = new Date(timestamp);

        if (Number.isNaN(date.getTime())) {
            return "";
        }

        return date.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    $: messageTime = formatTime(message.timestamp);

    $: messageName = message.sender?.displayName ?? message.sender?.login ?? "";

    $: messageNameColor = getNameColor(message.color, {
        readable: $displaySettings.readableNameColors,
    });

    $: nicknameFontFamily = getChatFontFamily($displaySettings.nicknameFont);

    $: messageFontFamily = getChatFontFamily($displaySettings.messageFont);

    $: resolvedBadges = $displaySettings.showBadges
        ? (Array.isArray(message.badges) ? message.badges : [])
              .map((badge) =>
                  resolveBadge($badgeCatalog, badge.setId, badge.id),
              )
              .filter(Boolean)
        : [];

    $: messageKey = savedMessages.getMessageKey(message);

    $: messageIsSaved = $savedMessages.some(
        (saved) => saved.key === messageKey,
    );

    async function openMenuAt(x, y, focusMenu = false) {
        menuX = x;
        menuY = y;
        menuOpen = true;

        await tick();

        if (!menuElement) return;

        const rect = menuElement.getBoundingClientRect();

        const margin = 8;

        if (rect.right > window.innerWidth - margin) {
            menuX = Math.max(margin, window.innerWidth - rect.width - margin);
        }

        if (rect.bottom > window.innerHeight - margin) {
            menuY = Math.max(margin, window.innerHeight - rect.height - margin);
        }

        if (focusMenu) {
            menuElement.querySelector('[role="menuitem"]')?.focus();
        }
    }

    function handleMessageClick(event) {
        openMenuAt(event.clientX, event.clientY);
    }

    function closeMenu(restoreFocus = false) {
        menuOpen = false;
        if (restoreFocus) messageElement?.focus({ preventScroll: true });
    }

    function handleMessageKeydown(event) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
            event.preventDefault();

            const rect = messageElement.getBoundingClientRect();

            openMenuAt(
                rect.left + Math.min(rect.width / 2, 160),

                rect.top + rect.height / 2,
                true,
            );

            return;
        }

        if (event.key === "Escape") {
            closeMenu();
        }
    }

    function handleMenuKeydown(event) {
        if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            closeMenu(true);
            return;
        }

        if (event.key === "Tab") {
            // Volta ao acionador antes de deixar o navegador avançar o foco.
            closeMenu(true);
            return;
        }

        const items = Array.from(menuElement.querySelectorAll('[role="menuitem"]'));
        const current = items.indexOf(document.activeElement);
        let next;

        switch (event.key) {
            case "ArrowDown": next = (current + 1) % items.length; break;
            case "ArrowUp": next = (current - 1 + items.length) % items.length; break;
            case "Home": next = 0; break;
            case "End": next = items.length - 1; break;
            default: return;
        }

        event.preventDefault();
        items[next]?.focus();
    }

    function handleDocumentClick(event) {
        if (!wrapperElement?.contains(event.target)) {
            closeMenu();
        }
    }

    function toggleSavedMessage() {
        if (messageIsSaved) {
            savedMessages.remove(messageKey);
        } else {
            /*
             * name/time ficam apenas no snapshot
             * persistido por compatibilidade com
             * o painel de mensagens salvas atual.
             */
            savedMessages.save({
                ...message,

                name: messageName,
                time: messageTime,
            });
        }

        closeMenu(true);
    }

    function blacklistMessageUser() {
        userBlacklist.addMessageUser(message);

        closeMenu(true);
    }

    onMount(() => {
        document.addEventListener("click", handleDocumentClick);

        return () => {
            document.removeEventListener("click", handleDocumentClick);
        };
    });
</script>

<div class="message-wrapper" bind:this={wrapperElement}>
    <div
        class="message"
        class:menu-open={menuOpen}
        bind:this={messageElement}
        role="button"
        tabindex="0"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={handleMessageClick}
        onkeydown={handleMessageKeydown}
    >
        <span class="message-prefix">
            {#if $displaySettings.showTimestamp}
                <span class="timestamp">
                    {messageTime}
                </span>
            {/if}

            {#if resolvedBadges.length > 0}
                <span class="badges" aria-label="Badges">
                    {#each resolvedBadges as badge (badge.key)}
                        <img
                            class="badge-image"
                            src={badge.imageUrl}
                            alt={badge.title}
                            title={badge.title}
                            width="18"
                            height="18"
                            loading="lazy"
                            decoding="async"
                        />
                    {/each}
                </span>
            {/if}

            <span class="message-author">
                <strong
                    class="username"
                    style:color={messageNameColor}
                    style:font-family={nicknameFontFamily}
                    style:font-size={`${$displaySettings.nicknameFontSize}px`}
                >
                    {messageName}
                </strong><span class="separator">:</span>
            </span>
        </span><span
            class="text"
            style:font-family={messageFontFamily}
            style:font-size={`${$displaySettings.messageFontSize}px`}
        >
            {#if Array.isArray(message.fragments) && message.fragments.length > 0}
                {#each message.fragments as fragment}
                    {#if fragment.type === "emote"}
                        {#if $displaySettings.showTwitchEmotes}
                            {@const emoteUrl = getTwitchEmoteUrl(fragment)}

                            {#if emoteUrl}
                                <img
                                    class="emote-image"
                                    src={emoteUrl}
                                    alt={fragment.text}
                                    title={fragment.text}
                                    width="24"
                                    height="24"
                                    loading="lazy"
                                    decoding="async"
                                />
                            {:else}
                                {displayText(fragment.text)}
                            {/if}
                        {:else}
                            {displayText(fragment.text)}
                        {/if}
                    {:else}
                        {displayText(fragment.text)}
                    {/if}
                {/each}
            {:else}
                {displayText(message.text)}
            {/if}
        </span>
    </div>

    {#if menuOpen}
        <div
            class="message-menu"
            bind:this={menuElement}
            role="menu"
            tabindex="-1"
            style:left={`${menuX}px`}
            style:top={`${menuY}px`}
            onclick={(event) => event.stopPropagation()}
            onkeydown={handleMenuKeydown}
        >
            <button type="button" role="menuitem" tabindex="-1" onclick={toggleSavedMessage}>
                {messageIsSaved ? "Remover dos salvos" : "Salvar mensagem"}
            </button>

            <button
                type="button"
                role="menuitem"
                tabindex="-1"
                onclick={blacklistMessageUser}
            >
                Adicionar usuário à blacklist
            </button>
        </div>
    {/if}
</div>

<style>
    .message-wrapper {
        width: 100%;
        max-width: 100%;
        min-width: 0;
    }

    .message {
        width: 100%;
        max-width: 100%;
        min-width: 0;

        padding: 4px 5px;

        color: #efeff1;

        font-family: Inter, "Noto Sans Arabic", Roobert, "Helvetica Neue",
            Helvetica, Arial, sans-serif;

        font-size: 14px;
        font-weight: 400;
        line-height: 1.42;

        border-radius: 5px;

        cursor: pointer;

        white-space: normal;
        overflow-wrap: anywhere;

        transition:
            background 100ms ease,
            box-shadow 100ms ease;
    }

    .text {
        color: #efeff1;
        font-weight: 400;
    }

    .message:hover {
        background: rgba(145, 70, 255, 0.09);
    }

    .message.menu-open {
        background: rgba(145, 70, 255, 0.14);

        box-shadow:
            inset 2px 0 0 rgba(177, 136, 255, 0.75),
            inset 0 0 0 1px rgba(145, 70, 255, 0.1);
    }

    .message:focus-visible {
        background: rgba(145, 70, 255, 0.1);

        outline: 1px solid rgba(177, 136, 255, 0.55);
        outline-offset: -1px;
    }

    .message-menu {
        position: fixed;
        z-index: 1000;

        min-width: 165px;

        padding: 4px;

        color: #dedee3;
        background: #1c1c22;

        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 7px;

        box-shadow:
            0 10px 30px rgba(0, 0, 0, 0.45),
            0 2px 8px rgba(0, 0, 0, 0.28);
    }

    .message-menu button {
        display: block;

        width: 100%;

        padding: 7px 9px;

        color: inherit;
        background: transparent;

        border: 0;
        border-radius: 4px;

        font: inherit;
        font-size: 12px;
        text-align: left;

        cursor: pointer;
    }

    .message-menu button:hover,
    .message-menu button:focus-visible {
        color: #fff;
        background: rgba(145, 70, 255, 0.14);

        outline: none;
    }

    .message-prefix {
    display: inline;

    margin-right: 0;

    vertical-align: baseline;
}

    .timestamp {
    margin: 0 2px 0 0;

    color: #d3d3d9;

    font-family:
        Inter,
        "Noto Sans Arabic",
        Roobert,
        "Helvetica Neue",
        Helvetica,
        Arial,
        sans-serif;

    font-size: 14px;
    font-weight: 400;

    font-variant-numeric: tabular-nums;

    vertical-align: baseline;
}

    .badges {
    display: inline-flex;
    align-items: center;

    gap: 2px;

    margin: 0 2px 0 0;

    vertical-align: -4px;
}

    .badge-image {
        width: 18px;
        height: 18px;

        display: block;

        object-fit: contain;
    }

    .message-author {
    display: inline;

    vertical-align: baseline;
}

    .username {
        font-weight: 600;
    }

    .separator {
    margin-left: 1px;
    margin-right: 3px;

    color: #efeff1;
    font-weight: 400;
}

    .emote-image {
        width: 24px;
        height: 24px;

        display: inline-block;

        margin: -4px 1px;

        vertical-align: middle;

        object-fit: contain;
    }
</style>
