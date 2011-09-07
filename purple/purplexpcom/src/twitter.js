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
 *   Patrick Cloke <clokep@instantbird.org>
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

const {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource:///modules/http.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", function()
  l10nHelper("chrome://purple/locale/twitter.properties")
);
initLogModule("twitter");

function ChatBuddy(aName) {
  this._name = aName;
}
ChatBuddy.prototype = GenericConvChatBuddyPrototype;

function Tweet(aTweet, aWho, aMessage, aObject)
{
  this._tweet = aTweet;
  this._init(aWho, aMessage, aObject);
}
Tweet.prototype = {
  __proto__: GenericMessagePrototype,
  getActions: function(aCount) {
    let actions = [
      new Action(_("reply"), function() {
        this.conversation.startReply(this._tweet);
      }, this)
    ];
    if (this.incoming) {
      actions.push(
        new Action(_("retweet"), function() {
          this.conversation.reTweet(this._tweet);
        }, this)
      );
    }
    if (aCount)
      aCount.value = actions.length;
    return actions;
  }
};

function Action(aLabel, aAction, aTweet)
{
  this.label = aLabel;
  this._action = aAction;
  this._tweet = aTweet;
}
Action.prototype = {
  __proto__: ClassInfo("purpleIMessageAction", "generic message action object"),
  get run() this._action.bind(this._tweet)
};

function Conversation(aAccount)
{
  this._init(aAccount);
  this._ensureParticipantExists(aAccount.name);
}
Conversation.prototype = {
  __proto__: GenericConvChatPrototype,
  unInit: function() { delete this.account._timeline; },
  inReplyToStatusId: null,
  startReply: function(aTweet) {
    this.inReplyToStatusId = aTweet.id_str;
    this.notifyObservers(null, "replying-to-prompt",
                         "@" + aTweet.user.screen_name + " ");
    this.notifyObservers(null, "status-text-changed",
                         _("replyingToStatusText", aTweet.text));
  },
  reTweet: function(aTweet) {
    this.account.reTweet(aTweet, this.onSentCallback,
                         function(aException, aData) {
      this.writeError(_("error.retweet", this._parseError(aData),
                        aTweet.text));
    }, this);
  },
  sendMsg: function (aMsg) {
    if (aMsg.length > this.account.maxMessageLength) {
      this.writeError(_("error.tooLong"));
      throw Cr.NS_ERROR_INVALID_ARG;
    }
    this.account.tweet(aMsg, this.inReplyToStatusId, this.onSentCallback,
                       function(aException, aData) {
      this.writeError(_("error.general", this._parseError(aData), aMsg));
    }, this);
    this.sendTyping(0);
  },
  sendTyping: function(aLength) {
    if (aLength == 0 && this.inReplyToStatusId) {
      delete this.inReplyToStatusId;
      this.notifyObservers(null, "status-text-changed", "");
    }
  },
  writeError: function(aErrorMessage) {
    this.writeMessage("twitter.com", aErrorMessage, {system: true});
  },
  onSentCallback: function(aData) {
    let tweet = JSON.parse(aData);
    if (tweet.user.screen_name != this.account.name)
      throw "Wrong screen_name... Uh?";
    this.account.displayMessages([tweet]);
    this.setTopic(tweet.text, tweet.user.screen_name);
  },
  _parseError: function(aData) {
    let error = "";
    try {
      let data = JSON.parse(aData);
      if ("error" in data)
        error = data.error;
      else if ("errors" in data)
        error = data.errors.split("\n")[0];
      if (error)
        error = "(" + error + ")";
    } catch(e) {}
    return error;
  },
  displayTweet: function(aTweet) {
    let name = aTweet.user.screen_name;
    this._ensureParticipantExists(name);

    let text = aTweet.text;
    if ("entities" in aTweet) {
      let entities = aTweet.entities;
      /* entArray is an array of entities ready to be replaced in the tweet,
       * each entity contains:
       *  - start: the start index of the entity inside the tweet,
       *  - end: the end index of the entity inside the tweet,
       *  - str: the string that should be replaced inside the tweet,
       *  - href: the url (href attribute) of the created link tag,
       *  - [optional] text: the text to display for the link,
       *     The original string (str) will be used if this is not set.
       *  - [optional] title: the title attribute for the link.
       */
      let entArray = [];
      if ("hashtags" in entities && Array.isArray(entities.hashtags)) {
        entArray = entArray.concat(entities.hashtags.map(function(h) ({
          start: h.indices[0],
          end: h.indices[1],
          str: "#" + h.text,
          href: "https://twitter.com/#!/search?q=#" + h.text})));
      }
      if ("urls" in entities && Array.isArray(entities.urls)) {
        entArray = entArray.concat(entities.urls.map(function(u) ({
          start: u.indices[0],
          end: u.indices[1],
          str: u.url,
          text: u.display_url || u.url,
          href: u.expanded_url || u.url})));
      }
      if ("user_mentions" in entities &&
          Array.isArray(entities.user_mentions)) {
        entArray = entArray.concat(entities.user_mentions.map(function(um) ({
          start: um.indices[0],
          end: um.indices[1],
          str: "@" + um.screen_name,
          title: um.name,
          href: "https://twitter.com/" + um.screen_name})));
      }
      entArray.sort(function(a, b) a.start - b.start);
      let offset = 0;
      for each (let entity in entArray) {
        let str = text.substring(offset + entity.start, offset + entity.end);
        if (str.toLowerCase() != entity.str.toLowerCase())
          continue;

        let html = "<a href=\"" + entity.href + "\"";
        if ("title" in entity)
          html += " title=\"" + entity.title + "\"";
        html += ">" + ("text" in entity ? entity.text : entity.str) + "</a>";
        text = text.slice(0, offset + entity.start) + html +
               text.slice(offset + entity.end);
        offset += html.length - (entity.end - entity.start);
      }
    }

    let flags =
      name == this.account.name ? {outgoing: true} : {incoming: true};
    flags.time = Math.round(new Date(aTweet.created_at) / 1000);
    flags.iconURL = aTweet.user.profile_image_url;

    (new Tweet(aTweet, name, text, flags)).conversation = this;
  },
  _ensureParticipantExists: function(aNick) {
    if (this._participants.hasOwnProperty(aNick))
      return;

    let chatBuddy = new ChatBuddy(aNick);
    this._participants[aNick] = chatBuddy;
    this.notifyObservers(new nsSimpleEnumerator([chatBuddy]),
                         "chat-buddy-add");
  },
  get name() _("timeline", this.nick),
  get nick() "@" + this.account.name
};

function Account(aProtoInstance, aKey, aName)
{
  this._init(aProtoInstance, aKey, aName);
  this._knownMessageIds = {};

  Services.obs.addObserver(this, "status-changed", false);
}
Account.prototype = {
  __proto__: GenericAccountPrototype,

  get HTMLEnabled() false,
  get maxMessageLength() 140,

  consumerKey: "TSuyS1ieRAkB3qWv8yyEw",
  consumerSecret: "DKtKaSf5a7pBNhdBsSZHTnI5Y03hRlPFYWmb4xXBlkU",
  completionURI: "http://oauthcallback.local/",
  baseURI: "https://api.twitter.com/",

  // Use this to keep track of the pending timeline requests. We attempt to fetch
  // home_timeline, @ mentions and tracked keywords (i.e. 3 timelines)
  _pendingRequests: [],
  _timelineBuffer: [],

  // Used to know if we should connect when returning from the offline status.
  _enabled: false,

  token: "",
  tokenSecret: "",
  connect: function() {
    if (this.connected || this.connecting)
      return;

    this.base.connecting();
    this._enabled = true;

    // Read the OAuth token from the prefs
    let prefValue = {};
    try {
      prefValue = JSON.parse(this.prefs.getCharPref("oauth"));
    } catch(e) { }
    if (prefValue.hasOwnProperty(this.consumerKey)) {
      let result = prefValue[this.consumerKey];
      this.token = result.oauth_token;
      this.tokenSecret = result.oauth_token_secret;
      if (result.screen_name && result.screen_name != this.name) {
        this.onError(_("connection.error.userMismatch"));
        return;
      }
    }

    // Get a new token if needed...
    if (!this.token || !this.tokenSecret) {
      this.requestToken();
      return;
    }

    LOG("Connecting using existing token");
    this.getTimelines();
  },

  // Currently only used for "status-changed" notification.
  observe: function(aSubject, aTopic, aMsg) {
    if (!this._enabled)
      return;

    let statusType = aSubject.currentStatusType;
    if (statusType == Ci.imIStatusInfo.STATUS_OFFLINE) {
      // This will remove the _enabled value...
      this.disconnect();
      // ...set it again:
      this._enabled = true;
    }
    else if (statusType > Ci.imIStatusInfo.STATUS_OFFLINE)
      this.connect();
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

    let dataParams = [];
    let url = /^https?:/.test(aUrl) ? aUrl : this.baseURI + aUrl;
    let urlSpec = url;
    let queryIndex = url.indexOf("?");
    if (queryIndex != -1) {
      urlSpec = url.slice(0, queryIndex);
      dataParams = url.slice(queryIndex + 1).split("&")
                      .map(function(p) p.split("=").map(percentEncode));
    }
    let method = "GET";
    if (aPOSTData) {
      method = "POST";
      aPOSTData.forEach(function (p) {
        dataParams.push(p.map(percentEncode));
      });
    }

    let signatureKey = this.consumerSecret + "&" + this.tokenSecret;
    let signatureBase =
      method + "&" + encodeURIComponent(urlSpec) + "&" +
      params.concat(dataParams)
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

  tweet: function(aMsg, aInReplyToId, aOnSent, aOnError, aThis) {
    let POSTData = [["status", aMsg]];
    if (aInReplyToId)
      POSTData.push(["in_reply_to_status_id", aInReplyToId]);
    this.signAndSend("1/statuses/update.json", null, POSTData,
                     aOnSent, aOnError, aThis);
  },
  reTweet: function(aTweet, aOnSent, aOnError, aThis) {
    this.signAndSend("1/statuses/retweet/" + aTweet.id_str + ".json",
                     null, [], aOnSent, aOnError, aThis);
  },

  getTimelines: function() {
    this.base
        .connecting(_("connection.requestTimelines"));

    // If we have a last known message ID, append it as a get parameter.
    let getParams = "?include_entities=1&count=200";
    if (this.prefs.prefHasUserValue("lastMessageId"))
      getParams += "&since_id=" + this.prefs.getCharPref("lastMessageId");
    this._pendingRequests = [
      this.signAndSend("1/statuses/home_timeline.json" + getParams, null, null,
                       this.onTimelineReceived, this.onTimelineError, this),
      this.signAndSend("1/statuses/mentions.json" + getParams, null, null,
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
    ERROR(aError);
    this._doneWithTimelineRequest(aRequest);
  },

  onTimelineReceived: function(aData, aRequest) {
    // Parse the returned data
    let data = JSON.parse(aData);
    // Fix the results from the search API to match those of the REST API
    if ("results" in data) {
      data = data.results;
      for each (let tweet in data) {
        if (!("user" in tweet) && "from_user" in tweet) {
          tweet.user = {screen_name: tweet.from_user,
                        profile_image_url: tweet.profile_image_url};
        }
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

    // Use the users' newest tweet as the topic.
    for (let i = this._timelineBuffer.length - 1; i >= 0; --i) {
      let tweet = this._timelineBuffer[i];
      if (tweet.user.screen_name == this.name) {
        this.timeline.setTopic(tweet.text, tweet.user.screen_name);
        break;
      }
    }

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
    DEBUG("Received data: " + newText);
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
        ERROR(e + " while parsing " + message);
        continue;
      }
      this.displayMessages([msg]);

      // If the message is from us, set it as the topic.
      if (("user" in msg) && ("text" in msg) &&
          (msg.user.screen_name == this.name))
        this.timeline.setTopic(msg.text, msg.user.screen_name);
    }
  },

  requestToken: function() {
    this.base.connecting(_("connection.initAuth"));
    let oauthParams =
      [["oauth_callback", encodeURIComponent(this.completionURI)]];
    this.signAndSend("oauth/request_token", null, [],
                     this.onRequestTokenReceived, this.onError, this,
                     oauthParams);
  },
  onRequestTokenReceived: function(aData) {
    LOG("Received request token.");
    let data = this._parseURLData(aData);
    if (!data.oauth_callback_confirmed ||
        !data.oauth_token || !data.oauth_token_secret) {
      this.gotDisconnected(this._base.ERROR_OTHER_ERROR,
                           _("connection.failedToken"));
      return;
    }
    this.token = data.oauth_token;
    this.tokenSecret = data.oauth_token_secret;

    this.requestAuthorization();
  },
  requestAuthorization: function() {
    this.base.connecting(_("connection.requestAuth"));
    const url = this.baseURI + "oauth/authorize?oauth_token=";
    this._browserRequest = {
      get promptText() _("authPrompt"),
      account: this,
      url: url + this.token,
      _active: true,
      cancelled: function() {
        if (!this._active)
          return;

        this.account
            .gotDisconnected(this.account._base.ERROR_AUTHENTICATION_FAILED,
                             _("connection.error.authCancelled"));
      },
      loaded: function(aWindow, aWebProgress) {
        if (!this._active)
          return;

        this._listener = {
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

          window: aWindow,
          webProgress: aWebProgress,
          _parent: this.account
        };
        aWebProgress.addProgressListener(this._listener,
                                         Ci.nsIWebProgress.NOTIFY_ALL);
      },
      QueryInterface: XPCOMUtils.generateQI([Ci.purpleIRequestBrowser])
    };
    Services.obs.notifyObservers(this._browserRequest, "browser-request", null);
  },
  finishAuthorizationRequest: function() {
    if (!("_browserRequest" in this))
      return;

    this._browserRequest._active = false;
    if ("_listener" in this._browserRequest)
      this._browserRequest._listener._cleanUp();
    delete this._browserRequest;
  },
  onAuthorizationReceived: function(aData) {
    let data = this._parseURLData(aData.split("?")[1]);
    if (data.oauth_token != this.token || !data.oauth_verifier) {
      this.gotDisconnected(this._base.ERROR_OTHER_ERROR,
                           _("connection.error.authFailed"));
      return;
    }
    this.requestAccessToken(data.oauth_verifier);
  },
  requestAccessToken: function(aTokenVerifier) {
    this.base.connecting(_("connection.requestAccess"));
    this.signAndSend("oauth/access_token", null, [],
                     this.onAccessTokenReceived, this.onError, this,
                     [["oauth_verifier", aTokenVerifier]]);
  },
  onAccessTokenReceived: function(aData) {
    LOG("Received access token.");
    let result = this._parseURLData(aData);
    if (result.screen_name && result.screen_name != this.name) {
      this.onError(_("connection.error.userMismatch"));
      return;
    }

    let prefValue = {};
    try {
      JSON.parse(this.prefs.getCharPref("oauth"));
    } catch(e) { }
    prefValue[this.consumerKey] = result;
    this.prefs.setCharPref("oauth", JSON.stringify(prefValue));

    this.token = result.oauth_token;
    this.tokenSecret = result.oauth_token_secret;

    this.getTimelines();
  },


  cleanUp: function() {
    this.finishAuthorizationRequest();
    if (this._pendingRequests.length != 0) {
      for each (let request in this._pendingRequests)
        request.abort();
      delete this._pendingRequests;
    }
    if (this._streamingRequest) {
      this._streamingRequest.abort();
      delete this._streamingRequest;
    }
    delete this.token;
    delete this.tokenSecret;
  },
  gotDisconnected: function(aError, aErrorMessage) {
    if (this.disconnected || this.disconnecting)
      return;

    if (aError === undefined)
      aError = this._base.NO_ERROR;
    let connected = this.connected;
    this.base.disconnecting(aError, aErrorMessage);
    this.cleanUp();
    if (this._timeline && connected)
      this._timeline.notifyObservers(this._timeline, "update-conv-chatleft");
    delete this._enabled;
    this.base.disconnected();
  },
  UnInit: function() {
    this.cleanUp();
    // If we've received any messages, update the last known message.
    let knownMessageIds = Object.keys(this._knownMessageIds);
    if (knownMessageIds.length) {
      this.prefs.setCharPref("lastMessageId",
                             Math.max.apply(null, knownMessageIds));
    }
    Services.obs.removeObserver(this, "status-changed");
    this._base.UnInit();
  },
  disconnect: function() {
    this.gotDisconnected();
  },

  onError: function(aException) {
    if (aException == "offline") {
      this.gotDisconnected(this._base.ERROR_NETWORK_ERROR,
                           _("connection.error.noNetwork"));
    }
    else
      this.gotDisconnected(this._base.ERROR_OTHER_ERROR, aException.toString());
  },

  // Allow us to reopen the timeline via the join chat menu.
  get canJoinChat() true,
  joinChat: function(aComponents) {
    // The 'timeline' getter opens a timeline conversation if none exists.
    this.timeline;
  }
};

function TwitterProtocol() { }
TwitterProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get name() "Twitter",
  get iconBaseURI() "chrome://prpl-twitter/skin/",
  get noPassword() true,
  options: {
    "track": {get label() _("options.track"), default: ""}
  },
  getAccount: function(aKey, aName) new Account(this, aKey, aName),
  classID: Components.ID("{31082ff6-1de8-422b-ab60-ca0ac0b2af13}")
};

const NSGetFactory = XPCOMUtils.generateNSGetFactory([TwitterProtocol]);
