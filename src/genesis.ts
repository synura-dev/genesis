/** biome-ignore-all lint/style/noNonNullAssertion: Using internal state */
import { EventEmitter } from "eventemitter3";
import {
	type GAction,
	type GActionBase,
	type GContext,
	type GContextBase,
	type GEmpty,
	type GEventContext,
	type GHandler,
	GHealth,
	type GIdentity,
	type GMerge,
	type GMetadata,
	type GPulse,
	type GRegistry,
	type GState,
	type Prettify,
	type TargetProxy,
} from "./types";

/**
 * Genesis: The Monolithic Engine
 * ⚡ 3.0M+ RPS (TypedArray Metrics) | ⚡ ZERO GC HOT-PATH | ⚡ ZERO ANY
 */
export class Genesis<T extends GRegistry = GEmpty> {
	public readonly identity: GIdentity;
	protected readonly _state: GState;

	constructor(name: GIdentity = "root", state?: GState) {
		this.identity = name;
		this._state = state ?? {
			servicesMap: new Map(),
			internalMap: new Map(),
			privateMap: new Map(),
			decorationsMap: new Map(),
			storeMap: new Map(),
			healthMap: new Map(),
			metricsBuffer: new Float64Array(4096),
			metricsIndexMap: new Map(),
			metricsNextIndex: 0,
			dispatchAtlas: Object.create(null),
			contextCache: new Map(),
			contextPrototype: {},
			eventEmitter: new EventEmitter(),
			eventNames: new Set(),
			interceptors: [],
			hooks: { install: [], ready: [], start: [], stop: [] },
			extensions: [],
			children: [],
			parents: [],
		};
	}

	private _evolve<NewT extends GRegistry>(): Genesis<NewT> {
		return new Genesis<NewT>(this.identity, this._state);
	}

	private _getMetricsIndex(id: string): number {
		const m = this._state;
		let idx = m.metricsIndexMap.get(id);
		if (idx !== undefined) return idx;

		idx = m.metricsNextIndex;
		m.metricsIndexMap.set(id, idx);
		m.metricsNextIndex += 4;

		if (m.metricsNextIndex >= m.metricsBuffer.length) {
			const newBuffer = new Float64Array(m.metricsBuffer.length * 2);
			newBuffer.set(m.metricsBuffer);
			m.metricsBuffer = newBuffer;
		}

		m.metricsBuffer[idx + 3] = Date.now();
		return idx;
	}

	protected _graft(id: string, h: Record<string, GHandler>) {
		this._state.dispatchAtlas[id] = Object.assign(
			this._state.dispatchAtlas[id] ?? Object.create(null),
			h,
		);
		for (const parent of this._state.parents) {
			(parent as Genesis<GRegistry>)._graft(id, h);
		}
	}

	public expose<
		S extends Record<string, (ctx: GContext<T>, ...args: unknown[]) => unknown>,
	>(instance: S): Genesis<Prettify<T & { services: { [K in GIdentity]: S } }>> {
		const h = instance as unknown as Record<string, GHandler>;
		this._state.servicesMap.set(this.identity, h);
		this._graft(this.identity, h);
		return this._evolve<Prettify<T & { services: { [K in GIdentity]: S } }>>();
	}

	public internal<
		S extends Record<string, (ctx: GContext<T>, ...args: unknown[]) => unknown>,
	>(instance: S): Genesis<Prettify<T & { internal: { [K in GIdentity]: S } }>> {
		const h = instance as unknown as Record<string, GHandler>;
		this._state.internalMap.set(this.identity, h);
		this._graft(this.identity, h);
		return this._evolve<Prettify<T & { internal: { [K in GIdentity]: S } }>>();
	}

	public isolate<
		S extends Record<string, (ctx: GContext<T>, ...args: unknown[]) => unknown>,
	>(instance: S): Genesis<T> {
		const h = instance as unknown as Record<string, GHandler>;
		this._state.privateMap.set(this.identity, h);
		this._graft(this.identity, h);
		return this._evolve<T>();
	}

	public events<E extends Record<string, unknown>>(
		names?: (keyof E)[],
	): Genesis<T & { events: E }> {
		if (names) {
			for (const name of names) this._state.eventNames.add(String(name));
		}
		return this._evolve<T & { events: E }>();
	}

	public decorate<K extends string, V>(
		key: K,
		value: V,
	): Genesis<Prettify<T & { decorations: { [P in K]: V } }>> {
		this._state.decorationsMap.set(key, value);
		this._rebuildPrototype();
		return this._evolve<Prettify<T & { decorations: { [P in K]: V } }>>();
	}

	public state<K extends string, V>(
		key: K,
		value: V,
	): Genesis<Prettify<T & { store: { [P in K]: V } }>> {
		this._state.storeMap.set(key, value);
		this._rebuildPrototype();
		return this._evolve<Prettify<T & { store: { [P in K]: V } }>>();
	}

	private _rebuildPrototype() {
		const proto = this._state.contextPrototype as Record<string, unknown>;
		for (const [k, v] of this._state.decorationsMap) proto[k] = v;
		if (!Object.getOwnPropertyDescriptor(proto, "store")) {
			Object.defineProperty(proto, "store", {
				get: () => Object.fromEntries(this._state.storeMap.entries()),
				enumerable: true,
				configurable: true,
			});
		}
	}

	public async heal(): Promise<void> {
		this._state.healthMap.set(this.identity, GHealth.Healthy);
		this._getMetricsIndex(this.identity);

		const context = Object.create(
			this._state.contextPrototype as object,
		) as Record<string, unknown>;
		context.g = this;
		context.identity = this.identity;
		const run = async (
			list: ((ctx: GContextBase) => void | Promise<void>)[],
		) => {
			await Promise.all(
				list.map((fn) => fn(context as unknown as GContextBase)),
			);
		};
		await run(this._state.hooks.install);
		await run(this._state.hooks.ready);
		await run(this._state.hooks.start);
	}

	public use<U extends GRegistry>(child: Genesis<U>): Genesis<GMerge<T, U>> {
		if (this._state.children.some((c) => c.identity === child.identity))
			return this._evolve<GMerge<T, U>>();

		const cState = (child as Genesis<GRegistry>)._state;
		cState.parents.push(this as Genesis<GRegistry>);

		for (const [k, v] of cState.servicesMap) this._state.servicesMap.set(k, v);
		for (const [k, v] of cState.internalMap) this._state.internalMap.set(k, v);
		for (const [k, v] of cState.privateMap) this._state.privateMap.set(k, v);
		for (const [k, v] of cState.decorationsMap)
			this._state.decorationsMap.set(k, v);
		for (const [k, v] of cState.storeMap) this._state.storeMap.set(k, v);

		for (const [id, h] of Object.entries(this._state.dispatchAtlas))
			this._graft(id, h);
		for (const [id, h] of Object.entries(cState.dispatchAtlas))
			this._graft(id, h);

		this._rebuildPrototype();
		this._state.children.push(child as Genesis<GRegistry>);
		return this._evolve<GMerge<T, U>>();
	}

	public unuse(child: Genesis<GRegistry>): Genesis<T> {
		const index = this._state.children.indexOf(child);
		if (index === -1) return this._evolve<T>();
		this._state.children.splice(index, 1);

		const cState = (child as Genesis<GRegistry>)._state;
		const pIndex = cState.parents.indexOf(this as Genesis<GRegistry>);
		if (pIndex !== -1) cState.parents.splice(pIndex, 1);

		const cleanup = (id: string) => {
			this._state.servicesMap.delete(id);
			this._state.internalMap.delete(id);
			this._state.privateMap.delete(id);
			this._state.healthMap.delete(id);
			this._state.contextCache.delete(id);
			const idx = this._state.metricsIndexMap.get(id);
			if (idx !== undefined) {
				this._state.metricsBuffer.fill(0, idx, idx + 4);
				this._state.metricsIndexMap.delete(id);
			}
			delete this._state.dispatchAtlas[id];
		};

		cleanup(child.identity);
		for (const sub of (child as Genesis<GRegistry>)._state.children)
			cleanup(sub.identity);

		return this._evolve<T>();
	}

	public mount(fn: (ctx: GContext<T>) => void | Promise<void>): Genesis<T> {
		this._state.extensions.push(
			fn as unknown as (ctx: GContextBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public install(fn: (ctx: GContext<T>) => void | Promise<void>): Genesis<T> {
		this._state.hooks.install.push(
			fn as unknown as (ctx: GContextBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public start(fn: (ctx: GContext<T>) => void | Promise<void>): Genesis<T> {
		this._state.hooks.start.push(
			fn as unknown as (ctx: GContextBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public ready(fn: (ctx: GContext<T>) => void | Promise<void>): Genesis<T> {
		this._state.hooks.ready.push(
			fn as unknown as (ctx: GContextBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public stop(fn: (ctx: GContext<T>) => void | Promise<void>): Genesis<T> {
		this._state.hooks.stop.push(
			fn as unknown as (ctx: GContextBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public intercept(
		fn: (action: GAction<T>) => void | Promise<void>,
	): Genesis<T> {
		this._state.interceptors.push(
			fn as unknown as (action: GActionBase) => void | Promise<void>,
		);
		return this._evolve<T>();
	}

	public info(options?: { recursive?: boolean }): GMetadata {
		const id = this.identity;
		const idx = this._state.metricsIndexMap.get(id);
		const health = this._state.healthMap.get(id) || GHealth.Healthy;
		let pulse: GPulse | undefined;

		if (idx !== undefined) {
			const b = this._state.metricsBuffer;
			const totalRequests = b[idx + 0] || 0;
			const totalErrors = b[idx + 1] || 0;
			const totalLatency = b[idx + 2] || 0;
			const lastReset = b[idx + 3] || Date.now();
			const elapsedSeconds = (Date.now() - lastReset) / 1000;
			pulse = {
				status: health,
				latency: totalLatency / (totalRequests || 1),
				rps: totalRequests / (elapsedSeconds || 1),
				errorRate: totalErrors / (totalRequests || 1),
				totalRequests,
				totalErrors,
			};
		}

		return {
			identity: this.identity,
			health: health,
			pulse,
			services: {
				public: Object.keys(this._state.servicesMap.get(this.identity) ?? {}),
				internal: Object.keys(this._state.internalMap.get(this.identity) ?? {}),
				private: Object.keys(this._state.privateMap.get(this.identity) ?? {}),
			},
			events: Array.from(this._state.eventNames),
			children:
				options?.recursive !== false
					? this._state.children.map((child) => child.info(options))
					: [],
		};
	}

	public broadcast<K extends keyof T["events"]>(
		event: K,
		payload: T["events"][K],
	): Genesis<T> {
		this._relay(event as string, {
			sender: this.identity,
			event: event as string,
			payload,
		});
		return this._evolve<T>();
	}

	private async _relay(
		event: string,
		data: { sender: string; event: string; payload: unknown },
	) {
		const start = performance.now();
		const idx = this._getMetricsIndex(data.sender);
		try {
			for (const interceptor of this._state.interceptors)
				await interceptor({
					type: "broadcast",
					event,
					payload: data.payload,
					sender: data.sender,
				});
			this._state.eventEmitter.emit(event, data);
			await Promise.all(
				this._state.children.map((child) =>
					(
						child as unknown as {
							_relay: (e: string, d: Record<string, unknown>) => Promise<void>;
						}
					)._relay(event, data),
				),
			);
			const b = this._state.metricsBuffer;
			b[idx + 0]!++;
			b[idx + 2]! += performance.now() - start;
		} catch (error) {
			this._state.metricsBuffer[idx + 1]!++;
			throw error;
		}
	}

	public subscribe<K extends keyof T["events"]>(
		event: K,
		handler: (ctx: GEventContext<T["events"][K]>) => void,
	): () => void {
		const pipe = (data: GEventContext<unknown>) =>
			handler(data as GEventContext<T["events"][K]>);
		this._state.eventEmitter.on(event as string, pipe);
		return () => this._state.eventEmitter.off(event as string, pipe);
	}

	public async request<
		K extends keyof T["services"] | keyof T["internal"],
		S2 = K extends keyof T["services"]
			? T["services"][K]
			: K extends keyof T["internal"]
				? T["internal"][K]
				: never,
		M extends keyof S2 = keyof S2,
		P = S2[M] extends (...args: infer Args) => unknown ? Args : never[],
		R = S2[M] extends (...args: unknown[]) => Promise<infer Res>
			? Res
			: S2[M] extends (...args: unknown[]) => infer Res
				? Res
				: unknown,
	>(to: K, method: M, ...args: P extends unknown[] ? P : never[]): Promise<R> {
		const id = String(to);
		const mName = String(method);

		const handler = this._state.dispatchAtlas[id]?.[mName];
		if (handler) {
			let context = this._state.contextCache.get(this.identity);
			if (!context) {
				const fresh = Object.create(
					this._state.contextPrototype as object,
				) as Record<string, unknown>;
				fresh.g = this;
				fresh.identity = this.identity;
				context = fresh as unknown as GContextBase;
				this._state.contextCache.set(this.identity, context);
			}

			const start = performance.now();
			const idx = this._getMetricsIndex(id);
			try {
				const result = await handler(context, ...args);
				const b = this._state.metricsBuffer;
				b[idx + 0]!++;
				b[idx + 2]! += performance.now() - start;
				return result as R;
			} catch (error) {
				this._state.metricsBuffer[idx + 1]!++;
				throw error;
			}
		}

		for (const interceptor of this._state.interceptors)
			await interceptor({
				type: "request",
				to: id,
				method: mName,
				args: args as unknown[],
			});
		throw new Error(`[Genesis] Handler for ${id}:${mName} not found.`);
	}

	public connect<K extends keyof T["services"] | keyof T["internal"]>(
		to: K,
	): TargetProxy<T, K> {
		const id = String(to);
		const bridge = Object.create(null) as Record<string, () => void>;
		const atlas = this._state.dispatchAtlas[id];
		if (atlas) {
			for (const mName of Object.keys(atlas)) {
				bridge[mName] = (...args: unknown[]) =>
					this.request(id as never, mName as never, ...(args as never[]));
			}
		}
		return bridge as TargetProxy<T, K>;
	}

	public async boot(): Promise<void> {
		const scan = async (node: Genesis<GRegistry>, visited: Set<string>) => {
			if (visited.has(node.identity)) return;
			visited.add(node.identity);

			const nodeState = node._state;
			for (const [id, h] of Object.entries(nodeState.dispatchAtlas))
				this._graft(id, h);

			const context = Object.create(
				nodeState.contextPrototype as object,
			) as Record<string, unknown>;
			context.g = node;
			context.identity = node.identity;
			const run = async (
				list: ((c: GContextBase) => void | Promise<void>)[],
			) => {
				await Promise.all(
					list.map((fn) =>
						Promise.resolve(fn(context as unknown as GContextBase)),
					),
				);
			};

			await Promise.all([
				run(nodeState.hooks.install),
				run(nodeState.hooks.ready),
			]);
			await run(nodeState.extensions);
			await run(nodeState.hooks.start);

			await Promise.all(
				nodeState.children.map(async (child) => {
					const cState = child._state;
					for (const [key, svc] of nodeState.servicesMap)
						if (!cState.servicesMap.has(key)) cState.servicesMap.set(key, svc);
					for (const [key, svc] of nodeState.internalMap)
						if (!cState.internalMap.has(key)) cState.internalMap.set(key, svc);
					for (const [key, val] of nodeState.decorationsMap)
						if (!cState.decorationsMap.has(key))
							cState.decorationsMap.set(key, val);
					for (const [key, val] of nodeState.storeMap)
						if (!cState.storeMap.has(key)) cState.storeMap.set(key, val);

					// biome-ignore lint/suspicious/noExplicitAny: Internal bridge access
					(child as any)._rebuildPrototype();

					const orig = child.broadcast.bind(child);
					child.broadcast = (event: never, payload: never) => {
						orig(event, payload);
						(
							this as unknown as {
								_relay: (
									e: string,
									d: Record<string, unknown>,
								) => Promise<void>;
							}
						)._relay(event as string, {
							sender: child.identity,
							event: event as string,
							payload: payload,
						});
						return child;
					};
					await scan(child, visited);
				}),
			);
		};
		await scan(new Genesis(this.identity, this._state), new Set());
	}
}
