import assert from "node:assert/strict";
import { test } from "node:test";
import { createEventSubClient } from "../src/lib/twitch/eventsub.js";

class FakeSocket extends EventTarget {
    static CLOSED = 3;
    static CLOSING = 2;
    static instances = [];
    readyState = 1;

    constructor() {
        super();
        FakeSocket.instances.push(this);
    }

    close() {
        this.readyState = FakeSocket.CLOSED;
        this.dispatchEvent(new Event("close"));
    }

    welcome() {
        this.dispatchEvent(new MessageEvent("message", {
            data: JSON.stringify({
                metadata: { message_type: "session_welcome" },
                payload: { session: { id: "session", keepalive_timeout_seconds: 30 } },
            }),
        }));
    }
}

function setup(t, onWelcome) {
    const original = globalThis.WebSocket;
    globalThis.WebSocket = FakeSocket;
    FakeSocket.instances = [];
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const states = [];
    const client = createEventSubClient({
        onWelcome,
        onStateChange: (state) => states.push(state),
    });
    t.after(() => {
        client.stop();
        globalThis.WebSocket = original;
    });
    client.connect();
    return { client, states };
}

for (const error of [
    { code: "network_error" },
    { status: 429 },
    { status: 503 },
]) {
    test(`recria sessão/subscriptions após falha transitória ${JSON.stringify(error)}`, async (t) => {
        let attempts = 0;
        const { states } = setup(t, async () => {
            if (++attempts === 1) throw error;
        });
        FakeSocket.instances[0].welcome();
        await Promise.resolve();
        assert.equal(states.at(-1).status, "reconnecting");
        t.mock.timers.tick(1000);
        assert.equal(FakeSocket.instances.length, 2);
        FakeSocket.instances[1].welcome();
        await Promise.resolve();
        assert.equal(states.at(-1).status, "connected");
        assert.equal(attempts, 2);
    });
}

test("erro permanente encerra transporte e informa a causa", async (t) => {
    const error = { status: 403, code: "forbidden" };
    const { states } = setup(t, async () => { throw error; });
    FakeSocket.instances[0].welcome();
    await Promise.resolve();
    assert.equal(states.at(-1).status, "error");
    assert.equal(states.at(-1).error, error);
    t.mock.timers.tick(60_000);
    assert.equal(FakeSocket.instances.length, 1);
});

test("desconectar cancela uma reconexão pendente", async (t) => {
    const { client } = setup(t, async () => { throw { status: 503 }; });
    FakeSocket.instances[0].welcome();
    await Promise.resolve();
    client.stop();
    t.mock.timers.tick(60_000);
    assert.equal(FakeSocket.instances.length, 1);
});

test("watchdog também recupera uma conexão que não recebeu welcome", (t) => {
    setup(t, async () => {});
    t.mock.timers.tick(32_000);
    t.mock.timers.tick(1000);
    assert.equal(FakeSocket.instances.length, 2);
});
