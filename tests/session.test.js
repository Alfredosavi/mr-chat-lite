import assert from "node:assert/strict";
import { mock, test } from "node:test";

let token = "stored-token";
let validate = async () => ({ user_id: "1", login: "streamer" });

mock.module("../src/lib/auth/twitch.js", {
    namedExports: {
        getAccessToken: () => token,
        isTwitchConfigured: () => true,
        validateToken: (...args) => validate(...args),
        logout: () => { token = null; },
        disconnectTwitch: async () => { token = null; },
    },
});

const { createAuthSession } = await import("../src/lib/auth/session.js");

test("token armazenado é validado antes de autenticar e a validação se repete", async (t) => {
    token = "stored-token";
    t.mock.timers.enable({ apis: ["setTimeout"] });
    let calls = 0;
    let resolve;
    validate = () => {
        calls++;
        return new Promise((done) => { resolve = done; });
    };
    const session = createAuthSession({ validationIntervalMs: 1000 });
    t.after(() => session.destroy());
    const pending = session.start();
    assert.equal(calls, 1);
    assert.equal(session.getState().status, "checking");
    resolve({ user_id: "1", login: "streamer" });
    await pending;
    assert.deepEqual(session.getState().user, { id: "1", login: "streamer" });
    assert.equal(session.getState().status, "authenticated");
    t.mock.timers.tick(1000);
    assert.equal(calls, 2);
    resolve(null);
    await Promise.resolve();
    assert.equal(session.getState().status, "unauthenticated");
});

test("token recusado não autentica", async (t) => {
    token = "invalid";
    validate = async () => null;
    const session = createAuthSession();
    t.after(() => session.destroy());
    await session.start();
    assert.equal(session.getState().status, "unauthenticated");
});

test("resposta de validação após logout não ressuscita sessão", async (t) => {
    token = "stored-token";
    let resolve;
    validate = () => new Promise((done) => { resolve = done; });
    const session = createAuthSession();
    t.after(() => session.destroy());
    const pending = session.start();
    session.logout();
    resolve({ user_id: "1", login: "streamer" });
    await pending;
    assert.equal(session.getState().status, "unauthenticated");
});
