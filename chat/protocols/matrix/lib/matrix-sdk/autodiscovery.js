"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AutoDiscoveryError = exports.AutoDiscoveryAction = exports.AutoDiscovery = void 0;
var _client = require("./client");
var _logger = require("./logger");
var _httpApi = require("./http-api");
var _discovery = require("./oidc/discovery");
var _validate = require("./oidc/validate");
var _error = require("./oidc/error");
var _versionSupport = require("./version-support");
var _class;
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2018 New Vector Ltd
Copyright 2019 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
// Dev note: Auto discovery is part of the spec.
// See: https://matrix.org/docs/spec/client_server/r0.4.0.html#server-discovery
let AutoDiscoveryAction = exports.AutoDiscoveryAction = /*#__PURE__*/function (AutoDiscoveryAction) {
  AutoDiscoveryAction["SUCCESS"] = "SUCCESS";
  AutoDiscoveryAction["IGNORE"] = "IGNORE";
  AutoDiscoveryAction["PROMPT"] = "PROMPT";
  AutoDiscoveryAction["FAIL_PROMPT"] = "FAIL_PROMPT";
  AutoDiscoveryAction["FAIL_ERROR"] = "FAIL_ERROR";
  return AutoDiscoveryAction;
}({});
let AutoDiscoveryError = exports.AutoDiscoveryError = /*#__PURE__*/function (AutoDiscoveryError) {
  AutoDiscoveryError["Invalid"] = "Invalid homeserver discovery response";
  AutoDiscoveryError["GenericFailure"] = "Failed to get autodiscovery configuration from server";
  AutoDiscoveryError["InvalidHsBaseUrl"] = "Invalid base_url for m.homeserver";
  AutoDiscoveryError["InvalidHomeserver"] = "Homeserver URL does not appear to be a valid Matrix homeserver";
  AutoDiscoveryError["InvalidIsBaseUrl"] = "Invalid base_url for m.identity_server";
  AutoDiscoveryError["InvalidIdentityServer"] = "Identity server URL does not appear to be a valid identity server";
  AutoDiscoveryError["InvalidIs"] = "Invalid identity server discovery response";
  AutoDiscoveryError["MissingWellknown"] = "No .well-known JSON file found";
  AutoDiscoveryError["InvalidJson"] = "Invalid JSON";
  AutoDiscoveryError["UnsupportedHomeserverSpecVersion"] = "The homeserver does not meet the version requirements";
  AutoDiscoveryError["HomeserverTooOld"] = "The homeserver does not meet the version requirements";
  return AutoDiscoveryError;
}({}); // TODO: Implement when Sydent supports the `/versions` endpoint - https://github.com/matrix-org/sydent/issues/424
//IdentityServerTooOld = "The identity server does not meet the minimum version requirements",
/**
 * @deprecated in favour of OidcClientConfig
 */
/**
 * @experimental
 */
/**
 * Utilities for automatically discovery resources, such as homeservers
 * for users to log in to.
 */
class AutoDiscovery {
  /**
   * Validates and verifies client configuration information for purposes
   * of logging in. Such information includes the homeserver URL
   * and identity server URL the client would want. Additional details
   * may also be included, and will be transparently brought into the
   * response object unaltered.
   * @param wellknown - The configuration object itself, as returned
   * by the .well-known auto-discovery endpoint.
   * @returns Promise which resolves to the verified
   * configuration, which may include error states. Rejects on unexpected
   * failure, not when verification fails.
   */
  static async fromDiscoveryConfig(wellknown) {
    // Step 1 is to get the config, which is provided to us here.

    // We default to an error state to make the first few checks easier to
    // write. We'll update the properties of this object over the duration
    // of this function.
    const clientConfig = {
      "m.homeserver": {
        state: AutoDiscovery.FAIL_ERROR,
        error: AutoDiscovery.ERROR_INVALID,
        base_url: null
      },
      "m.identity_server": {
        // Technically, we don't have a problem with the identity server
        // config at this point.
        state: AutoDiscovery.PROMPT,
        error: null,
        base_url: null
      }
    };
    if (!wellknown?.["m.homeserver"]) {
      _logger.logger.error("No m.homeserver key in config");
      clientConfig["m.homeserver"].state = AutoDiscovery.FAIL_PROMPT;
      clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_INVALID;
      return Promise.resolve(clientConfig);
    }
    if (!wellknown["m.homeserver"]["base_url"]) {
      _logger.logger.error("No m.homeserver base_url in config");
      clientConfig["m.homeserver"].state = AutoDiscovery.FAIL_PROMPT;
      clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_INVALID_HS_BASE_URL;
      return Promise.resolve(clientConfig);
    }

    // Step 2: Make sure the homeserver URL is valid *looking*. We'll make
    // sure it points to a homeserver in Step 3.
    const hsUrl = this.sanitizeWellKnownUrl(wellknown["m.homeserver"]["base_url"]);
    if (!hsUrl) {
      _logger.logger.error("Invalid base_url for m.homeserver");
      clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_INVALID_HS_BASE_URL;
      return Promise.resolve(clientConfig);
    }

    // Step 3: Make sure the homeserver URL points to a homeserver.
    const hsVersions = await this.fetchWellKnownObject(`${hsUrl}/_matrix/client/versions`);
    if (!hsVersions || !Array.isArray(hsVersions.raw?.["versions"])) {
      _logger.logger.error("Invalid /versions response");
      clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_INVALID_HOMESERVER;

      // Supply the base_url to the caller because they may be ignoring liveliness
      // errors, like this one.
      clientConfig["m.homeserver"].base_url = hsUrl;
      return Promise.resolve(clientConfig);
    }

    // Step 3.1: Non-spec check to ensure the server will actually work for us. We need to check if
    // any of the versions in `SUPPORTED_MATRIX_VERSIONS` are listed in the /versions response.
    const hsVersionSet = new Set(hsVersions.raw["versions"]);
    let supportedVersionFound = false;
    for (const version of _versionSupport.SUPPORTED_MATRIX_VERSIONS) {
      if (hsVersionSet.has(version)) {
        supportedVersionFound = true;
        break;
      }
    }
    if (!supportedVersionFound) {
      _logger.logger.error("Homeserver does not meet version requirements");
      clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_UNSUPPORTED_HOMESERVER_SPEC_VERSION;

      // Supply the base_url to the caller because they may be ignoring liveliness
      // errors, like this one.
      clientConfig["m.homeserver"].base_url = hsUrl;
      return Promise.resolve(clientConfig);
    }

    // Step 4: Now that the homeserver looks valid, update our client config.
    clientConfig["m.homeserver"] = {
      state: AutoDiscovery.SUCCESS,
      error: null,
      base_url: hsUrl
    };

    // Step 5: Try to pull out the identity server configuration
    let isUrl = "";
    if (wellknown["m.identity_server"]) {
      // We prepare a failing identity server response to save lines later
      // in this branch.
      const failingClientConfig = {
        "m.homeserver": clientConfig["m.homeserver"],
        "m.identity_server": {
          state: AutoDiscovery.FAIL_PROMPT,
          error: AutoDiscovery.ERROR_INVALID_IS,
          base_url: null
        }
      };

      // Step 5a: Make sure the URL is valid *looking*. We'll make sure it
      // points to an identity server in Step 5b.
      isUrl = this.sanitizeWellKnownUrl(wellknown["m.identity_server"]["base_url"]);
      if (!isUrl) {
        _logger.logger.error("Invalid base_url for m.identity_server");
        failingClientConfig["m.identity_server"].error = AutoDiscovery.ERROR_INVALID_IS_BASE_URL;
        return Promise.resolve(failingClientConfig);
      }

      // Step 5b: Verify there is an identity server listening on the provided
      // URL.
      const isResponse = await this.fetchWellKnownObject(`${isUrl}/_matrix/identity/v2`);
      if (!isResponse?.raw || isResponse.action !== AutoDiscoveryAction.SUCCESS) {
        _logger.logger.error("Invalid /v2 response");
        failingClientConfig["m.identity_server"].error = AutoDiscovery.ERROR_INVALID_IDENTITY_SERVER;

        // Supply the base_url to the caller because they may be ignoring
        // liveliness errors, like this one.
        failingClientConfig["m.identity_server"].base_url = isUrl;
        return Promise.resolve(failingClientConfig);
      }
    }

    // Step 6: Now that the identity server is valid, or never existed,
    // populate the IS section.
    if (isUrl && isUrl.toString().length > 0) {
      clientConfig["m.identity_server"] = {
        state: AutoDiscovery.SUCCESS,
        error: null,
        base_url: isUrl
      };
    }

    // Step 7: Copy any other keys directly into the clientConfig. This is for
    // things like custom configuration of services.
    Object.keys(wellknown).forEach(k => {
      if (k === "m.homeserver" || k === "m.identity_server") {
        // Only copy selected parts of the config to avoid overwriting
        // properties computed by the validation logic above.
        const notProps = ["error", "state", "base_url"];
        for (const prop of Object.keys(wellknown[k])) {
          if (notProps.includes(prop)) continue;
          // @ts-ignore - ts gets unhappy as we're mixing types here
          clientConfig[k][prop] = wellknown[k][prop];
        }
      } else {
        // Just copy the whole thing over otherwise
        clientConfig[k] = wellknown[k];
      }
    });
    const authConfig = await this.discoverAndValidateAuthenticationConfig(wellknown);
    clientConfig[_client.M_AUTHENTICATION.stable] = authConfig;

    // Step 8: Give the config to the caller (finally)
    return Promise.resolve(clientConfig);
  }

  /**
   * Validate delegated auth configuration
   * @deprecated use discoverAndValidateAuthenticationConfig
   * - m.authentication config is present and valid
   * - delegated auth issuer openid-configuration is reachable
   * - delegated auth issuer openid-configuration is configured correctly for us
   * When successful, DelegatedAuthConfig will be returned with endpoints used for delegated auth
   * Any errors are caught, and AutoDiscoveryState returned with error
   * @param wellKnown - configuration object as returned
   * by the .well-known auto-discovery endpoint
   * @returns Config or failure result
   */
  static async validateDiscoveryAuthenticationConfig(wellKnown) {
    try {
      const authentication = _client.M_AUTHENTICATION.findIn(wellKnown) || undefined;
      const homeserverAuthenticationConfig = (0, _validate.validateWellKnownAuthentication)(authentication);
      const issuerOpenIdConfigUrl = `${this.sanitizeWellKnownUrl(homeserverAuthenticationConfig.issuer)}/.well-known/openid-configuration`;
      const issuerWellKnown = await this.fetchWellKnownObject(issuerOpenIdConfigUrl);
      if (issuerWellKnown.action !== AutoDiscoveryAction.SUCCESS) {
        _logger.logger.error("Failed to fetch issuer openid configuration");
        throw new Error(_error.OidcError.General);
      }
      const validatedIssuerConfig = (0, _validate.validateOIDCIssuerWellKnown)(issuerWellKnown.raw);
      const delegatedAuthConfig = _objectSpread(_objectSpread({
        state: AutoDiscoveryAction.SUCCESS,
        error: null
      }, homeserverAuthenticationConfig), validatedIssuerConfig);
      return delegatedAuthConfig;
    } catch (error) {
      const errorMessage = error.message;
      const errorType = Object.values(_error.OidcError).includes(errorMessage) ? errorMessage : _error.OidcError.General;
      const state = errorType === _error.OidcError.NotSupported ? AutoDiscoveryAction.IGNORE : AutoDiscoveryAction.FAIL_ERROR;
      return {
        state,
        error: errorType
      };
    }
  }

  /**
   * Validate delegated auth configuration
   * - m.authentication config is present and valid
   * - delegated auth issuer openid-configuration is reachable
   * - delegated auth issuer openid-configuration is configured correctly for us
   * When successful, validated authentication metadata and optionally signing keys will be returned
   * Any errors are caught, and AutoDiscoveryState returned with error
   * @param wellKnown - configuration object as returned
   * by the .well-known auto-discovery endpoint
   * @returns Config or failure result
   */
  static async discoverAndValidateAuthenticationConfig(wellKnown) {
    try {
      const authentication = _client.M_AUTHENTICATION.findIn(wellKnown) || undefined;
      const result = await (0, _discovery.discoverAndValidateAuthenticationConfig)(authentication);

      // include this for backwards compatibility
      const validatedIssuerConfig = (0, _validate.validateOIDCIssuerWellKnown)(result.metadata);
      const response = _objectSpread(_objectSpread({
        state: AutoDiscoveryAction.SUCCESS,
        error: null
      }, validatedIssuerConfig), result);
      return response;
    } catch (error) {
      const errorMessage = error.message;
      const errorType = Object.values(_error.OidcError).includes(errorMessage) ? errorMessage : _error.OidcError.General;
      const state = errorType === _error.OidcError.NotSupported ? AutoDiscoveryAction.IGNORE : AutoDiscoveryAction.FAIL_ERROR;
      return {
        state,
        error: errorType
      };
    }
  }

  /**
   * Attempts to automatically discover client configuration information
   * prior to logging in. Such information includes the homeserver URL
   * and identity server URL the client would want. Additional details
   * may also be discovered, and will be transparently included in the
   * response object unaltered.
   * @param domain - The homeserver domain to perform discovery
   * on. For example, "matrix.org".
   * @returns Promise which resolves to the discovered
   * configuration, which may include error states. Rejects on unexpected
   * failure, not when discovery fails.
   */
  static async findClientConfig(domain) {
    if (!domain || typeof domain !== "string" || domain.length === 0) {
      throw new Error("'domain' must be a string of non-zero length");
    }

    // We use a .well-known lookup for all cases. According to the spec, we
    // can do other discovery mechanisms if we want such as custom lookups
    // however we won't bother with that here (mostly because the spec only
    // supports .well-known right now).
    //
    // By using .well-known, we need to ensure we at least pull out a URL
    // for the homeserver. We don't really need an identity server configuration
    // but will return one anyways (with state PROMPT) to make development
    // easier for clients. If we can't get a homeserver URL, all bets are
    // off on the rest of the config and we'll assume it is invalid too.

    // We default to an error state to make the first few checks easier to
    // write. We'll update the properties of this object over the duration
    // of this function.
    const clientConfig = {
      "m.homeserver": {
        state: AutoDiscovery.FAIL_ERROR,
        error: AutoDiscovery.ERROR_INVALID,
        base_url: null
      },
      "m.identity_server": {
        // Technically, we don't have a problem with the identity server
        // config at this point.
        state: AutoDiscovery.PROMPT,
        error: null,
        base_url: null
      }
    };

    // Step 1: Actually request the .well-known JSON file and make sure it
    // at least has a homeserver definition.
    const domainWithProtocol = domain.includes("://") ? domain : `https://${domain}`;
    const wellknown = await this.fetchWellKnownObject(`${domainWithProtocol}/.well-known/matrix/client`);
    if (!wellknown || wellknown.action !== AutoDiscoveryAction.SUCCESS) {
      _logger.logger.error("No response or error when parsing .well-known");
      if (wellknown.reason) _logger.logger.error(wellknown.reason);
      if (wellknown.action === AutoDiscoveryAction.IGNORE) {
        clientConfig["m.homeserver"] = {
          state: AutoDiscovery.PROMPT,
          error: null,
          base_url: null
        };
      } else {
        // this can only ever be FAIL_PROMPT at this point.
        clientConfig["m.homeserver"].state = AutoDiscovery.FAIL_PROMPT;
        clientConfig["m.homeserver"].error = AutoDiscovery.ERROR_INVALID;
      }
      return Promise.resolve(clientConfig);
    }

    // Step 2: Validate and parse the config
    return AutoDiscovery.fromDiscoveryConfig(wellknown.raw);
  }

  /**
   * Gets the raw discovery client configuration for the given domain name.
   * Should only be used if there's no validation to be done on the resulting
   * object, otherwise use findClientConfig().
   * @param domain - The domain to get the client config for.
   * @returns Promise which resolves to the domain's client config. Can
   * be an empty object.
   */
  static async getRawClientConfig(domain) {
    if (!domain || typeof domain !== "string" || domain.length === 0) {
      throw new Error("'domain' must be a string of non-zero length");
    }
    const response = await this.fetchWellKnownObject(`https://${domain}/.well-known/matrix/client`);
    if (!response) return {};
    return response.raw ?? {};
  }

  /**
   * Sanitizes a given URL to ensure it is either an HTTP or HTTP URL and
   * is suitable for the requirements laid out by .well-known auto discovery.
   * If valid, the URL will also be stripped of any trailing slashes.
   * @param url - The potentially invalid URL to sanitize.
   * @returns The sanitized URL or a falsey value if the URL is invalid.
   * @internal
   */
  static sanitizeWellKnownUrl(url) {
    if (!url) return false;
    try {
      let parsed;
      try {
        parsed = new URL(url);
      } catch (e) {
        _logger.logger.error("Could not parse url", e);
      }
      if (!parsed?.hostname) return false;
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      const port = parsed.port ? `:${parsed.port}` : "";
      const path = parsed.pathname ? parsed.pathname : "";
      let saferUrl = `${parsed.protocol}//${parsed.hostname}${port}${path}`;
      if (saferUrl.endsWith("/")) {
        saferUrl = saferUrl.substring(0, saferUrl.length - 1);
      }
      return saferUrl;
    } catch (e) {
      _logger.logger.error(e);
      return false;
    }
  }
  static fetch(resource, options) {
    if (this.fetchFn) {
      return this.fetchFn(resource, options);
    }
    return global.fetch(resource, options);
  }
  static setFetchFn(fetchFn) {
    AutoDiscovery.fetchFn = fetchFn;
  }

  /**
   * Fetches a JSON object from a given URL, as expected by all .well-known
   * related lookups. If the server gives a 404 then the `action` will be
   * IGNORE. If the server returns something that isn't JSON, the `action`
   * will be FAIL_PROMPT. For any other failure the `action` will be FAIL_PROMPT.
   *
   * The returned object will be a result of the call in object form with
   * the following properties:
   *   raw: The JSON object returned by the server.
   *   action: One of SUCCESS, IGNORE, or FAIL_PROMPT.
   *   reason: Relatively human-readable description of what went wrong.
   *   error: The actual Error, if one exists.
   * @param url - The URL to fetch a JSON object from.
   * @returns Promise which resolves to the returned state.
   * @internal
   */
  static async fetchWellKnownObject(url) {
    let response;
    try {
      response = await AutoDiscovery.fetch(url, {
        method: _httpApi.Method.Get,
        signal: (0, _httpApi.timeoutSignal)(5000)
      });
      if (response.status === 404) {
        return {
          raw: {},
          action: AutoDiscoveryAction.IGNORE,
          reason: AutoDiscovery.ERROR_MISSING_WELLKNOWN
        };
      }
      if (!response.ok) {
        return {
          raw: {},
          action: AutoDiscoveryAction.FAIL_PROMPT,
          reason: "General failure"
        };
      }
    } catch (err) {
      const error = err;
      let reason = "";
      if (typeof error === "object") {
        reason = error?.message;
      }
      return {
        error,
        raw: {},
        action: AutoDiscoveryAction.FAIL_PROMPT,
        reason: reason || "General failure"
      };
    }
    try {
      return {
        raw: await response.json(),
        action: AutoDiscoveryAction.SUCCESS
      };
    } catch (err) {
      const error = err;
      return {
        error,
        raw: {},
        action: AutoDiscoveryAction.FAIL_PROMPT,
        reason: error?.name === "SyntaxError" ? AutoDiscovery.ERROR_INVALID_JSON : AutoDiscovery.ERROR_INVALID
      };
    }
  }
}
exports.AutoDiscovery = AutoDiscovery;
_class = AutoDiscovery;
// Dev note: the constants defined here are related to but not
// exactly the same as those in the spec. This is to hopefully
// translate the meaning of the states in the spec, but also
// support our own if needed.
_defineProperty(AutoDiscovery, "ERROR_INVALID", AutoDiscoveryError.Invalid);
_defineProperty(AutoDiscovery, "ERROR_GENERIC_FAILURE", AutoDiscoveryError.GenericFailure);
_defineProperty(AutoDiscovery, "ERROR_INVALID_HS_BASE_URL", AutoDiscoveryError.InvalidHsBaseUrl);
_defineProperty(AutoDiscovery, "ERROR_INVALID_HOMESERVER", AutoDiscoveryError.InvalidHomeserver);
_defineProperty(AutoDiscovery, "ERROR_INVALID_IS_BASE_URL", AutoDiscoveryError.InvalidIsBaseUrl);
_defineProperty(AutoDiscovery, "ERROR_INVALID_IDENTITY_SERVER", AutoDiscoveryError.InvalidIdentityServer);
_defineProperty(AutoDiscovery, "ERROR_INVALID_IS", AutoDiscoveryError.InvalidIs);
_defineProperty(AutoDiscovery, "ERROR_MISSING_WELLKNOWN", AutoDiscoveryError.MissingWellknown);
_defineProperty(AutoDiscovery, "ERROR_INVALID_JSON", AutoDiscoveryError.InvalidJson);
_defineProperty(AutoDiscovery, "ERROR_UNSUPPORTED_HOMESERVER_SPEC_VERSION", AutoDiscoveryError.UnsupportedHomeserverSpecVersion);
/** @deprecated Replaced by ERROR_UNSUPPORTED_HOMESERVER_SPEC_VERSION */
_defineProperty(AutoDiscovery, "ERROR_HOMESERVER_TOO_OLD", _class.ERROR_UNSUPPORTED_HOMESERVER_SPEC_VERSION);
_defineProperty(AutoDiscovery, "ALL_ERRORS", Object.keys(AutoDiscoveryError));
/**
 * The auto discovery failed. The client is expected to communicate
 * the error to the user and refuse logging in.
 */
_defineProperty(AutoDiscovery, "FAIL_ERROR", AutoDiscoveryAction.FAIL_ERROR);
/**
 * The auto discovery failed, however the client may still recover
 * from the problem. The client is recommended to that the same
 * action it would for PROMPT while also warning the user about
 * what went wrong. The client may also treat this the same as
 * a FAIL_ERROR state.
 */
_defineProperty(AutoDiscovery, "FAIL_PROMPT", AutoDiscoveryAction.FAIL_PROMPT);
/**
 * The auto discovery didn't fail but did not find anything of
 * interest. The client is expected to prompt the user for more
 * information, or fail if it prefers.
 */
_defineProperty(AutoDiscovery, "PROMPT", AutoDiscoveryAction.PROMPT);
/**
 * The auto discovery was successful.
 */
_defineProperty(AutoDiscovery, "SUCCESS", AutoDiscoveryAction.SUCCESS);
_defineProperty(AutoDiscovery, "fetchFn", void 0);