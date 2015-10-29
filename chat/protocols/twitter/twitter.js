/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/Http.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");
Cu.import("resource:///modules/twitter-text.jsm");

var NS_PREFBRANCH_PREFCHANGE_TOPIC_ID = "nsPref:changed";
var kMaxMessageLength = 140;

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/twitter.properties")
);
XPCOMUtils.defineLazyGetter(this, "_lang", () =>
  l10nHelper("chrome://global/locale/languageNames.properties")
);
initLogModule("twitter", this);

function ChatBuddy(aName, aAccount) {
  this._name = aName;
  this._account = aAccount;
}
ChatBuddy.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
  get buddyIconFilename() {
    let userInfo = this._account._userInfo.get(this.name);
    if (userInfo)
      return userInfo.profile_image_url;
    return undefined;
  },
  set buddyIconFilename(aName) {
    // Prevent accidental removal of the getter.
    throw("Don't set chatBuddy.buddyIconFilename directly for Twitter.");
  }
}

function Tweet(aTweet, aWho, aMessage, aObject)
{
  this._tweet = aTweet;
  this._init(aWho, aMessage, aObject);
}
Tweet.prototype = {
  __proto__: GenericMessagePrototype,
  _deleted: false,
  getActions: function(aCount) {
    let account = this.conversation._account;
    let actions = [];

    if (account.connected) {
      actions.push(
        new Action(_("action.reply"), function() {
          this.conversation.startReply(this._tweet);
        }, this)
      );
      if (this.incoming) {
        actions.push(
          new Action(_("action.retweet"), function() {
            this.conversation.reTweet(this._tweet);
          }, this)
        );
        let isFriend = account._friends.has(this._tweet.user.id_str);
        let action = isFriend ? "stopFollowing" : "follow";
        let screenName = this._tweet.user.screen_name;
        actions.push(new Action(_("action." + action, screenName),
                                function() { account[action](screenName); }));
      }
      else if (this.outgoing && !this._deleted) {
        actions.push(
          new Action(_("action.delete"), function() {
            this.destroy();
          }, this)
        );
      }
    }
    actions.push(new Action(_("action.copyLink"), function() {
      let href = "https://twitter.com/" + this._tweet.user.screen_name +
                 "/status/" + this._tweet.id_str;
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper).copyString(href);
    }, this));
    if (aCount)
      aCount.value = actions.length;
    return actions;
  },
  destroy: function() {
    // Mark the tweet as deleted until we receive a response.
    this._deleted = true;

    this.conversation._account.destroy(this._tweet, this.onDestroyCallback,
                                       this.onDestroyErrorCallback, this);
  },
  onDestroyErrorCallback: function(aException, aData) {
    // The tweet was not successfully deleted.
    delete this._deleted;
    let error = this.conversation._parseError(aData);
    this.conversation.systemMessage(_("error.delete", error,
                                      this.originalMessage), true);
  },
  onDestroyCallback: function(aData) {
    let tweet = JSON.parse(aData);
    // If Twitter responds with an error, throw to call the error callback.
    if ("error" in tweet)
      throw tweet.error;

    // Create a new system message saying the tweet has been deleted.
    this.conversation.systemMessage(_("event.deleted", this.originalMessage));
  }
};

function Action(aLabel, aAction, aTweet)
{
  this.label = aLabel;
  this._action = aAction;
  this._tweet = aTweet;
}
Action.prototype = {
  __proto__: ClassInfo("prplIMessageAction", "generic message action object"),
  get run() { return this._action.bind(this._tweet); }
};

function Conversation(aAccount)
{
  this._init(aAccount);
  this._ensureParticipantExists(aAccount.name);
  // We need the screen names for the IDs in _friends, but _userInfo is
  // indexed by name, so we build an ID -> name map.
  let names = new Map([userInfo.id_str, name] for ([name, userInfo] of aAccount._userInfo));
  for (let id_str of aAccount._friends)
    this._ensureParticipantExists(names.get(id_str));

  // If the user's info has already been received, update the timeline topic.
  if (aAccount._userInfo.has(aAccount.name)) {
    let userInfo = aAccount._userInfo.get(aAccount.name);
    if ("description" in userInfo)
      this.setTopic(userInfo.description, aAccount.name, true);
  }
}
Conversation.prototype = {
  __proto__: GenericConvChatPrototype,
  unInit: function() {
    delete this._account._timeline;
    GenericConvChatPrototype.unInit.call(this);
  },
  inReplyToStatusId: null,
  startReply: function(aTweet) {
    this.inReplyToStatusId = aTweet.id_str;
    let entities = aTweet.entities;

    // Twitter replies go to all the users mentioned in the tweet.
    let nicks = [aTweet.user.screen_name];
    if ("user_mentions" in entities && Array.isArray(entities.user_mentions)) {
      nicks = nicks.concat(entities.user_mentions
                                   .map(um => um.screen_name));
    }
    // Ignore duplicates and the user's nick.
    let prompt =
      nicks.filter(function(aNick, aPos) {
             return nicks.indexOf(aNick) == aPos && aNick != this._account.name;
           }, this)
           .map(aNick => "@" + aNick)
           .join(" ") + " ";

    this.notifyObservers(null, "replying-to-prompt", prompt);
    this.notifyObservers(null, "status-text-changed",
                         _("replyingToStatusText", aTweet.text));
  },
  reTweet: function(aTweet) {
    this._account.reTweet(aTweet, this.onSentCallback,
                          function(aException, aData) {
      this.systemMessage(_("error.retweet", this._parseError(aData),
                           aTweet.text), true);
    }, this);
  },
  getTweetLength: function (aString) {
    // Use the Twitter library to calculate the length.
    return twttr.txt.getTweetLength(aString, this._account.config);
  },
  sendMsg: function (aMsg) {
    if (this.getTweetLength(aMsg) > kMaxMessageLength) {
      this.systemMessage(_("error.tooLong"), true);
      throw Cr.NS_ERROR_INVALID_ARG;
    }
    this._account.tweet(aMsg, this.inReplyToStatusId, this.onSentCallback,
                        function(aException, aData) {
      let error = this._parseError(aData);
      this.systemMessage(_("error.general", error, aMsg), true);
    }, this);
    this.sendTyping("");
  },
  sendTyping: function(aString) {
    if (aString.length == 0 && this.inReplyToStatusId) {
      delete this.inReplyToStatusId;
      this.notifyObservers(null, "status-text-changed", "");
      return kMaxMessageLength;
    }
    return kMaxMessageLength - this.getTweetLength(aString);
  },
  systemMessage: function(aMessage, aIsError, aDate) {
    let flags = {system: true};
    if (aIsError)
      flags.error = true;
    if (aDate)
      flags.time = aDate;
    this.writeMessage("twitter.com", aMessage, flags);
  },
  onSentCallback: function(aData) {
    let tweet = JSON.parse(aData);
    if (tweet.user.screen_name != this._account.name)
      throw "Wrong screen_name... Uh?";
    this._account.displayMessages([tweet]);
  },
  _parseError: function(aData) {
    let error = "";
    try {
      let data = JSON.parse(aData);
      if ("error" in data)
        error = data.error;
      else if ("errors" in data)
        error = data.errors[0].message;
      if (error)
        error = "(" + error + ")";
    } catch(e) {}
    return error;
  },
  parseTweet: function(aTweet) {
    let text = aTweet.text;
    let entities = {};
    // Handle retweets: retweeted_status contains the object for the original
    // tweet that is being retweeted.
    // If the retweet prefix ("RT @<username>: ") causes the tweet to be over
    // 140 characters, ellipses will be added. In this case, we want to get
    // the FULL text from the original tweet and update the entities to match.
    // Note: the truncated flag is not always set correctly by twitter, so we
    // always make use of the original tweet.
    if ("retweeted_status" in aTweet) {
      let retweet = aTweet["retweeted_status"];
      // We're going to take portions of the retweeted status and replace parts
      // of the original tweet, the retweeted status prepends the original
      // status with "RT @<username>: ", we need to keep the prefix.
      let offset = text.indexOf(": ") + 2;
      text = text.slice(0, offset) + retweet.text;

      // Keep any entities that refer to the prefix (we can refer directly to
      // aTweet for these since they are not edited).
      if ("entities" in aTweet) {
        for (let type in aTweet.entities) {
          let filteredEntities =
            aTweet.entities[type].filter(e => e.indices[0] < offset);
          if (filteredEntities.length)
            entities[type] = filteredEntities;
        }
      }

      // Add the entities from the retweet (a copy of these must be made since
      // they will be edited and we do not wish to change aTweet).
      if ("entities" in retweet) {
        for (let type in retweet.entities) {
          if (!(type in entities))
            entities[type] = [];

          // Append the entities from the original status.
          entities[type] = entities[type].concat(
            retweet.entities[type].map(function(aEntity) {
              let entity = Object.create(aEntity);
              // Add the offset to the indices to account for the prefix.
              entity.indices = entity.indices.map(i => i + offset);
              return entity;
            })
          );
        }
      }
    } else {
      // For non-retweets, we just want to use the entities that are given.
      if ("entities" in aTweet)
        entities = aTweet.entities;
    }

    if (Object.keys(entities).length) {
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
        entArray = entArray.concat(entities.hashtags.map(h => ({
          start: h.indices[0],
          end: h.indices[1],
          str: "#" + h.text,
          href: "https://twitter.com/#!/search?q=%23" + h.text})));
      }
      if ("urls" in entities && Array.isArray(entities.urls)) {
        entArray = entArray.concat(entities.urls.map(u => ({
          start: u.indices[0],
          end: u.indices[1],
          str: u.url,
          text: u.display_url || u.url,
          href: u.expanded_url || u.url})));
      }
      if ("user_mentions" in entities &&
          Array.isArray(entities.user_mentions)) {
        entArray = entArray.concat(entities.user_mentions.map(um => ({
          start: um.indices[0],
          end: um.indices[1],
          str: "@" + um.screen_name,
          text: '@<span class="ib-person">' + um.screen_name + "</span>",
          title: um.name,
          href: "https://twitter.com/" + um.screen_name})));
      }
      entArray.sort((a, b) => a.start - b.start);
      let offset = 0;
      for each (let entity in entArray) {
        let str = text.substring(offset + entity.start, offset + entity.end);
        if (str[0] == "\uFF20") // ＠ - unicode character similar to @
          str = "@" + str.substring(1);
        if (str[0] == "\uFF03") // ＃ - unicode character similar to #
          str = "#" + str.substring(1);
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

    return text;
  },
  displayTweet: function(aTweet) {
    let name = aTweet.user.screen_name;
    this._ensureParticipantExists(name);
    let text = this.parseTweet(aTweet);

    let flags =
      name == this._account.name ? {outgoing: true} : {incoming: true};
    flags.time = Math.round(new Date(aTweet.created_at) / 1000);
    flags._iconURL = aTweet.user.profile_image_url;
    if (aTweet.delayed)
      flags.delayed = true;
    if (text.includes("@" + this.nick))
      flags.containsNick = true;

    (new Tweet(aTweet, name, text, flags)).conversation = this;
  },
  _ensureParticipantExists: function(aNick) {
    if (this._participants.has(aNick))
      return;

    let chatBuddy = new ChatBuddy(aNick, this._account);
    this._participants.set(aNick, chatBuddy);
    this.notifyObservers(new nsSimpleEnumerator([chatBuddy]),
                         "chat-buddy-add");
  },
  get name() { return this.nick + " timeline"; },
  get title() { return _("timeline", this.nick); },
  get nick() { return this._account.name; },
  set nick(aNick) {},
  get topicSettable() { return this.nick == this._account.name; },
  get topic() { return this._topic; }, // can't add a setter without redefining the getter
  set topic(aTopic) {
    if (this.topicSettable)
      this._account.setUserDescription(aTopic);
  }
};

function Account(aProtocol, aImAccount)
{
  this._init(aProtocol, aImAccount);
  this._knownMessageIds = new Set();
  this._userInfo = new Map();
  this._friends = new Set();
}
Account.prototype = {
  __proto__: GenericAccountPrototype,

  // The correct normalization for twitter would be just toLowerCase().
  // Unfortunately, for backwards compatibility we retain this normalization,
  // which can cause edge cases for usernames with underscores.
  normalize: aString => aString.replace(/[^a-z0-9]/gi, "").toLowerCase(),

  consumerKey: Services.prefs.getCharPref("chat.twitter.consumerKey"),
  consumerSecret: Services.prefs.getCharPref("chat.twitter.consumerSecret"),
  completionURI: "http://oauthcallback.local/",
  baseURI: "https://api.twitter.com/",
  _lastMsgId: "",

  // Use this to keep track of the pending timeline requests. We attempt to fetch
  // home_timeline, @ mentions and tracked keywords (i.e. 3 timelines)
  _pendingRequests: [],
  _timelineBuffer: [],
  _timelineAuthError: 0,

  // Twitter's current internal configuration, received in response to an API
  // call, see https://dev.twitter.com/docs/api/1.1/get/help/configuration.
  config: {
    "short_url_length_https": 23,
    "short_url_length": 22
  },

  token: "",
  tokenSecret: "",
  connect: function() {
    if (this.connected || this.connecting)
      return;

    this.reportConnecting();

    // Read the OAuth token from the prefs
    let prefValue = {};
    try {
      prefValue = JSON.parse(this.prefs.getCharPref("oauth"));
    } catch(e) { }
    if (prefValue.hasOwnProperty(this.consumerKey)) {
      let result = prefValue[this.consumerKey];
      this.token = result.oauth_token;
      this.tokenSecret = result.oauth_token_secret;
      if (!this.fixAccountName(result))
        return;
    }

    // Get a new token if needed...
    if (!this.token || !this.tokenSecret) {
      this.requestToken();
      return;
    }

    this.LOG("Connecting using existing token");
    this.getTimelines();

    // Request the Twitter API configuration.
    this.signAndSend("1.1/help/configuration.json", null, null,
                     this.onConfigReceived, this.onError, this);
  },

  observe: function(aSubject, aTopic, aMsg) {
    // Twitter doesn't broadcast the user's availability, so we can ignore
    // imIUserStatusInfo's status notifications.
    if (aTopic != NS_PREFBRANCH_PREFCHANGE_TOPIC_ID)
      return;

    // Reopen the stream with the new tracked keywords.
    this.DEBUG("Twitter tracked keywords modified: " + this.getString("track"));

    // Close the stream and reopen it.
    this._streamingRequest.abort();
    this.openStream();
  },

  signAndSend: function(aUrl, aHeaders, aPOSTData, aOnLoad, aOnError, aThis,
                        aOAuthParams) {
    const kChars =
      "0123456789ABCDEFGHIJKLMNOPQRSTUVWXTZabcdefghiklmnopqrstuvwxyz";
    const kNonceLength = 6;
    let nonce = "";
    for (let i = 0; i < kNonceLength; ++i)
      nonce += kChars[Math.floor(Math.random() * kChars.length)];

    let params = (aOAuthParams || []).concat([
      ["oauth_consumer_key", this.consumerKey],
      ["oauth_nonce", nonce],
      ["oauth_signature_method", "HMAC-SHA1"],
      ["oauth_token", this.token],
      ["oauth_timestamp", Math.floor(((new Date()).getTime()) / 1000)],
      ["oauth_version", "1.0"]
    ]);

    let dataParams = [];
    let url = /^https?:/.test(aUrl) ? aUrl : this.baseURI + aUrl;
    let urlSpec = url;
    let queryIndex = url.indexOf("?");
    if (queryIndex != -1) {
      urlSpec = url.slice(0, queryIndex);
      dataParams = url.slice(queryIndex + 1).split("&")
                      .map(p => p.split("=").map(percentEncode));
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
            .sort((a, b) => (a[0] < b[0]) ? -1 : (a[0] > b[0]) ? 1 : 0)
            .map(p => p.map(encodeURIComponent).join("%3D"))
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
      "OAuth " + params.map(p => p[0] + "=\"" + p[1] + "\"").join(", ");

    let options = {
      headers: (aHeaders || []).concat([["Authorization", authorization]]),
      postData: aPOSTData,
      onLoad: aOnLoad ? aOnLoad.bind(aThis) : null,
      onError: aOnError ? aOnError.bind(aThis) : null,
      logger: {log: this.LOG.bind(this),
               debug: this.DEBUG.bind(this)}
    }
    return httpRequest(url, options);
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
    this.signAndSend("1.1/statuses/update.json", null, POSTData, aOnSent,
                     aOnError, aThis);
  },
  reTweet: function(aTweet, aOnSent, aOnError, aThis) {
    let url = "1.1/statuses/retweet/" + aTweet.id_str + ".json";
    this.signAndSend(url, null, [], aOnSent, aOnError, aThis);
  },
  destroy: function(aTweet, aOnSent, aOnError, aThis) {
    let url = "1.1/statuses/destroy/" + aTweet.id_str + ".json";
    this.signAndSend(url, null, [], aOnSent, aOnError, aThis);
  },

  _friends: null,
  follow: function(aUserName) {
    this.signAndSend("1.1/friendships/create.json", null,
                     [["screen_name", aUserName]]);
  },
  stopFollowing: function(aUserName) {
    // friendships/destroy will return the user in case of success.
    // Error cases would return a non 200 HTTP code and not call our callback.
    this.signAndSend("1.1/friendships/destroy.json", null,
                     [["screen_name", aUserName]], function(aData, aXHR) {
      let user = JSON.parse(aData);
      if (!("id_str" in user))
        return; // Unexpected response...
      this._friends.delete(user.id_str);
      let date = aXHR.getResponseHeader("Date");
      this.timeline.systemMessage(_("event.unfollow", user.screen_name), false,
                                  new Date(date) / 1000);
    }, null, this);
  },
  addBuddy: function(aTag, aName) {
    this.follow(aName);
  },

  getTimelines: function() {
    this.reportConnecting(_("connection.requestTimelines"));

    // If we have a last known message ID, append it as a get parameter.
    let lastMsgParam = "";
    if (this.prefs.prefHasUserValue("lastMessageId")) {
      let lastMsgId = this.prefs.getCharPref("lastMessageId");
      // Check that the ID is made up of all digits, otherwise the server will
      // croak on our request.
      if (/^\d+$/.test(lastMsgId)) {
        lastMsgParam = "&since_id=" + lastMsgId;
        this._lastMsgId = lastMsgId;
      }
      else
        this.WARN("invalid value for the lastMessageId preference: " + lastMsgId);
    }
    let getParams = "?count=200" + lastMsgParam;
    this._pendingRequests = [
      this.signAndSend("1.1/statuses/home_timeline.json" + getParams, null,
                       null, this.onTimelineReceived, this.onTimelineError,
                       this),
      this.signAndSend("1.1/statuses/mentions_timeline.json" + getParams, null,
                       null, this.onTimelineReceived, this.onTimelineError,
                       this)
    ];

    let track = this.getString("track");
    if (track) {
      let trackQuery = track.split(",").map(encodeURIComponent).join(" OR ");
      getParams = "?q=" + trackQuery + lastMsgParam + "&count=100";
      let url = "1.1/search/tweets.json" + getParams;
      this._pendingRequests.push(
        this.signAndSend(url, null, null, this.onTimelineReceived,
                         this.onTimelineError, this, null));
    }
  },

  get timeline() { return this._timeline || (this._timeline = new Conversation(this)); },
  displayMessages: function(aMessages) {
    let lastMsgId = this._lastMsgId;
    for each (let tweet in aMessages) {
      if (!("user" in tweet) || !("text" in tweet) || !("id_str" in tweet) ||
          this._knownMessageIds.has(tweet.id_str))
        continue;
      let id = tweet.id_str;
      // Update the last known message.
      // Compare the length of the ids first, and then the text.
      // This avoids converting tweet ids into rounded numbers.
      if (id.length > lastMsgId.length ||
          (id.length == lastMsgId.length && id > lastMsgId))
        lastMsgId = id;
      this._knownMessageIds.add(id);
      this.setUserInfo(tweet.user);
      this.timeline.displayTweet(tweet);
    }
    if (lastMsgId != this._lastMsgId) {
      this._lastMsgId = lastMsgId;
      this.prefs.setCharPref("lastMessageId", this._lastMsgId);
    }
  },

  onTimelineError: function(aError, aResponseText, aRequest) {
    this.ERROR(aError);
    if (aRequest.status == 401)
      ++this._timelineAuthError;
    this._doneWithTimelineRequest(aRequest);
  },

  onTimelineReceived: function(aData, aRequest) {
    this._timelineBuffer = this._timelineBuffer.concat(JSON.parse(aData));
    this._doneWithTimelineRequest(aRequest);
  },

  _doneWithTimelineRequest: function(aRequest) {
    this._pendingRequests =
      this._pendingRequests.filter(r => r !== aRequest);

    // If we are still waiting for more data, return early
    if (this._pendingRequests.length != 0)
      return;

    if (this._timelineAuthError >= 2) {
      // 2 out of the 3 timeline requests are authenticated.
      // With at least 2 '401 - Unauthorized' errors, we are sure
      // that our OAuth token is consistently rejected.
      delete this._timelineAuthError;
      delete this._timelineBuffer;
      delete this._pendingRequests;
      delete this.token;
      delete this.tokenSecret;
      this.requestToken();
      return;
    }

    // Less than 2 auth errors is probably just some flakiness of the
    // twitter servers, ignore and reset this._timelineAuthError.
    if (this._timelineAuthError)
      delete this._timelineAuthError;

    this.reportConnected();

    // If the conversation already exists, notify it we are back online.
    if (this._timeline)
      this._timeline.notifyObservers(this._timeline, "update-buddy-status");

    this._timelineBuffer.sort(this.sortByDate);
    this._timelineBuffer.forEach(aTweet => aTweet.delayed = true);
    this.displayMessages(this._timelineBuffer);

    // Fetch userInfo for the user if we don't already have it.
    this.requestBuddyInfo(this.name);

    // Reset in case we get disconnected
    delete this._timelineBuffer;
    delete this._pendingRequests;

    // Open the streams to get the live data.
    this.openStream();
  },

  sortByDate: (a, b) =>
    (new Date(a["created_at"])) - (new Date(b["created_at"])),

  _streamingRequest: null,
  _pendingData: "",
  openStream: function() {
    let track = this.getString("track");
    this._streamingRequest =
      this.signAndSend("https://userstream.twitter.com/1.1/user.json", null,
                       track ? [["track", track]] : [], this.openStream,
                       this.onStreamError, this);
    this._streamingRequest.responseType = "moz-chunked-text";
    this._streamingRequest.onprogress = this.onDataAvailable.bind(this);
    this.resetStreamTimeout();
    this.prefs.addObserver("track", this, false);
  },
  _streamTimeout: null,
  resetStreamTimeout: function() {
    if (this._streamTimeout)
      clearTimeout(this._streamTimeout);
    // The twitter Streaming API sends a keep-alive newline every 30 seconds
    // so if we haven't received anything for 90s, we should disconnect and try
    // to reconnect.
    this._streamTimeout = setTimeout(this.onStreamTimeout.bind(this), 90000);
  },
  onStreamError: function(aError) {
    delete this._streamingRequest;
    // _streamTimeout is cleared by cleanUp called by gotDisconnected.
    this.gotDisconnected(Ci.prplIAccount.ERROR_NETWORK_ERROR, aError);
  },
  onStreamTimeout: function() {
    this.gotDisconnected(Ci.prplIAccount.ERROR_NETWORK_ERROR, "timeout");
  },
  onDataAvailable: function(aRequest) {
    this.resetStreamTimeout();
    let newText = this._pendingData + aRequest.target.response;
    this.DEBUG("Received data: " + newText);
    let messages = newText.split(/\r\n?/);
    this._pendingData = messages.pop();
    for each (let message in messages) {
      if (!message.trim())
        continue;
      let msg;
      try {
        msg = JSON.parse(message);
      } catch (e) {
        this.ERROR(e + " while parsing " + message);
        continue;
      }
      if ("text" in msg)
        this.displayMessages([msg]);
      else if ("friends" in msg) {
        // Filter out the IDs that info has already been received from (e.g. a
        // tweet has been received as part of the timeline request).
        let userInfoIds = new Set();
        for each (let userInfo in this._userInfo)
          userInfoIds.add(userInfo.id_str);
        let ids = msg.friends.filter(
          aId => !userInfoIds.has(aId.toString()));

        while (ids.length) {
          // Take the first 100 elements, turn them into a comma separated list.
          this.signAndSend("1.1/users/lookup.json", null,
                           [["user_id", ids.slice(0, 99).join(",")]],
                           this.onLookupReceived, null, this);
          // Remove the first 100 elements.
          ids = ids.slice(100);
        }

        // Overwrite the existing _friends list (if any).
        this._friends = new Set(msg.friends.map(aId => aId.toString()));
      }
      else if ("event" in msg) {
        let user, event;
        switch(msg.event) {
          case "follow":
            if (msg.source.screen_name == this.name) {
              this._friends.add(msg.target.id_str);
              user = msg.target;
              event = "follow";
            }
            else if (msg.target.screen_name == this.name) {
              user = msg.source;
              event = "followed";
            }
            if (user) {
              this.setUserInfo(user);
              this.timeline.systemMessage(_("event." + event, user.screen_name),
                                          false, new Date(msg.created_at) / 1000);
            }
            break;
          case "user_update":
            this.setUserInfo(msg.target);
            break;
        }
      }
    }
  },

  requestToken: function() {
    this.reportConnecting(_("connection.initAuth"));
    let oauthParams =
      [["oauth_callback", encodeURIComponent(this.completionURI)]];
    this.signAndSend("oauth/request_token", null, [],
                     this.onRequestTokenReceived, this.onError, this,
                     oauthParams);
  },
  onRequestTokenReceived: function(aData) {
    this.LOG("Received request token.");
    let data = this._parseURLData(aData);
    if (!data.oauth_callback_confirmed ||
        !data.oauth_token || !data.oauth_token_secret) {
      this.gotDisconnected(Ci.prplIAccount.ERROR_OTHER_ERROR,
                           _("connection.failedToken"));
      return;
    }
    this.token = data.oauth_token;
    this.tokenSecret = data.oauth_token_secret;

    this.requestAuthorization();
  },
  requestAuthorization: function() {
    this.reportConnecting(_("connection.requestAuth"));
    let url = this.baseURI + "oauth/authorize?" +
      "force_login=true&" + // ignore cookies
      "screen_name=" + this.name + "&" + // prefill the user name input box
      "oauth_token=" + this.token;
    this._browserRequest = {
      get promptText() { return _("authPrompt"); },
      account: this,
      url: url,
      _active: true,
      cancelled: function() {
        if (!this._active)
          return;

        this.account
            .gotDisconnected(Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
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
            if (!aURL.startsWith(this._parent.completionURI))
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
      QueryInterface: XPCOMUtils.generateQI([Ci.prplIRequestBrowser])
    };
    Services.obs.notifyObservers(this._browserRequest, "browser-request", null);
  },
  finishAuthorizationRequest: function() {
    // Clean up the cookies, so that several twitter OAuth dialogs can work
    // during the same session (bug 954308).
    let cookies = Services.cookies.getCookiesFromHost("twitter.com");
    while (cookies.hasMoreElements()) {
      let cookie = cookies.getNext().QueryInterface(Ci.nsICookie2);
      Services.cookies.remove(cookie.host, cookie.name, cookie.path, false);
    }

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
      this.gotDisconnected(Ci.prplIAccount.ERROR_OTHER_ERROR,
                           _("connection.error.authFailed"));
      return;
    }
    this.requestAccessToken(data.oauth_verifier);
  },
  requestAccessToken: function(aTokenVerifier) {
    this.reportConnecting(_("connection.requestAccess"));
    this.signAndSend("oauth/access_token", null, [],
                     this.onAccessTokenReceived, this.onError, this,
                     [["oauth_verifier", aTokenVerifier]]);
  },
  onAccessTokenReceived: function(aData) {
    this.LOG("Received access token.");
    let result = this._parseURLData(aData);
    if (!this.fixAccountName(result))
      return;

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
  fixAccountName: function(aAuthResult) {
    if (!aAuthResult.screen_name || aAuthResult.screen_name == this.name)
      return true;

    if (aAuthResult.screen_name.toLowerCase() != this.name.toLowerCase()) {
      this.onError(_("connection.error.userMismatch"));
      return false;
    }

    this.LOG("Fixing the case of the account name: " +
             this.name + " -> " + aAuthResult.screen_name);
    this.__defineGetter__("name", () => aAuthResult.screen_name);
    return true;
  },

  cleanUp: function() {
    this.finishAuthorizationRequest();
    if (this._pendingRequests.length != 0) {
      for each (let request in this._pendingRequests)
        request.abort();
      delete this._pendingRequests;
    }
    if (this._streamTimeout) {
      clearTimeout(this._streamTimeout);
      delete this._streamTimeout;
      // Remove the preference observer that is added when the user stream is
      // opened. (This needs to be removed even if an error occurs, in which
      // case _streamingRequest is immediately deleted.)
      this.prefs.removeObserver("track", this);
    }
    if (this._streamingRequest) {
      this._streamingRequest.abort();
      delete this._streamingRequest;
    }
    delete this._pendingData;
    delete this.token;
    delete this.tokenSecret;
  },
  gotDisconnected: function(aError, aErrorMessage) {
    if (this.disconnected || this.disconnecting)
      return;

    if (aError === undefined)
      aError = Ci.prplIAccount.NO_ERROR;
    let connected = this.connected;
    this.reportDisconnecting(aError, aErrorMessage);
    this.cleanUp();
    if (this._timeline && connected)
      this._timeline.notifyObservers(this._timeline, "update-conv-chatleft");
    this.reportDisconnected();
  },
  remove: function() {
    if (!this._timeline)
      return;
    this._timeline.close();
    delete this._timeline;
  },
  unInit: function() {
    this.cleanUp();
  },
  disconnect: function() {
    this.gotDisconnected();
  },

  onError: function(aException) {
    if (aException == "offline") {
      this.gotDisconnected(Ci.prplIAccount.ERROR_NETWORK_ERROR,
                           _("connection.error.noNetwork"));
    }
    else
      this.gotDisconnected(Ci.prplIAccount.ERROR_OTHER_ERROR, aException.toString());
  },

  setUserDescription: function(aDescription) {
    const kMaxUserDescriptionLength = 160;
    if (aDescription.length > kMaxUserDescriptionLength) {
      aDescription = aDescription.substr(0, kMaxUserDescriptionLength);
      this.WARN("Description too long (over " + kMaxUserDescriptionLength +
                " characters):\n" + aDescription + ".");
      this.timeline.systemMessage(_("error.descriptionTooLong", aDescription));
    }
    // Don't need to catch the reply since the stream receives user_update.
    this.signAndSend("1.1/account/update_profile.json", null,
                     [["description", aDescription]]);
  },

  setUserInfo: function(aUser) {
    let nick = aUser.screen_name;
    this._userInfo.set(nick, aUser);

    // If it's the user's userInfo, update the timeline topic.
    if (nick == this.name && "description" in aUser)
      this.timeline.setTopic(aUser.description, nick, true);
  },
  onRequestedInfoReceived: function(aData) {
    let user = JSON.parse(aData);
    this.setUserInfo(user);
    this.requestBuddyInfo(user.screen_name);
  },
  requestBuddyInfo: function(aBuddyName) {
    let userInfo = this._userInfo.get(aBuddyName);
    if (!userInfo) {
      this.signAndSend("1.1/users/show.json?screen_name=" + aBuddyName, null,
                       null, this.onRequestedInfoReceived, null, this);
      return;
    }

    // List of the names of the info to actually show in the tooltip and
    // optionally a transform function to apply to the value.
    // See https://dev.twitter.com/docs/api/1/get/users/show for the options.
    let normalizeBool = isFollowing => _(isFollowing ? "yes" : "no");
    const kFields = {
      name: null,
      following: normalizeBool,
      description: null,
      url: null,
      location: null,
      lang: function(aLang) {
        try {
          return _lang(aLang);
        }
        catch(e) {
          return aLang;
        }
      },
      time_zone: null,
      protected: normalizeBool,
      created_at: aDate => (new Date(aDate)).toLocaleDateString(),
      statuses_count: null,
      friends_count: null,
      followers_count: null,
      listed_count: null
    };

    let tooltipInfo = [];
    for (let field in kFields) {
      if (Object.prototype.hasOwnProperty.call(userInfo, field) &&
          userInfo[field]) {
        let value = userInfo[field];
        if (kFields[field])
          value = kFields[field](value);
        tooltipInfo.push(new TooltipInfo(_("tooltip." + field), value));
      }
    }
    tooltipInfo.push(new TooltipInfo(null, userInfo.profile_image_url,
                                     Ci.prplITooltipInfo.icon));

    Services.obs.notifyObservers(new nsSimpleEnumerator(tooltipInfo),
                                 "user-info-received", aBuddyName);
  },

  // Handle the full user info for each received friend. Set the user info and
  // create the participant.
  onLookupReceived: function(aData) {
    let users = JSON.parse(aData);
    for each (let user in users) {
      this.setUserInfo(user);
      this.timeline._ensureParticipantExists(user.screen_name);
    }
  },

  onConfigReceived: function(aData) {
    this.config = JSON.parse(aData);
  },

  // Allow us to reopen the timeline via the join chat menu.
  get canJoinChat() { return true; },
  joinChat: function(aComponents) {
    // The 'timeline' getter opens a timeline conversation if none exists.
    this.timeline;
  }
};

// Shortcut to get the JavaScript account object.
function getAccount(aConv) { return aConv.wrappedJSObject._account; }

function TwitterProtocol() {
  this.registerCommands();
}
TwitterProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "twitter"; },
  get name() { return _("twitter.protocolName"); },
  get iconBaseURI() { return "chrome://prpl-twitter/skin/"; },
  get noPassword() { return true; },
  options: {
    "track": {get label() { return _("options.track"); }, default: ""}
  },
  // Replace the command name in the help string so translators do not attempt
  // to translate it.
  commands: [
    {
      name: "follow",
      get helpString() { return _("command.follow", "follow"); },
      run: function(aMsg, aConv) {
        aMsg = aMsg.trim();
        if (!aMsg)
          return false;
        let account = getAccount(aConv);
        aMsg.split(" ").forEach(account.follow, account);
        return true;
      }
    },
    {
      name: "unfollow",
      get helpString() { return _("command.unfollow", "unfollow"); },
      run: function(aMsg, aConv) {
        aMsg = aMsg.trim();
        if (!aMsg)
          return false;
        let account = getAccount(aConv);
        aMsg.split(" ").forEach(account.stopFollowing, account);
        return true;
      }
    }
  ],
  getAccount: function(aImAccount) { return new Account(this, aImAccount); },
  classID: Components.ID("{31082ff6-1de8-422b-ab60-ca0ac0b2af13}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([TwitterProtocol]);
