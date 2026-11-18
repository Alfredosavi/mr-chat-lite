<script>
    import TopBar from "./TopBar.svelte";
    import SideDrawer from "./SideDrawer.svelte";
    import ChatView from "../chat/ChatView.svelte";

    export let channel = "";
    export let onReconnectChannel =
    async () => {};

    let activePanel = null;

    function selectPanel(panel) {
        activePanel = activePanel === panel ? null : panel;
    }

    function closePanel() {
        activePanel = null;
    }
</script>

<div class="app-shell">
    <TopBar
    {activePanel}
    {channel}
    onSelectPanel={selectPanel}
/>

    <div class="workspace" class:drawer-open={activePanel !== null}>
        <main class="chat-stage">
            <div class="chat-container">
                <ChatView />
            </div>
        </main>

        {#if activePanel}
            <button
                class="drawer-backdrop"
                type="button"
                aria-label="Fechar painel"
                onclick={closePanel}
            ></button>

            <SideDrawer
    panel={activePanel}
    currentChannel={channel}
    onReconnectChannel={onReconnectChannel}
    onClose={closePanel}
/>
        {/if}
    </div>
</div>

<style>
    :global(*) {
        box-sizing: border-box;
    }

    :global(html),
    :global(body),
    :global(#app) {
        width: 100%;
        height: 100%;
        margin: 0;
    }

    :global(body) {
        overflow: hidden;

        background: #0d0d11;
        color: #f4f4f5;

        font-family:
            Inter,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
    }

    .app-shell {
        --topbar-height: 48px;
        --drawer-width: 340px;

        width: 100%;
        height: 100dvh;

        min-width: 0;

        display: grid;
        grid-template-rows:
            var(--topbar-height)
            minmax(0, 1fr);

        overflow: hidden;
        background: #0d0d11;
    }

    .workspace {
        position: relative;

        width: 100%;

        min-width: 0;
        min-height: 0;

        display: grid;
        grid-template-columns: minmax(0, 1fr);

        overflow: hidden;
    }

    .chat-stage {
        width: 100%;

        min-width: 0;
        min-height: 0;

        display: flex;
        justify-content: center;

        padding: 0;

        overflow: hidden;
    }

    .chat-container {
        width: 100%;

        min-width: 0;
        min-height: 0;

        display: flex;
        justify-content: center;

        padding: clamp(10px, 2.5vw, 40px);

        overflow: hidden;
    }

    .drawer-backdrop {
        position: absolute;
        inset: 0;

        z-index: 10;
        border: 0;
        background: rgba(0, 0, 0, 0.46);

        cursor: default;
    }

    @media (min-width: 960px) {
        .workspace.drawer-open {
            grid-template-columns:
                minmax(0, 1fr)
                var(--drawer-width);
        }

        .drawer-backdrop {
            display: none;
        }
    }
</style>
