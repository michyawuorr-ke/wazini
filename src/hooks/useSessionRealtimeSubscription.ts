import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { SessionWithCustomer } from "../types/domain";

type SessionChangeHandler = (event: {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  session: SessionWithCustomer | null;
  sessionId: string;
}) => void;

/**
 * Live Supabase Realtime subscription on the `session` table, scoped to
 * one shop. This is what makes the Business tab queue update instantly
 * — a new check-in (web app or manual_checkin) or a status change
 * (verified via any path, voided, abandoned) pushes into the UI the
 * moment it happens in Postgres, with no polling and no manual refresh.
 *
 * Requires migration 010_enable_realtime.sql to have been run — without
 * it, this subscribes successfully but never receives any events
 * (a silent no-op, not an error), since the table isn't in the
 * `supabase_realtime` publication.
 *
 * IMPORTANT — does not replace the offline queue or SMS-match flow:
 * those still drive the actual writes. This hook only listens for the
 * RESULT of any write reaching the database, regardless of which path
 * produced it (this device's own action, another device, the web app,
 * or a queued action finally syncing). That's deliberate — it makes
 * the queue correct even in scenarios this app has no other way of
 * knowing about, e.g. a second barber phone verifying a session, or
 * the customer web app creating a brand new check-in.
 *
 * COST NOTE (added after real-world multi-user scoping discussion):
 * each open realtime connection is billed/counted by Supabase. With
 * owner + multiple barbers all potentially running this app
 * simultaneously per shop, an always-on connection (mount-to-unmount,
 * regardless of whether the Business tab is actually visible) wastes
 * connections at scale — React Navigation typically keeps prior screens
 * mounted in its stack, so navigating to Customers does NOT unmount
 * Business by default. The `enabled` param lets the calling screen tie
 * this connection to actual screen focus (useFocusEffect) instead of
 * component lifecycle, closing the connection the moment the user
 * isn't looking at this screen, not just when they fully leave it.
 */
export function useSessionRealtimeSubscription(
  shopId: string | null,
  onChange: SessionChangeHandler,
  enabled: boolean = true
) {
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Keep the latest callback in a ref so the subscription effect below
  // doesn't need to re-subscribe every time the caller's callback
  // identity changes (e.g. due to closures over changing state) —
  // re-subscribing unnecessarily would mean a brief gap where events
  // could be missed.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!shopId || !enabled) return;

    const channel = supabase
      .channel(`session-changes-${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "session",
          filter: `shop_id=eq.${shopId}`,
        },
        (payload) => {
          const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
          const row = (payload.new ?? payload.old) as { id: string } | null;

          if (!row) return;

          // postgres_changes payloads do NOT include joined data (no
          // customer name/phone) — only the raw session row. The
          // calling screen is responsible for re-fetching full details
          // when needed (e.g. a fresh INSERT needs the customer's name
          // to render a queue row, which this event alone can't supply).
          onChangeRef.current({
            eventType,
            session: null,
            sessionId: row.id,
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [shopId, enabled]);
}
