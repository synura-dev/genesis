import { describe, expect, test } from "bun:test";
import { Genesis } from "../src/genesis";

describe("Step 2: GLifecycle Refactor", () => {
	test("should execute lifecycle hooks in order", async () => {
		const order: string[] = [];
		const g = new Genesis("core")
			.install(() => {
				order.push("install");
			})
			.ready(() => {
				order.push("ready");
			})
			.start(() => {
				order.push("start");
			});

		await g.heal();

		expect(order).toEqual(["install", "ready", "start"]);
	});

	test("should handle async hooks", async () => {
		const order: string[] = [];
		const g = new Genesis("async")
			.install(async () => {
				await new Promise((r) => setTimeout(r, 10));
				order.push("install");
			})
			.ready(() => {
				order.push("ready");
			});

		await g.heal();

		expect(order).toEqual(["install", "ready"]);
	});

	test("should support interceptors for hooks", async () => {
		const events: unknown[] = [];
		const g = new Genesis("intercepted")
			.intercept((action) => {
				if (action.type === "hook") {
					events.push(action.name);
				}
			})
			.install(() => {});

		await g.heal();

		expect(events).toContain("install");
		expect(events).toContain("ready");
		expect(events).toContain("start");
	});

	test("should support boot() for bulk node initialization", async () => {
		const order: string[] = [];
		const child = new Genesis("child").install(() =>
			order.push("child-install"),
		);

		const parent = new Genesis("parent")
			.install(() => order.push("parent-install"))
			.use(child);

		await parent.boot();

		// Boot order: install (parent, then child), then ready, then extension, then start
		expect(order).toEqual(["parent-install", "child-install"]);
	});
});
