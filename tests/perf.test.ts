import { describe, expect, it } from "bun:test";
import { Genesis } from "../src/genesis";

describe("⚡ Genesis Performance Benchmark", () => {
	it("should handle high throughput requests", async () => {
		const g = await new Genesis("core")
			.expose({
				ping: () => "pong",
				pingAsync: async () => {
					await Promise.resolve();
					return "pong";
				},
			})
			.boot();

		const count = 1_000_000;

		console.log(
			`\n🚀 Starting Genesis Benchmark: ${count.toLocaleString()} requests...`,
		);

		// --- TEST 1: RAW PERFORMANCE ---
		let start = performance.now();
		for (let i = 0; i < count; i++) {
			const res = await g.request("core", "ping");
			expect(res).toBe("pong");
		}
		let end = performance.now();
		let duration = (end - start) / 1000;

		console.log(
			`✅ [RAW] Sync Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
		);

		// --- TEST 2: WITH SYNC INTERCEPTOR ---
		g.intercept(() => {});
		start = performance.now();

		for (let i = 0; i < count; i++) {
			const res = await g.request("core", "ping");
			expect(res).toBe("pong");
		}

		end = performance.now();
		duration = (end - start) / 1000;

		console.log(
			`✅ [SYNC INTERCEPT] Sync Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
		);

		// --- TEST 3: ASYNC REQUEST ---
		start = performance.now();

		for (let i = 0; i < count; i++) {
			const res = await g.request("core", "pingAsync");
			expect(res).toBe("pong");
		}

		end = performance.now();
		duration = (end - start) / 1000;

		console.log(
			`✅ [ASYNC] Async Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
		);

		// --- ASSERT INTERNAL STATE ---
		const info = g.info();

		expect(info).toBeDefined();
		expect(info.health).toBeTruthy();
		expect(info.pulse?.totalRequests).toBeGreaterThan(0);

		console.log(`\n📊 Internal Metrics (TypedArray):`);
		console.log(`   - Status: ${info.health}`);
		console.log(`   - Latency: ${info.pulse?.latency.toFixed(6)}ms`);
		console.log(
			`   - Total Requests: ${info.pulse?.totalRequests.toLocaleString()}`,
		);
	});
});
