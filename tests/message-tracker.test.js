import assert from "node:assert/strict";
import { test } from "node:test";
import { createMessageTracker } from "../src/lib/chat/message-tracker.js";

const message = (id) => ({ id });

test("conta apenas mensagens visíveis em lotes, mesmo com última bloqueada", () => {
    const tracker = createMessageTracker();
    const a = message("a");
    const blocked = message("blocked");
    const b = message("b");
    const c = message("c");
    tracker.update([a], [a]);
    assert.equal(tracker.update([a, blocked, b], [a, b]), 1);
    assert.equal(tracker.update([a, blocked, b, c, message("blocked2")], [a, b, c]), 1);
});

test("desbloquear mensagens antigas não as conta como novas", () => {
    const tracker = createMessageTracker();
    const messages = [message("a"), message("b")];
    tracker.update(messages, []);
    assert.equal(tracker.update(messages, messages), 0);
});

test("conta lotes após poda do buffer e reinicia após troca de canal", () => {
    const tracker = createMessageTracker();
    tracker.update([message("a"), message("b"), message("c")], []);
    const messages = [message("c"), message("d"), message("e")];
    assert.equal(tracker.update(messages, messages), 2);
    tracker.update([], []);
    assert.equal(tracker.update([message("a")], [message("a")]), 1);
});
