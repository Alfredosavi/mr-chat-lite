<script>
    import { onDestroy } from "svelte";

    export let userCode = "";
    export let verificationUri = "";
    export let remainingSeconds = 0;

    let copied = false;
    let copyTimer = null;

    $: formattedRemaining = formatTime(remainingSeconds);
    $: canOpenTwitch = isSafeHttpsUrl(verificationUri);

    function formatTime(seconds) {
        const value = Math.max(0, Number(seconds) || 0);
        const minutes = Math.floor(value / 60);
        const secs = value % 60;

        return `${minutes}:${String(secs).padStart(2, "0")}`;
    }

    function getSafeHttpsUrl(value) {
        if (typeof value !== "string" || !value.trim()) {
            return null;
        }

        try {
            const url = new URL(value);

            return url.protocol === "https:" ? url.toString() : null;
        } catch {
            return null;
        }
    }

    function isSafeHttpsUrl(value) {
        return getSafeHttpsUrl(value) !== null;
    }

    async function copyCode() {
        if (!userCode) return;

        try {
            await navigator.clipboard.writeText(userCode);

            copied = true;

            if (copyTimer) {
                clearTimeout(copyTimer);
            }

            copyTimer = setTimeout(() => {
                copied = false;
                copyTimer = null;
            }, 1800);
        } catch {
            copied = false;
        }
    }

    function openTwitch() {
        const safeUri = getSafeHttpsUrl(verificationUri);

        if (!safeUri) return;

        window.open(safeUri, "_blank", "noopener,noreferrer");
    }

    onDestroy(() => {
        if (copyTimer) {
            clearTimeout(copyTimer);
        }
    });
</script>

<div class="auth-instructions">
    <div class="auth-step">
        <span class="auth-step-number">1</span>
        <span>Abra a página de autorização da Twitch.</span>
    </div>

    <div class="auth-step">
        <span class="auth-step-number">2</span>
        <span>Confira o código exibido abaixo.</span>
    </div>

    <div class="auth-step">
        <span class="auth-step-number">3</span>
        <span>Autorize o Mr Chat Lite a acessar o chat.</span>
    </div>
</div>

<div class="auth-code-card">
    <div class="auth-code-header">
        <span>Código de autorização</span>

        <span class="auth-expires" aria-live="polite">
            Expira em {formattedRemaining}
        </span>
    </div>

    <button
        class="auth-code"
        type="button"
        onclick={copyCode}
        title="Copiar código"
        aria-label="Copiar código de autorização"
    >
        {userCode}
    </button>

    <button
        class="auth-copy-link"
        type="button"
        onclick={copyCode}
        aria-live="polite"
    >
        {#if copied}
            ✓ Código copiado
        {:else}
            Copiar código
        {/if}
    </button>
</div>

<button
    class="auth-twitch-button"
    type="button"
    onclick={openTwitch}
    disabled={!canOpenTwitch}
>
    <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="currentColor"
        aria-hidden="true"
    >
        <path
            d="M4 2 2 6v14h5v3h3l3-3h4l5-5V2H4Zm16 12-3 3h-5l-3 3v-3H5V4h15v10Z"
        />
        <path d="M14 7h2v6h-2V7Zm-5 0h2v6H9V7Z" />
    </svg>

    Abrir Twitch para autorizar
</button>

<div class="auth-waiting-status" role="status" aria-live="polite">
    <span class="auth-pulse" aria-hidden="true"></span>
    <span>Aguardando autorização automaticamente...</span>
</div>

<div class="auth-security-note">
    <span class="auth-security-icon" aria-hidden="true">◈</span>

    <p>
        Sua senha da Twitch nunca é informada ao Mr Chat Lite. A autorização
        acontece diretamente no site da Twitch e concede
        <span class="auth-read-only">somente acesso de leitura ao chat</span>.
    </p>
</div>
