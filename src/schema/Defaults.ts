/**
 * @author NetFeez <netfeez.dev@gmail.com>.
 * @description Fresh default factories for the mutable collection defaults declared by the schemas.
 * @license Apache-2.0
 */
export namespace Defaults {

    /**
     * Materializes a brand new empty array. Used as the value of a `default` accessor, so every
     * processed document receives its own array instead of sharing the one held by the schema.
     * @returns A new empty array on every access.
     **/
    export function array(): never[] { return []; }

    /**
     * Materializes a brand new empty record. Used as the value of a `default` accessor, so every
     * processed document receives its own object instead of sharing the one held by the schema.
     * @returns A new empty record on every access.
     **/
    export function record(): Record<string, never> { return {}; }

}

export default Defaults;
