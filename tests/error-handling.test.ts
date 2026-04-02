import { describe, expect, it } from "bun:test";
import { Genesis } from "../src/genesis";

describe("⚡ Genesis Error Handling", () => {
	it("should distinguish Genesis System Errors", async () => {
		const g = await new Genesis("core").boot();

		try {
			await g.request("core", "non-existent");
		} catch (error: unknown) {
			const err = error as Error;
			expect(err.message).toContain("[Genesis]");
			expect(err.message).toContain("not found");
			expect(
				(err as unknown as Record<string, unknown>).genesis,
			).toBeUndefined();
		}
	});

	it("should tag and contextualize User Sync Errors WITHOUT modifying the message", async () => {
		const g = await new Genesis("core")
			.expose({
				fail: () => {
					throw new Error("User logic failed");
				},
			})
			.boot();

		try {
			g.request("core", "fail");
		} catch (error: unknown) {
			const err = error as Error & { genesis: { type: string } };
			expect(err.message).not.toContain("[User]");
			expect(err.message).toBe("User logic failed");
			expect(err.genesis.type).toBe("HANDLER_ERROR");
		}
	});

	it("should tag and contextualize User Async Errors WITHOUT modifying the message", async () => {
		const g = await new Genesis("core")
			.expose({
				failAsync: async () => {
					await Promise.resolve();
					throw new Error("Async failure");
				},
			})
			.boot();

		try {
			await g.request("core", "failAsync");
		} catch (error: unknown) {
			const err = error as Error & { genesis: { type: string } };
			expect(err.message).not.toContain("[User]");
			expect(err.message).toBe("Async failure");
			expect(err.genesis.type).toBe("HANDLER_ERROR");
		}
	});

	it("should update metrics correctly on sync and async errors", async () => {
		const g = await new Genesis("core")
			.expose({
				syncErr: () => {
					throw new Error("1");
				},
				asyncErr: async () => {
					throw new Error("2");
				},
			})
			.boot();

		try {
			g.request("core", "syncErr");
		} catch {}
		try {
			await g.request("core", "asyncErr");
		} catch {}

		const info = g.info();
		expect(info.pulse?.totalRequests).toBe(2);
		expect(info.pulse?.totalErrors).toBe(2);
	});

	it("should trigger interceptors on both sync and async errors", async () => {
		let interceptedError: Error | null = null;
		const g = await new Genesis("core")
			.expose({
				fail: async () => {
					throw new Error("Intercept me");
				},
			})
			.intercept((action) => {
				if (action.error) interceptedError = action.error as Error;
			})
			.boot();

		try {
			await g.request("core", "fail");
		} catch {}

		expect(interceptedError).not.toBeNull();
		expect((interceptedError as unknown as Error).message).toContain(
			"Intercept me",
		);
	});
});
