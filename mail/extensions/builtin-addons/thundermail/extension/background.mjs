import { j as f } from "./background2.mjs";
(function() {
  try {
    var d = typeof window < "u" ? window : typeof global < "u" ? global : typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : {};
    d.SENTRY_RELEASE = { id: "d61553dafd81e9dbc55b313bda41af550f53d80a" }, d._sentryModuleMetadata = d._sentryModuleMetadata || {}, d._sentryModuleMetadata[new d.Error().stack] = (function(e) {
      for (var n = 1; n < arguments.length; n++) {
        var r = arguments[n];
        if (r != null) for (var t in r) r.hasOwnProperty(t) && (e[t] = r[t]);
      }
      return e;
    })({}, d._sentryModuleMetadata[new d.Error().stack], { version: "1.9.0", appHost: "background" });
    var a = new d.Error().stack;
    a && (d._sentryDebugIds = d._sentryDebugIds || {}, d._sentryDebugIds[a] = "c8bd82cb-d65c-4091-8562-38f0d0a90940", d._sentryDebugIdIdentifier = "sentry-dbid-c8bd82cb-d65c-4091-8562-38f0d0a90940");
  } catch {
  }
})();
export {
  f as triggerAddonLogin
};
