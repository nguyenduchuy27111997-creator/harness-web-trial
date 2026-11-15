import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

const LOST = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

// Listens to the owner's private books topic. A SUBSCRIBED after a lost connection calls onReconnect.
export function subscribeToBooks(supabase: SupabaseClient<Database>, userId: string, onChange: () => void, onReconnect: () => void): () => void {
  let stopped = false;
  let lost = false;
  const channel = supabase.channel("books:" + userId, { config: { private: true } });
  void supabase.realtime.setAuth().then(() => {
    if (stopped) return;
    channel.on("broadcast", { event: "*" }, () => onChange()).subscribe((status) => {
      if (LOST.has(status)) lost = true;
      else if (status === "SUBSCRIBED" && lost) {
        lost = false;
        onReconnect();
      }
    });
  });
  return () => {
    stopped = true;
    void supabase.removeChannel(channel);
  };
}
