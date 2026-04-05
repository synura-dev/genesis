/** biome-ignore-all lint/complexity/noBannedTypes: Using Object */
import type { EventEmitter } from "eventemitter3";
import type { Genesis } from "./genesis";

/**
 * Identity (Namespace) & INTERNAL Bridge
 */
export type GIdentity = string;
export const INTERNAL = Symbol("GenesisInternal");
export const INTERNAL_STORE = Symbol("GenesisStore");

export namespace G {
	/**
	 * Utility: Flatten Types for better DX
	 */
	export type Simplify<T> = {
		[K in keyof T]: T[K];
	} & {};

	/**
	 * Global Atlas Schema (The Type State)
	 */
	export interface Atlas {
		services: {};
		internal: {};
		events: {};
		decorations: {};
		store: {};
	}

	/**
	 * Standard Empty Atlas Start
	 */
	export interface Empty extends Atlas {
		services: {};
		internal: {};
		events: {};
		decorations: {};
		store: {};
	}

	/**
	 * Optimized Merge (Combined Signature):
	 * This prevents the IDE from unrolling the entire object structure in intermediate chain steps.
	 */
	export type Combine<T extends Atlas, U> = Simplify<{
		services: T["services"] & (U extends { services: infer S } ? S : {});
		internal: T["internal"] & (U extends { internal: infer I } ? I : {});
		events: T["events"] & (U extends { events: infer E } ? E : {});
		decorations: T["decorations"] &
			(U extends { decorations: infer D } ? D : {});
		store: T["store"] & (U extends { store: infer ST } ? ST : {});
	}>;

	/**
	 * Atlas Blueprint Wrapper
	 */
	export type Blueprint<T extends Atlas> = {
		atlas: T;
	};

	/**
	 * Unified Context: Strictly Derived from Atlas
	 * We keep Simplify here because this is the final object the dev interacts with.
	 */
	export type Context<T extends Atlas> = Simplify<
		{
			readonly g: Genesis<T, string>;
			readonly identity: GIdentity;
			readonly store: T["store"];
		} & T["decorations"]
	>;

	/**
	 * Internal Bridge for Engine Inter-op
	 */
	export interface Bridge {
		readonly state: State;
		graft(id: string | symbol, h: Record<string, Handler>): void;
		rebuildPrototype(): void;
		relay(
			event: string,
			data: { sender: string; event: string; payload: unknown },
		): void | Promise<void>;
		trigger(
			hooks: HookFn<Atlas>[],
			name: "install" | "ready" | "start" | "stop" | "extension",
		): void | Promise<void>;
	}

	/**
	 * Registration Schema for Type Mapping
	 */
	export interface RegistrationSchema {
		services: Record<string, Handler>;
		internal: Record<string, Handler>;
		private: Record<string, Handler>;
		state: { keyOrObj: string | Record<string, unknown>; value?: unknown };
		events: string[];
		decorations: { key: string; value: unknown };
	}

	/**
	 * Registration Entry: Discriminated Union for safe registration dispatch
	 */
	export type RegistrationEntry = {
		[K in keyof RegistrationSchema]: {
			type: K;
			payload: RegistrationSchema[K];
		};
	}[keyof RegistrationSchema];

	/**
	 * Atlas Discovery: High-performance lookup
	 */
	export type Discover<
		T extends Atlas,
		K extends string,
	> = K extends keyof T["services"]
		? T["services"][K]
		: K extends keyof T["internal"]
			? T["internal"][K]
			: Record<string, Handler>;

	/**
	 * Utility: Strip the Context (the first parameter) from handler arguments for Proxy access.
	 * ⚡ SAFE-TYPE 100% | ⚡ ZERO-ANY
	 */
	export type StripContext<T> = T extends (
		ctx: infer _,
		...args: infer P
	) => infer R
		? (...args: P) => R
		: T;

	/**
	 * Bivariant Hook Types
	 */
	export type HookFn<T extends Atlas = Atlas> = (
		ctx: Context<T>,
	) => void | Promise<void>;
	export type ExtensionFn<T extends Atlas = Atlas> = (
		ctx: Context<T>,
	) => void | Promise<void>;
	export type InterceptorFn<T extends Atlas = Atlas> = (
		action: Action<T>,
	) => void | Promise<void>;

	/**
	 * Internal Handler: Uses interface for method bivariance
	 */
	export type Handler = (
		ctx: {
			g: Genesis<G.Atlas>;
			identity: GIdentity;
			store: Record<string, unknown>;
		},
		...args: unknown[]
	) => unknown | Promise<unknown>;

	/**
	 * Interceptor Action
	 */
	export type Action<
		T extends Atlas,
		Agents = T["services"] & T["internal"],
	> = (
		| {
				[K in keyof Agents & string]: {
					type: "request";
					to: K;
					method: Extract<keyof Agents[K], string> | (string & {});
					args: unknown[];
					sender: GIdentity;
				};
		  }[keyof Agents & string]
		| {
				type: "request";
				to: string & {};
				method: string;
				args: unknown[];
				sender: GIdentity;
		  }
		| {
				type: "broadcast";
				event: Extract<keyof T["events"], string> | (string & {});
				payload: keyof T["events"] extends never
					? unknown
					: T["events"][keyof T["events"]];
				sender: GIdentity;
		  }
		| {
				type: "hook";
				name: "install" | "ready" | "start" | "stop" | "extension";
				target: GIdentity;
				sender: GIdentity;
		  }
	) & {
		to?: string;
		method?: string;
		args?: unknown[];
		event?: string;
		payload?: unknown;
		sender: GIdentity;
		name?: string;
		target?: string;
		error?: unknown;
	};

	/**
	 * Health Status
	 */
	export enum Health {
		Healthy = "healthy",
		Degraded = "degraded",
		Dead = "dead",
	}

	/**
	 * Pulse (Metrics)
	 */
	export interface Pulse {
		status: Health;
		latency: number;
		rps: number;
		errorRate: number;
		totalRequests: number;
		totalErrors: number;
	}

	/**
	 * Plugin Metadata (Atlas Reflection)
	 */
	export interface Metadata {
		identity: GIdentity;
		health: Health;
		pulse?: Pulse;
		services?: {
			public: string[];
			internal: string[];
			private: string[];
		};
		events?: string[];
		children?: Metadata[];
		isRef?: boolean;
	}

	/**
	 * Internal Engine State
	 */
	export interface State {
		readonly servicesMap: Map<GIdentity, Record<string, Handler>>;
		readonly internalMap: Map<GIdentity, Record<string, Handler>>;
		readonly privateMap: Map<GIdentity, Record<string, Handler>>;
		readonly decorationsMap: Map<string, unknown>;
		readonly storeMap: Map<string, unknown>;
		readonly healthMap: Map<GIdentity, Health>;

		// TYPEDARRAY METRICS ENGINE
		metricsBuffer: Float64Array;
		readonly metricsIndexMap: Map<GIdentity, number>;
		metricsNextIndex: Uint32Array;

		readonly dispatchAtlas: Record<string | symbol, Record<string, Handler>> & {
			[INTERNAL_STORE]?: Record<string, unknown>;
		};
		readonly contextCache: Map<
			GIdentity,
			{
				g: Genesis<G.Atlas>;
				identity: GIdentity;
				store: Record<string, unknown>;
			}
		>;
		readonly contextPrototype: Record<string, unknown>;
		readonly eventEmitter: EventEmitter;
		readonly eventNames: Set<string>;
		readonly interceptors: InterceptorFn[];
		readonly hooks: {
			install: HookFn[];
			ready: HookFn[];
			start: HookFn[];
			stop: HookFn[];
		};
		readonly extensions: ExtensionFn[];
		readonly children: Genesis<G.Atlas>[];
		readonly parents: Genesis<G.Atlas>[];
	}

	/**
	 * Dynamic Service Proxy
	 */
	export type TargetProxy<T extends Atlas, K extends string> = Simplify<{
		[P in keyof Discover<T, K>]: StripContext<Discover<T, K>[P]>;
	}>;
}
