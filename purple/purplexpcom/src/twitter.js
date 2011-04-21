/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Instantbird messenging client, released
 * 2010.
 *
 * The Initial Developer of the Original Code is
 * Florian QUEZE <florian@instantbird.org>.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource:///modules/imServices.jsm");
Components.utils.import("resource:///modules/jsProtoHelper.jsm");
const Ci = Components.interfaces;
const Cc = Components.classes;

function ChatBuddy(aName) {
  this._name = aName;
}
ChatBuddy.prototype = GenericConvChatBuddyPrototype;

function Conversation(aAccount)
{
  this._init(aAccount);
  this._ensureParticipantExists(aAccount.name);
}
Conversation.prototype = {
  __proto__: GenericConvChatPrototype,
  unInit: function() { delete this.account._timeline; },
  sendMsg: function (aMsg) {
    this.account.tweet(aMsg, this.onSentCallback, function(aException, aData) {
      let error = "";
      try {
        error = "(" + JSON.parse(aData).error + ") ";
      } catch(e) {}
      let msg = "An error " + error + "occured while sending: " + aMsg;
      this.writeMessage("twitter.com", msg, {system: true});
    }, this);
  },
  onSentCallback: function(aData) {
    let tweet = JSON.parse(aData);
    if (tweet.user.screen_name != this.account.name)
      throw "Wrong screen_name... Uh?";
    this.account.displayMessages([tweet]);
  },
  displayTweet: function(aTweet) {
    let name = aTweet.user.screen_name;
    this._ensureParticipantExists(name);
    let flags =
      name == this.account.name ? {outgoing: true} : {incoming: true};
    flags.time = Math.round(new Date(aTweet.created_at) / 1000);
    this.writeMessage(name, aTweet.text, flags);
  },
  _ensureParticipantExists: function(aNick) {
    if (this._participants.hasOwnProperty(aNick))
      return;

    let chatBuddy = new ChatBuddy(aNick);
    this._participants[aNick] = chatBuddy;
    this.notifyObservers(new nsSimpleEnumerator([chatBuddy]),
                         "chat-buddy-add");
  },
  get name() this.nick + " timeline",
  get nick() "@" + this.account.name
};

function Account(aProtoInstance, aKey, aName)
{
  this._init(aProtoInstance, aKey, aName);
  this._knownMessageIds = {};
}
Account.prototype = {
  __proto__: GenericAccountPrototype,

  get HTMLEnabled() false,
  consumerKey: "TSuyS1ieRAkB3qWv8yyEw",
  consumerSecret: "DKtKaSf5a7pBNhdBsSZHTnI5Y03hRlPFYWmb4xXBlkU",
  completionURI: "http://oauthcallback.local/",
  baseURI: "https://api.twitter.com/",

  // Use this to keep track of the pending timeline requests. We attempt to fetch
  // home_timeline, @ mentions and tracked keywords (i.e. 3 timelines)
  _pendingRequests: [],
  _timelineBuffer: [],

  token: "",
  tokenSecret: "",
  connect: function() {
    this.base.connecting();

    // Read the OAuth token from the prefs
    let prefName = "messenger.account." + this.id + ".options.oauth";
    let prefValue = {};
    try {
      prefValue = JSON.parse(Services.prefs.getCharPref(prefName));
    } catch(e) { }
    if (prefValue.hasOwnProperty(this.consumerKey)) {
      let result = prefValue[this.consumerKey];
      this.token = result.oauth_token;
      this.tokenSecret = result.oauth_token_secret;
      if (result.screen_name && result.screen_name != this.name) {
        this.onError("Username mismatch.");
        return;
      }
    }

    // Get a new token if needed...
    if (!this.token || !this.tokenSecret) {
      this.requestToken();
      return;
    }

    this.getTimelines();
  },


  signAndSend: function(aUrl, aHeaders, aPOSTData, aOnLoad, aOnError, aThis,
                        aOAuthParams) {
    const chars =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    const nonceLength = 6;
    let nonce = "";
    for (var i = 0; i < nonceLength; ++i)
      nonce += chars[Math.floor(Math.random() * chars.length)];

    let params = (aOAuthParams || []).concat([
      ["oauth_consumer_key", this.consumerKey],
      ["oauth_nonce", nonce],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_token", this.token],
      ["oauth_timestamp", Math.floor(((new Date()).getTime()) / 1000)],
      ["oauth_version", "1.0"]
    ]);

    function percentEncode(aString)
      encodeURIComponent(aString).replace(/\!|\*|\'|\(|\)/g, function(m)
        ({"!": "%21", "*": "%2A", "'": "%27", "(": "%28", ")": "%29"}[m]))

    let url = /^https?:/.test(aUrl) ? aUrl : this.baseURI + aUrl;
    let method = "GET";
    let postParams = [];
    if (aPOSTData) {
      method = "POST";
      aPOSTData.forEach(function (p) {
        postParams.push([p[0], percentEncode(p[1])]);
      });
    }

    let signatureKey = this.consumerSecret + "&" + this.tokenSecret;
    let signatureBase =
      method + "&" + encodeURIComponent(url) + "&" +
      params.concat(postParams)
            .sort(function(a,b) (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? 1 : 0)
            .map(function(p) p.map(encodeURIComponent).join("%3D"))
            .join("%26");

    let keyFactory = Cc["@mozilla.org/security/keyobjectfactory;1"]
                     .getService(Ci.nsIKeyObjectFactory);
    let hmac =
      Cc["@mozilla.org/security/hmac;1"].createInstance(Ci.nsICryptoHMAC);
    hmac.init(hmac.SHA1,
              keyFactory.keyFromString(Ci.nsIKeyObject.HMAC, signatureKey));
    // No UTF-8 encoding, special chars are already escaped.
    let bytes = [b.charCodeAt() for each (b in signatureBase)];
    hmac.update(bytes, bytes.length);
    let signature = hmac.finish(true);

    params.push(["oauth_signature", encodeURIComponent(signature)]);

    let authorization =
      "OAuth " + params.map(function (p) p[0] + "=\"" + p[1] + "\"").join(", ");
    let headers = (aHeaders || []).concat([["Authorization", authorization]]);

    return doXHRequest(url, headers, aPOSTData, aOnLoad, aOnError, aThis);
  },
  _parseURLData: function(aData) {
    let result = {};
    aData.split("&").forEach(function (aParam) {
      let [key, value] = aParam.split("=");
      result[key] = value;
    });
    return result;
  },

  tweet: function(aMsg, aOnSent, aOnError, aThis) {
    this.signAndSend("1/statuses/update.json", null, [["status", aMsg]],
                     aOnSent, aOnError, aThis);
  },

  getTimelines: function() {
    this._pendingRequests = [
      this.signAndSend("1/statuses/home_timeline.json", null, null,
                       this.onTimelineReceived, this.onTimelineError, this),
      this.signAndSend("1/statuses/mentions.json", null, null,
                       this.onTimelineReceived, this.onTimelineError, this)
    ];

    let track = this.getString("track");
    if (track) {
      let url = "http://search.twitter.com/search.json?q=" +
                track.split(",").join(" OR ");
      this._pendingRequests.push(doXHRequest(url, null, null,
                                             this.onTimelineReceived,
                                             this.onTimelineError, this));
    }
  },

  get timeline() this._timeline || (this._timeline = new Conversation(this)),
  displayMessages: function(aMessages) {
    for each (let tweet in aMessages) {
      if (!("user" in tweet) || !("text" in tweet) || !("id_str" in tweet) ||
         tweet.id_str in this._knownMessageIds)
        continue;
      this._knownMessageIds[tweet.id_str] = tweet;
      this.timeline.displayTweet(tweet);
    }
  },

  onTimelineError: function(aError, aResponseText, aRequest) {
    // TODO show the error in the console...
    this._doneWithTimelineRequest(aRequest);
  },

  onTimelineReceived: function(aData, aRequest) {
    // Parse the returned data
    let data = JSON.parse(aData);
    // Fix the results from the search API to match those of the REST API
    if ("results" in data) {
      data = data.results;
      for each (let tweet in data) {
        if (!("user" in tweet) && "from_user" in tweet)
          tweet.user = {screen_name: tweet.from_user};
      }
    }
    this._timelineBuffer = this._timelineBuffer.concat(data);

    this._doneWithTimelineRequest(aRequest);
  },

  _doneWithTimelineRequest: function(aRequest) {
    this._pendingRequests =
      this._pendingRequests.filter(function (r) r !== aRequest);

    // If we are still waiting for more data, return early
    if (this._pendingRequests.length != 0)
      return;

    this.base.connected();

    // If the conversation already exists, notify it we are back online.
    if (this._timeline)
      this._timeline.notifyObservers(this._timeline, "update-buddy-status");

    this._timelineBuffer.sort(this.sortByDate);
    this.displayMessages(this._timelineBuffer);

    // Reset in case we get disconnected
    delete this._timelineBuffer;
    delete this._pendingRequests;

    // Open the streams to get the live data.
    this.openStream();
  },

  sortByDate: function(a, b)
    (new Date(a["created_at"])) - (new Date(b["created_at"])),

  _streamingRequest: null,
  _pendingData: "",
  _receivedLength: 0,
  openStream: function() {
    let track = this.getString("track");
    this._streamingRequest =
      this.signAndSend("https://userstream.twitter.com/2/user.json",
                       null, track ? [["track", track]] : [],
                       this.openStream, this.onStreamError, this);
    this._streamingRequest.onprogress = this.onDataAvailable.bind(this);
  },
  onStreamError: function(aError) {
    delete this._streamingRequest;
    this.gotDisconnected(this._base.ERROR_NETWORK_ERROR, aError);
  },
  onDataAvailable: function(aRequest) {
    let text = aRequest.target.responseText;
    let newText = this._pendingData + text.slice(this._receivedLength);
    let messages = newText.split(/\r\n?/);
    this._pendingData = messages.pop();
    this._receivedLength = text.length;
    for each (let message in messages) {
      if (!message.trim())
        continue;
      let msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        dump("error: " + e + " while parsing " + message + "\n");
        continue;
      }
      this.displayMessages([msg]);
    }
  },

  requestToken: function() {
    let oauthParams =
      [["oauth_callback", encodeURIComponent(this.completionURI)]];
    this.signAndSend("oauth/request_token", null, [],
                     this.onRequestTokenReceived, this.onError, this,
                     oauthParams);
  },
  onRequestTokenReceived: function(aData) {
    this.base.connecting("Received request token.");
    let data = this._parseURLData(aData);
    if (!data.oauth_callback_confirmed ||
        !data.oauth_token || !data.oauth_token_secret) {
      this.gotDisconnected(this._base.ERROR_OTHER_ERROR,
                           "Failed to get request token.");
      return;
    }
    this.token = data.oauth_token;
    this.tokenSecret = data.oauth_token_secret;

    this.requestAuthorization();
  },
  _progressListener: {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIWebProgressListener,
                                           Ci.nsISupportsWeakReference]),
    _checkForRedirect: function(aURL) {
      if (aURL.indexOf(this._parent.completionURI) != 0)
        return;

      this.webProgress.removeProgressListener(this);
      this.window.close();
      delete this.window;
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
    onSecurityChange: function() {}
  },
  requestAuthorization: function() {
    const url = this.baseURI + "oauth/authorize?oauth_token=";
    let browserRequest = {
      promptText: "Give permission to use your Twitter account",
      account: this,
      url: url + this.token,
      cancelled: function() {
        this.account.gotDisconnected(this.account._base.ERROR_AUTHENTICATION_FAILED,
                                     "Authorization process cancelled.");
      },
      loaded: function(aRequest, aWindow, aWebProgress) {
        let listener = this.account._progressListener;
        listener.window = aWindow;
        listener.webProgress = aWebProgress;
        listener._parent = this.account;
        aWebProgress.addProgressListener(listener,
                                         Ci.nsIWebProgress.NOTIFY_ALL);
      },
      QueryInterface: XPCOMUtils.generateQI([Ci.purpleIRequestBrowser])
    };
    Services.obs.notifyObservers(browserRequest, "browser-request", null);
  },
  onAuthorizationReceived: function(aData) {
    let data = this._parseURLData(aData.split("?")[1]);
    if (data.oauth_token != this.token || !data.oauth_verifier) {
      this.gotDisconnected(this._base.ERROR_OTHER_ERROR,
                           "Failed to get authorization.");
      return;
    }
    this.requestAccessToken(data.oauth_verifier);
  },
  requestAccessToken: function(aTokenVerifier) {
    this.signAndSend("oauth/access_token", null, [],
                     this.onAccessTokenReceived, this.onError, this,
                     [["oauth_verifier", aTokenVerifier]]);
  },
  onAccessTokenReceived: function(aData) {
    this.base.connecting("Received access token.");
    let result = this._parseURLData(aData);
    if (result.screen_name && result.screen_name != this.name) {
      this.onError("Username mismatch.");
      return;
    }

    let prefName = "messenger.account." + this.id + ".options.oauth";
    let prefValue = {};
    try {
      JSON.parse(Services.prefs.getCharPref(prefName));
    } catch(e) { }
    prefValue[this.consumerKey] = result;
    Services.prefs.setCharPref(prefName, JSON.stringify(prefValue));

    this.token = result.oauth_token;
    this.tokenSecret = result.oauth_token_secret;

    this.getTimelines();
  },


  gotDisconnected: function(aError, aErrorMessage) {
    if (aError === undefined)
      aError = this._base.NO_ERROR;
    let connected = this.connected;
    this.base.disconnecting(aError, aErrorMessage);
    if (this._pendingRequests.length != 0) {
      for each (let request in this._pendingRequests)
        request.abort();
      delete this._pendingRequests;
    }
    if (this._streamingRequest) {
      this._streamingRequest.abort();
      delete this._streamingRequest;
    }
    if (this._timeline && connected)
      this._timeline.notifyObservers(this._timeline, "update-conv-chatleft");
    this.base.disconnected();
  },
  disconnect: function() {
    this.gotDisconnected();
  },

  onError: function(aException) {
    this.gotDisconnected(this._base.ERROR_OTHER_ERROR, aException.toString());
  }
};

function TwitterProtocol() { }
TwitterProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get name() "Twitter",
  get iconBaseURI() "chrome://prpl-twitter/skin/",
  get noPassword() true,
  options: {
    "track": {label: "Tracked keywords", default: ""}
  },
  getAccount: function(aKey, aName) new Account(this, aKey, aName),
  classID: Components.ID("{31082ff6-1de8-422b-ab60-ca0ac0b2af13}"),
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([TwitterProtocol]);
