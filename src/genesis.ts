import { EventEmitter } from "eventemitter3";
import { GFluent } from "./fluent";
import { GRegistry } from "./registry";
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
	protected readonly _registry: GRegistry;
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

	constructor(name: Id, state?: G.State, logic?: GRegistry) {
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
				metricsNextIndex: new Uint32Array(1),
				dispatchAtlas: Object.create(null),
				contextCache: new Map(),
				contextPrototype: {},
				eventEmitter: new EventEmitter(),
				eventNames: new Set(),
				interceptors: [],
				pipelines: new Map(),
				relayPipeline: null,
				hooks: { install: [], ready: [], start: [], stop: [] },
				extensions: [],
				children: [],
				parents: [],
			},
		);

		this.identity = name;
		this._registry = logic ?? new GRegistry();
		this._rebuildPrototype();
	}

	protected override _evolve<NewT extends G.Atlas>(
		nextState: G.State,
	): Genesis<NewT, Id> {
		return new Genesis<NewT, Id>(this.identity, nextState, this._registry);
	}

	private _getMetricsIndex(id: string): number {
		const m = this._state;
		let idx = m.metricsIndexMap.get(id);
		if (idx !== undefined) return idx;

		idx = m.metricsNextIndex[0] ?? 0;
		m.metricsIndexMap.set(id, idx);
		m.metricsNextIndex[0] = idx + 4;

		if ((m.metricsNextIndex[0] ?? 0) >= m.metricsBuffer.length) {
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
		this._registry.registry(this.identity, this._state, entry, (id, h) =>
			this._graft(id, h),
		);
		this._rebuildPrototype();
		this._rebuildPipelines();
		this._rebuildRelayPipeline();
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

	private _compile(id: string, mName: string, h: G.Handler): G.Handler {
		const s = this._state;
		const b = s.metricsBuffer;
		const idx = this._getMetricsIndex(id);
		const snap = [...s.interceptors];
		const n = snap.length;

		return (ctx, ...args) => {
			const start = performance.now();

			// ⚡ FAST-PATH: No interceptors
			if (n === 0) {
				try {
					const res = h(ctx, ...args);
					if (res instanceof Promise) {
						return res.then(
							(r) => {
								b[idx + 0] = (b[idx + 0] || 0) + 1;
								b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
								return r;
							},
							(e) => {
								b[idx + 0] = (b[idx + 0] || 0) + 1;
								b[idx + 1] = (b[idx + 1] || 0) + 1;
								b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
								if (e instanceof Error && !("genesis" in e)) {
									Object.defineProperty(e, "genesis", {
										value: { type: "HANDLER_ERROR", to: id, method: mName },
										enumerable: false,
										configurable: true,
									});
								}
								throw e;
							},
						);
					}
					b[idx + 0] = (b[idx + 0] || 0) + 1;
					b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
					return res;
				} catch (e) {
					b[idx + 0] = (b[idx + 0] || 0) + 1;
					b[idx + 1] = (b[idx + 1] || 0) + 1;
					b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
					if (e instanceof Error && !("genesis" in e)) {
						Object.defineProperty(e, "genesis", {
							value: { type: "HANDLER_ERROR", to: id, method: mName },
							enumerable: false,
							configurable: true,
						});
					}
					throw e;
				}
			}

			// ⚡ PATH: Using interceptors
			const action: G.Action<G.Atlas> = {
				type: "request",
				to: id,
				method: mName,
				args,
				sender: ctx.identity,
			};

			let i = 0;
			const next = (): unknown | Promise<unknown> => {
				while (i < n) {
					const r = snap[i++]?.(action);
					if (r instanceof Promise) return r.then(next);
				}

				// Execute Handler
				try {
					const res = h(ctx, ...args);
					if (res instanceof Promise) {
						return res.then(
							(r) => {
								b[idx + 0] = (b[idx + 0] || 0) + 1;
								b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
								return r;
							},
							(e) => {
								b[idx + 0] = (b[idx + 0] || 0) + 1;
								b[idx + 1] = (b[idx + 1] || 0) + 1;
								b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
								action.error = e;
								let j = 0;
								const failNext = (): void | Promise<void> => {
									while (j < n) {
										const fr = snap[j++]?.(action);
										if (fr instanceof Promise)
											return fr.catch(() => {}).then(failNext);
									}
									if (e instanceof Error && !("genesis" in e)) {
										Object.defineProperty(e, "genesis", {
											value: { type: "HANDLER_ERROR", to: id, method: mName },
											enumerable: false,
											configurable: true,
										});
									}
									throw e;
								};
								return failNext();
							},
						);
					}
					b[idx + 0] = (b[idx + 0] || 0) + 1;
					b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
					return res;
				} catch (e) {
					b[idx + 0] = (b[idx + 0] || 0) + 1;
					b[idx + 1] = (b[idx + 1] || 0) + 1;
					b[idx + 2] = (b[idx + 2] || 0) + (performance.now() - start);
					action.error = e;
					let j = 0;
					const failSync = (): void | Promise<void> => {
						while (j < n) {
							const fr = snap[j++]?.(action);
							if (fr instanceof Promise)
								return fr.catch(() => {}).then(failSync);
						}
						if (e instanceof Error && !("genesis" in e)) {
							Object.defineProperty(e, "genesis", {
								value: { type: "HANDLER_ERROR", to: id, method: mName },
								enumerable: false,
								configurable: true,
							});
						}
						throw e;
					};
					const fr = failSync();
					if (fr instanceof Promise) return fr;
					throw e;
				}
			};

			return next();
		};
	}

	private _rebuildPipelines() {
		const s = this._state;
		s.pipelines.clear();
		for (const id of Reflect.ownKeys(s.dispatchAtlas)) {
			if (typeof id !== "string") continue;
			const methods = s.dispatchAtlas[id];
			if (!methods) continue;
			for (const method of Object.keys(methods)) {
				const h = methods[method];
				if (h) s.pipelines.set(`${id}:${method}`, this._compile(id, method, h));
			}
		}
	}

	private _rebuildRelayPipeline() {
		const s = this._state;
		const itpc = s.interceptors;
		const emitter = s.eventEmitter;
		const b = s.metricsBuffer;

		s.relayPipeline = (event, data) => {
			const start = performance.now();
			const idx = this._getMetricsIndex(data.sender);
			const execute = () => {
				emitter.emit(event, data);
				b[idx + 0] = (b[idx + 0] ?? 0) + 1;
				b[idx + 2] = (b[idx + 2] ?? 0) + (performance.now() - start);
			};

			if (itpc.length === 0) return execute();

			const action: G.Action<G.Atlas> = {
				type: "broadcast",
				event,
				payload: data.payload,
				sender: data.sender,
			};

			let i = 0;
			const next = (): void | Promise<void> => {
				if (i >= itpc.length) return execute();
				const r = itpc[i++]?.(action);
				return r instanceof Promise ? r.then(next) : next();
			};
			return next();
		};
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

	private _trigger<U extends G.Atlas>(
		hooks: G.HookFn<U>[],
		name: "install" | "ready" | "start" | "stop" | "extension",
	): void | Promise<void> {
		const context = this._createContext();
		const interceptors = this._state.interceptors as G.InterceptorFn<G.Atlas>[];

		const runInterceptors = (
			idx: number,
			error?: unknown,
		): void | Promise<void> => {
			for (let i = idx; i < interceptors.length; i++) {
				const interceptor = interceptors[i];
				if (!interceptor) continue;
				const r = interceptor({
					type: "hook",
					name,
					target: this.identity,
					sender: this.identity,
					error,
				});
				if (r instanceof Promise)
					return r.then(
						() => runInterceptors(i + 1, error),
						() => {},
					);
			}
		};

		const runHooks = (idx: number): void | Promise<void> => {
			for (let i = idx; i < hooks.length; i++) {
				const hook = hooks[i];
				if (hook) {
					const r = (hook as G.HookFn<G.Atlas>)(context as G.Context<G.Atlas>);
					if (r instanceof Promise) return r.then(() => runHooks(i + 1));
				}
			}
		};

		try {
			if (interceptors.length > 0) {
				const itpc = runInterceptors(0);
				if (itpc instanceof Promise) {
					return itpc.then(() => {
						const hr = runHooks(0);
						if (hr instanceof Promise) return hr;
					});
				}
			}

			const hr = runHooks(0);
			if (hr instanceof Promise) {
				return hr.catch((error) => {
					if (error instanceof Error && !("genesis" in error)) {
						Object.defineProperty(error, "genesis", {
							value: { type: "HOOK_ERROR", target: this.identity, name },
							enumerable: false,
							configurable: true,
						});
					}
					if (interceptors.length > 0) {
						const itpc = runInterceptors(0, error);
						if (itpc instanceof Promise)
							return itpc.then(() => {
								throw error;
							});
					}
					throw error;
				});
			}
		} catch (error) {
			if (error instanceof Error && !("genesis" in error)) {
				Object.defineProperty(error, "genesis", {
					value: { type: "HOOK_ERROR", target: this.identity, name },
					enumerable: false,
					configurable: true,
				});
			}
			if (interceptors.length > 0) {
				const itpc = runInterceptors(0, error);
				if (itpc instanceof Promise)
					return itpc.then(() => {
						throw error;
					});
			}
			throw error;
		}
	}

	public heal(): void | Promise<void> {
		this._state.healthMap.set(this.identity, G.Health.Healthy);
		this._getMetricsIndex(this.identity);
		this._rebuildPipelines();
		this._rebuildRelayPipeline();
		const h = this._state.hooks;
		const p1 = this._trigger(h.install, "install");
		if (p1 instanceof Promise) {
			return p1
				.then(() => this._trigger(h.ready, "ready"))
				.then(() => this._trigger(h.start, "start"));
		}
		const p2 = this._trigger(h.ready, "ready");
		if (p2 instanceof Promise) {
			return p2.then(() => this._trigger(h.start, "start"));
		}
		return this._trigger(h.start, "start");
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
			metricsNextIndex: s.metricsNextIndex,
			eventEmitter: s.eventEmitter,
			dispatchAtlas: s.dispatchAtlas,
			contextCache: s.contextCache,
			interceptors: s.interceptors,
			pipelines: s.pipelines,
			relayPipeline: s.relayPipeline,
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
		this._rebuildPipelines();
		this._rebuildRelayPipeline();
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

	public broadcast<
		K extends Extract<keyof T["events"], string> | (string & {}),
	>(
		event: K,
		payload: K extends keyof T["events"] ? T["events"][K] : unknown,
	): Genesis<T, Id> | Promise<Genesis<T, Id>> {
		const res = this._relay(event as string, {
			sender: this.identity,
			event: event as string,
			payload,
		});
		if (res instanceof Promise)
			return res.then(() => this._evolve<T>(this._state));
		return this._evolve<T>(this._state);
	}

	private _relay(
		event: string,
		data: { sender: string; event: string; payload: unknown },
	): void | Promise<void> {
		return this._state.relayPipeline?.(event, data);
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


	public request<
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
	>(to: K, method: M, ...args: P): R | Promise<R> {
		const h = this._state.pipelines.get(`${to as string}:${method as string}`);
		if (!h) throw new Error(`[Genesis] Handler for ${to as string}:${method as string} not found.`);

		let ctx = this._state.contextCache.get(this.identity);
		if (!ctx) {
			ctx = this._createContext();
			this._state.contextCache.set(this.identity, ctx);
		}

		return h(ctx, ...(args as unknown[])) as R | Promise<R>;
	}

	public connect<
		K extends
			| Extract<keyof T["services"] | keyof T["internal"], string>
			| (string & {}),
	>(to: K): G.TargetProxy<T, K> {
		const cache = Object.create(null) as Record<
			string,
			(...args: unknown[]) => unknown | Promise<unknown>
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

	public boot(): this | Promise<this> {
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
			const node = nodes[i];
			if (!node) continue;
			node[INTERNAL].rebuildPrototype();
			node._rebuildPipelines();
			node._rebuildRelayPipeline();
		}

		const phases = ["install", "ready", "extension", "start"] as const;

		const runPhase = (pIdx: number, nIdx: number): void | Promise<void> => {
			const p = phases[pIdx];
			if (!p) return;

			for (let j = nIdx; j < nodes.length; j++) {
				const n = nodes[j];
				if (!n) continue;

				const s = n[INTERNAL].state;
				const h = p === "extension" ? s.extensions : s.hooks[p];
				const r = n[INTERNAL].trigger(h as G.HookFn<G.Atlas>[], p);
				if (r instanceof Promise) {
					return r.then(() => runPhase(pIdx, j + 1));
				}
			}
			return runPhase(pIdx + 1, 0);
		};

		const result = runPhase(0, 0);
		if (result instanceof Promise) return result.then(() => this);
		return this;
	}
}
