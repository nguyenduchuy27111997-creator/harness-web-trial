"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { subscribeToBooks } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";

const DEBOUNCE_MS = 500;

// Refreshes the list when one of the user's books changes elsewhere. Renders nothing.
export function LiveRefresh({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    };
    const unsubscribe = subscribeToBooks(createClient(), userId, refresh, () => router.refresh());
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [router, userId]);
  return null;
}
