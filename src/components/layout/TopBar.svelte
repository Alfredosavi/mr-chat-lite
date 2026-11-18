<script>
    import { onMount } from "svelte";
    import { userBlacklist } from "../../lib/stores/filters.js";
    import { liveInfo } from "../../lib/twitch/live-info.js";

    export let activePanel = null;

    export let channel = "";

    export let onSelectPanel = () => {};

    let tickerViewport;
    let tickerContent;

    let tickerOverflow = false;
    let tickerDistance = 0;
    let now = Date.now();

    function updateTicker() {
        if (!tickerViewport || !tickerContent) {
            return;
        }

        const viewportWidth = tickerViewport.getBoundingClientRect().width;

        const contentWidth = tickerContent.getBoundingClientRect().width;

        /*
         * Pequena margem para não deixar o último caractere
         * encostar/cortar antes de ativar o scroll.
         */
        const safetyMargin = 8;

        tickerOverflow = contentWidth > viewportWidth - safetyMargin;

        tickerDistance = tickerOverflow
            ? Math.max(0, contentWidth - viewportWidth + safetyMargin)
            : 0;
    }

    function formatViewers(value) {
        if (!Number.isFinite(value) || value < 0) {
            return "";
        }

        if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(1).replace(".0", "")}M`;
        }

        if (value >= 1_000) {
            return `${(value / 1_000).toFixed(1).replace(".0", "")}k`;
        }

        return String(value);
    }

    function formatUptime(startedAt, currentTime) {
        if (!startedAt) {
            return "";
        }

        const started = new Date(startedAt).getTime();

        if (!Number.isFinite(started) || started > currentTime) {
            return "";
        }

        const totalMinutes = Math.floor((currentTime - started) / 60_000);

        const days = Math.floor(totalMinutes / (24 * 60));

        const hours = Math.floor((totalMinutes % (24 * 60)) / 60);

        const minutes = totalMinutes % 60;

        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m`;
        }

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${minutes}m`;
    }

    $: liveTitle = $liveInfo.title;

    $: category = $liveInfo.category;

    $: viewers = $liveInfo.live ? formatViewers($liveInfo.viewers) : "";

    $: uptime = $liveInfo.live ? formatUptime($liveInfo.startedAt, now) : "";

    onMount(() => {
        updateTicker();

        const observer = new ResizeObserver(() => {
            updateTicker();
        });

        observer.observe(tickerViewport);
        observer.observe(tickerContent);

        const uptimeTimer = setInterval(() => {
            now = Date.now();
        }, 30_000);

        return () => {
            observer.disconnect();
            clearInterval(uptimeTimer);
        };
    });
</script>

<header class="topbar">
    <div class="channel-status">
        <span
    class="status-dot"
    class:live={$liveInfo.live}
    aria-hidden="true"
></span>

        <strong class="channel" title={`#${channel}`}>
            #{channel}
        </strong>
    </div>

    <div class="ticker" bind:this={tickerViewport}>
        <div
            class="ticker-content"
            class:scrolling={tickerOverflow}
            bind:this={tickerContent}
            style={`--ticker-distance: ${tickerDistance}px`}
        >
            {#if liveTitle}
                <span class="live-title">
                    {liveTitle}
                </span>
            {/if}

            {#if category}
                <span class="separator"> · </span>

                <span class="category">
                    {category}
                </span>
            {/if}

            {#if viewers}
                <span class="separator"> · </span>

                <span class="meta-item">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path
                            d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"
                        />

                        <circle cx="12" cy="12" r="2.5" />
                    </svg>

                    {viewers}
                </span>
            {/if}

            {#if uptime}
                <span class="separator"> · </span>

                <span class="meta-item">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />

                        <path d="M12 7v5l3 2" />
                    </svg>

                    {uptime}
                </span>
            {/if}
        </div>
    </div>

    <nav class="actions" aria-label="Menu principal">
        <button
            type="button"
            class="filter-action"
            class:active={activePanel === "filters"}
            aria-label="Filtros"
            aria-pressed={activePanel === "filters"}
            title="Filtros"
            onclick={() => onSelectPanel("filters")}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5h16l-6 7v5l-4 2v-7L4 5Z" />
            </svg>

            {#if $userBlacklist.length > 0}
                <span class="action-badge">
                    {$userBlacklist.length > 99 ? "99+" : $userBlacklist.length}
                </span>
            {/if}
        </button>
        <button
            type="button"
            class:active={activePanel === "users"}
            aria-label="Usuários"
            aria-pressed={activePanel === "users"}
            onclick={() => onSelectPanel("users")}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
                />
            </svg>
        </button>

        <button
            type="button"
            class:active={activePanel === "saved"}
            aria-label="Mensagens salvas"
            aria-pressed={activePanel === "saved"}
            title="Mensagens salvas"
            onclick={() => onSelectPanel("saved")}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3h12v18l-6-4-6 4V3Z" />
            </svg>
        </button>

        <button
            type="button"
            class:active={activePanel === "notifications"}
            aria-label="Notificações"
            aria-pressed={activePanel === "notifications"}
            onclick={() => onSelectPanel("notifications")}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                    d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM13.73 21a2 2 0 0 1-3.46 0"
                />
            </svg>
        </button>

        <button
            type="button"
            class:active={activePanel === "settings"}
            aria-label="Configurações"
            aria-pressed={activePanel === "settings"}
            onclick={() => onSelectPanel("settings")}
        >
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />

                <path
                    d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.37.37.7.6 1 .28.35.66.56 1.1.6H21v4h-.09a1.7 1.7 0 0 0-1.51.4Z"
                />
            </svg>
        </button>
    </nav>
</header>

<style>
    .topbar {
        position: relative;
        z-index: 30;

        width: 100%;
        height: 48px;

        min-width: 0;

        display: grid;

        /*
         * Canal | ticker | ações
         */
        grid-template-columns:
            minmax(70px, 120px)
            minmax(0, 1fr)
            auto;

        align-items: center;

        gap: 10px;
        padding: 0 8px 0 12px;
        overflow: hidden;
        background: #15151b;

        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
    }

    .channel-status {
        min-width: 0;

        display: flex;
        align-items: center;

        gap: 6px;

        overflow: hidden;
    }

    .status-dot {
    width: 7px;
    height: 7px;

    flex: 0 0 auto;

    border-radius: 50%;

    background: #62626c;

    box-shadow:
        0 0 0 3px
        rgba(98, 98, 108, 0.07);
}

.status-dot.live {
    background: #55d68b;

    box-shadow:
        0 0 0 3px
        rgba(85, 214, 139, 0.08);
}

    .channel {
        min-width: 0;

        overflow: hidden;

        color: #dedee3;

        font-size: 12px;
        font-weight: 600;

        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /*
     * Janela pela qual enxergamos
     * as informações da live.
     */
    .ticker {
        width: 100%;
        min-width: 0;

        overflow: hidden;

        /* mask-image: linear-gradient(
            to right,
            transparent 0,
            black 12px,
            black calc(100% - 12px),
            transparent 100%
        ); */
    }

    .ticker-content {
        width: max-content;

        display: flex;
        align-items: center;

        gap: 8px;

        color: #777781;

        font-size: 11px;

        white-space: nowrap;
    }

    .ticker-content.scrolling {
        animation: ticker-scroll 8s ease-in-out infinite alternate;

        will-change: transform;
    }

    .live-title {
        color: #c7c7ce;

        font-weight: 500;
    }

    .category {
        color: #8c8c96;
    }

    .separator {
        color: #50505a;
    }

    .meta-item {
        display: inline-flex;
        align-items: center;

        gap: 4px;

        font-variant-numeric: tabular-nums;
    }

    .meta-item svg {
        width: 12px;
        height: 12px;
        flex: 0 0 auto;
    }

    .actions {
        display: flex;
        align-items: center;
        gap: 2px;
    }

    .filter-action {
        position: relative;
    }

    .action-badge {
        position: absolute;

        top: 1px;
        right: 1px;

        min-width: 14px;
        height: 14px;

        display: flex;
        align-items: center;
        justify-content: center;

        padding: 0 3px;

        color: #fff;
        background: #9146ff;

        border: 2px solid #15151b;
        border-radius: 999px;

        font-size: 8px;
        font-weight: 700;
        line-height: 1;
    }

    button {
        width: 34px;
        height: 34px;

        display: grid;
        place-items: center;

        padding: 0;

        color: #92929d;
        background: transparent;

        border: 0;
        border-radius: 7px;

        cursor: pointer;

        transition:
            background 120ms ease,
            color 120ms ease;
    }

    button:hover {
        color: #f2f2f4;

        background: rgba(255, 255, 255, 0.06);
    }

    button.active {
        color: #cdb7ff;

        background: rgba(145, 70, 255, 0.14);
    }

    button:focus-visible {
        outline: 2px solid #9f75ff;
        outline-offset: -2px;
    }

    svg {
        fill: none;

        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
    }

    button svg {
        width: 17px;
        height: 17px;
    }

    @keyframes ticker-scroll {
        from {
            transform: translateX(0);
        }

        to {
            transform: translateX(calc(-1 * var(--ticker-distance)));
        }
    }

    @media (max-width: 430px) {
        .topbar {
            grid-template-columns:
                minmax(55px, 80px)
                minmax(0, 1fr)
                auto;

            gap: 5px;

            padding-left: 7px;
            padding-right: 4px;
        }

        .actions {
            gap: 0;
        }

        button {
            width: 30px;
        }
    }

    @media (prefers-reduced-motion: reduce) {
        /* .ticker {
            mask-image: none;
        } */

        .ticker-content.scrolling {
            animation: none;
        }
    }
</style>
