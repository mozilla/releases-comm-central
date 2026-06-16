import { j as f } from "./background2.mjs";
(function() {
  try {
    var e = typeof window < "u" ? window : typeof global < "u" ? global : typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : {};
    e.SENTRY_RELEASE = { id: "ee8296024a94b624bcad12906f96a0242118e8b2" }, e._sentryModuleMetadata = e._sentryModuleMetadata || {}, e._sentryModuleMetadata[new e.Error().stack] = (function(d) {
      for (var n = 1; n < arguments.length; n++) {
        var r = arguments[n];
        if (r != null) for (var t in r) r.hasOwnProperty(t) && (d[t] = r[t]);
      }
      return d;
    })({}, e._sentryModuleMetadata[new e.Error().stack], { version: "1.8.5", appHost: "background" });
    var a = new e.Error().stack;
    a && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[a] = "c8bd82cb-d65c-4091-8562-38f0d0a90940", e._sentryDebugIdIdentifier = "sentry-dbid-c8bd82cb-d65c-4091-8562-38f0d0a90940");
  } catch {
  }
})();
export {
  f as triggerAddonLogin
};
