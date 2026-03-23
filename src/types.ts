import type EventEmitter from "eventemitter3";
import type { Genesis } from "./genesis";

/**
 * Utility: Flatten Types for better DX
 */
export type Prettify<T> = {
	[K in keyof T]: T[K];
} & {};

/**
 * Identity (Namespace)
 */
export type GIdentity = string;

/**
 * Global Registry Schema Base
 */
export interface GRegistry {
	services: Record<string, Record<string, unknown>>;
	internal: Record<string, Record<string, unknown>>;
	events: Record<string, unknown>;
	decorations: Record<string, unknown>;
	store: Record<string, unknown>;
}

/**
 * Standard Empty Start Registry
 */
export interface GEmpty extends GRegistry {
	// biome-ignore lint/complexity/noBannedTypes: Root state
	services: {};
	// biome-ignore lint/complexity/noBannedTypes: Root state
	internal: {};
	// biome-ignore lint/complexity/noBannedTypes: Root state
	events: {};
	// biome-ignore lint/complexity/noBannedTypes: Root state
	decorations: {};
	// biome-ignore lint/complexity/noBannedTypes: Root state
	store: {};
}

/**
 * Merge two Registries
 */
export type GMerge<T extends GRegistry, U extends GRegistry> = Prettify<{
	services: T["services"] & U["services"];
	internal: T["internal"] & U["internal"];
	events: T["events"] & U["events"];
	decorations: T["decorations"] & U["decorations"];
	store: T["store"] & U["store"];
}>;

/**
 * Base Context (Internal engine LCD)
 */
export interface GContextBase {
	readonly g: Genesis<GRegistry>;
	readonly identity: GIdentity;
	readonly store: Record<string, unknown>;
}

/**
 * Internal Handler Type
 */
export type GHandler = (ctx: GContextBase, ...args: unknown[]) => unknown;

/**
 * Unified Context: Full Inference for Hooks/Extensions
 */
export type GContext<T extends GRegistry> = Prettify<
	{
		readonly g: Genesis<T>;
		readonly identity: GIdentity;
	} & T["decorations"] & { readonly store: T["store"] }
>;

/**
 * Event Context
 */
export interface GEventContext<T = unknown> {
	readonly sender: GIdentity;
	readonly event: string;
	readonly payload: T;
}

/**
 * Base Action (Internal engine LCD)
 */
export interface GActionBase {
	type: "request" | "broadcast";
	to?: string;
	method?: string;
	args?: unknown[];
	event?: string;
	payload?: unknown;
	sender?: string;
}

/**
 * Interceptor Action
 */
export type GAction<T extends GRegistry> =
	| {
			type: "request";
			to:
				| Extract<keyof T["services"] | keyof T["internal"], string>
				| (string & {});
			method: string;
			args: unknown[];
	  }
	| {
			type: "broadcast";
			event: Extract<keyof T["events"], string> | (string & {});
			payload: T["events"][keyof T["events"]];
			sender: GIdentity;
	  };

/**
 * Health Status
 */
export enum GHealth {
	Healthy = "healthy",
	Degraded = "degraded",
	Dead = "dead",
}

/**
 * Pulse (Metrics)
 */
export interface GPulse {
	status: GHealth;
	latency: number;
	rps: number;
	errorRate: number;
	totalRequests: number;
	totalErrors: number;
}

/**
 * Plugin Metadata (Atlas)
 */
export interface GMetadata {
	identity: GIdentity;
	health: GHealth;
	pulse?: GPulse;
	services: {
		public: string[];
		internal: string[];
		private: string[];
	};
	events: string[];
	children: GMetadata[];
}

/**
 * Internal Engine State
 */
export interface GState {
	readonly servicesMap: Map<GIdentity, Record<string, GHandler>>;
	readonly internalMap: Map<GIdentity, Record<string, GHandler>>;
	readonly privateMap: Map<GIdentity, Record<string, GHandler>>;
	readonly decorationsMap: Map<string, unknown>;
	readonly storeMap: Map<string, unknown>;
	readonly healthMap: Map<GIdentity, GHealth>;

	// TYPEDARRAY METRICS ENGINE
	metricsBuffer: Float64Array;
	readonly metricsIndexMap: Map<GIdentity, number>;
	metricsNextIndex: number;

	readonly dispatchAtlas: Record<string, Record<string, GHandler>>;
	readonly contextCache: Map<GIdentity, GContextBase>;
	readonly contextPrototype: Record<string, unknown>;
	readonly eventEmitter: EventEmitter;
	readonly eventNames: Set<string>;
	readonly interceptors: ((action: GActionBase) => void | Promise<void>)[];
	readonly hooks: {
		install: ((ctx: GContextBase) => void | Promise<void>)[];
		ready: ((ctx: GContextBase) => void | Promise<void>)[];
		start: ((ctx: GContextBase) => void | Promise<void>)[];
		stop: ((ctx: GContextBase) => void | Promise<void>)[];
	};
	readonly extensions: ((ctx: GContextBase) => void | Promise<void>)[];
	readonly children: Genesis<GRegistry>[];
	readonly parents: Genesis<GRegistry>[];
}

export type TargetProxy<
	T extends GRegistry,
	K extends keyof T["services"] | keyof T["internal"],
> = K extends keyof T["services"]
	? T["services"][K]
	: K extends keyof T["internal"]
		? T["internal"][K]
		: never;
