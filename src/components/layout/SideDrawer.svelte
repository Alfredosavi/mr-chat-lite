<script>
    import {
        savedMessages,
        MAX_SAVED_MESSAGES,
    } from "../../lib/stores/saved-messages.js";

    import {
        userBlacklist,
        wordBlacklist,
        MAX_BLACKLIST_USERS,
        MAX_BLACKLIST_WORDS,
    } from "../../lib/stores/filters.js";

    import { channelSettings } from "../../lib/stores/channel-settings.js";

    import {
        displaySettings,
        CHAT_PAUSE_MODES,
        CHAT_FONT_OPTIONS,
        MIN_CHAT_FONT_SIZE,
        MAX_CHAT_FONT_SIZE,
    } from "../../lib/stores/display-settings.js";

    export let panel;
    export let onClose = () => {};
    export let currentChannel = "";

    export let onReconnectChannel = async () => {};

    let blockedUserInput = "";
    let blockedWordInput = "";
    let channelInput = channelSettings.getChannelLogin();

    let channelSaving = false;
    let channelError = "";

    const titles = {
        filters: "Filtros",
        users: "Usuários",
        saved: "Mensagens salvas",
        notifications: "Notificações",
        settings: "Configurações",
    };

    $: title = titles[panel] ?? "Painel";

    function addBlockedUser(event) {
        event.preventDefault();

        const added = userBlacklist.addLogin(blockedUserInput);

        if (added) {
            blockedUserInput = "";
        }
    }

    function addBlockedWord(event) {
        event.preventDefault();

        const added = wordBlacklist.add(blockedWordInput);

        if (added) {
            blockedWordInput = "";
        }
    }

    async function saveChannel(event) {
        event.preventDefault();

        if (channelSaving) {
            return;
        }

        channelError = "";

        let normalized;

        try {
            normalized = channelSettings.normalize(channelInput);
        } catch (error) {
            channelError = error?.message || "Canal inválido.";

            return;
        }

        channelSaving = true;

        try {
            await onReconnectChannel(normalized);

            channelInput = normalized;
        } catch (error) {
            console.error("[SideDrawer] Falha ao trocar canal.", error);

            channelError =
                error?.message || "Não foi possível conectar ao canal.";
        } finally {
            channelSaving = false;
        }
    }

    function resetDisplaySettings() {
        const confirmed = window.confirm(
            "Restaurar todas as configurações de aparência e chat para os valores padrão?",
        );

        if (!confirmed) {
            return;
        }

        displaySettings.reset();
    }
</script>

<aside class="drawer" aria-label={title}>
    <header class="drawer-header">
        <h2>{title}</h2>

        <button type="button" aria-label="Fechar painel" onclick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
            </svg>
        </button>
    </header>

    <div class="drawer-content">
        {#if panel === "filters"}
            <section>
                <div class="section-header">
                    <h3>
                        Blacklist de usuários

                        {#if $userBlacklist.length > 0}
                            <span class="saved-count">
                                {$userBlacklist.length}
                            </span>
                        {/if}
                    </h3>
                </div>

                <p class="filter-limit">
                    Limite máximo: {$userBlacklist.length}/{MAX_BLACKLIST_USERS}
                </p>

                <p class="filter-description">
                    Mensagens destes usuários não serão exibidas no chat.
                </p>

                <form class="filter-add-form" onsubmit={addBlockedUser}>
                    <input
                        type="text"
                        bind:value={blockedUserInput}
                        placeholder="Nickname"
                        autocomplete="off"
                        spellcheck="false"
                        aria-label="Nickname para blacklist"
                    />

                    <button type="submit"> Adicionar </button>
                </form>

                {#if $userBlacklist.length === 0}
                    <div class="placeholder">Nenhum usuário na blacklist.</div>
                {:else}
                    <div class="blocked-users">
                        {#each $userBlacklist as user (user.key)}
                            <div class="blocked-user">
                                <div>
                                    <strong>
                                        {user.displayName || user.login}
                                    </strong>

                                    {#if user.login}
                                        <span>
                                            @{user.login}
                                        </span>
                                    {/if}
                                </div>

                                <button
                                    type="button"
                                    aria-label={`Remover ${user.displayName || user.login} da blacklist`}
                                    title="Remover da blacklist"
                                    onclick={() =>
                                        userBlacklist.remove(user.key)}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
            <section>
                <div class="section-header">
                    <h3>
                        Blacklist de palavras

                        {#if $wordBlacklist.length > 0}
                            <span class="saved-count">
                                {$wordBlacklist.length}
                            </span>
                        {/if}
                    </h3>
                </div>

                <p class="filter-limit">
                    Limite máximo: {$wordBlacklist.length}/{MAX_BLACKLIST_WORDS}
                </p>

                <p class="filter-description">
                    Mensagens contendo estes termos não serão exibidas no chat.
                </p>

                <form class="filter-add-form" onsubmit={addBlockedWord}>
                    <input
                        type="text"
                        bind:value={blockedWordInput}
                        placeholder="Palavra ou expressão"
                        autocomplete="off"
                        spellcheck="false"
                        aria-label="Palavra ou expressão para blacklist"
                    />

                    <button type="submit"> Adicionar </button>
                </form>

                {#if $wordBlacklist.length === 0}
                    <div class="placeholder">Nenhuma palavra na blacklist.</div>
                {:else}
                    <div class="blocked-users">
                        {#each $wordBlacklist as entry (entry.key)}
                            <div class="blocked-user">
                                <div>
                                    <strong>
                                        {entry.term}
                                    </strong>
                                </div>

                                <button
                                    type="button"
                                    aria-label={`Remover ${entry.term} da blacklist`}
                                    title="Remover da blacklist"
                                    onclick={() =>
                                        wordBlacklist.remove(entry.key)}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </section>
        {:else if panel === "settings"}
            <section>
                <h3>Twitch</h3>

                <p class="filter-description">
                    Canal exibido no chat. Deixe vazio para usar sua própria
                    conta Twitch.
                </p>

                <form class="filter-add-form" onsubmit={saveChannel}>
                    <input
                        type="text"
                        bind:value={channelInput}
                        placeholder="nome_do_canal"
                        autocomplete="off"
                        autocapitalize="none"
                        spellcheck="false"
                        aria-label="Canal da Twitch"
                        disabled={channelSaving}
                    />

                    <button type="submit" disabled={channelSaving}>
                        {channelSaving
                            ? "Conectando..."
                            : "Salvar e reconectar"}
                    </button>
                </form>

                {#if currentChannel}
                    <p class="channel-current">
                        Conectado em
                        <strong>
                            #{currentChannel}
                        </strong>
                    </p>
                {/if}

                {#if channelError}
                    <p class="channel-error" role="alert">
                        {channelError}
                    </p>
                {/if}
            </section>
            <section>
                <h3>Chat</h3>

                <div class="option">
                    <div>
                        <strong>Horário</strong>
                        <span> Mostrar horário das mensagens </span>
                    </div>

                    <button
                        type="button"
                        class="setting-toggle"
                        class:active={$displaySettings.showTimestamp}
                        role="switch"
                        aria-checked={$displaySettings.showTimestamp}
                        aria-label="Mostrar horário das mensagens"
                        onclick={() => displaySettings.toggle("showTimestamp")}
                    ></button>
                </div>

                <div class="option">
                    <div>
                        <strong>Emotes da Twitch</strong>
                        <span> Exibir emotes da Twitch </span>
                    </div>

                    <button
                        type="button"
                        class="setting-toggle"
                        class:active={$displaySettings.showTwitchEmotes}
                        role="switch"
                        aria-checked={$displaySettings.showTwitchEmotes}
                        aria-label="Exibir emotes da Twitch"
                        onclick={() =>
                            displaySettings.toggle("showTwitchEmotes")}
                    ></button>
                </div>

                <div class="option">
                    <div>
                        <strong>Emojis</strong>
                        <span> Exibir emojis Unicode </span>
                    </div>

                    <button
                        type="button"
                        class="setting-toggle"
                        class:active={$displaySettings.showEmoji}
                        role="switch"
                        aria-checked={$displaySettings.showEmoji}
                        aria-label="Exibir emojis"
                        onclick={() => displaySettings.toggle("showEmoji")}
                    ></button>
                </div>

                <div class="option">
                    <div>
                        <strong>Badges</strong>
                        <span> Mostrar badges dos usuários </span>
                    </div>

                    <button
                        type="button"
                        class="setting-toggle"
                        class:active={$displaySettings.showBadges}
                        role="switch"
                        aria-checked={$displaySettings.showBadges}
                        aria-label="Mostrar badges dos usuários"
                        onclick={() => displaySettings.toggle("showBadges")}
                    ></button>
                </div>

                <div class="pause-setting">
                    <div class="pause-setting-header">
                        <strong>Pausar chat</strong>

                        <span>
                            Escolha quando o auto-scroll deve ser pausado
                        </span>
                    </div>

                    <div
                        class="pause-options"
                        role="radiogroup"
                        aria-label="Modo de pausa do chat"
                    >
                        <button
                            type="button"
                            class="pause-option"
                            class:active={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.SCROLL}
                            role="radio"
                            aria-checked={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.SCROLL}
                            onclick={() =>
                                displaySettings.set(
                                    "pauseMode",
                                    CHAT_PAUSE_MODES.SCROLL,
                                )}
                        >
                            <span class="pause-radio"></span>

                            <span class="pause-option-text">
                                <strong>Somente rolagem</strong>

                                <small> Pausar ao sair do final do chat </small>
                            </span>
                        </button>

                        <button
                            type="button"
                            class="pause-option"
                            class:active={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.ALT}
                            role="radio"
                            aria-checked={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.ALT}
                            onclick={() =>
                                displaySettings.set(
                                    "pauseMode",
                                    CHAT_PAUSE_MODES.ALT,
                                )}
                        >
                            <span class="pause-radio"></span>

                            <span class="pause-option-text">
                                <strong>Segurar Alt</strong>

                                <small>
                                    Rolagem ou enquanto Alt estiver pressionado
                                </small>
                            </span>
                        </button>

                        <button
                            type="button"
                            class="pause-option"
                            class:active={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.MOUSE}
                            role="radio"
                            aria-checked={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.MOUSE}
                            onclick={() =>
                                displaySettings.set(
                                    "pauseMode",
                                    CHAT_PAUSE_MODES.MOUSE,
                                )}
                        >
                            <span class="pause-radio"></span>

                            <span class="pause-option-text">
                                <strong>Mouse sobre o chat</strong>

                                <small>
                                    Rolagem ou enquanto o mouse estiver sobre o
                                    chat
                                </small>
                            </span>
                        </button>

                        <button
                            type="button"
                            class="pause-option"
                            class:active={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.MOUSE_OR_ALT}
                            role="radio"
                            aria-checked={$displaySettings.pauseMode ===
                                CHAT_PAUSE_MODES.MOUSE_OR_ALT}
                            onclick={() =>
                                displaySettings.set(
                                    "pauseMode",
                                    CHAT_PAUSE_MODES.MOUSE_OR_ALT,
                                )}
                        >
                            <span class="pause-radio"></span>

                            <span class="pause-option-text">
                                <strong>Mouse ou Alt</strong>

                                <small>
                                    Rolagem, mouse sobre o chat ou tecla Alt
                                </small>
                            </span>
                        </button>
                    </div>
                </div>
            </section>

            <section>
                <h3>Aparência</h3>

                <div class="option">
                    <div>
                        <strong>Cores legíveis</strong>
                        <span>
                            Corrigir cores de nickname com baixo contraste
                        </span>
                    </div>

                    <button
                        type="button"
                        class="setting-toggle"
                        class:active={$displaySettings.readableNameColors}
                        role="switch"
                        aria-checked={$displaySettings.readableNameColors}
                        aria-label="Usar cores legíveis nos nicknames"
                        onclick={() =>
                            displaySettings.toggle("readableNameColors")}
                    ></button>
                </div>

                <div class="font-group">
                    <strong class="font-group-title"> Nickname </strong>

                    <label class="font-control">
                        <span>Fonte</span>

                        <select
                            value={$displaySettings.nicknameFont}
                            onchange={(event) =>
                                displaySettings.set(
                                    "nicknameFont",
                                    event.currentTarget.value,
                                )}
                        >
                            {#each CHAT_FONT_OPTIONS as font}
                                <option value={font.value}>
                                    {font.label}
                                </option>
                            {/each}
                        </select>
                    </label>

                    <label class="font-control">
                        <span>Tamanho</span>

                        <div class="font-size-control">
                            <input
                                type="number"
                                min={MIN_CHAT_FONT_SIZE}
                                max={MAX_CHAT_FONT_SIZE}
                                value={$displaySettings.nicknameFontSize}
                                oninput={(event) =>
                                    displaySettings.set(
                                        "nicknameFontSize",
                                        event.currentTarget.valueAsNumber,
                                    )}
                            />

                            <span>px</span>
                        </div>
                    </label>
                </div>

                <div class="font-group">
                    <strong class="font-group-title"> Mensagem </strong>

                    <label class="font-control">
                        <span>Fonte</span>

                        <select
                            value={$displaySettings.messageFont}
                            onchange={(event) =>
                                displaySettings.set(
                                    "messageFont",
                                    event.currentTarget.value,
                                )}
                        >
                            {#each CHAT_FONT_OPTIONS as font}
                                <option value={font.value}>
                                    {font.label}
                                </option>
                            {/each}
                        </select>
                    </label>

                    <label class="font-control">
                        <span>Tamanho</span>

                        <div class="font-size-control">
                            <input
                                type="number"
                                min={MIN_CHAT_FONT_SIZE}
                                max={MAX_CHAT_FONT_SIZE}
                                value={$displaySettings.messageFontSize}
                                oninput={(event) =>
                                    displaySettings.set(
                                        "messageFontSize",
                                        event.currentTarget.valueAsNumber,
                                    )}
                            />

                            <span>px</span>
                        </div>
                    </label>
                </div>
            </section>
            <section class="reset-settings-section">
                <h3>Restaurar</h3>

                <p class="reset-settings-description">
                    Restaura as configurações de chat e aparência para os
                    valores padrão. Mensagens salvas, filtros e conta Twitch não
                    serão apagados.
                </p>

                <button
                    class="reset-settings-button"
                    type="button"
                    onclick={resetDisplaySettings}
                >
                    Restaurar configurações padrão
                </button>
            </section>
        {:else if panel === "saved"}
            <section class="saved-section">
                <div class="section-header">
                    <h3>
                        Salvas
                        {#if $savedMessages.length > 0}
                            <span class="saved-count">
                                {$savedMessages.length}
                            </span>
                        {/if}
                    </h3>

                    {#if $savedMessages.length > 0}
                        <button
                            class="clear-saved"
                            type="button"
                            onclick={() => savedMessages.clear()}
                        >
                            Limpar tudo
                        </button>
                    {/if}
                </div>

                <p class="saved-limit">
                    Limite máximo: {$savedMessages.length}/{MAX_SAVED_MESSAGES}
                </p>

                {#if $savedMessages.length === 0}
                    <div class="placeholder">Nenhuma mensagem salva.</div>
                {:else}
                    <div class="saved-list">
                        {#each $savedMessages as saved, index (saved.key)}
                            <article class="saved-message">
                                <div class="saved-message-header">
                                    <div class="saved-identity">
                                        <span class="saved-index">
                                            {index + 1}.
                                        </span>

                                        <strong>
                                            {saved.message.name}
                                        </strong>
                                    </div>

                                    <span class="saved-time">
                                        {saved.message.time}
                                    </span>
                                </div>

                                <p>
                                    {saved.message.text}
                                </p>

                                <button
                                    class="remove-saved"
                                    type="button"
                                    aria-label={`Remover mensagem salva de ${saved.message.name}`}
                                    title="Remover"
                                    onclick={() =>
                                        savedMessages.remove(saved.key)}
                                >
                                    <svg viewBox="0 0 24 24" aria-hidden="true">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            </article>
                        {/each}
                    </div>
                {/if}
            </section>
        {:else if panel === "notifications"}
            <section>
                <h3>Alertas</h3>

                <div class="option">
                    <div>
                        <strong>Notificações locais</strong>
                        <span> Alertas definidos pelo usuário </span>
                    </div>

                    <div class="fake-toggle"></div>
                </div>

                <div class="placeholder">
                    Regras e usuários monitorados aparecerão aqui.
                </div>
            </section>
        {:else if panel === "users"}
            <section>
                <h3>Listas</h3>

                <div class="placeholder">
                    Whitelist e usuários configurados aparecerão aqui.
                </div>
            </section>
        {/if}
    </div>
</aside>

<style>
    .drawer {
        position: relative;
        z-index: 20;

        width: var(--drawer-width);
        min-width: 0;
        height: 100%;

        overflow: hidden;
        background: #15151b;

        border-left: 1px solid rgba(255, 255, 255, 0.07);

        animation: drawer-in 150ms ease-out;
    }

    .drawer-header {
        height: 48px;

        display: flex;
        align-items: center;
        justify-content: space-between;

        padding: 0 10px 0 16px;

        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    h2,
    h3 {
        margin: 0;
    }

    h2 {
        font-size: 14px;
        font-weight: 600;
    }

    h3 {
        margin-bottom: 10px;

        color: #92929d;

        font-size: 11px;
        font-weight: 600;

        letter-spacing: 0.06em;
        text-transform: uppercase;
    }

    .drawer-header button {
        width: 32px;
        height: 32px;

        display: grid;
        place-items: center;

        padding: 0;

        color: #8e8e98;
        background: transparent;

        border: 0;
        border-radius: 7px;

        cursor: pointer;
    }

    .drawer-header button:hover {
        color: #fff;
        background: rgba(255, 255, 255, 0.06);
    }

    .drawer-header button:focus-visible {
        outline: 2px solid #9f75ff;
    }

    .channel-current,
    .channel-error {
        margin: -5px 0 0;

        font-size: 10px;
        line-height: 1.4;
    }

    .channel-current {
        color: #777781;
    }

    .channel-current strong {
        color: #b69cff;
        font-weight: 500;
    }

    .channel-error {
        color: #ff7777;
    }

    .filter-add-form input:disabled,
    .filter-add-form button:disabled {
        cursor: default;
        opacity: 0.55;
    }

    svg {
        width: 17px;
        height: 17px;

        fill: none;

        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
    }

    .drawer-content {
        height: calc(100% - 48px);

        padding: 16px;

        overflow-y: auto;
        overscroll-behavior: contain;
    }

    section + section {
        margin-top: 28px;
    }

    .option {
        display: flex;
        align-items: center;
        justify-content: space-between;

        gap: 14px;

        min-height: 50px;

        padding: 9px 0;

        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .option > div:first-child {
        min-width: 0;
        display: grid;
        gap: 3px;
    }

    .option strong {
        color: #e1e1e5;
        font-size: 12px;
        font-weight: 500;
    }

    .option span {
        color: #777781;
        font-size: 11px;
        line-height: 1.35;
    }

    .fake-toggle {
        position: relative;

        width: 32px;
        height: 18px;

        flex: 0 0 auto;
        border-radius: 999px;
        background: #34343d;
    }

    .fake-toggle::after {
        content: "";

        position: absolute;

        top: 3px;
        left: 3px;

        width: 12px;
        height: 12px;
        border-radius: 50%;

        background: #aaaab3;
    }

    .fake-toggle.active {
        background: #6541a5;
    }

    .fake-toggle.active::after {
        left: 17px;
        background: #fff;
    }

    .placeholder {
        padding: 14px;

        color: #777781;
        background: rgba(255, 255, 255, 0.025);

        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;

        font-size: 11px;
        line-height: 1.5;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        gap: 12px;

        margin-bottom: 10px;
    }

    .section-header h3 {
        display: flex;
        align-items: center;

        gap: 6px;

        margin-bottom: 0;
    }

    .saved-count {
        min-width: 18px;
        height: 18px;

        display: inline-flex;
        align-items: center;
        justify-content: center;

        padding: 0 5px;

        color: #cdb7ff;
        background: rgba(145, 70, 255, 0.13);

        border-radius: 999px;

        font-size: 9px;
        font-weight: 700;

        letter-spacing: 0;
    }

    .clear-saved {
        padding: 4px 6px;

        color: #8f8f99;
        background: transparent;

        border: 0;
        border-radius: 5px;

        font-size: 10px;

        cursor: pointer;
    }

    .clear-saved:hover {
        color: #e5e5e8;
        background: rgba(255, 255, 255, 0.05);
    }

    .saved-list {
        display: grid;

        gap: 6px;
    }

    .saved-message {
        position: relative;

        padding: 9px 32px 9px 10px;

        background: rgba(255, 255, 255, 0.025);

        border: 1px solid rgba(255, 255, 255, 0.055);
        border-radius: 7px;
    }

    .saved-message:hover {
        background: rgba(255, 255, 255, 0.04);
    }

    .saved-message-header {
        display: flex;
        align-items: center;
        justify-content: space-between;

        gap: 10px;

        margin-bottom: 5px;
    }

    .saved-limit,
    .filter-limit {
        margin: -3px 0 12px;

        color: rgba(255, 105, 105, 0.62);

        font-size: 9px;
        line-height: 1.3;
    }

    .saved-identity {
        min-width: 0;

        display: flex;
        align-items: center;

        gap: 4px;
    }

    .saved-identity strong {
        min-width: 0;

        overflow: hidden;

        color: #b69cff;

        font-size: 11px;
        font-weight: 600;

        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .saved-index {
        flex: 0 0 auto;

        color: #5f5f69;

        font-size: 10px;
    }

    .saved-time {
        flex: 0 0 auto;

        color: #666671;

        font-size: 9px;
        font-variant-numeric: tabular-nums;
    }

    .saved-message p {
        margin: 0;

        color: #c9c9cf;

        font-size: 11px;
        line-height: 1.45;

        overflow-wrap: anywhere;
    }

    .remove-saved {
        position: absolute;

        top: 6px;
        right: 5px;

        width: 24px;
        height: 24px;

        display: grid;
        place-items: center;

        padding: 0;

        color: #656570;
        background: transparent;

        border: 0;
        border-radius: 5px;

        cursor: pointer;

        opacity: 0;
    }

    .saved-message:hover .remove-saved,
    .remove-saved:focus-visible {
        opacity: 1;
    }

    .remove-saved:hover {
        color: #f0f0f2;
        background: rgba(255, 255, 255, 0.06);
    }

    .remove-saved svg {
        width: 13px;
        height: 13px;
    }

    .clear-saved:focus-visible,
    .remove-saved:focus-visible {
        outline: 2px solid #9f75ff;
        outline-offset: -1px;
    }

    .filter-description {
        margin: -2px 0 12px;

        color: #777781;

        font-size: 10px;
        line-height: 1.45;
    }

    .filter-add-form {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;

        gap: 6px;

        margin-bottom: 14px;
    }

    .filter-add-form input {
        min-width: 0;

        padding: 7px 9px;

        color: #dedee3;
        background: #101015;

        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;

        font-size: 11px;

        outline: none;
    }

    .filter-add-form input::placeholder {
        color: #5f5f69;
    }

    .filter-add-form input:focus {
        border-color: rgba(145, 70, 255, 0.55);

        box-shadow: 0 0 0 2px rgba(145, 70, 255, 0.08);
    }

    .filter-add-form button {
        padding: 0 10px;

        color: #d6c6ff;
        background: rgba(145, 70, 255, 0.12);

        border: 1px solid rgba(145, 70, 255, 0.22);
        border-radius: 6px;

        font-size: 10px;

        cursor: pointer;
    }

    .filter-add-form button:hover {
        color: #fff;
        background: rgba(145, 70, 255, 0.2);
    }

    .blocked-users {
        display: grid;

        gap: 5px;
    }

    .blocked-user {
        min-height: 42px;

        display: flex;
        align-items: center;
        justify-content: space-between;

        gap: 10px;

        padding: 7px 7px 7px 10px;

        background: rgba(255, 255, 255, 0.025);

        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 7px;
    }

    .blocked-user > div {
        min-width: 0;

        display: grid;

        gap: 2px;
    }

    .blocked-user strong {
        overflow: hidden;

        color: #d6d6dc;

        font-size: 11px;
        font-weight: 500;

        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .blocked-user span {
        overflow: hidden;

        color: #666671;

        font-size: 9px;

        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .blocked-user > button {
        width: 26px;
        height: 26px;

        flex: 0 0 auto;

        display: grid;
        place-items: center;

        padding: 0;

        color: #656570;
        background: transparent;

        border: 0;
        border-radius: 5px;

        cursor: pointer;
    }

    .blocked-user > button:hover {
        color: #f0f0f2;
        background: rgba(255, 255, 255, 0.06);
    }

    .blocked-user > button svg {
        width: 13px;
        height: 13px;
    }

    .setting-toggle {
        position: relative;

        width: 32px;
        height: 18px;

        flex: 0 0 auto;

        padding: 0;

        background: #34343d;

        border: 0;
        border-radius: 999px;

        cursor: pointer;
    }

    .setting-toggle::after {
        content: "";

        position: absolute;

        top: 3px;
        left: 3px;

        width: 12px;
        height: 12px;

        background: #aaaab3;

        border-radius: 50%;

        transition:
            left 100ms ease,
            background 100ms ease;
    }

    .setting-toggle.active {
        background: #6541a5;
    }

    .setting-toggle.active::after {
        left: 17px;

        background: #fff;
    }

    .setting-toggle:focus-visible {
        outline: 2px solid #9f75ff;
        outline-offset: 2px;
    }

    .pause-setting {
        margin-top: 18px;
    }

    .pause-setting-header {
        display: grid;

        gap: 3px;

        margin-bottom: 9px;
    }

    .pause-setting-header strong {
        color: #e1e1e5;

        font-size: 12px;
        font-weight: 500;
    }

    .pause-setting-header span {
        color: #777781;

        font-size: 10px;
        line-height: 1.4;
    }

    .pause-options {
        display: grid;

        gap: 4px;
    }

    .pause-option {
        width: 100%;

        display: flex;
        align-items: center;

        gap: 9px;

        padding: 7px 8px;

        color: inherit;
        background: transparent;

        border: 1px solid transparent;
        border-radius: 6px;

        font: inherit;
        text-align: left;

        cursor: pointer;
    }

    .pause-option:hover {
        background: rgba(255, 255, 255, 0.035);
    }

    .pause-option.active {
        background: rgba(145, 70, 255, 0.08);

        border-color: rgba(145, 70, 255, 0.14);
    }

    .pause-radio {
        width: 13px;
        height: 13px;

        flex: 0 0 auto;

        border: 1px solid #64646e;
        border-radius: 50%;
    }

    .pause-option.active .pause-radio {
        border: 4px solid #9f75ff;
    }

    .pause-option-text {
        min-width: 0;

        display: grid;

        gap: 2px;
    }

    .pause-option-text strong {
        color: #d6d6dc;

        font-size: 10px;
        font-weight: 500;
    }

    .pause-option-text small {
        color: #686873;

        font-size: 9px;
        line-height: 1.35;
    }

    .pause-option:focus-visible {
        outline: 2px solid #9f75ff;
        outline-offset: 1px;
    }

    .font-group {
        display: grid;

        gap: 8px;

        padding: 12px 0;

        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .font-group-title {
        color: #d6d6dc;

        font-size: 11px;
        font-weight: 500;
    }

    .font-control {
        display: grid;
        grid-template-columns:
            minmax(0, 1fr)
            120px;

        align-items: center;

        gap: 10px;
    }

    .font-control > span {
        color: #777781;

        font-size: 10px;
    }

    .font-control select,
    .font-control input {
        min-width: 0;

        padding: 6px 8px;

        color: #dedee3;
        background: #101015;

        border: 1px solid rgba(255, 255, 255, 0.08);

        border-radius: 6px;

        font: inherit;
        font-size: 10px;

        outline: none;
    }

    .font-control select:focus,
    .font-control input:focus {
        border-color: rgba(145, 70, 255, 0.55);

        box-shadow: 0 0 0 2px rgba(145, 70, 255, 0.08);
    }

    .font-size-control {
        display: grid;
        grid-template-columns:
            minmax(0, 1fr)
            auto;

        align-items: center;

        gap: 5px;
    }

    .font-size-control > span {
        color: #666671;

        font-size: 9px;
    }

    .font-size-control input {
        width: 100%;
    }

    .reset-settings-section {
        padding-bottom: 8px;
    }

    .reset-settings-description {
        margin: -2px 0 12px;

        color: #a6a6af;

        font-size: 11px;
        line-height: 1.45;
    }

    .reset-settings-button {
        width: 100%;

        padding: 8px 10px;

        color: #ffb3b3;
        background: rgba(255, 70, 70, 0.08);

        border: 1px solid rgba(255, 85, 85, 0.22);
        border-radius: 6px;

        font: inherit;
        font-size: 11px;
        font-weight: 500;

        cursor: pointer;

        transition:
            background 120ms ease,
            border-color 120ms ease,
            color 120ms ease;
    }

    .reset-settings-button:hover {
        color: #fff;
        background: rgba(255, 70, 70, 0.16);
        border-color: rgba(255, 90, 90, 0.38);
    }

    .reset-settings-button:focus-visible {
        outline: 2px solid #ff6b6b;
        outline-offset: 2px;
    }

    @keyframes drawer-in {
        from {
            opacity: 0;
            transform: translateX(10px);
        }

        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @media (max-width: 959px) {
        .drawer {
            position: absolute;

            top: 0;
            right: 0;
            bottom: 0;

            width: min(var(--drawer-width), 88vw);
            box-shadow: -14px 0 40px rgba(0, 0, 0, 0.3);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .drawer {
            animation: none;
        }
    }
</style>
