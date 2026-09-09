/**
 * Composer/server release. Bump on every behaviour change to the hosted tools
 * (the corpus has its own version and Merkle root; the engine has ENGINE.version).
 * Reported as `versions.composer` on every response so integrators can pin builds.
 */
export const COMPOSER_VERSION = "0.5.0";
