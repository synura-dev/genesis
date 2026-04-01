import { Genesis } from "../src/genesis";

/**
 * ⚡ GENESIS PERFORMANCE BENCHMARK
 * Testing: 1,000,000 Requests
 */
async function runPerfTest() {
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

	// --- TEST 1: RAW PERFORMANCE (NO INTERCEPTORS) ---
	let start = performance.now();
	for (let i = 0; i < count; i++) {
		await g.request("core", "ping");
	}
	let end = performance.now();
	let duration = (end - start) / 1000;
	console.log(
		`✅ [RAW] Sync Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
	);

	// --- TEST 2: WITH SYNC INTERCEPTOR ---
	g.intercept(() => {}); // Empty sync interceptor
	start = performance.now();
	for (let i = 0; i < count; i++) {
		await g.request("core", "ping");
	}
	end = performance.now();
	duration = (end - start) / 1000;
	console.log(
		`✅ [SYNC INTERCEPT] Sync Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
	);

	// --- TEST 3: WITH ASYNC REQUEST ---
	start = performance.now();
	for (let i = 0; i < count; i++) {
		await g.request("core", "pingAsync");
	}
	end = performance.now();
	duration = (end - start) / 1000;
	console.log(
		`✅ [ASYNC] Async Request: ${duration.toFixed(4)}s (${Math.floor(count / duration).toLocaleString()} RPS)`,
	);

	const info = g.info();
	console.log(`\n📊 Internal Metrics (TypedArray):`);
	console.log(`   - Status: ${info.health}`);
	console.log(`   - Latency: ${info.pulse?.latency.toFixed(6)}ms`);
	console.log(
		`   - Total Requests: ${info.pulse?.totalRequests.toLocaleString()}`,
	);
}

runPerfTest().catch(console.error);
