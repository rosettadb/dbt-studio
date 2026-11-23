/**
 * Pieces of Studio that extensions may use, one file per area so an
 * extension file imports only what it needs. Internal extensions import the
 * area files directly; installed extensions get everything below as the
 * `@rosetta/studio-api` module.
 */
export * from './layout';
