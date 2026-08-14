import {
    startDeviceFlow,
    pollDeviceToken,
    commitDeviceAuthorization,
} from "../../lib/auth/twitch.js";

const DEFAULT_EXPIRES_IN = 1800;
const DEFAULT_INTERVAL = 5;
const DEFAULT_SUCCESS_DELAY_MS = 1800;
const DEFAULT_VERIFICATION_URI = "https://www.twitch.tv/activate";

function positiveNumber(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeNumber(value, fallback) {
    const parsed = Number(value);

    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function requiredString(value, fieldName) {
    if (typeof value !== "string" || !value.trim()) {
        throw new Error(`Campo obrigatório ausente: ${fieldName}.`);
    }

    return value.trim();
}

function normalizeVerificationUri(value) {
    const candidate =
        typeof value === "string" && value.trim()
            ? value.trim()
            : DEFAULT_VERIFICATION_URI;

    const url = new URL(candidate);

    if (url.protocol !== "https:") {
        throw new Error("URL de autorização inválida.");
    }

    return url.toString();
}

function normalizeDevicePayload(payload) {
    if (!payload || typeof payload !== "object") {
        throw new Error("Resposta de autenticação inválida.");
    }

    return {
        deviceCode: requiredString(payload.device_code, "device_code"),
        userCode: requiredString(payload.user_code, "user_code"),
        verificationUri: normalizeVerificationUri(
            payload.verification_uri_complete || payload.verification_uri,
        ),
        expiresIn: positiveNumber(payload.expires_in, DEFAULT_EXPIRES_IN),
        intervalSec: positiveNumber(payload.interval, DEFAULT_INTERVAL),
    };
}

export function createDeviceAuth({
    onUpdate = () => {},
    onAuthorized = () => {},
    successDelayMs = DEFAULT_SUCCESS_DELAY_MS,
} = {}) {
    let flowId = 0;

    let pollTimer = null;
    let countdownTimer = null;
    let successTimer = null;

    let currentDevice = null;
    let expiresAt = 0;

    const successDelay = nonNegativeNumber(
        successDelayMs,
        DEFAULT_SUCCESS_DELAY_MS,
    );

    function emit(update) {
        onUpdate(update);
    }

    function clearTimers() {
        if (pollTimer) {
            clearTimeout(pollTimer);
            pollTimer = null;
        }

        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }

        if (successTimer) {
            clearTimeout(successTimer);
            successTimer = null;
        }
    }

    function invalidateFlow() {
        flowId += 1;
        clearTimers();
    }

    async function start() {
        invalidateFlow();

        const id = flowId;

        currentDevice = null;
        expiresAt = 0;

        emit({
            status: "loading",
            message: "",
            userCode: "",
            verificationUri: "",
            remainingSeconds: 0,
        });

        try {
            const payload = await startDeviceFlow();

            if (id !== flowId) return;

            currentDevice = normalizeDevicePayload(payload);
            expiresAt = Date.now() + currentDevice.expiresIn * 1000;

            emit({
                status: "waiting",
                message: "",
                userCode: currentDevice.userCode,
                verificationUri: currentDevice.verificationUri,
                remainingSeconds: currentDevice.expiresIn,
            });

            startCountdown(id);
            schedulePoll(id);
        } catch {
            if (id !== flowId) return;

            currentDevice = null;
            expiresAt = 0;

            emit({
                status: "error",
                message: "Não foi possível iniciar a autenticação.",
            });
        }
    }

    function startCountdown(id) {
        updateRemainingTime(id);

        countdownTimer = setInterval(() => {
            updateRemainingTime(id);
        }, 1000);
    }

    function updateRemainingTime(id) {
        if (id !== flowId || !currentDevice) {
            return;
        }

        const remainingSeconds = Math.max(
            0,
            Math.ceil((expiresAt - Date.now()) / 1000),
        );

        emit({ remainingSeconds });

        if (remainingSeconds <= 0) {
            expire(id);
        }
    }

    function expire(id) {
        if (id !== flowId) return;

        clearTimers();

        currentDevice = null;
        expiresAt = 0;

        emit({
            status: "expired",
            remainingSeconds: 0,
            message: "O código de autorização expirou.",
        });
    }

    function schedulePoll(id) {
        if (id !== flowId || !currentDevice || pollTimer) {
            return;
        }

        pollTimer = setTimeout(
            () => poll(id),
            currentDevice.intervalSec * 1000,
        );
    }

    async function poll(id) {
        pollTimer = null;

        if (id !== flowId || !currentDevice) {
            return;
        }

        try {
            const result = await pollDeviceToken(currentDevice.deviceCode);

            if (id !== flowId) return;

            if (result?.status === "authorized") {
                /*
                 * Somente persiste os tokens depois de confirmar que
                 * esta resposta ainda pertence ao fluxo atual.
                 */
                commitDeviceAuthorization(result.tokenPair);

                clearTimers();

                currentDevice = null;
                expiresAt = 0;

                emit({
                    status: "success",
                    message: "Conta Twitch conectada com sucesso.",
                });

                successTimer = setTimeout(() => {
                    if (id === flowId) {
                        onAuthorized();
                    }
                }, successDelay);

                return;
            }

            if (result?.status === "pending") {
                schedulePoll(id);
                return;
            }

            if (result?.status === "expired") {
                expire(id);
                return;
            }

            clearTimers();
            currentDevice = null;
            expiresAt = 0;

            emit({
                status: "error",
                message: "A Twitch retornou uma resposta inesperada.",
            });
        } catch (error) {
            if (id !== flowId) return;

            clearTimers();

            const errorCode =
                typeof error?.code === "string"
                    ? error.code
                    : typeof error?.message === "string"
                      ? error.message
                      : "";

            currentDevice = null;
            expiresAt = 0;

            if (errorCode === "expired_token") {
                emit({
                    status: "expired",
                    remainingSeconds: 0,
                    message: "O código de autorização expirou.",
                });

                return;
            }

            emit({
                status: "error",
                message: "Não foi possível concluir a autenticação.",
            });
        }
    }

    function destroy() {
        invalidateFlow();
        currentDevice = null;
        expiresAt = 0;
    }

    return {
        start,
        destroy,
    };
}
