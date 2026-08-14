<script>
    export let status = "loading";
    export let message = "";
    export let onRetry = () => {};
</script>

{#if status === "loading"}
    <div class="auth-result" role="status" aria-live="polite">
        <div class="auth-spinner" aria-hidden="true"></div>
        <strong>Preparando autenticação</strong>
        <p>Solicitando um código à Twitch...</p>
    </div>
{:else if status === "success"}
    <div class="auth-result" role="status" aria-live="polite">
        <div
            class="auth-result-icon auth-result-icon-success"
            aria-hidden="true"
        >
            ✓
        </div>

        <h3>Conta conectada</h3>
        <p>Autorização concluída. Preparando o chat...</p>
    </div>
{:else if status === "expired"}
    <div class="auth-result" role="status" aria-live="polite">
        <div class="auth-result-icon" aria-hidden="true">↻</div>

        <h3>Código expirado</h3>
        <p>O código tem validade limitada. Gere um novo para continuar.</p>

        <button
            class="auth-twitch-button auth-result-action"
            type="button"
            onclick={onRetry}
        >
            Gerar novo código
        </button>
    </div>
{:else if status === "error"}
    <div class="auth-result" role="alert">
        <div class="auth-result-icon auth-result-icon-error" aria-hidden="true">
            !
        </div>

        <h3>Não foi possível conectar</h3>
        <p>{message}</p>

        <button
            class="auth-twitch-button auth-result-action"
            type="button"
            onclick={onRetry}
        >
            Tentar novamente
        </button>
    </div>
{:else}
    <div class="auth-result" role="alert">
        <div class="auth-result-icon auth-result-icon-error" aria-hidden="true">
            !
        </div>

        <h3>Estado de autenticação inválido</h3>
        <p>Não foi possível continuar a autenticação.</p>

        <button
            class="auth-twitch-button auth-result-action"
            type="button"
            onclick={onRetry}
        >
            Tentar novamente
        </button>
    </div>
{/if}
