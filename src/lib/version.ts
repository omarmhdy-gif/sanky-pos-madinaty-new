// Single source of truth for the version shown in Settings — keep in sync
// with package.json's "version" by hand (no build-time injection exists in
// this static-export setup, so this is a deliberate manual mirror, same as
// printer-server/server.js's own SERVER_VERSION constant).
export const APP_VERSION = "1.0.0";
export const BUILD_LABEL = "Production Build";
