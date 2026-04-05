import { type G, INTERNAL_STORE } from "./types";

/**
 * GLogic: The Execution Engine for Genesis
 * Separation of Concerns: Handles the actual mutation of GState.
 */
export class GRegistry {
	/**
	 * Registry: Central dispatcher for GState mutations during plugin registration.
	 */
	public registry(
		identity: string,
		state: G.State,
		entry: G.RegistrationEntry,
		graft: (id: string | symbol, h: Record<string, G.Handler>) => void,
	): void {
		const { type, payload } = entry;

		// Type narrowing via Discriminated Union
		switch (type) {
			case "services": {
				state.servicesMap.set(identity, payload);
				graft(identity, payload);
				break;
			}
			case "internal": {
				state.internalMap.set(identity, payload);
				graft(identity, payload);
				break;
			}
			case "private": {
				state.privateMap.set(identity, payload);
				graft(identity, payload);
				break;
			}
			case "state": {
				const store =
					state.dispatchAtlas[INTERNAL_STORE] ?? Object.create(null);
				if (!state.dispatchAtlas[INTERNAL_STORE]) {
					state.dispatchAtlas[INTERNAL_STORE] = store;
				}

				const { keyOrObj, value } = payload;

				if (typeof keyOrObj === "object" && keyOrObj !== null) {
					for (const [k, v] of Object.entries(keyOrObj)) {
						state.storeMap.set(k, v);
						store[k] = v;
					}
				} else if (typeof keyOrObj === "string") {
					state.storeMap.set(keyOrObj, value);
					store[keyOrObj] = value;
				}
				break;
			}
			case "events": {
				for (let i = 0; i < payload.length; i++) {
					const name = payload[i];
					if (name) state.eventNames.add(name);
				}
				break;
			}
			case "decorations": {
				state.decorationsMap.set(payload.key, payload.value);
				break;
			}
		}
	}
}
