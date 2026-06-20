import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  enqueueAction,
  getQueue,
  removeFromQueue,
  markAttemptFailed,
  getQueueLength,
} from "../queue";

describe("offline queue", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it("starts empty", async () => {
    const queue = await getQueue();
    expect(queue).toEqual([]);
    expect(await getQueueLength()).toBe(0);
  });

  it("enqueues an action with a generated localId and zero attempts", async () => {
    const action = await enqueueAction("manual_checkin", { shopId: "shop-1" });

    expect(action.localId).toMatch(/^local_/);
    expect(action.type).toBe("manual_checkin");
    expect(action.attemptCount).toBe(0);
    expect(action.lastError).toBeNull();

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
  });

  it("preserves insertion order across multiple enqueues", async () => {
    await enqueueAction("manual_checkin", { order: 1 });
    await enqueueAction("verify_session", { order: 2 });
    await enqueueAction("void_session", { order: 3 });

    const queue = await getQueue();
    expect(queue.map((a) => a.payload.order)).toEqual([1, 2, 3]);
  });

  it("removes a specific action by localId without affecting others", async () => {
    const a1 = await enqueueAction("manual_checkin", { order: 1 });
    const a2 = await enqueueAction("verify_session", { order: 2 });

    await removeFromQueue(a1.localId);

    const queue = await getQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].localId).toBe(a2.localId);
  });

  it("increments attemptCount and records the error on a failed attempt", async () => {
    const action = await enqueueAction("verify_session", { sessionId: "s1" });

    await markAttemptFailed(action.localId, "Network request failed");

    const queue = await getQueue();
    expect(queue[0].attemptCount).toBe(1);
    expect(queue[0].lastError).toBe("Network request failed");
  });

  it("accumulates attemptCount across multiple failures", async () => {
    const action = await enqueueAction("verify_session", { sessionId: "s1" });

    await markAttemptFailed(action.localId, "error 1");
    await markAttemptFailed(action.localId, "error 2");
    await markAttemptFailed(action.localId, "error 3");

    const queue = await getQueue();
    expect(queue[0].attemptCount).toBe(3);
    expect(queue[0].lastError).toBe("error 3");
  });

  it("recovers gracefully from corrupted queue data instead of throwing", async () => {
    await AsyncStorage.setItem("wazini:offline_queue", "{not valid json");

    const queue = await getQueue();
    expect(queue).toEqual([]);
  });

  it("persists actions across separate getQueue calls (simulating app restart)", async () => {
    await enqueueAction("manual_checkin", { shopId: "shop-1" });

    // A fresh getQueue() call reads from AsyncStorage again, simulating
    // what happens after an app restart — the queue must survive that.
    const queueAfterReload = await getQueue();
    expect(queueAfterReload).toHaveLength(1);
  });
});
