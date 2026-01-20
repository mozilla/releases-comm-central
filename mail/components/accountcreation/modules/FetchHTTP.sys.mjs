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
  JXON: "resource:///modules/JXON.sys.mjs",
  MailStringUtils: "resource:///modules/MailStringUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(["messenger/accountcreation/accountCreation.ftl"], false)
);

const { gAccountSetupLogger, abortSignalTimeout } = AccountCreationUtils;

/**
 * Make a HTTP request. Wrapper similar to fetch, but not quite. Uses
 * XMLHttpRequest, so redirects can be handled as errors.
 *
 * @param {string} url - URL of the server function. ATTENTION: The caller needs
 *   to make sure that the URL is secure to call.
 * @param {object} [args={}] - Additional parameters as properties, see below
 * @param {object} [args.urlArgs={}] - Parameters to add to the end of the URL
 *   as query string. E.g. { foo: "bla", bar: "blub blub" } will add
 *   "?foo=bla&bar=blub%20blub" to the URL (unless the URL already has a "?",
 *   then it adds "&foo..."). The values will be urlComponentEncoded, so pass
 *   them unencoded.
 * @param {object} [args.headers={}] - HTTP headers to be added to the HTTP
 *   request. { foo: "blub blub" } will add HTTP header "Foo: Blub blub". The
 *   values will be passed verbatim.
 * @param {boolean} [args.post] - HTTP GET or POST Only influences the HTTP
 *   request method, i.e. first line of the HTTP request, not the body or
 *   parameters. Use POST when you modify server state, GET when you only
 *   request information. Default is GET, but POST is automatically set when a
 *   body is provided.
 * @param {object|string} [args.uploadBody] - Arbitrary object or string,
 *   which to use as body of the HTTP request. Will also set the mimetype
 *   accordingly. Only supported object types, currently supported:
 *    - JXON -> sending XML
 *    - JS object -> sending JSON
 *    - string -> sending text/plain
 *   If you want to override the body mimetype, set header Content-Type below.
 *   Usually, you have nothing to upload, so just leave it unset.
 * @param {string} [args.username] - Default unset = no authentication.
 * @param {string} [args.password] - Default unset = no authentication.
 * @param {AbortSignal} [args.signal] - Optional abort signal to cancel the
 *   request.
 * @param {number} [args.timeout=5000] - The forced timeout for the request in
 *   miliseconds.
 * @param {boolean} [isRetry = false] - Internal parameter used to indicate if
 *   this is a recursive call.
 * @returns {string|object} The response body from the server. If it is JSON or
 *   XML the data is parsed into object from (JXON for XML).
 * @throws {ServerException} The ServerException's code is either the HTTP
 *   status code, -4 if there was an error parsing the response body or -2 if
 *   any other error occurred. Other error types might also be thrown, for
 *   example if the abort signal is aborted before the request is even set up.
 */
export async function fetchHTTP(url, args = {}, isRetry = false) {
  const urlObject = new URL(lazy.Sanitizer.string(url));
  args.urlArgs ??= {};
  args.headers ??= {};

  const fetchArgs = {
    method: args.post || args.uploadBody ? "POST" : "GET",
    body: args.uploadBody,
    headers: args.headers,
  };

  for (const [name, value] of Object.entries(args.urlArgs)) {
    urlObject.searchParams.append(name, value);
  }

  if (typeof args.uploadBody == "object" && "nodeType" in args.uploadBody) {
    // XML
    fetchArgs.headers["Content-Type"] ??= "text/xml; charset=UTF-8";
    fetchArgs.body = new XMLSerializer().serializeToString(args.uploadBody);
  } else if (typeof args.uploadBody == "object") {
    // JSON
    fetchArgs.headers["Content-Type"] ??= "text/json; charset=UTF-8";
    fetchArgs.body = JSON.stringify(args.uploadBody);
  } else if (typeof args.uploadBody == "string") {
    // Plaintext
    // You can override the mimetype with { headers: {"Content-Type" : "text/foo" } }
    fetchArgs.headers["Content-Type"] ??= "text/plain; charset=UTF-8";
  }

  if (args.username && args.password) {
    const authorization = btoa(
      lazy.MailStringUtils.stringToByteString(
        `${args.username}:${args.password}`
      )
    );
    fetchArgs.headers.Authorization = `Basic ${authorization}`;
  }

  args.timeout = lazy.Sanitizer.integer(args.timeout || 5000); // default 5 seconds

  const timeoutAbort = abortSignalTimeout(args.timeout);
  const signals = [timeoutAbort];
  if (args.signal) {
    args.signal.throwIfAborted();
    signals.push(args.signal);
  }
  fetchArgs.signal = AbortSignal.any(signals);

  gAccountSetupLogger.info("Requesting", urlObject);

  let response;
  try {
    const request = new XMLHttpRequest();
    request.mozBackgroundRequest = true;
    request.open(
      fetchArgs.method,
      urlObject.toString(),
      true,
      fetchArgs.headers.Authorization && args.username,
      fetchArgs.headers.Authorization && args.password
    );
    request.channel.loadGroup = null;
    request.timeout = args.timeout;
    for (const [header, value] of Object.entries(fetchArgs.headers)) {
      request.setRequestHeader(header, value);
    }

    response = request;
    await new Promise((resolve, reject) => {
      request.onload = resolve;
      request.onerror = reject;
      request.ontimeout = reject;
      fetchArgs.signal.addEventListener(
        "abort",
        () => {
          request.abort();
          reject(fetchArgs.signal.reason);
        },
        { once: true }
      );
      request.send(fetchArgs.body?.toString());
    });
  } catch (error) {
    if (
      response.status >= 300 &&
      fetchArgs.headers.Authorization &&
      response.responseURL.replace(/\/\/.*@/, "//") != urlObject.toString() &&
      response.responseURL.startsWith("http") &&
      !isRetry
    ) {
      gAccountSetupLogger.info(
        "Call to ",
        urlObject,
        " was redirected to ",
        response.responseURL,
        ", and failed. Re-trying the new URL with authentication again."
      );
      return fetchHTTP(response.responseURL, { ...args, urlArgs: {} }, true);
    }
    const message = await lazy.l10n.formatValue("cannot-contact-server-error");
    throw new ServerException(
      response.statusText || message,
      response.status || -2,
      response.responseURL || urlObject.toString(),
      error
    );
  }

  if (response.status >= 200 && response.status < 300) {
    try {
      const responseType = response.getResponseHeader("Content-Type");
      if (
        ["text/xml", "application/xml", "text/rdf"].some(mimetype =>
          responseType?.startsWith(mimetype)
        )
      ) {
        return lazy.JXON.build(response.responseXML);
      } else if (
        ["text/json", "application/json"].some(mimetype =>
          responseType?.startsWith(mimetype)
        )
      ) {
        const json = JSON.parse(response.responseText);
        return json;
      }
      return response.responseText;
    } catch (error) {
      throw new ServerException(
        await lazy.l10n.formatValue("bad-response-content-error"),
        -4,
        response.responseURL,
        error
      );
    }
  } else if (
    fetchArgs.headers.Authorization &&
    response.responseURL.replace(/\/\/.*@/, "//") != urlObject.toString() &&
    response.responseURL.startsWith("http") &&
    !isRetry
  ) {
    gAccountSetupLogger.info(
      "Call to ",
      urlObject,
      " was redirected to ",
      response.responseURL,
      ", and failed. Re-trying the new URL with authentication again."
    );
    return fetchHTTP(response.responseURL, { ...args, urlArgs: {} }, true);
  } else {
    let message = response.statusText;
    if (!response.status) {
      message = await lazy.l10n.formatValue("cannot-contact-server-error");
    }
    throw new ServerException(
      message,
      response.status || -2,
      response.responseURL
    );
  }
}

class ServerException extends Error {
  constructor(message, code, uri, cause) {
    super(message, { cause });
    this.code = code;
    this.uri = uri;
    this.url = uri;
  }
}
