import { j as f } from "./background-CTHpSNy3.js";
(function() {
  try {
    var e = typeof window < "u" ? window : typeof global < "u" ? global : typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : {};
    e.SENTRY_RELEASE = { id: "8ebc1adf52b7a91ec7dacb1e5f25d89c8680d03f" }, e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = (function(d) {
      for (var n = 1; n < arguments.length; n++) {
        var r = arguments[n];
        if (r != null) for (var t in r) r.hasOwnProperty(t) && (d[t] = r[t]);
      }
      return d;
    })({}, e._sentryModuleMetadata[new e.Error().stack], { version: "1.7.12", appHost: "background" });
    var a = new e.Error().stack;
    a && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[a] = "3b2cb549-91f4-434d-a412-35578c075316", e._sentryDebugIdIdentifier = "sentry-dbid-3b2cb549-91f4-434d-a412-35578c075316");
  } catch {
  }
})();
export {
  f as triggerAddonLogin
};
