import { describe, expect, test } from "bun:test";
import { Genesis } from "../src/genesis";

describe("Step 1: GMetrics Refactor", () => {
	test("should record and calculate pulse correctly", async () => {
		const g = new Genesis("core").expose({
			ping: async () => "pong",
			error: () => {
				throw new Error("Expected");
			},
		});

		await g.heal();

		// Record some requests
		await g.request("core", "ping");
		await g.request("core", "ping");
		try {
			await g.request("core", "error");
		} catch (e) {
			// ignore
		}

		const info = g.info();
		const pulse = info.pulse;

		expect(pulse).toBeDefined();
		if (pulse) {
			expect(pulse.totalRequests).toBe(3);
			expect(pulse.totalErrors).toBe(1);
			expect(pulse.rps).toBeGreaterThan(0);
			expect(pulse.latency).toBeGreaterThanOrEqual(0);
		}
	});

	test("should handle child metrics aggregation", async () => {
		const child = new Genesis("child").expose({
			work: () => "done",
		});

		const parent = new Genesis("parent").use(child);

		await parent.heal();
		await child.heal();

		// Request to child
		await parent.request("child", "work");

		const info = parent.info({ recursive: true });
		expect(info.pulse?.totalRequests).toBe(1);

		const childInfo = info.children?.[0];
		expect(childInfo?.pulse?.totalRequests).toBe(1);
	});
});
