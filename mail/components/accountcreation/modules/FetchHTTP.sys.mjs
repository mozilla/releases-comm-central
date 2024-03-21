/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This is a small wrapper around XMLHttpRequest, which solves various
 * inadequacies of the API, e.g. error handling. It is entirely generic and
 * can be used for purposes outside of even mail.
 *
 * It does not provide download progress, but assumes that the
 * fetched resource is so small (<1 10 KB) that the roundtrip and
 * response generation is far more significant than the
 * download time of the response. In other words, it's fine for RPC,
 * but not for bigger file downloads.
 */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { JXON } from "resource:///modules/JXON.sys.mjs";

const {
  Abortable,
  alertPrompt,
  assert,
  ddump,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  UserCancelledException,
} = AccountCreationUtils;

/**
 * Set up a fetch.
 *
 * @param {string} url - URL of the server function.
 *    ATTENTION: The caller needs to make sure that the URL is secure to call.
 * @param {object} args - Additional parameters as properties, see below
 *
 * @param {Function({string} result)} successCallback
 *   Called when the server call worked (no errors).
 *   |result| will contain the body of the HTTP response, as string.
 * @param {Function(ex)} errorCallback
 *   Called in case of error. ex contains the error
 *   with a user-displayable but not localized |.message| and maybe a
 *   |.code|, which can be either
 *  - an nsresult error code,
 *  - an HTTP result error code (0...1000) or
 *  - negative: 0...-100 :
 *     -2 = can't resolve server in DNS etc.
 *     -4 = response body (e.g. XML) malformed
 *
 * The following optional parameters are supported as properties of the |args| object:
 *
 * @param {Object, associative array} urlArgs - Parameters to add
 *   to the end of the URL as query string. E.g.
 *   { foo: "bla", bar: "blub blub" } will add "?foo=bla&bar=blub%20blub"
 *   to the URL
 *   (unless the URL already has a "?", then it adds "&foo...").
 *   The values will be urlComponentEncoded, so pass them unencoded.
 * @param {Object, associative array} headers - HTTP headers to be added
 *   to the HTTP request.
 *   { foo: "blub blub" } will add HTTP header "Foo: Blub blub".
 *   The values will be passed verbatim.
 * @param {boolean} post - HTTP GET or POST
 *   Only influences the HTTP request method,
 *   i.e. first line of the HTTP request, not the body or parameters.
 *   Use POST when you modify server state,
 *   GET when you only request information.
 *   Default is GET.
 * @param {Object, associative array} bodyFormArgs - Like urlArgs,
 *   just that the params will be sent x-url-encoded in the body,
 *   like a HTML form post.
 *   The values will be urlComponentEncoded, so pass them unencoded.
 *   This cannot be used together with |uploadBody|.
 * @param {object} uploadBody - Arbitrary object, which to use as
 *   body of the HTTP request. Will also set the mimetype accordingly.
 *   Only supported object types, currently only JXON is supported
 *   (sending XML).
 *   Usually, you have nothing to upload, so just pass |null|.
 *   Only supported object types, currently supported:
 *   JXON -> sending XML
 *   JS object -> sending JSON
 *   string -> sending text/plain
 *   If you want to override the body mimetype, set header Content-Type below.
 *   Usually, you have nothing to upload, so just leave it at |null|.
 *   Default |null|.
 * @param {boolean} allowCache (default true)
 * @param {string} username (default null = no authentication)
 * @param {string} password (default null = no authentication)
 * @param {boolean} allowAuthPrompt (default true)
 * @param {boolean} requireSecureAuth (default false)
 *   Ignore the username and password unless we are using https:
 *   This also applies to both https: to http: and http: to https: redirects.
 */
export function FetchHTTP(url, args, successCallback, errorCallback) {
  assert(typeof successCallback == "function", "BUG: successCallback");
  assert(typeof errorCallback == "function", "BUG: errorCallback");
  this._url = lazy.Sanitizer.string(url);
  if (!args) {
    args = {};
  }
  if (!args.urlArgs) {
    args.urlArgs = {};
  }
  if (!args.headers) {
    args.headers = {};
  }

  this._args = args;
  this._args.post = lazy.Sanitizer.boolean(args.post || false); // default false
  this._args.allowCache =
    "allowCache" in args ? lazy.Sanitizer.boolean(args.allowCache) : true; // default true
  this._args.allowAuthPrompt = lazy.Sanitizer.boolean(
    args.allowAuthPrompt || false
  ); // default false
  this._args.requireSecureAuth = lazy.Sanitizer.boolean(
    args.requireSecureAuth || false
  ); // default false
  this._args.timeout = lazy.Sanitizer.integer(args.timeout || 5000); // default 5 seconds
  this._successCallback = successCallback;
  this._errorCallback = errorCallback;
  this._logger = gAccountSetupLogger;
  this._logger.info("Requesting <" + url + ">");
}

FetchHTTP.prototype = {
  __proto__: Abortable.prototype,
  _url: null, // URL as passed to ctor, without arguments
  _args: null,
  _successCallback: null,
  _errorCallback: null,
  _request: null, // the XMLHttpRequest object
  result: null,

  start() {
    let url = this._url;
    for (const name in this._args.urlArgs) {
      url +=
        (!url.includes("?") ? "?" : "&") +
        name +
        "=" +
        encodeURIComponent(this._args.urlArgs[name]);
    }
    this._request = new XMLHttpRequest();
    const request = this._request;
    request.mozBackgroundRequest = !this._args.allowAuthPrompt;
    let username = null,
      password = null;
    if (url.startsWith("https:") || !this._args.requireSecureAuth) {
      username = this._args.username;
      password = this._args.password;
    }
    request.open(
      this._args.post ? "POST" : "GET",
      url,
      true,
      username,
      password
    );
    request.channel.loadGroup = null;
    request.timeout = this._args.timeout;
    // needs bug 407190 patch v4 (or higher) - uncomment if that lands.
    // try {
    //    var channel = request.channel.QueryInterface(Ci.nsIHttpChannel2);
    //    channel.connectTimeout = 5;
    //    channel.requestTimeout = 5;
    //    } catch (e) { dump(e + "\n"); }

    if (!this._args.allowCache) {
      // Disable Mozilla HTTP cache
      request.channel.loadFlags |= Ci.nsIRequest.LOAD_BYPASS_CACHE;
    }

    // body
    let mimetype = null;
    let body = this._args.uploadBody;
    if (typeof body == "object" && "nodeType" in body) {
      // XML
      mimetype = "text/xml; charset=UTF-8";
      body = new XMLSerializer().serializeToString(body);
    } else if (typeof body == "object") {
      // JSON
      mimetype = "text/json; charset=UTF-8";
      body = JSON.stringify(body);
    } else if (typeof body == "string") {
      // Plaintext
      // You can override the mimetype with { headers: {"Content-Type" : "text/foo" } }
      mimetype = "text/plain; charset=UTF-8";
      // body already set above
    } else if (this._args.bodyFormArgs) {
      mimetype = "application/x-www-form-urlencoded; charset=UTF-8";
      body = "";
      for (const name in this._args.bodyFormArgs) {
        body +=
          (body ? "&" : "") +
          name +
          "=" +
          encodeURIComponent(this._args.bodyFormArgs[name]);
      }
    }

    // Headers
    if (mimetype && !("Content-Type" in this._args.headers)) {
      request.setRequestHeader("Content-Type", mimetype);
    }
    if (username && password) {
      // workaround, because open(..., username, password) does not work.
      request.setRequestHeader(
        "Authorization",
        "Basic " +
          btoa(
            // btoa() takes a BinaryString.
            String.fromCharCode(
              ...new TextEncoder().encode(username + ":" + password)
            )
          )
      );
    }
    for (const name in this._args.headers) {
      request.setRequestHeader(name, this._args.headers[name]);
      if (name == "Cookie") {
        // Websites are not allowed to set this, but chrome is.
        // Nevertheless, the cookie lib later overwrites our header.
        // request.channel.setCookie(this._args.headers[name]); -- crashes
        // So, deactivate that Firefox cookie lib.
        request.channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
      }
    }

    var me = this;
    request.onload = function () {
      me._response(true);
    };
    request.onerror = function () {
      me._response(false);
    };
    request.ontimeout = function () {
      me._response(false);
    };
    request.send(body);
    // Store the original stack so we can use it if there is an exception
    this._callStack = Error().stack;
  },
  _response(success, exStored) {
    try {
      var errorCode = null;
      var errorStr = null;

      if (
        success &&
        this._request.status >= 200 &&
        this._request.status < 300
      ) {
        // HTTP level success
        try {
          // response
          var mimetype = this._request.getResponseHeader("Content-Type");
          if (!mimetype) {
            mimetype = "";
          }
          mimetype = mimetype.split(";")[0];
          if (
            mimetype == "text/xml" ||
            mimetype == "application/xml" ||
            mimetype == "text/rdf"
          ) {
            // XML
            this.result = JXON.build(this._request.responseXML);
          } else if (
            mimetype == "text/json" ||
            mimetype == "application/json"
          ) {
            // JSON
            this.result = JSON.parse(this._request.responseText);
          } else {
            // Plaintext (fallback)
            // ddump("mimetype: " + mimetype + " only supported as text");
            this.result = this._request.responseText;
          }
        } catch (e) {
          success = false;
          errorStr = getStringBundle(
            "chrome://messenger/locale/accountCreationUtil.properties"
          ).GetStringFromName("bad_response_content.error");
          errorCode = -4;
        }
      } else if (
        this._args.username &&
        this._request.responseURL.replace(/\/\/.*@/, "//") != this._url &&
        this._request.responseURL.startsWith(
          this._args.requireSecureAuth ? "https" : "http"
        ) &&
        !this._isRetry
      ) {
        // Redirects lack auth, see <https://stackoverflow.com/a/28411170>
        this._logger.info(
          "Call to <" +
            this._url +
            "> was redirected to <" +
            this._request.responseURL +
            ">, and failed. Re-trying the new URL with authentication again."
        );
        this._url = this._request.responseURL;
        this._isRetry = true;
        this.start();
        return;
      } else {
        success = false;
        try {
          errorCode = this._request.status;
          errorStr = this._request.statusText;
        } catch (e) {
          // In case .statusText throws (it's marked as [Throws] in the webidl),
          // continue with empty errorStr.
        }
        if (!errorStr) {
          // If we can't resolve the hostname in DNS etc., .statusText is empty.
          errorCode = -2;
          errorStr = getStringBundle(
            "chrome://messenger/locale/accountCreationUtil.properties"
          ).GetStringFromName("cannot_contact_server.error");
          ddump(errorStr + " on <" + this._url + ">");
        }
      }

      // Callbacks
      if (success) {
        try {
          this._successCallback(this.result);
        } catch (e) {
          e.stack = this._callStack;
          this._error(e);
        }
      } else if (exStored) {
        this._error(exStored);
      } else {
        // Put the caller's stack into the exception
        const e = new ServerException(errorStr, errorCode, this._url);
        e.stack = this._callStack;
        this._error(e);
      }

      if (this._finishedCallback) {
        try {
          this._finishedCallback(this);
        } catch (e) {
          console.error(e);
        }
      }
    } catch (e) {
      // error in our fetchhttp._response() code
      this._error(e);
    }
  },
  _error(e) {
    try {
      this._errorCallback(e);
    } catch (e) {
      // error in errorCallback, too!
      console.error(e);
      alertPrompt("Error in errorCallback for fetchhttp", e);
    }
  },
  /**
   * Call this between start() and finishedCallback fired.
   */
  cancel(ex) {
    assert(!this.result, "Call already returned");

    this._request.abort();

    // Need to manually call error handler
    // <https://bugzilla.mozilla.org/show_bug.cgi?id=218236#c11>
    this._response(false, ex ? ex : new UserCancelledException());
  },
  /**
   * Allows caller or lib to be notified when the call is done.
   * This is useful to enable and disable a Cancel button in the UI,
   * which allows to cancel the network request.
   */
  setFinishedCallback(finishedCallback) {
    this._finishedCallback = finishedCallback;
  },
};

function ServerException(msg, code, uri) {
  Exception.call(this, msg);
  this.code = code;
  this.uri = uri;
}
ServerException.prototype = Object.create(Exception.prototype);
ServerException.prototype.constructor = ServerException;

/**
 * Creates a FetchHTTP instance.
 *
 * Use this instead of the constructor if you want to replace FetchHTTP during
 * testing, e.g. because HttpServer can't or shouldn't be used.
 *
 * @see {@link FetchHTTP}
 */
FetchHTTP.create = (url, args, successCallback, errorCallback) => {
  return new FetchHTTP(url, args, successCallback, errorCallback);
};
