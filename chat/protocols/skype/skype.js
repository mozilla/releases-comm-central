/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource://gre/modules/Http.jsm");
Cu.import("resource:///modules/ArrayBufferUtils.jsm");
Cu.import("resource:///modules/BigInteger.jsm");
Cu.import("resource:///modules/imServices.jsm");
Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

// Constants used by the login process. This emulates a captured session using
// official means.
var kLockAndKeyAppId = "msmsgs@msnmsgr.com";
var kLockAndKeySecret = "Q1P7W2E4J9R8U3S5";
var kClientId = "578134";
var kClientInfo = "os=Windows; osVer=8.1; proc=Win32; lcid=en-us; " +
  "deviceType=1; country=n/a; clientName=swx-skype.com; clientVer=908/1.0.0.20";

var kLoginHost = "login.skype.com";
var kContactsHost = "api.skype.com";
var kMessagesHost = "client-s.gateway.messenger.live.com";

// Map from strings returned by the SkypeWeb API to statuses.
var kStatusMap = {
  "Online": "AVAILABLE",
  "Offline": "OFFLINE",
  "Idle": "IDLE",
  "Away": "AWAY",
  "Hidden": "INVISIBLE"
};

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/skype.properties")
);

/*
 * Convert a URL to a user's name.
 *
 * E.g. https://bay-client-s.gateway.messenger.live.com/v1/users/ME/contacts/8:clokep
 *      https://bay-client-s.gateway.messenger.live.com/v1/users/8:clokep/presenceDocs/messagingService
 *
 *
 * Note that some contacts might have a /1: in them (instead of a /8:), that's
 * for MSN linked contacts.
 */
function contactUrlToName(aUrl) {
  let start = aUrl.indexOf("/8:");
  if (start == -1)
    return null;
  // Skip over the separator.
  start += "/8:".length;

  let end = aUrl.indexOf("/", start);
  if (end == -1)
    end = undefined;

  return aUrl.slice(start, end);
}

function SkypeConversation(aAccount, aName) {
  this.buddy = aAccount._buddies.get(aName);
  this._init(aAccount, aName);
}
SkypeConversation.prototype = {
  __proto__: GenericConvIMPrototype,
  _account: null,

  sendMsg: function(aMessage) {
    if (!aMessage.length)
      return;

    let target = "8:" + this.name;
    let url = "https://" + kMessagesHost + "/v1/users/ME/conversations/" +
              target + "/messages";

    let clientMessageId = Date.now().toString();
    let message = {
      "clientmessageid": clientMessageId,
      "content": aMessage,
      "messagetype": "RichText",
      "contenttype": "text",
    };
    let options = {
      onLoad: (aResponse, aXhr) => {
        this._account.LOG("Message response: " + aResponse);
        this._account.LOG("Successfully sent message: " + aMessage)
      },
      onError: this._account._onHttpFailure("sending message"),
      postData: JSON.stringify(message),
      logger: this._account.logger
    };

    // TODO Track the messages we sent?
    this._account._messagesRequest(url, options);
  }
};

function SkypeAccountBuddy(aAccount, aBuddy, aTag, aUserName) {
  aAccount.LOG("Creating account buddy for " + aUserName);

  this._init(aAccount, aBuddy, aTag, aUserName);
}
SkypeAccountBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,
  _info: null,
  mood: null,

  // Called when the user wants to chat with the buddy.
  createConversation: function() this._account.createConversation(this.userName),

  // Returns a list of imITooltipInfo objects to be displayed when the user
  // hovers over the buddy.
  getTooltipInfo: function() {
    if (!this._info)
      return EmptyEnumerator;

    let tooltipInfo = [];
    for (let info in this._info) {
      // If there's no value, skip the element.
      if (!this._info[info])
        continue;

      // TODO Put real labels on here.
      tooltipInfo.push(new TooltipInfo(info, this._info[info]));
    }
    if (this.mood)
      tooltipInfo.push(new TooltipInfo("Mood", this.mood));

    return new nsSimpleEnumerator(tooltipInfo);
  },

  remove: function() {
    this._account.removeBuddy(this);
    GenericAccountBuddyPrototype.remove.call(this);
  }
};

/*
 * Cut out a part of a larger string bordered by aStart and aEnd. Returns an
 * empty string if the needle is not found.
 */
function extractString(aStr, aStart, aEnd) {
  // First find the start index, then offset by the string length.
  let startIndex = aStr.indexOf(aStart) + aStart.length;
  if (startIndex == -1)
    return "";
  // Now find the next occurrence of end after the start.
  let endIndex = aStr.indexOf(aEnd, startIndex);
  if (endIndex == -1)
    return "";

  return aStr.slice(startIndex, endIndex);
}

/*
 * A magic method (originally from MSN) to stop 3rd parties from connecting.
 * Differs from MSN by swapping MD5 for SHA256.
 *
 * A pre-emptive apology is necessary for those about to embark on the journey
 * of understanding this code. I wish you luck and God's speed.
 */
function magicSha256(aInput) {
  let productId = kLockAndKeyAppId;

  // Create a SHA 256 hash.
  let converter = Cc["@mozilla.org/intl/scriptableunicodeconverter"]
                    .createInstance(Ci.nsIScriptableUnicodeConverter);
  converter.charset = "UTF-8";
  let data = converter.convertToByteArray(aInput);
  let productKey = converter.convertToByteArray(kLockAndKeySecret);

  let hash =
    Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hash.init(hash.SHA256);
  hash.update(data, data.length);
  hash.update(productKey, productKey.length);
  // Finalize the hash as a set of bytes.
  let sha256Hash = hash.finish(false);

  // Split it into four integers (note that this ignores the second half of the
  // hash).
  let sha256Buffer = StringToArrayBuffer(sha256Hash);
  let view = new DataView(sha256Buffer, 0, 16);

  let sha256Parts = [];
  let newHashParts = [];
  for (let i = 0; i < 4; ++i) {
    // Ensure little-endianness is used.
    sha256Parts.push(view.getUint32(i * 4, true));

    newHashParts.push(sha256Parts[i]);
    sha256Parts[i] &= 0x7FFFFFFF;
  }

  // Make a new string and pad with '0' to a length that's a multiple of 8.
  let buf = aInput + productId;
  let len = buf.length;
  let modLen = len % 8;
  if (modLen != 0) {
    let fix = 8 - modLen;
    buf += "0".repeat(fix);
    len += fix;
  }

  // Split into integers.
  view = new DataView(StringToArrayBuffer(buf));

  // This is magic.
  let nHigh = bigInt(0);
  let nLow = bigInt(0);
  for (let i = 0; i < (len / 4); i += 2) {
    let temp = bigInt(0x0E79A9C1).times(view.getUint32(i * 4, true))
                                 .divmod(0x7FFFFFFF).remainder;
    temp = temp.plus(nLow).times(sha256Parts[0]).plus(sha256Parts[1])
                                                .divmod(0x7FFFFFFF).remainder;
    nHigh = nHigh.plus(temp);

    temp = temp.plus(view.getUint32((i + 1) * 4, true)).divmod(0x7FFFFFFF).remainder;
    nLow = temp.times(sha256Parts[2]).plus(sha256Parts[3]).divmod(0x7FFFFFFF).remainder;
    nHigh = nHigh.plus(nLow);
  }
  nLow = nLow.plus(sha256Parts[1]).divmod(0x7FFFFFFF).remainder.toJSNumber();
  nHigh = nHigh.plus(sha256Parts[3]).divmod(0x7FFFFFFF).remainder.toJSNumber();

  newHashParts[0] ^= nLow;
  newHashParts[1] ^= nHigh;
  newHashParts[2] ^= nLow;
  newHashParts[3] ^= nHigh;

  // Make a string of the parts and convert to hexadecimal.
  let output = "";
  for (let i = 0; i < 4; ++i) {
    let part = newHashParts[i];
    // Adjust to little-endianness.
    part = ((part & 0xFF) << 24) | ((part & 0xFF00) << 8) |
           ((part >> 8) & 0xFF00) | ((part >> 24) & 0xFF);

    // JavaScript likes to use signed numbers, force this to give us the
    // unsigned representation.
    if (part < 0)
      part += 0xFFFFFFFF + 1;

    let hexPart = part.toString(16);
    // Ensure that the string has 8 characters (4 bytes).
    output += "0".repeat(8 - hexPart.length) + hexPart;
  }

  return output;
}

// TODO Add tests for this function.
// Calculate the timezone offset of the local computer as [+-]HH:MM.
function getTimezone() {
  /*
   * Zero-pad aNum to the length of aLen.
   */
  function zeroPad(aNum, aLen) {
    let nStr = aNum.toString();
    let nLen = nStr.length;

    if (nLen > aLen) {
      throw "Can't zero-pad when longer than expected length: " + nStr +
        ".length > " + aLen;
    }

    return "0".repeat(aLen - nLen) + nStr;
  };

  // Invert the sign of the timezone from JavaScript's date object.
  let sign = "+";
  let timezone = new Date().getTimezoneOffset() * -1;
  if (timezone < 0)
    sign = "-";
  timezone = Math.abs(timezone);

  // Separate the timezone into hours and minutes.
  let minutes = timezone % 60;
  let hours = (timezone - minutes) / 60;

  // Ensure both hours and minutes are two digits long.
  minutes = zeroPad(minutes, 2);
  hours = zeroPad(hours, 2);

  // The final timezone string.
  return sign + hours + "|" + minutes;
}

function SkypeAccount(aProtoInstance, aImAccount) {
  this._init(aProtoInstance, aImAccount);

  // Initialize some maps.
  this._buddies = new Map();
  this._conversations = new Map();
  this._chats = new Map();

  this._logger = {log: this.LOG.bind(this), debug: this.DEBUG.bind(this)};
}
SkypeAccount.prototype = {
  __proto__: GenericAccountPrototype,
  // A Map holding the list of buddies associated with their usernames.
  _buddies: null,
  // A Map holding the list of open conversations by the username of the buddy.
  _conversations: null,
  // A Map holding the list of open (multiple user) chats by name.
  _chats: null,
  // The current request in the polling loop.
  _request: null,
  // The timer for the next poll.
  _poller: null,

  // Some tokens.
  _skypeToken: null,
  _registrationToken: null,

  // Logger used for HTTP requests.
  _logger: null,

  mapStatusString: function(aStatus) {
    if (aStatus in kStatusMap)
      return Ci.imIStatusInfo["STATUS_" + kStatusMap[aStatus]];

    // Uh-oh, we got something not in the map.
    this.WARN("Received unknown status type: " + aStatus);
    return Ci.imIStatusInfo.STATUS_UNKNOWN;
  },

  connect: function() {
    this.reportConnecting();

    this.LOG("STARTING Login");

    // Perform the request to get the session token values.
    let loginUrl = "https://" + kLoginHost + "/login";
    let options = {
      onLoad: this._onPieResponse.bind(this),
      onError: this._onHttpFailure("requesting pie"),
      logger: this.logger
    }
    httpRequest(loginUrl, options);
  },

  /*
   * Generates a callback which causes the account to enter an error state with
   * the given error string.
   */
  _onHttpFailure: function(aErrorStr) {
    return (aError, aResponse, aXhr) => {
      this.ERROR("HTTP failure occurred: " + aErrorStr + "\n" + aError);
      this._disconnectWithAuthFailure();
    };
  },

  _onHttpError: function(aError, aResponse, aXhr) {
    this.ERROR("Received error response:\n" + aError);
  },

  // Mmmmm...pie.
  _onPieResponse: function(aResponse, aXhr) {
    this.reportConnecting(_("connecting.authenticating"));

    // Parse the pie/etm and do the actual login.
    let loginUrl = "https://" + kLoginHost + "/login";

    let params = [["client_id", kClientId],
                  ["redirect_uri", "https://web.skype.com"]];
    loginUrl += "?" +
      params.map(p => p.map(encodeURIComponent).join("=")).join("&");

    this.LOG("Received PIE response:\n" + aResponse);

    // Note that the response is really just an HTML page with some JavaScript
    // and forms that these values are being pulled from.
    let pie = extractString(aResponse, "=\"pie\" value=\"", "\"");
    if (!pie) {
      this.ERROR("pie value not found.")
      this._disconnectWithAuthFailure();
      return;
    }
    let etm = extractString(aResponse, "=\"etm\" value=\"", "\"");
    if (!etm) {
      this.ERROR("etm value not found.")
      this._disconnectWithAuthFailure();
      return;
    }

    let options = {
      onLoad: this._onLoginResponse.bind(this),
      onError: this._onHttpFailure("requesting skypetoken"),
      postData: [["username", this.name],
                 ["password", this.imAccount.password],
                 ["timezone_field", getTimezone()],
                 ["pie", pie],
                 ["etm", etm],
                 ["js_time", Date.now()],
                 ["client_id", kClientId],
                 ["redirect_uri", "https://web.skype.com/"]],
      headers: [["Connection", "close"],
                // BehaviorOverride is a custom microsoft header. It stops the
                // response from doing a 302 Found Location redirect, since
                // there are important headers that need to be plucked before
                // the redirect happens.
                ["BehaviorOverride", "redirectAs404"]],
      logger: this._logger
    }
    httpRequest(loginUrl, options);
  },
  _onLoginResponse: function(aResponse, aXhr) {
    this.LOG("Received LOGIN response:\n" + aResponse);

    let refreshToken =
      extractString(aResponse, "=\"skypetoken\" value=\"", "\"");
    if (!refreshToken) {
      this.ERROR("skypetoken value not found.")
      this._disconnectWithAuthFailure();
      return;
    }

    // All done!
    this._skypeToken = refreshToken;
    this.LOG("Recevied Skype token: " + this._skypeToken);

    if (this._registrationToken) {
      // Subscribe to receive particular events.
      this._subscribe();
      return;
    }

    this.reportConnecting(_("connecting.registrationToken"));

    // Request the registration token.
    let messagesUrl = "https://" + kMessagesHost + "/v1/users/ME/endpoints";
    // The current time in seconds, converted to a string.
    let curTime = String(Math.floor(Date.now() / 1000));
    let response = magicSha256(curTime);
    let options = {
      onLoad: this._onRegistrationTokenReceived.bind(this),
      onError: (aError, aResponse, aXhr) => {
        this.ERROR("HTTP failure occurred: requesting registration token\n" +
                   aError);
        this._disconnectWithAuthFailure("error.registrationToken");
      },
      postData: "{}", // Empty JSON object.
      headers: [["Connection", "close"],
                // BehaviorOverride is a custom microsoft header. It stops the
                // response from doing a 302 Found Location redirect, since
                // there are important headers that need to be plucked before
                // the redirect happens.
                ["BehaviorOverride", "redirectAs404"],
                ["LockAndKey", "appId=" + kLockAndKeyAppId +
                               "; time=" + curTime +
                               "; lockAndKeyResponse=" + response],
                ["ClientInfo", kClientInfo],
                ["Authentication", "skypetoken=" + this._skypeToken]],
      logger: this._logger
    }
    httpRequest(messagesUrl, options);
  },
  _onRegistrationTokenReceived: function(aResponse, aXhr) {
    this.LOG("Registration token received: " + aResponse);

    let registrationToken = aXhr.getResponseHeader("Set-RegistrationToken");
    this.LOG("regToken: " + registrationToken);
    if (!registrationToken) {
      this.ERROR("registraation token value not found.")
      this._disconnectWithAuthFailure();
      return;
    }

    this._registrationToken = registrationToken;
    this._subscribe();
  },

  // Subscribe to the events we want to see.
  _subscribe: function() {
    this.LOG("Sending subscription.");

    // Subscribe to particular events.
    let messagesUrl =
      "https://" + kMessagesHost + "/v1/users/ME/endpoints/SELF/subscriptions";
    // The endpoints to subscribe to.
    let subscriptions = {
      "interestedResources": ["/v1/users/ME/conversations/ALL/properties",
                              "/v1/users/ME/conversations/ALL/messages",
                              "/v1/users/ME/contacts/ALL",
                              "/v1/threads/ALL"],
      "template": "raw",
      "channelType": "httpLongPoll"
    };
    let options = {
      onLoad: this._onSubscription.bind(this),
      onError: this._onHttpFailure("subscribing to notifications"),
      postData: JSON.stringify(subscriptions),
      logger: this._logger
    };
    this._messagesRequest(messagesUrl, options);
  },

  _onSubscription: function(aResponse, aXhr) {
    this.LOG("Got subscription response: " + aResponse);
    this.reportConnected();

    // TODO Check auth requests.

    // Get friends list.
    let contactListUrl = "https://" + kContactsHost + "/users/self/contacts";
    let options = {
      onLoad: this._onContactsList.bind(this),
      onError: this._onHttpError.bind(this),
      logger: this._logger
    }
    this._contactsRequest(contactListUrl, options);

    // Poll for messages.
    this._getMessages();
  },

  _onContactsList: function(aResponse, aXhr) {
    this.LOG("Contacts list: " + aResponse);

    let buddies = JSON.parse(aResponse);
    if (!buddies) {
      this.ERROR("Unable to parse JSON response: " + aResponse);
      return;
    }

    // You have no friends. :( Nothing to do, just move along.
    if (!buddies.length)
      return;

    // This gets a little confusing, buddyObj refers to the JSON that was parsed
    // and returned from the server, buddy refers to the prplIAccountBuddy.
    for (let buddyObj of buddies) {
      let buddy = this._buddies.get(buddyObj.skypename);
      if (!buddy) {
        buddy = new SkypeAccountBuddy(
          this, null, Services.tags.defaultTag, buddyObj.skypename);

        // Store the buddy for later.
        this._buddies.set(buddyObj.skypename, buddy);

        // Notify the UI of the buddy.
        Services.contacts.accountBuddyAdded(buddy);
      }

      // TODO There is also fullname / skypename.
      // Note that display_name is the public alias that the buddy has set for
      // themselves, skypename is the buddy's unique ID name, fullname is their
      // real name.
      if (buddyObj.display_name)
        buddy.serverAlias = buddyObj.display_name;
      // Store the buddy info into the object for tooltips.
      buddy._info = buddyObj;

      // Set the buddy's status to offline until we get an update.
      buddy.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
    }

    // Download profiles.
    let profilesUrl =
      "https://" + kContactsHost + "/users/self/contacts/profiles";
    let options = {
      postData: buddies.map((b) => ["contacts[]", b.skypename]),
      onLoad: this._onProfiles.bind(this),
      onError: this._onHttpError.bind(this),
      logger: this._logger
    };
    this.LOG(JSON.stringify(options));
    this._contactsRequest(profilesUrl, options);

    // Subscribe to user statuses.
    let contactsUrl = "https://" + kMessagesHost + "/v1/users/ME/contacts";
    let contacts = buddies.map((b) => {
      return {"id": "8:" + b.skypename};
    });
    options = {
      postData: JSON.stringify({"contacts": contacts}),
      onLoad: (aResponse, aXhr) =>
        this.LOG("Successfully subscribed to contacts."),
      onError: this._onHttpError.bind(this),
      logger: this._logger
    };
    this.LOG(JSON.stringify(options));
    this._messagesRequest(contactsUrl, options);
  },

  _onProfiles: function(aResponse, aXhr) {
    this.LOG("Profiles: " + aResponse);

    let skypeContacts = JSON.parse(aResponse);

    // TODO Error checking.

    for (let skypeContact of skypeContacts) {
      let username = skypeContact.username;

      let buddy = this._buddies.get(username);
      if (!buddy)
        continue;

      // Set some properties on the buddy.
      buddy.serverAlias = skypeContact.displayname;
      // TODO There's also firstname and lastname fields.
      buddy.mood = skypeContact.mood;

      // TODO Download the file and store it in the profile.
      let avatarUrl = skypeContact.avatarUrl;
      if (!avatarUrl) {
        avatarUrl = "https://" + kContactsHost + "/users/" + buddy.userName +
          "/profile/avatar";
      }
      buddy.buddyIconFilename = skypeContact.avatarUrl;
    }
  },

  /*
   * Download the actual messages, this will recurse through its callback.
   */
  _getMessages: function() {
    let messagesUrl = "https://" + kMessagesHost +
      "/v1/users/ME/endpoints/SELF/subscriptions/0/poll";
    let options = {
      method: "POST",
      onLoad: this._onMessages.bind(this),
      onError: this._onHttpError.bind(this),
      logger: this._logger
    };
    this._request = this._messagesRequest(messagesUrl, options);
  },

  _onMessages: function(aResponse, aXhr) {
    this.LOG("Messages: " + aResponse);

    // Poll for new events by performing another XHR in 1 second.
    this._request = null;
    this._poller = setTimeout(this._getMessages.bind(this), 1000);

    // Empty responses are received as keep alives.
    if (!aResponse)
      return;

    // Otherwise, parse the response as JSON.
    let obj = JSON.parse(aResponse);
    if (!obj) {
      this.ERROR("Unable to parse JSON response: " + aResponse);
      return;
    }

    // If no messages, nothing to do.
    if (!("eventMessages" in obj))
      return;

    for (let message of obj.eventMessages) {
      // The type of message (e.g. new message, new status).
      let resourceType = message.resourceType;
      // The message object.
      let resource = message.resource;

      // Based on what the message is, totally different things are done below.
      // Sorry for the mess. We can probably abstract this better.
      if (resourceType == "NewMessage") {
        let messageType = resource.messagetype;
        let from = contactUrlToName(resource.from);
        if (!from) {
          this.WARN("Received a message without a parseable from field: " +
                    resource.from);
          return;
        }

        // TODO Handle composetime field?
        let conversationLink = resource.conversationLink;

        // Check if the conversation is a chat.
        if (conversationLink.indexOf("/19:") != -1) {
          // TODO
          this.WARN("Received message from MUC.");
          continue;
        }

        // Get or create the conversation.
        let conversationName = contactUrlToName(conversationLink);
        let conv = this._conversations.get(conversationName);

        let messageTypeParts = messageType.split("/");
        // Set the typing state (if the conversation exists).
        if (messageTypeParts[0] == "Control" && conv) {
          let typingState = null;
          // NotTyping or Typing.
          if (messageTypeParts[1] == "Typing")
            typingState = Ci.prplIConvIM.TYPING;
          else if (messageTypeParts[1] == "ClearTyping")
            typingState = Ci.prplIConvIM.NOT_TYPING;
          if (typingState !== null)
            conv.updateTyping(typingState);
          // TODO There doesn't seem to be a "typed" state.
        } else if (messageType == "RichText" || messageType == "Text") {
          // Create a conversation if it doesn't exist.
          if (!conv)
            conv = this.createConversation(conversationName);

          // TODO Handle RichText vs. Text.

          // Put the message into the conversation.
          let options = {};
          if (from == this.name)
            options.outgoing = true;
          else
            options.incoming = true;
          conv.writeMessage(from, resource.content, options);
        }
      } else if (resourceType == "UserPresence") {
        // Ignore our own statuses.
        let from = contactUrlToName(resource.selfLink);
        if (!from)
          continue;

        // Get the buddy and update the status.
        let buddy = this._buddies.get(from);
        if (buddy)
          buddy.setStatus(this.mapStatusString(resource.status), "");
      } else if (resourceType == "EndpointPresence") {
        // Nothing to do.
      } else if (resourceType == "ConversationUpdate") {
        // Nothing to do.
      } else if (resourceType == "ThreadUpdate") {
        // Nothing to do.
      } else {
        this.WARN("Unhandled resource type: " + resourceType);
      }
    }
  },

  /*
   * Make a request to the Skype contacts API, this is essentially just
   * httpRequest, but auto-adds a bunch of headers that are necessary.
   */
  _contactsRequest: function(aUrl, aOptions = {}) {
    let headers = aOptions.headers || [];

    // Add some special Skype headers.
    headers = headers.concat([
      ["X-Skypetoken", this._skypeToken],
      ["X-Stratus-Caller", "swx-skype.com"],
      ["X-Stratus-Request", "abcd1234"],
      ["Origin", "https://web.skype.com"],
      ["Referer", "https://web.skype.com/main"],
      ["Accept", "application/json; ver=1.0;"],
    ]);

    aOptions.headers = headers;

    return httpRequest(aUrl, aOptions);
  },

  /*
   * Make a request to the Skype messages API, this is essentially just
   * httpRequest, but auto-adds a bunch of headers that are necessary.
   */
  _messagesRequest: function(aUrl, aOptions = {}) {
    let headers = aOptions.headers || [];

    // Add some special Skype headers.
    headers = headers.concat([
      ["RegistrationToken", this._registrationToken],
      ["Referer", "https://web.skype.com/main"],
      ["Accept", "application/json; ver=1.0;"],
      ["ClientInfo", kClientInfo],
    ]);

    aOptions.headers = headers;

    return httpRequest(aUrl, aOptions);
  },

  // Helper function to disconnect with authentication failed.
  _disconnectWithAuthFailure: function(aMessageId="error.auth") {
    this.reportDisconnecting(Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
                             _(aMessageId));
    this.reportDisconnected();
  },

  disconnect: function() {
    if (this.disconnected || this.disconnecting)
      return;

    clearTimeout(this._poller);
    if (this._request)
      this._request.abort();

    this._request = null;
    this._poller = null;

    // Mark all contacts on the account as having an unknown status.
    this._buddies.forEach(aBuddy =>
      aBuddy.setStatus(Ci.imIStatusInfo.STATUS_UNKNOWN, ""));

    this.reportDisconnected();
  },

  // TODO?
  observe: function(aSubject, aTopic, aData) {},

  remove: function() {
    this._conversations.forEach(conv => conv.close());
    delete this._conversations;
    this.buddies.forEach(aBuddy => aBuddy.remove());
    delete this.buddies;
  },

  unInit: function() {
    delete this.imAccount;
    clearTimeout(this._poller);
  },

  createConversation: function(aName) {
    let conv = new SkypeConversation(this, aName);
    this._conversations.set(aName, conv);
    return conv;
  },

  // Called when the user adds or authorizes a new contact.
  addBuddy: function(aTag, aName) {},

  loadBuddy: function(aBuddy, aTag) {
    let buddy = new SkypeAccountBuddy(this, aBuddy, aTag);
    this._buddies.set(buddy.userName, buddy);

    return buddy;
  },

  // TODO Add support for MUCs.
  get canJoinChat() { return false; },
  chatRoomFields: {},
  joinChat: function(aComponents) {}
};

function SkypeProtocol() {}
SkypeProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get name() { return "Skype"; },
  get iconBaseURI() { return "chrome://prpl-skype/skin/"; },
  get baseId() { return "prpl-skype"; },

  get passwordOptional() { return false; },

  getAccount: function(aImAccount) { return new SkypeAccount(this, aImAccount); },
  classID: Components.ID("{8446c0f6-9f59-4710-844e-eaa6c1f49d35}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([SkypeProtocol]);
