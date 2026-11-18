import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { get } from "svelte/store";

let failStream = false;
let failChannel = false;
let stream = { title: "Live", viewer_count: 42, started_at: "2026-01-01T00:00:00Z" };

mock.module("../src/lib/twitch/api.js", {
    namedExports: {
        twitchApiRequest: async (path) => {
            if (path === "streams") {
                if (failStream) throw Error("Rede indisponível");
                return { data: stream ? [stream] : [] };
            }
            if (failChannel) throw Error("Rede indisponível");
            return { data: [{ title: "Canal", game_name: "Categoria" }] };
        },
    },
});

const { liveInfo, startLiveInfo, stopLiveInfo, refreshLiveInfo } =
    await import("../src/lib/twitch/live-info.js");

test("falha de consulta vira estado desconhecido e resposta vazia confirma offline", async (t) => {
    t.after(stopLiveInfo);
    await startLiveInfo("1");
    assert.equal(get(liveInfo).live, true);
    failStream = true;
    await refreshLiveInfo();
    assert.equal(get(liveInfo).live, null);
    assert.equal(get(liveInfo).viewers, null);
    assert.equal(get(liveInfo).status, "partial");
    failChannel = true;
    await refreshLiveInfo();
    assert.equal(get(liveInfo).live, null);
    assert.equal(get(liveInfo).status, "error");
    failStream = false;
    failChannel = false;
    stream = null;
    await refreshLiveInfo();
    assert.equal(get(liveInfo).live, false);
    assert.equal(get(liveInfo).status, "ready");
});
