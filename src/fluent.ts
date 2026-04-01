/**
 * GFluent: The Universal Chaining Base
 * Strictly generic, dependency-free base for building Fluent Interfaces.
 *
 * @template T - The Type State (Static inference layer)
 * @template S - The Runtime State (The actual data container)
 */
export abstract class GFluent<_T, S> {
	constructor(protected readonly _state: S) {}

	/**
	 * Internal evolve: Must be implemented by the subclass to return its own type.
	 */
	protected abstract _evolve<NewT>(nextState: S): GFluent<NewT, S>;

	/**
	 * Core dispatcher: Executes side-effects on state and returns an evolved instance.
	 */
	protected _provide<NewT, P>(
		payload: P,
		handler: (payload: P, state: S) => void,
	): GFluent<NewT, S> {
		handler(payload, this._state);
		return this._evolve<NewT>(this._state);
	}

	/**
	 * Raw state accessor
	 */
	public get rawState(): S {
		return this._state;
	}
}
