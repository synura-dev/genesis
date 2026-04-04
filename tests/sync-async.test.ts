import { describe, expect, it } from "bun:test";
import { Genesis } from "../src/genesis";

describe("⚡ Genesis Sync-Async Logic", () => {
	it("should execute synchronous handlers synchronously", async () => {
		const g = await new Genesis("sync-core")
			.expose({
				ping: () => "pong",
			})
			.boot();

		// ⚡ TRICK: We don't await immediately to check if it's a Promise
		const result = g.request("sync-core", "ping");

		// In the new logic, if no interceptors and handler is sync,
		// result should NOT be an instance of Promise.
		expect(result instanceof Promise).toBe(false);
		expect(result).toBe("pong");
	});

	it("should handle asynchronous handlers correctly", async () => {
		const g = await new Genesis("async-core")
			.expose({
				pingAsync: async () => {
					await Promise.resolve();
					return "pong";
				},
			})
			.boot();

		const result = g.request("async-core", "pingAsync");

		expect(result instanceof Promise).toBe(true);
		expect(await result).toBe("pong");
	});

	it("should fall back to Promise if a sync service has an async interceptor", async () => {
		const g = await new Genesis("mixed-core")
			.expose({
				ping: () => "pong",
			})
			.boot();

		// Add async interceptor
		g.intercept(async () => {
			await Promise.resolve();
		});

		const result = g.request("mixed-core", "ping");

		expect(result instanceof Promise).toBe(true);
		expect(await result).toBe("pong");
	});

	it("should remain synchronous with synchronous interceptors", async () => {
		const g = await new Genesis("sync-itpc-core")
			.expose({
				ping: () => "pong",
			})
			.boot();

		// Add sync interceptor
		g.intercept(() => {
			// Do nothing
		});

		const result = g.request("sync-itpc-core", "ping");

		expect(result instanceof Promise).toBe(false);
		expect(result).toBe("pong");
	});

	it("should correctly handle event relay in mixed modes", async () => {
		let callCount = 0;
		const g = await new Genesis("event-core").events("test-event").boot();

		g.subscribe("test-event", () => {
			callCount++;
		});

		// Broadcast (Sync Path)
		const b1 = g.broadcast("test-event", {});
		expect(b1 instanceof Promise).toBe(false);
		expect(callCount).toBe(1);

		// Add async interceptor to break sync relay
		g.intercept(async () => {
			await Promise.resolve();
		});

		const b2 = g.broadcast("test-event", {});
		expect(b2 instanceof Promise).toBe(true);
		await b2;
		expect(callCount).toBe(2);
	});
});
