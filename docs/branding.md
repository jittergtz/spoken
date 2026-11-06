# Ducky branding

The application name is **Ducky**, its package name is `ducky`, and its
application identifier is `com.gizmolabs.ducky`. Desktop app icon formats and
in-app logos use the supplied purple duck artwork in `src/assets/Ducky.png`.
Regenerate them with `npm run build:icons` on macOS.

The macOS menu bar uses the separate white duck silhouette, cleaned up as
`src/assets/ducky-tray.svg`. Generate its transparent template PNGs with
`npm run build:tray-icon`. macOS supplies the appropriate foreground color.

Fresh installations use a `Ducky` profile, or `Ducky-development` /
`Ducky-staging` for those channels. Existing Spoken profiles are reused in place
to preserve settings, localStorage, databases, recordings, and encrypted keys.
The old default voice-agent name is upgraded to Ducky; custom names are kept.

Some technical identifiers retain their previous names for compatibility:

- Saved provider IDs, localStorage keys, model caches, and keychain services.
- OAuth schemes, auth cookies, HTTP headers, and environment variables.
- Published CLI commands, hosted service URLs, repository links, and remote
  update/signing service configuration.

These refer to existing data or external infrastructure. Changing their spelling
without migrating the corresponding services would break existing connections.
Upstream project attribution and historical release notes remain intact.
