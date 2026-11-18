import assert from "node:assert/strict";
import { mock, test } from "node:test";

const requests = [];
const connections = [];
const badges = [];
const live = [];

mock.module("../src/lib/twitch/users.js", {
    namedExports: {
        getCurrentUser: ({ signal }) => new Promise((resolve) => {
            requests.push({ resolve, signal });
        }),
    },
});
mock.module("../src/lib/chat/client.js", {
    namedExports: {
        createChatClient: () => ({
            store: {},
            connect: async ({ channelLogin }) => {
                connections.push(channelLogin);
                return { id: channelLogin, login: channelLogin };
            },
            disconnect() {},
            getState() {},
        }),
    },
});
mock.module("../src/lib/twitch/badges.js", {
    namedExports: {
        clearBadgeCatalog() {},
        loadBadgeCatalog: (id) => badges.push(id),
    },
});
mock.module("../src/lib/twitch/live-info.js", {
    namedExports: {
        stopLiveInfo() {},
        startLiveInfo: (id) => live.push(id),
    },
});

const { connectChat, disconnectChat } = await import("../src/lib/chat/runtime.js");

test("resposta antiga de identidade não reconecta nem carrega dados do canal anterior", async () => {
    const old = connectChat({ channelLogin: "old" });
    const rejected = assert.rejects(old, { name: "AbortError" });
    disconnectChat();
    assert.equal(requests[0].signal.aborted, true);
    const current = connectChat({ channelLogin: "new" });
    requests[1].resolve({ id: "1", login: "viewer" });
    await current;
    requests[0].resolve({ id: "1", login: "viewer" });
    await rejected;
    assert.deepEqual(connections, ["new"]);
    assert.deepEqual(badges, ["new"]);
    assert.deepEqual(live, ["new"]);
    disconnectChat();
});

test("logout durante consulta de identidade impede abertura posterior do chat", async () => {
    const before = connections.length;
    const pending = connectChat();
    const rejected = assert.rejects(pending, { name: "AbortError" });
    const request = requests.at(-1);
    disconnectChat();
    request.resolve({ id: "1", login: "viewer" });
    await rejected;
    assert.equal(connections.length, before);
});
