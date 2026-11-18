import assert from "node:assert/strict";
import { mock, test } from "node:test";

let transport;
mock.module("../src/lib/twitch/eventsub.js", {
    namedExports: {
        createEventSubClient: (callbacks) => {
            transport = callbacks;
            return { connect() {}, stop() {} };
        },
    },
});
mock.module("../src/lib/twitch/users.js", {
    namedExports: {
        getUserByLogin: async (login) => ({ id: "1", login }),
    },
});
mock.module("../src/lib/twitch/subscriptions.js", {
    namedExports: {
        CHAT_SUBSCRIPTION_TYPES: {
            MESSAGE: "channel.chat.message",
            MESSAGE_DELETE: "channel.chat.message_delete",
            CLEAR: "channel.chat.clear",
            CLEAR_USER_MESSAGES: "channel.chat.clear_user_messages",
            NOTIFICATION: "channel.chat.notification",
        },
        createChatSubscriptions: async () => ({ failed: [] }),
    },
});

const { createChatClient } = await import("../src/lib/chat/client.js");

test("conexão só conclui após transporte confirmar subscriptions prontas", async (t) => {
    const client = createChatClient();
    t.after(() => client.disconnect());
    let ready = false;
    const pending = client.connect({ channelLogin: "channel", userId: "2" });
    pending.then(() => { ready = true; });
    await Promise.resolve();
    transport.onStateChange({ status: "subscribing" });
    await Promise.resolve();
    assert.equal(ready, false);
    transport.onStateChange({ status: "connected" });
    assert.equal((await pending).login, "channel");
});

test("falha permanente é propagada ao chamador", async (t) => {
    const client = createChatClient();
    t.after(() => client.disconnect());
    const pending = client.connect({ channelLogin: "channel", userId: "2" });
    const rejected = assert.rejects(pending, /Sem permissão/);
    await Promise.resolve();
    transport.onStateChange({ status: "error", error: Error("Sem permissão") });
    await rejected;
});

test("desconectar libera a promessa que aguardava subscriptions", async () => {
    const client = createChatClient();
    const pending = client.connect({ channelLogin: "channel", userId: "2" });
    const rejected = assert.rejects(pending, { name: "AbortError" });
    await Promise.resolve();
    client.disconnect();
    await rejected;
});
