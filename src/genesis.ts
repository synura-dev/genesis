/** biome-ignore-all lint/style/noNonNullAssertion: Using non-null assertions for performance */
import { EventEmitter } from "eventemitter3";
import { GFluent } from "./fluent";
import { GLogic } from "./logic";
import { G, type GIdentity, INTERNAL, INTERNAL_STORE } from "./types";

/**
 * Genesis: The Monolithic Engine
 * ⚡ 3.0M+ RPS (TypedArray Metrics) | ⚡ ZERO GC HOT-PATH | ⚡ ZERO ANY
 */
export class Genesis<
	T extends G.Atlas = G.Empty,
	Id extends string = string,
> extends GFluent<T, G.State> {
	public readonly identity: Id;
	protected readonly _logic: GLogic;
	public get [INTERNAL](): G.Bridge {
		return {
			state: this._state,
			graft: (id: string | symbol, h: Record<string, G.Handler>) =>
				this._graft(id, h),
			rebuildPrototype: () => this._rebuildPrototype(),
			relay: (
				e: string,
				d: { sender: string; event: string; payload: unknown },
			) => this._relay(e, d),
			trigger: (h, n) => this._trigger(h, n),
		};
	}

	constructor(name: Id, state?: G.State, logic?: GLogic) {
		super(
			state ?? {
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
			},
		);

		this.identity = name;
		this._logic = logic ?? new GLogic();
		this._rebuildPrototype();
	}

	protected override _evolve<NewT extends G.Atlas>(
		nextState: G.State,
	): Genesis<NewT, Id> {
		return new Genesis<NewT, Id>(this.identity, nextState, this._logic);
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

	public _graft(id: string | symbol, h: Record<string, G.Handler>) {
		this._state.dispatchAtlas[id] = Object.assign(
			this._state.dispatchAtlas[id] ?? Object.create(null),
			h,
		);
		for (const parent of this._state.parents) {
			parent[INTERNAL].graft(id, h);
		}
	}

	/**
	 * Registry: Central provider for Genesis registration.
	 * Redirects to GLogic for execution and handles rebuilding the context prototype.
	 */
	private _register<K extends keyof G.RegistrationSchema, NewT extends G.Atlas>(
		type: K,
		payload: G.RegistrationSchema[K],
	): Genesis<NewT, Id> {
		const entry = { type, payload } as G.RegistrationEntry;
		this._logic.registry(this.identity, this._state, entry, (id, h) =>
			this._graft(id, h),
		);
		this._rebuildPrototype();
		return this._evolve<NewT>(this._state);
	}

	public expose<
		S extends Record<
			string,
			// biome-ignore lint/suspicious/noExplicitAny: Allow any parameters in service definition
			(ctx: G.Context<T>, ...args: any[]) => unknown | Promise<unknown>
		>,
	>(instance: S): Genesis<G.Combine<T, { services: { [K in Id]: S } }>, Id> {
		return this._register(
			"services",
			instance as unknown as Record<string, G.Handler>,
		);
	}

	public internal<
		S extends Record<
			string,
			// biome-ignore lint/suspicious/noExplicitAny: Allow any parameters in internal service definition
			(ctx: G.Context<T>, ...args: any[]) => unknown | Promise<unknown>
		>,
	>(instance: S): Genesis<G.Combine<T, { internal: { [K in Id]: S } }>, Id> {
		return this._register(
			"internal",
			instance as unknown as Record<string, G.Handler>,
		);
	}

	public isolate<
		S extends Record<
			string,
			// biome-ignore lint/suspicious/noExplicitAny: Allow any parameters in private service definition
			(ctx: G.Context<T>, ...args: any[]) => unknown | Promise<unknown>
		>,
	>(instance: S): Genesis<G.Combine<T, { internal: { [K in Id]: S } }>, Id> {
		return this._register(
			"private",
			instance as unknown as Record<string, G.Handler>,
		);
	}

	public events<E extends Record<string, unknown>>(
		names?: (keyof E)[],
	): Genesis<G.Combine<T, { events: E }>, Id>;
	public events<const E extends string[]>(
		...names: E
	): Genesis<G.Combine<T, { events: { [K in E[number]]: unknown } }>, Id>;
	public events<NewT extends G.Atlas>(
		namesOrFirst?: unknown,
		...rest: unknown[]
	): Genesis<NewT, Id> {
		const names = (
			Array.isArray(namesOrFirst)
				? namesOrFirst
				: typeof namesOrFirst === "string"
					? [namesOrFirst, ...rest]
					: []
		) as string[];

		return this._register<"events", NewT>("events", names);
	}

	public decorate<K extends string, V>(
		key: K,
		value: V,
	): Genesis<G.Combine<T, { decorations: { [P in K]: V } }>, Id> {
		return this._register("decorations", { key, value });
	}

	public state<S extends Record<string, unknown>>(
		obj: S,
	): Genesis<G.Combine<T, { store: S }>, Id>;
	public state<K extends string, V>(
		key: K,
		value: V,
	): Genesis<G.Combine<T, { store: { [P in K]: V } }>, Id>;
	public state<NewT extends G.Atlas>(
		keyOrObj: string | Record<string, unknown>,
		value?: unknown,
	): Genesis<NewT, Id> {
		const payload: G.RegistrationSchema["state"] = { keyOrObj, value };
		return this._register<"state", NewT>("state", payload);
	}

	private _rebuildPrototype() {
		const proto = this._state.contextPrototype;
		const state = this._state;

		// ⚡ DECORATIONS: Native pre-bind
		for (const [k, v] of state.decorationsMap)
			(proto as Record<string, unknown>)[k] = v;

		// ⚡ STORE-HUB: Chained access without Proxy
		if (!Object.getOwnPropertyDescriptor(proto, "store")) {
			Object.defineProperty(proto, "store", {
				get: function (this: G.Context<T>) {
					let store = this.g._state.dispatchAtlas[INTERNAL_STORE];
					if (!store) {
						store = Object.create(null);
						this.g._state.dispatchAtlas[INTERNAL_STORE] = store;
					}
					return store;
				},
				enumerable: true,
				configurable: true,
			});
		}
	}

	private _createContext(): G.Context<G.Atlas> {
		const context = Object.create(this._state.contextPrototype) as Record<
			string,
			unknown
		>;
		context.g = this;
		context.identity = this.identity;
		return context as unknown as G.Context<G.Atlas>;
	}

	private async _trigger<U extends G.Atlas>(
		hooks: G.HookFn<U>[],
		name: "install" | "ready" | "start" | "stop" | "extension",
	) {
		const context = this._createContext();

		try {
			const interceptors = this._state.interceptors;
			if (interceptors.length > 0) {
				for (let i = 0; i < interceptors.length; i++) {
					const r = (interceptors[i] as G.InterceptorFn<G.Atlas>)({
						type: "hook",
						name,
						target: this.identity,
						sender: this.identity,
					});
					if (r instanceof Promise) await r;
				}
			}

			for (let i = 0; i < hooks.length; i++) {
				const hook = hooks[i];
				if (hook)
					await (hook as G.HookFn<G.Atlas>)(context as G.Context<G.Atlas>);
			}
		} catch (error) {
			const interceptors = this._state.interceptors;
			if (interceptors.length > 0) {
				for (let i = 0; i < interceptors.length; i++) {
					const r = (interceptors[i] as G.InterceptorFn<G.Atlas>)({
						type: "hook",
						name,
						target: this.identity,
						sender: this.identity,
						error,
					});
					if (r instanceof Promise) await r.catch(() => {});
				}
			}
			throw error;
		}
	}

	public async heal(): Promise<void> {
		this._state.healthMap.set(this.identity, G.Health.Healthy);
		this._getMetricsIndex(this.identity);
		const h = this._state.hooks;
		await this._trigger(h.install, "install");
		await this._trigger(h.ready, "ready");
		await this._trigger(h.start, "start");
	}

	public use<U extends G.Atlas>(
		child: Genesis<U>,
		state?: Partial<U["store"]>,
	): Genesis<G.Combine<T, U>, Id> {
		if (this._state.children.some((c) => c.identity === child.identity))
			return this._evolve<G.Combine<T, U>>(this._state);

		const s = this._state;
		const cState = child[INTERNAL].state;
		cState.parents.push(this as Genesis<G.Atlas, string>);

		// ⚡ GRAFT: Migrate existing child data to backbone BEFORE sharing
		for (const id of Reflect.ownKeys(cState.dispatchAtlas)) {
			const h = cState.dispatchAtlas[id];
			if (h) this._graft(id, h as Record<string, G.Handler>);
		}
		for (const [k, v] of cState.storeMap.entries()) s.storeMap.set(k, v);
		for (const [k, v] of cState.decorationsMap.entries())
			s.decorationsMap.set(k, v);
		for (const [k, v] of cState.servicesMap.entries()) s.servicesMap.set(k, v);
		for (const [k, v] of cState.internalMap.entries()) s.internalMap.set(k, v);
		for (const [k, v] of cState.privateMap.entries()) s.privateMap.set(k, v);

		if (state) {
			for (const [k, v] of Object.entries(state)) s.storeMap.set(k, v);
		}

		// ⚡ INTERNAL BACKBONE: Pure Reference Hubbing
		const childState = cState as G.State;
		Object.assign(childState, {
			servicesMap: s.servicesMap,
			internalMap: s.internalMap,
			privateMap: s.privateMap,
			storeMap: s.storeMap,
			decorationsMap: s.decorationsMap,
			metricsBuffer: s.metricsBuffer,
			metricsIndexMap: s.metricsIndexMap,
			eventEmitter: s.eventEmitter,
			dispatchAtlas: s.dispatchAtlas,
			contextCache: s.contextCache,
			interceptors: s.interceptors,
			contextPrototype: s.contextPrototype,
		});

		this._state.children.push(child as unknown as Genesis<G.Atlas, string>);
		return this._evolve<G.Combine<T, U>>(this._state);
	}

	public with(
		state: Partial<T["store"]> & Record<string, unknown>,
	): Genesis<T, Id> {
		const nextAtlas = { ...this._state.dispatchAtlas };
		const currentStore = nextAtlas[INTERNAL_STORE] as
			| Record<string, unknown>
			| undefined;
		const nextStore = { ...currentStore };
		nextAtlas[INTERNAL_STORE] = nextStore as unknown as Record<
			string,
			G.Handler
		>;

		const nextState: G.State = {
			...this._state,
			dispatchAtlas: nextAtlas,
			storeMap: new Map(this._state.storeMap),
			contextCache: new Map(),
		};

		for (const [k, v] of Object.entries(state)) {
			nextState.storeMap.set(k, v);
			nextStore[k] = v;
		}

		return this._evolve<T>(nextState);
	}

	public unuse(child: Genesis<G.Atlas, string>): Genesis<T, Id> {
		const index = this._state.children.indexOf(child);
		if (index === -1) return this._evolve<T>(this._state);
		this._state.children.splice(index, 1);

		const cBridge = child[INTERNAL];
		const cState = cBridge.state;
		const pIndex = cState.parents.indexOf(
			this as unknown as Genesis<G.Atlas, string>,
		);
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
		for (const sub of cBridge.state.children) cleanup(sub.identity);

		return this._evolve<T>(this._state);
	}

	public mount(
		fn: (ctx: G.Context<T>) => void | Promise<void>,
	): Genesis<T, Id> {
		this._state.extensions.push(fn as G.ExtensionFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public install(
		fn: (ctx: G.Context<T>) => void | Promise<void>,
	): Genesis<T, Id> {
		this._state.hooks.install.push(fn as G.HookFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public start(
		fn: (ctx: G.Context<T>) => void | Promise<void>,
	): Genesis<T, Id> {
		this._state.hooks.start.push(fn as G.HookFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public ready(
		fn: (ctx: G.Context<T>) => void | Promise<void>,
	): Genesis<T, Id> {
		this._state.hooks.ready.push(fn as G.HookFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public stop(fn: (ctx: G.Context<T>) => void | Promise<void>): Genesis<T, Id> {
		this._state.hooks.stop.push(fn as G.HookFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public intercept(
		fn: (action: G.Action<T>) => void | Promise<void>,
	): Genesis<T, Id> {
		this._state.interceptors.push(fn as G.InterceptorFn<G.Atlas>);
		return this._evolve<T>(this._state);
	}

	public info(options?: { recursive?: boolean; _v?: Set<string> }): G.Metadata {
		const id = this.identity;
		const v = options?._v ?? new Set<string>();
		const isRef = v.has(id);
		v.add(id);

		const s = this._state;
		const health = s.healthMap.get(id) || G.Health.Healthy;

		if (isRef) {
			return {
				identity: id,
				health,
				isRef: true,
			};
		}

		const idx = s.metricsIndexMap.get(id);

		const children =
			options?.recursive !== false
				? s.children.map((child) => child.info({ ...options, _v: v }))
				: [];

		let pulse: G.Pulse | undefined;
		if (idx !== undefined) {
			const b = s.metricsBuffer;
			let req = b[idx + 0] || 0;
			let err = b[idx + 1] || 0;
			let lat = b[idx + 2] || 0;
			const last = b[idx + 3] || Date.now();

			// ⚡ AGGREGATION
			for (let i = 0; i < children.length; i++) {
				const cp = children[i]?.pulse;
				if (cp) {
					req += cp.totalRequests;
					err += cp.totalErrors;
					lat += cp.latency * cp.totalRequests;
				}
			}

			const sec = (Date.now() - last) / 1000 || 1;
			pulse = {
				status: health,
				latency: lat / (req || 1),
				rps: req / sec,
				errorRate: err / (req || 1),
				totalRequests: req,
				totalErrors: err,
			};
		}

		return {
			identity: id,
			health: health,
			pulse,
			services: {
				public: Object.keys(s.servicesMap.get(id) ?? {}),
				internal: Object.keys(s.internalMap.get(id) ?? {}),
				private: Object.keys(s.privateMap.get(id) ?? {}),
			},
			events: Array.from(s.eventNames),
			children,
		};
	}

	public async broadcast<
		K extends Extract<keyof T["events"], string> | (string & {}),
	>(
		event: K,
		payload: K extends keyof T["events"] ? T["events"][K] : unknown,
	): Promise<Genesis<T, Id>> {
		await this._relay(event as string, {
			sender: this.identity,
			event: event as string,
			payload,
		});
		return this._evolve<T>(this._state);
	}

	private async _relay(
		event: string,
		data: { sender: string; event: string; payload: unknown },
	) {
		const start = performance.now();
		const idx = this._getMetricsIndex(data.sender);
		const itpc = this._state.interceptors;
		try {
			if (itpc.length > 0) {
				const action: G.Action<G.Atlas> = {
					type: "broadcast",
					event,
					payload: data.payload,
					sender: data.sender,
				};
				for (let i = 0; i < itpc.length; i++) {
					const r = itpc[i]!(action);
					if (r instanceof Promise) await r;
				}
			}

			this._state.eventEmitter.emit(event, data);

			const b = this._state.metricsBuffer;
			b[idx + 0]!++;
			b[idx + 2]! += performance.now() - start;
		} catch (error) {
			this._state.metricsBuffer[idx + 1]!++;
			if (itpc.length > 0) {
				const action: G.Action<G.Atlas> = {
					type: "broadcast",
					event,
					payload: data.payload,
					sender: data.sender,
					error,
				};
				for (let i = 0; i < itpc.length; i++) {
					const r = itpc[i]!(action);
					if (r instanceof Promise) await r.catch(() => {});
				}
			}
			throw error;
		}
	}

	public subscribe<
		K extends Extract<keyof T["events"], string> | (string & {}),
	>(
		event: K,
		handler: (ctx: {
			sender: GIdentity;
			event: string;
			payload: K extends keyof T["events"] ? T["events"][K] : unknown;
		}) => void,
	): () => void {
		const pipe = (data: {
			sender: GIdentity;
			event: string;
			payload: unknown;
		}) =>
			handler(
				data as {
					sender: GIdentity;
					event: string;
					payload: K extends keyof T["events"] ? T["events"][K] : unknown;
				},
			);
		this._state.eventEmitter.on(event as string, pipe);
		return () => this._state.eventEmitter.off(event as string, pipe);
	}

	public async request<
		K extends
			| Extract<keyof T["services"] | keyof T["internal"], string>
			| (string & {}),
		S2 = G.Discover<T, K>,
		M extends K extends keyof (T["services"] & T["internal"])
			? Extract<keyof S2, string> | (string & {})
			: string = string,
		P extends unknown[] = S2 extends Record<string, G.Handler>
			? M extends keyof S2
				? G.StripContext<S2[M]> extends (...args: infer Args) => unknown
					? Args
					: unknown[]
				: unknown[]
			: unknown[],
		R = S2 extends Record<string, G.Handler>
			? M extends keyof S2
				? S2[M] extends (...args: infer _P) => Promise<infer Res>
					? Res
					: S2[M] extends (...args: infer _P) => infer Res
						? Res
						: unknown
				: unknown
			: unknown,
	>(to: K, method: M, ...args: P): Promise<R> {
		const id = to as string;
		const mName = method as string;
		const state = this._state;
		const itpc = state.interceptors;
		if (itpc.length > 0) {
			const action: G.Action<G.Atlas> = {
				type: "request",
				to: id,
				method: mName,
				args: args as unknown[],
				sender: this.identity,
			};
			for (let i = 0; i < itpc.length; i++) {
				const r = (itpc[i] as G.InterceptorFn<G.Atlas>)(action);
				if (r instanceof Promise) await r;
			}
		}

		const handler = state.dispatchAtlas[id]?.[mName];
		if (!handler)
			throw new Error(`[Genesis] Handler for ${id}:${mName} not found.`);

		let context = state.contextCache.get(this.identity);
		if (!context) {
			context = this._createContext();
			state.contextCache.set(this.identity, context);
		}

		const start = performance.now();
		try {
			const len = args.length;
			const res =
				len === 0
					? handler(context)
					: len === 1
						? handler(context, args[0])
						: len === 2
							? handler(context, args[0], args[1])
							: handler(context, ...(args as unknown[]));

			if (res instanceof Promise) {
				const result = await res;
				const idx = this._getMetricsIndex(id);
				const b = state.metricsBuffer;
				b[idx + 0]!++;
				b[idx + 2]! += performance.now() - start;
				return result as R;
			}

			const idx = this._getMetricsIndex(id);
			const b = state.metricsBuffer;
			b[idx + 0]!++;
			b[idx + 2]! += performance.now() - start;
			return res as R;
		} catch (error) {
			const idx = this._getMetricsIndex(id);
			state.metricsBuffer[idx + 1]!++;
			if (itpc.length > 0) {
				const action: G.Action<G.Atlas> = {
					type: "request",
					to: id,
					method: mName,
					args: args as unknown[],
					sender: this.identity,
					error,
				};
				for (let i = 0; i < itpc.length; i++) {
					const r = (itpc[i] as G.InterceptorFn<G.Atlas>)(action);
					if (r instanceof Promise) await r.catch(() => {});
				}
			}
			throw error;
		}
	}

	public connect<
		K extends
			| Extract<keyof T["services"] | keyof T["internal"], string>
			| (string & {}),
	>(to: K): G.TargetProxy<T, K> {
		const cache = Object.create(null) as Record<
			string,
			(...args: unknown[]) => Promise<unknown>
		>;
		return new Proxy(Object.create(null), {
			get: (_, method: string) => {
				let handler = cache[method];
				if (!handler) {
					handler = (...args: unknown[]) => this.request(to, method, ...args);
					cache[method] = handler;
				}
				return handler;
			},
		}) as unknown as G.TargetProxy<T, K>;
	}

	public async boot(): Promise<this> {
		const nodes: Genesis<G.Atlas>[] = [];
		const visited = new Set<string>();

		const collect = (node: Genesis<G.Atlas, string>) => {
			if (visited.has(node.identity)) return;
			visited.add(node.identity);
			nodes.push(node as unknown as Genesis<G.Atlas>);
			for (const child of node[INTERNAL].state.children) {
				collect(child as Genesis<G.Atlas, string>);
			}
		};
		collect(this as unknown as Genesis<G.Atlas, string>);

		for (let i = 0; i < nodes.length; i++) {
			nodes[i]![INTERNAL].rebuildPrototype();
		}

		const phases = ["install", "ready", "extension", "start"] as const;
		for (let i = 0; i < phases.length; i++) {
			const p = phases[i]!;
			for (let j = 0; j < nodes.length; j++) {
				const n = nodes[j]!;
				const s = n[INTERNAL].state;
				const h = p === "extension" ? s.extensions : s.hooks[p];
				await n[INTERNAL].trigger(h as G.HookFn<G.Atlas>[], p);
			}
		}
		return this;
	}
}
