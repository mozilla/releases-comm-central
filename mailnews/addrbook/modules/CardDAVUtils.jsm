/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["CardDAVUtils", "NotificationCallbacks"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  ContextualIdentityService:
    "resource://gre/modules/ContextualIdentityService.jsm",
  Services: "resource://gre/modules/Services.jsm",
});
XPCOMUtils.defineLazyServiceGetter(
  this,
  "nssErrorsService",
  "@mozilla.org/nss_errors_service;1",
  "nsINSSErrorsService"
);

var CardDAVUtils = {
  _contextMap: new Map(),

  /**
   * Returns the id of a unique private context for each username. When the
   * userContextId is set on a principal, this allows the use of multiple
   * usernames on the same server without the networking code causing issues.
   *
   * @param {String} username
   * @return {integer}
   */
  contextForUsername(username) {
    if (username && CardDAVUtils._contextMap.has(username)) {
      return CardDAVUtils._contextMap.get(username);
    }

    // This could be any 32-bit integer, as long as it isn't already in use.
    let nextId = 25000 + CardDAVUtils._contextMap.size;
    ContextualIdentityService.remove(nextId);
    CardDAVUtils._contextMap.set(username, nextId);
    return nextId;
  },

  /**
   * Make an HTTP request. If the request needs a username and password, the
   * given authPrompt is called.
   *
   * @param {String}  uri
   * @param {Object}  details
   * @param {String}  [details.method]
   * @param {Object}  [details.headers]
   * @param {String}  [details.body]
   * @param {String}  [details.contentType]
   * @param {msgIOAuth2Module}  [details.oAuth] - If this is present the
   *     request will use OAuth2 authorization.
   * @param {NotificationCallbacks} [details.callbacks] - Handles usernames
   *     and passwords for this request.
   * @param {integer} [details.userContextId] - See _contextForUsername.
   *
   * @return {Promise<Object>} - Resolves to an object with getters for:
   *    - status, the HTTP response code
   *    - statusText, the HTTP response message
   *    - text, the returned data as a String
   *    - dom, the returned data parsed into a Document
   */
  async makeRequest(uri, details) {
    if (typeof uri == "string") {
      uri = Services.io.newURI(uri);
    }
    let {
      method = "GET",
      headers = {},
      body = null,
      contentType = "text/xml",
      oAuth = null,
      callbacks = new NotificationCallbacks(),
      userContextId = Ci.nsIScriptSecurityManager.DEFAULT_USER_CONTEXT_ID,
    } = details;
    headers["Content-Type"] = contentType;
    if (oAuth) {
      headers.Authorization = await new Promise((resolve, reject) => {
        oAuth.connect(true, {
          onSuccess(token) {
            resolve(
              // `token` is a base64-encoded string for SASL XOAUTH2. That is
              // not what we want, extract just the Bearer token part.
              // (See OAuth2Module.connect.)
              atob(token)
                .split("\x01")[1]
                .slice(5)
            );
          },
          onFailure: reject,
        });
      });
    }

    return new Promise((resolve, reject) => {
      let principal = Services.scriptSecurityManager.createContentPrincipal(
        uri,
        { userContextId }
      );

      let channel = Services.io.newChannelFromURI(
        uri,
        null,
        principal,
        null,
        Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        Ci.nsIContentPolicy.TYPE_OTHER
      );
      channel.QueryInterface(Ci.nsIHttpChannel);
      for (let [name, value] of Object.entries(headers)) {
        channel.setRequestHeader(name, value, false);
      }
      if (body !== null) {
        let converter = Cc[
          "@mozilla.org/intl/scriptableunicodeconverter"
        ].createInstance(Ci.nsIScriptableUnicodeConverter);
        converter.charset = "UTF-8";
        let stream = converter.convertToInputStream(body.toString());

        channel.QueryInterface(Ci.nsIUploadChannel);
        channel.setUploadStream(stream, contentType, -1);
      }
      channel.requestMethod = method; // Must go after setUploadStream.
      channel.notificationCallbacks = callbacks;

      let listener = Cc["@mozilla.org/network/stream-loader;1"].createInstance(
        Ci.nsIStreamLoader
      );
      listener.init({
        onStreamComplete(loader, context, status, resultLength, result) {
          let finalChannel = loader.request.QueryInterface(Ci.nsIHttpChannel);
          if (!Components.isSuccessCode(status)) {
            let isCertError = false;
            try {
              let errorType = nssErrorsService.getErrorClass(status);
              if (errorType == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
                isCertError = true;
              }
            } catch (ex) {
              // nsINSSErrorsService.getErrorClass throws if given a non-TLS,
              // non-cert error, so ignore this.
            }

            if (isCertError && finalChannel.securityInfo) {
              let secInfo = finalChannel.securityInfo.QueryInterface(
                Ci.nsITransportSecurityInfo
              );
              let params = {
                exceptionAdded: false,
                securityInfo: secInfo,
                prefetchCert: true,
                location: finalChannel.originalURI.displayHost,
              };
              Services.wm
                .getMostRecentWindow("")
                .openDialog(
                  "chrome://pippki/content/exceptionDialog.xhtml",
                  "",
                  "chrome,centerscreen,modal",
                  params
                );

              if (params.exceptionAdded) {
                // Try again now that an exception has been added.
                CardDAVUtils.makeRequest(uri, details).then(resolve, reject);
                return;
              }
            }

            reject(new Components.Exception("Connection failure", status));
            return;
          }
          if (finalChannel.responseStatus == 401) {
            // We tried to authenticate, but failed.
            reject(
              new Components.Exception(
                "Authorization failure",
                Cr.NS_ERROR_FAILURE
              )
            );
            return;
          }
          resolve({
            get status() {
              return finalChannel.responseStatus;
            },
            get statusText() {
              return finalChannel.responseStatusText;
            },
            get text() {
              return new TextDecoder().decode(Uint8Array.from(result));
            },
            get dom() {
              if (this._dom === undefined) {
                try {
                  this._dom = new DOMParser().parseFromString(
                    this.text,
                    "text/xml"
                  );
                } catch (ex) {
                  this._dom = null;
                }
              }
              return this._dom;
            },
          });
        },
      });
      channel.asyncOpen(listener, channel);
    });
  },
};

/**
 * Passed to nsIChannel.notificationCallbacks in CardDAVDirectory.makeRequest.
 * This handles HTTP authentication, prompting the user if necessary. It also
 * ensures important headers are copied from one channel to another if a
 * redirection occurs.
 *
 * @implements {nsIInterfaceRequestor}
 * @implements {nsIAuthPrompt2}
 * @implements {nsIChannelEventSink}
 */
class NotificationCallbacks {
  /**
   * @param {String}  [username] - Used to pre-fill any auth dialogs.
   * @param {String}  [password] - Used to pre-fill any auth dialogs.
   * @param {boolean} [forcePrompt] - Skips checking the password manager for
   *     a password, even if username is given. The user will be prompted.
   */
  constructor(username, password, forcePrompt) {
    this.username = username;
    this.password = password;
    this.forcePrompt = forcePrompt;
  }
  QueryInterface = ChromeUtils.generateQI([
    "nsIInterfaceRequestor",
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]);
  getInterface = ChromeUtils.generateQI([
    "nsIAuthPrompt2",
    "nsIChannelEventSink",
  ]);
  promptAuth(channel, level, authInfo) {
    if (authInfo.flags & Ci.nsIAuthInformation.PREVIOUS_FAILED) {
      return false;
    }

    if (!this.forcePrompt) {
      let logins = Services.logins.findLogins(channel.URI.prePath, null, "");
      for (let l of logins) {
        if (l.username == this.username) {
          authInfo.username = l.username;
          authInfo.password = l.password;
          return true;
        }
      }
    }

    authInfo.username = this.username;
    authInfo.password = this.password;

    let savePasswordLabel = null;
    let savePassword = {};
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savePasswordLabel = Services.strings
        .createBundle("chrome://passwordmgr/locale/passwordmgr.properties")
        .GetStringFromName("rememberPassword");
      savePassword.value = true;
    }
    let returnValue = Services.prompt.promptAuth(
      Services.wm.getMostRecentWindow(""),
      channel,
      level,
      authInfo,
      savePasswordLabel,
      savePassword
    );
    if (returnValue) {
      this.shouldSaveAuth = savePassword.value;
      this.origin = channel.URI.prePath;
    }
    this.authInfo = authInfo;
    return returnValue;
  }
  saveAuth() {
    if (this.shouldSaveAuth) {
      let newLoginInfo = Cc[
        "@mozilla.org/login-manager/loginInfo;1"
      ].createInstance(Ci.nsILoginInfo);
      newLoginInfo.init(
        this.origin,
        null,
        this.authInfo.realm,
        this.authInfo.username,
        this.authInfo.password,
        "",
        ""
      );
      try {
        Services.logins.addLogin(newLoginInfo);
      } catch (ex) {
        Cu.reportError(ex);
      }
    }
  }
  asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
    /**
     * Copy the given header from the old channel to the new one, ignoring missing headers
     *
     * @param {String} header - The header to copy
     */
    function copyHeader(header) {
      try {
        let headerValue = oldChannel.getRequestHeader(header);
        if (headerValue) {
          newChannel.setRequestHeader(header, headerValue, false);
        }
      } catch (e) {
        if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
          // The header could possibly not be available, ignore that
          // case but throw otherwise
          throw e;
        }
      }
    }

    // Make sure we can get/set headers on both channels.
    newChannel.QueryInterface(Ci.nsIHttpChannel);
    oldChannel.QueryInterface(Ci.nsIHttpChannel);

    // If any other header is used, it should be added here. We might want
    // to just copy all headers over to the new channel.
    copyHeader("Authorization");
    copyHeader("Depth");
    copyHeader("Originator");
    copyHeader("Recipient");
    copyHeader("If-None-Match");
    copyHeader("If-Match");

    newChannel.requestMethod = oldChannel.requestMethod;
    callback.onRedirectVerifyCallback(Cr.NS_OK);
  }
}
