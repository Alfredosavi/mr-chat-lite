<script>
    import { onMount, onDestroy } from "svelte";

    import AuthOverlay from "./components/AuthOverlay/AuthOverlay.svelte";

    import {
        createAuthSession,
        SESSION_STATUS,
    } from "./lib/auth/session.js";

    let sessionState = {
        status: SESSION_STATUS.IDLE,
        user: null,
        lastValidatedAt: null,
        validationError: null,
    };

    let operationError = "";

    const session = createAuthSession({
        onUpdate(nextState) {
            sessionState = nextState;
        },
    });

    onMount(() => {
        session.start().catch((error) => {
            console.error(
                "[App] Falha inesperada ao iniciar sessão.",
                error,
            );

            operationError =
                "Não foi possível iniciar a sessão.";
        });
    });

    onDestroy(() => {
        session.destroy();
    });

    async function handleAuthLinked() {
        operationError = "";

        try {
            /*
             * Mesmo depois do Device Flow terminar,
             * validamos o token antes de liberar o app.
             */
            await session.revalidate({
                force: true,
            });
        } catch (error) {
            console.error(
                "[App] Falha ao validar nova autenticação.",
                error,
            );

            operationError =
                "Não foi possível validar a sessão.";
        }
    }

    async function retrySession() {
        operationError = "";

        try {
            await session.revalidate({
                force: true,
            });
        } catch (error) {
            console.error(
                "[App] Falha ao verificar sessão.",
                error,
            );

            operationError =
                "Não foi possível verificar a sessão.";
        }
    }

    function logout() {
        operationError = "";
        session.logout();
    }

    async function disconnect() {
        operationError = "";

        try {
            await session.disconnect();
        } catch (error) {
            console.error(
                "[App] Falha inesperada ao desvincular Twitch.",
                error,
            );

            operationError =
                "Não foi possível desvincular a conta.";
        }
    }
</script>

{#if sessionState.status === SESSION_STATUS.IDLE ||
    sessionState.status === SESSION_STATUS.CHECKING}

    <main class="session-page">
        <div class="session-card">
            <div class="spinner"></div>

            <h1>Mr Chat Lite</h1>

            <p>Verificando sua sessão Twitch...</p>
        </div>
    </main>

{:else if sessionState.status === SESSION_STATUS.UNAUTHENTICATED}

    <AuthOverlay onLinked={handleAuthLinked} />

{:else if sessionState.status === SESSION_STATUS.AUTHENTICATED}

    <main class="session-page">
        <div class="session-card">
            <span class="session-status session-status-ok">
                ● Autenticado
            </span>

            <h1>Mr Chat Lite</h1>

            <p>
                Sessão Twitch funcionando corretamente.
            </p>

            {#if sessionState.user}
                <div class="user-info">
                    <span>Usuário</span>

                    <strong>
                        {sessionState.user.login}
                    </strong>

                    <small>
                        ID: {sessionState.user.id}
                    </small>
                </div>
            {/if}

            {#if sessionState.validationError === "network"}
                <p class="warning">
                    A última validação falhou por problema de rede.
                    A sessão anteriormente validada foi mantida.
                </p>
            {/if}

            <div class="actions">
                <button
                    type="button"
                    onclick={logout}
                >
                    Sair localmente
                </button>

                <button
                    type="button"
                    class="danger"
                    onclick={disconnect}
                >
                    Desvincular Twitch
                </button>
            </div>
        </div>
    </main>

{:else if sessionState.status === SESSION_STATUS.UNAVAILABLE}

    <main class="session-page">
        <div class="session-card">
            <span class="session-status session-status-warning">
                ● Twitch indisponível
            </span>

            <h1>Não foi possível verificar sua sessão</h1>

            <p>
                Existe uma sessão armazenada, mas não foi possível
                validá-la agora. Verifique sua conexão.
            </p>

            <button
                type="button"
                onclick={retrySession}
            >
                Tentar novamente
            </button>
        </div>
    </main>

{:else if sessionState.status === SESSION_STATUS.MISCONFIGURED}

    <main class="session-page">
        <div class="session-card">
            <span class="session-status session-status-error">
                ● Configuração inválida
            </span>

            <h1>Client ID não configurado</h1>

            <p>
                Configure
                <code>VITE_TWITCH_CLIENT_ID</code>
                antes de iniciar o Mr Chat Lite.
            </p>
        </div>
    </main>

{:else if sessionState.status === SESSION_STATUS.DISCONNECTING}

    <main class="session-page">
        <div class="session-card">
            <div class="spinner"></div>

            <h1>Desvinculando Twitch</h1>

            <p>Aguarde enquanto a sessão é encerrada.</p>
        </div>
    </main>

{/if}

{#if operationError}
    <div class="operation-error" role="alert">
        {operationError}
    </div>
{/if}

<style>
    .session-page {
        min-height: 100vh;

        display: grid;
        place-items: center;

        padding: 24px;

        background: #111116;
        color: #f4f4f5;
    }

    .session-card {
        width: min(100%, 420px);

        display: flex;
        flex-direction: column;
        align-items: center;

        gap: 14px;

        padding: 28px;

        text-align: center;

        background: #1b1b22;

        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
    }

    h1 {
        margin: 0;
        font-size: 22px;
    }

    p {
        margin: 0;

        color: #a7a7b1;

        font-size: 13px;
        line-height: 1.5;
    }

    .session-status {
        font-size: 12px;
        font-weight: 600;
    }

    .session-status-ok {
        color: #63db93;
    }

    .session-status-warning {
        color: #e7bc67;
    }

    .session-status-error {
        color: #ff6b78;
    }

    .user-info {
        width: 100%;

        display: grid;

        gap: 5px;

        padding: 14px;

        background: rgba(255, 255, 255, 0.03);

        border-radius: 10px;
    }

    .user-info span,
    .user-info small {
        color: #8f8f99;
        font-size: 11px;
    }

    .user-info strong {
        font-size: 16px;
    }

    .warning {
        padding: 10px 12px;

        color: #d7b66f;

        background: rgba(231, 188, 103, 0.08);

        border: 1px solid rgba(231, 188, 103, 0.15);
        border-radius: 8px;
    }

    .actions {
        width: 100%;

        display: flex;

        gap: 10px;
    }

    button {
        min-height: 40px;

        flex: 1;

        padding: 0 14px;

        color: #fff;

        background: #33333d;

        border: none;
        border-radius: 8px;

        cursor: pointer;
    }

    button:hover {
        background: #41414d;
    }

    button:focus-visible {
        outline: 2px solid #b995ff;
        outline-offset: 3px;
    }

    button.danger {
        background: #8d303a;
    }

    button.danger:hover {
        background: #a63a46;
    }

    code {
        color: #c7adff;
    }

    .spinner {
        width: 32px;
        height: 32px;

        border: 3px solid rgba(255, 255, 255, 0.08);
        border-top-color: #9146ff;
        border-radius: 50%;

        animation: spin 700ms linear infinite;
    }

    .operation-error {
        position: fixed;

        left: 50%;
        bottom: 20px;

        transform: translateX(-50%);

        padding: 10px 14px;

        color: #fff;
        background: #8d303a;

        border-radius: 8px;

        font-size: 12px;
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
