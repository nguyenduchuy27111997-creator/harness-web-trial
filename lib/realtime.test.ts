import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { subscribeToBooks } from "./realtime";

function fake() {
  let statusCb: (s: string) => void = () => {};
  let msgCb: () => void = () => {};
  const channel = {
    on: vi.fn((_t: string, _f: unknown, cb: () => void) => {
      msgCb = cb;
      return channel;
    }),
    subscribe: vi.fn((cb: (s: string) => void) => {
      statusCb = cb;
      return channel;
    }),
  };
  const client = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve("ok")),
    realtime: { setAuth: vi.fn(() => Promise.resolve()) },
  };
  return { client: client as unknown as SupabaseClient<Database>, raw: client, status: (s: string) => statusCb(s), message: () => msgCb() };
}

describe("subscribeToBooks", () => {
  it("joins the private topic and reports changes", async () => {
    const f = fake();
    const onChange = vi.fn();
    subscribeToBooks(f.client, "u1", onChange, vi.fn());
    await Promise.resolve();
    expect(f.raw.channel).toHaveBeenCalledWith("books:u1", { config: { private: true } });
    f.message();
    expect(onChange).toHaveBeenCalledOnce();
  });
  it("calls onReconnect only for SUBSCRIBED after a lost connection", async () => {
    const f = fake();
    const onReconnect = vi.fn();
    subscribeToBooks(f.client, "u1", vi.fn(), onReconnect);
    await Promise.resolve();
    f.status("SUBSCRIBED");
    expect(onReconnect).not.toHaveBeenCalled();
    f.status("CLOSED");
    f.status("SUBSCRIBED");
    expect(onReconnect).toHaveBeenCalledOnce();
  });
  it("removes the channel on unsubscribe", () => {
    const f = fake();
    subscribeToBooks(f.client, "u1", vi.fn(), vi.fn())();
    expect(f.raw.removeChannel).toHaveBeenCalled();
  });
});
