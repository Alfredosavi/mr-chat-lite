<script>
    import { onMount, onDestroy } from "svelte";

    import AuthWaiting from "./AuthWaiting.svelte";
    import AuthResult from "./AuthResult.svelte";
    import { createDeviceAuth } from "./device-auth.js";

    import "./AuthOverlay.css";
    import appIcon from "../../assets/app-icon.png";

    const FOCUSABLE_SELECTOR = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    export let onLinked = () => {};

    let status = "loading";
    let message = "";
    let userCode = "";
    let verificationUri = "";
    let remainingSeconds = 0;

    let panelElement = null;

    function updateState(update) {
        if (update.status !== undefined) {
            status = update.status;
        }

        if (update.message !== undefined) {
            message = update.message;
        }

        if (update.userCode !== undefined) {
            userCode = update.userCode;
        }

        if (update.verificationUri !== undefined) {
            verificationUri = update.verificationUri;
        }

        if (update.remainingSeconds !== undefined) {
            remainingSeconds = update.remainingSeconds;
        }
    }

    const auth = createDeviceAuth({
        onUpdate: updateState,
        onAuthorized: () => {
            onLinked();
        },
        successDelayMs: 1800,
    });

    function beginDevice() {
        auth.start();
    }

    function getFocusableElements() {
        if (!panelElement) return [];

        return Array.from(
            panelElement.querySelectorAll(FOCUSABLE_SELECTOR),
        ).filter(
            (element) =>
                element instanceof HTMLElement &&
                !element.hasAttribute("disabled") &&
                element.getAttribute("aria-hidden") !== "true",
        );
    }

    function handlePanelKeydown(event) {
        if (event.key !== "Tab") return;

        const focusableElements = getFocusableElements();

        if (focusableElements.length === 0) {
            event.preventDefault();
            panelElement?.focus();
            return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
            if (
                activeElement === firstElement ||
                activeElement === panelElement
            ) {
                event.preventDefault();
                lastElement.focus();
            }

            return;
        }

        if (activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    onMount(() => {
        panelElement?.focus();
        beginDevice();
    });

    onDestroy(() => {
        auth.destroy();
    });
</script>

<div class="auth-overlay-backdrop" role="presentation">
    <div
        class="auth-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        tabindex="-1"
        bind:this={panelElement}
        onkeydown={handlePanelKeydown}
    >
        <header class="auth-header">
            <div class="auth-twitch-mark" aria-hidden="true">
                <img src={appIcon} alt="" class="auth-app-icon" />
            </div>

            <div>
                <span class="auth-welcome">Bem-vindo ao</span>

                <h2 id="auth-title">Mr Chat Lite</h2>

                <p class="auth-subtitle">
                    Um leitor de chat da Twitch leve, simples e focado em
                    leitura.
                </p>
            </div>
        </header>

        <div class="auth-project-info">
            <p>
                O Mr Chat Lite é um projeto <strong>open source</strong>. Você
                pode consultar o código-fonte, acompanhar o desenvolvimento e
                contribuir pelo GitHub.
            </p>

            <a
                class="auth-repository-link"
                href="https://github.com/alfredosavi/mr-chat-lite"
                target="_blank"
                rel="noopener noreferrer"
            >
                <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path
                        d="M12 .7a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.23c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.77.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.29-1.23 3.29-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .7Z"
                    />
                </svg>

                Ver projeto no GitHub
            </a>
        </div>

        {#if status === "waiting"}
            <div class="auth-connect-header">
                <h3>Conectar sua conta Twitch</h3>

                <p>
                    Para receber as mensagens do chat, autorize o acesso
                    seguindo os passos abaixo.
                </p>
            </div>

            <AuthWaiting {userCode} {verificationUri} {remainingSeconds} />
        {:else}
            <AuthResult {status} {message} onRetry={beginDevice} />
        {/if}
    </div>
</div>
