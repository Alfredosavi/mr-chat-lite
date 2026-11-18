<script>
    import { onMount, onDestroy } from "svelte";

    import AppShell from "./components/layout/AppShell.svelte";
    import AuthOverlay from "./components/AuthOverlay/AuthOverlay.svelte";
    import {
    channelSettings,
} from "./lib/stores/channel-settings.js";

    import {
        createAuthSession,
        SESSION_STATUS,
    } from "./lib/auth/session.js";

    import {
        connectChat,
        disconnectChat,
    } from "./lib/chat/runtime.js";

    let sessionState = {
        status: SESSION_STATUS.IDLE,
        user: null,
        lastValidatedAt: null,
        validationError: null,
    };

    let chatChannel = "";

    let chatConnectionStarted = false;
    let destroyed = false;

    async function ensureChatConnected(
    channelLogin =
        channelSettings.getChannelLogin(),
) {
        if (
            destroyed ||
            chatConnectionStarted
        ) {
            return;
        }

        chatConnectionStarted = true;

        try {
            const result = await connectChat({
    channelLogin,
});

            if (destroyed) {
                return;
            }

            chatChannel =
                result?.broadcaster?.login ??
                result?.currentUser?.login ??
                "";

            console.log(
                "[App] Chat Twitch inicializado.",
                {
                    channel: chatChannel,
                },
            );
        } catch (error) {
            if (destroyed) {
                return;
            }

            chatConnectionStarted = false;

            console.error(
                "[App] Não foi possível inicializar o chat.",
                error,
            );
        }
    }

    function stopChat() {
        chatConnectionStarted = false;
        chatChannel = "";

        disconnectChat();
    }

    async function handleReconnectChannel(
    channelLogin,
) {
    const normalized =
        channelSettings.normalize(
            channelLogin,
        );

    /*
     * Encerra a conexão atual antes
     * de trocar o broadcaster.
     */
    chatConnectionStarted = false;
    chatChannel = "";

    disconnectChat();

    await ensureChatConnected(
        normalized,
    );

    /*
     * Só persistimos se a conexão
     * realmente foi concluída.
     */
    channelSettings.save(
        normalized,
    );

    return chatChannel;
}

    const authSession = createAuthSession({
        onUpdate(nextState) {
            sessionState = nextState;

            if (
                nextState.status ===
                SESSION_STATUS.AUTHENTICATED
            ) {
                void ensureChatConnected();
                return;
            }

            if (
                nextState.status ===
                    SESSION_STATUS.UNAUTHENTICATED ||
                nextState.status ===
                    SESSION_STATUS.MISCONFIGURED ||
                nextState.status ===
                    SESSION_STATUS.DISCONNECTING
            ) {
                stopChat();
            }
        },
    });

    async function handleLinked() {
        await authSession.revalidate({
            force: true,
        });
    }

    onMount(() => {
        void authSession.start();
    });

    onDestroy(() => {
        destroyed = true;

        disconnectChat();
        authSession.destroy();
    });
</script>

{#if sessionState.status === SESSION_STATUS.AUTHENTICATED}
    <AppShell
    channel={chatChannel}
    onReconnectChannel={handleReconnectChannel}
/>
{:else if
    sessionState.status === SESSION_STATUS.IDLE ||
    sessionState.status === SESSION_STATUS.CHECKING ||
    sessionState.status === SESSION_STATUS.DISCONNECTING}
    <div class="session-loading" role="status">
        <div class="spinner" aria-hidden="true"></div>
        <span>Preparando o Mr Chat Lite...</span>
    </div>
{:else}
    <AuthOverlay onLinked={handleLinked} />
{/if}

<style>
    .session-loading {
        width: 100%;
        height: 100dvh;

        display: flex;
        align-items: center;
        justify-content: center;

        gap: 10px;

        color: #92929d;
        background: #0d0d11;

        font-size: 12px;
    }

    .spinner {
        width: 16px;
        height: 16px;

        border: 2px solid rgba(255, 255, 255, 0.1);
        border-top-color: #9f75ff;
        border-radius: 50%;

        animation: spin 700ms linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (prefers-reduced-motion: reduce) {
        .spinner {
            animation: none;
        }
    }
</style>
