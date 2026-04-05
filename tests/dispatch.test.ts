import { describe, expect, test } from "bun:test";
import { Genesis } from "../src/genesis";

describe("Step 3: GDispatch Refactor", () => {
	test("should handle RPC requests accurately", async () => {
		const g = new Genesis("core").expose({
			add: (_ctx, a: number, b: number) => a + b,
		});

		await g.heal();
		const result = await g.request("core", "add", 10, 20);
		expect(result).toBe(30);
	});

	test("should handle pub/sub events accurately", async () => {
		let received: any = null;
		const g = new Genesis("pubsub").events<["ping"]>("ping");

		g.subscribe("ping", (data) => {
			received = data.payload;
		});

		await g.heal();
		await g.broadcast("ping", "hello");

		expect(received).toBe("hello");
	});

	test("should support interceptors for communication", async () => {
		const logs: string[] = [];
		const g = new Genesis("intercepted")
			.intercept((action) => {
				logs.push(`${action.type}:${action.sender}`);
			})
			.expose({
				ping: () => "pong",
			});

		await g.heal();
		await g.request("intercepted", "ping");

		expect(logs).toContain("request:intercepted");
	});

	test("should handle errors and propagate correctly", async () => {
		const g = new Genesis("errors").expose({
			fail: () => {
				throw new Error("Boom");
			},
		});

		await g.heal();
		try {
			await g.request("errors", "fail");
		} catch (e: any) {
			expect(e.message).toBe("Boom");
			expect(e.genesis.type).toBe("HANDLER_ERROR");
		}
	});
});
