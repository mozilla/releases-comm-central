/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides OAuth 2.0 authentication
 */
var EXPORTED_SYMBOLS = ["OAuth2"];

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/Http.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource:///modules/gloda/log4moz.js");

function parseURLData(aData) {
  let result = {};
  aData.split(/[?#]/, 2)[1].split("&").forEach(function (aParam) {
    let [key, value] = aParam.split("=");
    result[key] = value;
  });
  return result;
}

// Only allow one connecting window per endpoint.
var gConnecting = {};

function OAuth2(aBaseURI, aScope, aAppKey, aAppSecret) {
    this.authURI = aBaseURI + "oauth2/auth";
    this.tokenURI = aBaseURI + "oauth2/token";
    this.consumerKey = aAppKey;
    this.consumerSecret = aAppSecret;
    this.scope = aScope;
    this.extraAuthParams = [];

    this.log = Log4Moz.getConfiguredLogger("TBOAuth");
}

OAuth2.CODE_AUTHORIZATION = "authorization_code";
OAuth2.CODE_REFRESH = "refresh_token";

OAuth2.prototype = {

    responseType: "code",
    consumerKey: null,
    consumerSecret: null,
    completionURI: "http://localhost",
    requestWindowURI: "chrome://messenger/content/browserRequest.xul",
    requestWindowFeatures: "chrome,private,centerscreen,width=980,height=600",
    requestWindowTitle: "",
    scope: null,

    accessToken: null,
    refreshToken: null,
    tokenExpires: 0,

    connect: function connect(aSuccess, aFailure, aWithUI, aRefresh) {

        this.connectSuccessCallback = aSuccess;
        this.connectFailureCallback = aFailure;

        if (!aRefresh && this.accessToken) {
            aSuccess();
        } else if (this.refreshToken) {
            this.requestAccessToken(this.refreshToken, OAuth2.CODE_REFRESH);
        } else {
            if (!aWithUI) {
                aFailure('{ "error": "auth_noui" }');
                return;
            }
            if (gConnecting[this.authURI]) {
                aFailure("Window already open");
                return;
            }
            this.requestAuthorization();
        }
    },

    requestAuthorization: function requestAuthorization() {
        let params = [
            ["response_type", this.responseType],
            ["client_id", this.consumerKey],
            ["redirect_uri", this.completionURI],
        ];
        // The scope can be optional.
        if (this.scope) {
            params.push(["scope", this.scope]);
        }

        // Add extra parameters
        params.push(...this.extraAuthParams);

        // Now map the parameters to a string
        params = params.map(([k,v]) => k + "=" + encodeURIComponent(v)).join("&");

        this._browserRequest = {
            account: this,
            url: this.authURI + "?" + params,
            _active: true,
            iconURI: "",
            cancelled: function() {
                if (!this._active) {
                    return;
                }

                this.account.finishAuthorizationRequest();
                this.account.onAuthorizationFailed(Components.results.NS_ERROR_ABORT, '{ "error": "cancelled"}');
            },

            loaded: function (aWindow, aWebProgress) {
                if (!this._active) {
                    return;
                }

                this._listener = {
                    window: aWindow,
                    webProgress: aWebProgress,
                    _parent: this.account,

                    QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                                           Ci.nsISupportsWeakReference]),

                    _cleanUp: function() {
                      this.webProgress.removeProgressListener(this);
                      this.window.close();
                      delete this.window;
                    },

                    _checkForRedirect: function(aURL) {
                      if (aURL.indexOf(this._parent.completionURI) != 0)
                        return;

                      this._parent.finishAuthorizationRequest();
                      this._parent.onAuthorizationReceived(aURL);
                    },

                    onStateChange: function(aWebProgress, aRequest, aStateFlags, aStatus) {
                      const wpl = Ci.nsIWebProgressListener;
                      if (aStateFlags & (wpl.STATE_START | wpl.STATE_IS_NETWORK))
                        this._checkForRedirect(aRequest.name);
                    },
                    onLocationChange: function(aWebProgress, aRequest, aLocation) {
                      this._checkForRedirect(aLocation.spec);
                    },
                    onProgressChange: function() {},
                    onStatusChange: function() {},
                    onSecurityChange: function() {},
                };
                aWebProgress.addProgressListener(this._listener,
                                                 Ci.nsIWebProgress.NOTIFY_ALL);
                aWindow.document.title = this.account.requestWindowTitle;
            }
        };

        this.wrappedJSObject = this._browserRequest;
        gConnecting[this.authURI] = true;
        Services.ww.openWindow(null, this.requestWindowURI, null, this.requestWindowFeatures, this);
    },
    finishAuthorizationRequest: function() {
        gConnecting[this.authURI] = false;
        if (!("_browserRequest" in this)) {
            return;
        }

        this._browserRequest._active = false;
        if ("_listener" in this._browserRequest) {
            this._browserRequest._listener._cleanUp();
        }
        delete this._browserRequest;
    },

    onAuthorizationReceived: function(aData) {
        this.log.info("authorization received" + aData);
        let results = parseURLData(aData);
        if (this.responseType == "code" && results.code) {
            this.requestAccessToken(results.code, OAuth2.CODE_AUTHORIZATION);
        } else if (this.responseType == "token") {
            this.onAccessTokenReceived(JSON.stringify(results));
        }
        else
          this.onAuthorizationFailed(null, aData);
    },

    onAuthorizationFailed: function(aError, aData) {
        this.connectFailureCallback(aData);
    },

    requestAccessToken: function requestAccessToken(aCode, aType) {
        let params = [
            ["client_id", this.consumerKey],
            ["client_secret", this.consumerSecret],
            ["grant_type", aType],
        ];

        if (aType == OAuth2.CODE_AUTHORIZATION) {
            params.push(["code", aCode]);
            params.push(["redirect_uri", this.completionURI]);
        } else if (aType == OAuth2.CODE_REFRESH) {
            params.push(["refresh_token", aCode]);
        }

        let options = {
          postData: params,
          onLoad: this.onAccessTokenReceived.bind(this),
          onError: this.onAccessTokenFailed.bind(this)
        }
        httpRequest(this.tokenURI, options);
    },

    onAccessTokenFailed: function onAccessTokenFailed(aError, aData) {
        if (aError != "offline") {
            this.refreshToken = null;
        }
        this.connectFailureCallback(aData);
    },

    onAccessTokenReceived: function onRequestTokenReceived(aData) {
        let result = JSON.parse(aData);

        this.accessToken = result.access_token;
        if ("refresh_token" in result) {
            this.refreshToken = result.refresh_token;
        }
        if ("expires_in" in result) {
            this.tokenExpires = (new Date()).getTime() + (result.expires_in * 1000);
        } else {
            this.tokenExpires = Number.MAX_VALUE;
        }
        this.tokenType = result.token_type;

        this.connectSuccessCallback();
    }
};
