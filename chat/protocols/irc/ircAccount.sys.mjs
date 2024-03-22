/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ClassInfo,
  executeSoon,
  l10nHelper,
  nsSimpleEnumerator,
} from "resource:///modules/imXPCOMUtils.sys.mjs";
import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import {
  ctcpFormatToHTML,
  kListRefreshInterval,
} from "resource:///modules/ircUtils.sys.mjs";
import {
  GenericAccountPrototype,
  GenericAccountBuddyPrototype,
  GenericConvIMPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericConversationPrototype,
  TooltipInfo,
} from "resource:///modules/jsProtoHelper.sys.mjs";
import { NormalizedMap } from "resource:///modules/NormalizedMap.sys.mjs";
import { Socket } from "resource:///modules/socket.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
  ircHandlers: "resource:///modules/ircHandlers.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "_conv", () =>
  l10nHelper("chrome://chat/locale/conversations.properties")
);
ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/irc.properties")
);

/*
 * Parses a raw IRC message into an object (see section 2.3 of RFC 2812). This
 * returns an object with the following fields:
 *   rawMessage The initial message string received without any processing.
 *   command    A string that is the command or response code.
 *   params     An array of strings for the parameters. The last parameter is
 *              stripped of its : prefix.
 *   origin     The user's nickname or the server who sent the message. Can be
 *              a host (e.g. irc.mozilla.org) or an IPv4 address (e.g. 1.2.3.4)
 *              or an IPv6 address (e.g. 3ffe:1900:4545:3:200:f8ff:fe21:67cf).
 *   user       The user's username, note that this can be undefined.
 *   host       The user's hostname, note that this can be undefined.
 *   source     A "nicely" formatted combination of user & host, which is
 *              <user>@<host> or <user> if host is undefined.
 *   tags       A Map with tags stored as key-value-pair. The value is a decoded
 *              string or undefined if the tag has no value.
 *
 * There are cases (e.g. localhost) where it cannot be easily determined if a
 * message is from a server or from a user, thus the usage of a generic "origin"
 * instead of "nickname" or "servername".
 *
 * Inputs:
 *  aData       The raw string to parse, it should already have the \r\n
 *              stripped from the end.
 *  aOrigin     The default origin to use for unprefixed messages.
 */
export function ircMessage(aData, aOrigin) {
  const message = { rawMessage: aData };
  let temp;

  // Splits the raw string into five parts. The third part, the command, is
  // required. A raw string looks like:
  //   ["@" <tags> " "] [":" <prefix> " "] <command> [" " <parameter>]* [":" <last parameter>]
  //     <tags>: /[^ ]+/
  //     <prefix>: :(<server name> | <nickname> [["!" <user>] "@" <host>])
  //     <command>: /[^ ]+/
  //     <parameter>: /[^ ]+/
  //     <last parameter>: /.+/
  // See http://joshualuckers.nl/2010/01/10/regular-expression-to-match-raw-irc-messages/
  // Note that this expression is slightly more aggressive in matching than RFC
  // 2812 would allow. It allows for empty parameters (besides the last
  // parameter, which can always be empty), by allowing multiple spaces.
  // (This is for compatibility with Unreal's 432 response, which returns an
  // empty first parameter.) It also allows a trailing space after the
  // <parameter>s when no <last parameter> is present (also occurs with Unreal).
  if (
    !(temp = aData.match(
      /^(?:@([^ ]+) )?(?::([^ ]+) )?([^ ]+)((?: +[^: ][^ ]*)*)? *(?::([\s\S]*))?$/
    ))
  ) {
    throw new Error("Couldn't parse message: \"" + aData + '"');
  }

  message.command = temp[3];
  // Space separated parameters. Since we expect a space as the first thing
  // here, we want to ignore the first value (which is empty).
  message.params = temp[4] ? temp[4].split(" ").slice(1) : [];
  // Last parameter can contain spaces or be an empty string.
  if (temp[5] !== undefined) {
    message.params.push(temp[5]);
  }

  // Handle the prefix part of the message per RFC 2812 Section 2.3.

  // If no prefix is given, assume the current server is the origin.
  if (!temp[2]) {
    temp[2] = aOrigin;
  }

  // Split the prefix into separate nickname, username and hostname fields as:
  //   :(servername|(nickname[[!user]@host]))
  [message.origin, message.user, message.host] = temp[2].split(/[!@]/);

  // Store the tags in a Map, see IRCv3.2 Message Tags.
  message.tags = new Map();

  if (temp[1]) {
    const tags = temp[1].split(";");
    tags.forEach(tag => {
      let [key, value] = tag.split("=");

      if (value) {
        // Unescape tag values according to this mapping:
        // \\ = \
        // \n = LF
        // \r = CR
        // \s = SPACE
        // \: = ;
        // everything else stays identical.
        value = value.replace(/\\(.)/g, (str, type) => {
          if (type == "\\") {
            return "\\";
          } else if (type == "n") {
            return "\n";
          } else if (type == "r") {
            return "\r";
          } else if (type == "s") {
            return " ";
          } else if (type == ":") {
            return ";";
          }
          // Ignore the backslash, not specified by the spec, but as it says
          // backslashes must be escaped this case should not occur in a valid
          // tag value.
          return type;
        });
      }
      // The tag key can typically have the form of example.com/aaa for vendor
      // defined tags. The spec wants any unicode characters in URLs to be
      // in punycode (xn--). These are not unescaped to their unicode value.
      message.tags.set(key, value);
    });
  }

  // It is occasionally useful to have a "source" which is a combination of
  // user@host.
  if (message.user) {
    message.source = message.user + "@" + message.host;
  } else if (message.host) {
    message.source = message.host;
  } else {
    message.source = "";
  }

  return message;
}

// This handles a mode change string for both channels and participants. A mode
// change string is of the form:
//   aAddNewMode is true if modes are being added, false otherwise.
//   aNewModes is an array of mode characters.
function _setMode(aAddNewMode, aNewModes) {
  // Check each mode being added/removed.
  for (const newMode of aNewModes) {
    const hasMode = this._modes.has(newMode);
    // If the mode is in the list of modes and we want to remove it.
    if (hasMode && !aAddNewMode) {
      this._modes.delete(newMode);
    } else if (!hasMode && aAddNewMode) {
      // If the mode is not in the list of modes and we want to add it.
      this._modes.add(newMode);
    }
  }
}

function TagMessage(aMessage, aTagName) {
  this.message = aMessage;
  this.tagName = aTagName;
  this.tagValue = aMessage.tags.get(aTagName);
}

// Properties / methods shared by both ircChannel and ircConversation.
export var GenericIRCConversation = {
  _observedNicks: [],
  // This is set to true after a message is sent to notify the 401
  // ERR_NOSUCHNICK handler to write an error message to the conversation.
  _pendingMessage: false,
  _waitingForNick: false,

  normalizeNick(aNick) {
    return this._account.normalizeNick(aNick);
  },

  // This will calculate the maximum number of bytes that are left for a message
  // typed by the user by calculate the amount of bytes that would be used by
  // the IRC messaging.
  getMaxMessageLength() {
    // Build the shortest possible message that could be sent to other users.
    const baseMessage =
      ":" +
      this._account._nickname +
      this._account.prefix +
      " " +
      this._account.buildMessage("PRIVMSG", this.name) +
      " :\r\n";
    return (
      this._account.maxMessageLength - this._account.countBytes(baseMessage)
    );
  },
  /**
   * @param {string} aWho - Message author's username.
   * @param {string} aMessage - Message text.
   * @param {object} aObject - Other properties to set on the imMessage.
   */
  handleTags(aWho, aMessage, aObject) {
    let messageProps = aObject;
    if ("tags" in aObject && lazy.ircHandlers.hasTagHandlers) {
      // Merge extra info for the handler into the props.
      messageProps = Object.assign(
        {
          who: aWho,
          message: aMessage,
          get originalMessage() {
            return aMessage;
          },
        },
        messageProps
      );
      for (const tag of aObject.tags.keys()) {
        // Unhandled tags may be common, since a tag does not have to be handled
        // with a tag handler, it may also be handled by a message command handler.
        lazy.ircHandlers.handleTag(
          this._account,
          new TagMessage(messageProps, tag)
        );
      }

      // Remove helper prop for tag handlers. We don't want to remove the other
      // ones, since they might have been changed and will override aWho and
      // aMessage in the imMessage constructor.
      delete messageProps.originalMessage;
    }
    // Remove the IRC tags, as those were passed in just for this step.
    delete messageProps.tags;
    return messageProps;
  },
  // Apply CTCP formatting before displaying.
  prepareForDisplaying(aMsg) {
    aMsg.displayMessage = ctcpFormatToHTML(aMsg.displayMessage);
    GenericConversationPrototype.prepareForDisplaying.apply(this, arguments);
  },
  prepareForSending(aOutgoingMessage) {
    // Split the message by line breaks and send each one individually.
    const messages = aOutgoingMessage.message.split(/[\r\n]+/);

    const maxLength = this.getMaxMessageLength();

    // Attempt to smartly split a string into multiple lines (based on the
    // maximum number of characters the message can contain).
    for (let i = 0; i < messages.length; ++i) {
      const message = messages[i];
      const length = this._account.countBytes(message);
      // The message is short enough.
      if (length <= maxLength) {
        continue;
      }

      // Find the location of a space before the maximum length.
      const index = message.lastIndexOf(" ", maxLength);

      // Remove the current message and insert the two new ones. If no space was
      // found, cut the first message to the maximum length and start the second
      // message one character after that. If a space was found, exclude it.
      messages.splice(
        i,
        1,
        message.substr(0, index == -1 ? maxLength : index),
        message.substr(index + 1 || maxLength)
      );
    }

    return messages;
  },
  dispatchMessage(message, action = false, isNotice = false) {
    if (!message.length) {
      return;
    }

    if (action) {
      if (!this._account.sendCTCPMessage(this.name, false, "ACTION", message)) {
        this.writeMessage(
          this._account._currentServerName,
          lazy._("error.sendMessageFailed"),
          {
            error: true,
            system: true,
          }
        );
        return;
      }
    } else if (
      !this._account.sendMessage(isNotice ? "NOTICE" : "PRIVMSG", [
        this.name,
        message,
      ])
    ) {
      this.writeMessage(
        this._account._currentServerName,
        lazy._("error.sendMessageFailed"),
        {
          error: true,
          system: true,
        }
      );
      return;
    }

    // By default the server doesn't send the message back, but this can be
    // enabled with the echo-message capability. If this is not enabled, just
    // assume the message was received and immediately show it.
    if (!this._account._activeCAPs.has("echo-message")) {
      this.writeMessage(
        this._account.imAccount.alias ||
          this._account.imAccount.statusInfo.displayName ||
          this._account._nickname,
        message,
        {
          outgoing: true,
          notification: isNotice,
          action,
        }
      );
    }

    this._pendingMessage = true;
  },

  /**
   * IRC doesn't support typing notifications, but it does have a maximum
   * message length.
   *
   * @param {string} string - The currently typed message.
   * @returns {number} The number of characters that can still be typed
   */
  getRemainingCharacters(string) {
    const longestLineLength = Math.max.apply(
      null,
      string.split("\n").map(this._account.countBytes, this._account)
    );
    return this.getMaxMessageLength() - longestLineLength;
  },

  requestCurrentWhois(aNick) {
    if (!this._observedNicks.length) {
      Services.obs.addObserver(this, "user-info-received");
    }
    this._observedNicks.push(this.normalizeNick(aNick));
    this._account.requestCurrentWhois(aNick);
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic != "user-info-received") {
      return;
    }

    const nick = this.normalizeNick(aData);
    const nickIndex = this._observedNicks.indexOf(nick);
    if (nickIndex == -1) {
      return;
    }

    // Remove the nick from the list of nicks that are being waited to received.
    this._observedNicks.splice(nickIndex, 1);

    // If this is the last nick, remove the observer.
    if (!this._observedNicks.length) {
      Services.obs.removeObserver(this, "user-info-received");
    }

    // If we are waiting for the conversation name, set it.
    const account = this._account;
    if (this._waitingForNick && nick == this.normalizedName) {
      if (account.whoisInformation.has(nick)) {
        this.updateNick(account.whoisInformation.get(nick).nick);
      }
      delete this._waitingForNick;
      return;
    }

    // Otherwise, print the requested whois information.
    const type = { system: true, noLog: true };
    // RFC 2812 errors 401 and 406 result in there being no entry for the nick.
    if (!account.whoisInformation.has(nick)) {
      this.writeMessage(null, lazy._("message.unknownNick", nick), type);
      return;
    }
    // If the nick is offline, tell the user. In that case, it's WHOWAS info.
    let msgType = "message.whois";
    if ("offline" in account.whoisInformation.get(nick)) {
      msgType = "message.whowas";
    }
    let msg = lazy._(msgType, account.whoisInformation.get(nick).nick);

    // Iterate over each field.
    for (const elt of aSubject.QueryInterface(Ci.nsISimpleEnumerator)) {
      switch (elt.type) {
        case Ci.prplITooltipInfo.pair:
        case Ci.prplITooltipInfo.sectionHeader:
          msg += "\n" + lazy._("message.whoisEntry", elt.label, elt.value);
          break;
        case Ci.prplITooltipInfo.sectionBreak:
          break;
        case Ci.prplITooltipInfo.status:
          if (elt.label != Ci.imIStatusInfo.STATUS_AWAY) {
            break;
          }
          // The away message has no tooltipInfo.pair entry.
          msg +=
            "\n" +
            lazy._("message.whoisEntry", lazy._("tooltip.away"), elt.value);
          break;
      }
    }
    this.writeMessage(null, msg, type);
  },

  unInitIRCConversation() {
    this._account.removeConversation(this.name);
    if (this._observedNicks.length) {
      Services.obs.removeObserver(this, "user-info-received");
    }
  },
};

export function ircChannel(aAccount, aName, aNick) {
  this._init(aAccount, aName, aNick);
  this._participants = new NormalizedMap(this.normalizeNick.bind(this));
  this._modes = new Set();
  this._observedNicks = [];
  this.banMasks = [];
}

ircChannel.prototype = {
  __proto__: GenericConvChatPrototype,
  _modes: null,
  _receivedInitialMode: false,
  // For IRC you're not in a channel until the JOIN command is received, open
  // all channels (initially) as left.
  _left: true,
  // True while we are rejoining a channel previously parted by the user.
  _rejoined: false,
  banMasks: [],

  // Section 3.2.2 of RFC 2812.
  part(aMessage) {
    const params = [this.name];

    // If a valid message was given, use it as the part message.
    // Otherwise, fall back to the default part message, if it exists.
    const msg = aMessage || this._account.getString("partmsg");
    if (msg) {
      params.push(msg);
    }

    this._account.sendMessage("PART", params);

    // Remove reconnection information.
    delete this.chatRoomFields;
  },

  close() {
    // Part the room if we're connected.
    if (this._account.connected && !this.left) {
      this.part();
    }
    GenericConvChatPrototype.close.call(this);
  },

  unInit() {
    this.unInitIRCConversation();
    GenericConvChatPrototype.unInit.call(this);
  },

  // Use the normalized nick in order to properly notify the observers.
  getNormalizedChatBuddyName(aNick) {
    return this.normalizeNick(aNick);
  },

  getParticipant(aNick, aNotifyObservers) {
    if (this._participants.has(aNick)) {
      return this._participants.get(aNick);
    }

    const participant = new ircParticipant(aNick, this);
    this._participants.set(aNick, participant);

    // Add the participant to the whois table if it is not already there.
    this._account.setWhois(participant._name);

    if (aNotifyObservers) {
      this.notifyObservers(
        new nsSimpleEnumerator([participant]),
        "chat-buddy-add"
      );
    }
    return participant;
  },

  /*
   * Add/remove modes from this channel.
   *
   * aNewMode is the new mode string, it MUST begin with + or -.
   * aModeParams is a list of ordered string parameters for the mode string.
   * aSetter is the nick of the person (or service) that set the mode.
   */
  setMode(aNewMode, aModeParams, aSetter) {
    // Save this for a comparison after the new modes have been set.
    const previousTopicSettable = this.topicSettable;

    const hostMaskExp = /^.+!.+@.+$/;
    function getNextParam() {
      // If there's no next parameter, throw a warning.
      if (!aModeParams.length) {
        this.WARN("Mode parameter expected!");
        return undefined;
      }
      return aModeParams.pop();
    }
    function peekNextParam() {
      // Non-destructively gets the next param.
      if (!aModeParams.length) {
        return undefined;
      }
      return aModeParams.slice(-1)[0];
    }

    // Are modes being added or removed?
    if (aNewMode[0] != "+" && aNewMode[0] != "-") {
      this.WARN("Invalid mode string: " + aNewMode);
      return;
    }
    const addNewMode = aNewMode[0] == "+";

    // Check each mode being added and update the user.
    const channelModes = [];
    const userModes = new NormalizedMap(this.normalizeNick.bind(this));
    let msg;

    for (let i = aNewMode.length - 1; i > 0; --i) {
      // Since some modes are conflicted between different server
      // implementations, check if a participant with that name exists. If this
      // is true, then update the mode of the ConvChatBuddy.
      if (
        this._account.memberStatuses.includes(aNewMode[i]) &&
        aModeParams.length &&
        this._participants.has(peekNextParam())
      ) {
        // Store the new modes for this nick (so each participant's mode is only
        // updated once).
        const nick = getNextParam();
        if (!userModes.has(nick)) {
          userModes.set(nick, []);
        }
        userModes.get(nick).push(aNewMode[i]);

        // Don't use this mode as a channel mode.
        continue;
      } else if (aNewMode[i] == "k") {
        // Channel key.
        let newFields = this.name;
        if (addNewMode) {
          const key = getNextParam();
          // A new channel key was set, display a message if this key is not
          // already known.
          if (
            this.chatRoomFields &&
            this.chatRoomFields.getValue("password") == key
          ) {
            continue;
          }
          msg = lazy._("message.channelKeyAdded", aSetter, key);
          newFields += " " + key;
        } else {
          msg = lazy._("message.channelKeyRemoved", aSetter);
        }

        this.writeMessage(aSetter, msg, { system: true });
        // Store the new fields for reconnect.
        this.chatRoomFields =
          this._account.getChatRoomDefaultFieldValues(newFields);
      } else if (aNewMode[i] == "b") {
        // A banmask was added or removed.
        const banMask = getNextParam();
        let msgKey = "message.banMask";
        if (addNewMode) {
          this.banMasks.push(banMask);
          msgKey += "Added";
        } else {
          this.banMasks = this.banMasks.filter(aBanMask => banMask != aBanMask);
          msgKey += "Removed";
        }
        this.writeMessage(aSetter, lazy._(msgKey, banMask, aSetter), {
          system: true,
        });
      } else if (["e", "I", "l"].includes(aNewMode[i])) {
        // TODO The following have parameters that must be accounted for.
        getNextParam();
      } else if (
        aNewMode[i] == "R" &&
        aModeParams.length &&
        peekNextParam().match(hostMaskExp)
      ) {
        // REOP_LIST takes a mask as a parameter, since R is a conflicted mode,
        // try to match the parameter. Implemented by IRCNet.
        // TODO The parameter must be acounted for.
        getNextParam();
      }
      // TODO From RFC 2811: a, i, m, n, q, p, s, r, t, l, e, I.

      // Keep track of the channel modes in the order they were received.
      channelModes.unshift(aNewMode[i]);
    }

    if (aModeParams.length) {
      this.WARN("Unused mode parameters: " + aModeParams.join(", "));
    }

    // Update the mode of each participant.
    for (const [nick, mode] of userModes.entries()) {
      this.getParticipant(nick).setMode(addNewMode, mode, aSetter);
    }

    // If the topic can now be set (and it couldn't previously) or vice versa,
    // notify the UI. Note that this status can change by either a channel mode
    // or a user mode changing.
    if (this.topicSettable != previousTopicSettable) {
      this.notifyObservers(this, "chat-update-topic");
    }

    // If no channel modes were being set, don't display a message for it.
    if (!channelModes.length) {
      return;
    }

    // Store the channel modes.
    _setMode.call(this, addNewMode, channelModes);

    // Notify the UI of changes.
    msg = lazy._(
      "message.channelmode",
      aNewMode[0] + channelModes.join(""),
      aSetter
    );
    this.writeMessage(aSetter, msg, { system: true });

    this._receivedInitialMode = true;
  },

  setModesFromRestriction(aRestriction) {
    // First remove all types from the list of modes.
    for (const key in this._account.channelRestrictionToModeMap) {
      const mode = this._account.channelRestrictionToModeMap[key];
      this._modes.delete(mode);
    }

    // Add the new mode onto the list.
    if (aRestriction in this._account.channelRestrictionToModeMap) {
      const mode = this._account.channelRestrictionToModeMap[aRestriction];
      if (mode) {
        this._modes.add(mode);
      }
    }
  },

  get topic() {
    return this._topic;
  }, // can't add a setter without redefining the getter
  set topic(aTopic) {
    // Note that the UI isn't updated here because the server will echo back the
    // TOPIC to us and we'll set it on receive.
    this._account.sendMessage("TOPIC", [this.name, aTopic]);
  },
  get topicSettable() {
    // Don't use getParticipant since we don't want to lazily create it!
    const participant = this._participants.get(this.nick);

    // We must be in the room to set the topic.
    if (!participant) {
      return false;
    }

    // If the channel mode is +t, hops and ops can set the topic; otherwise
    // everyone can.
    return !this._modes.has("t") || participant.admin || participant.moderator;
  },
  writeMessage(aWho, aMsg, aObject) {
    const messageProps = this.handleTags(aWho, aMsg, aObject);
    GenericConvChatPrototype.writeMessage.call(this, aWho, aMsg, messageProps);
  },
};
Object.assign(ircChannel.prototype, GenericIRCConversation);

function ircParticipant(aName, aConv) {
  this._name = aName;
  this._conv = aConv;
  this._account = aConv._account;
  this._modes = new Set();

  // Handle multi-prefix modes.
  let i;
  for (
    i = 0;
    i < this._name.length && this._name[i] in this._account.userPrefixToModeMap;
    ++i
  ) {
    const mode = this._account.userPrefixToModeMap[this._name[i]];
    if (mode) {
      this._modes.add(mode);
    }
  }
  this._name = this._name.slice(i);
}
ircParticipant.prototype = {
  __proto__: GenericConvChatBuddyPrototype,

  setMode(aAddNewMode, aNewModes, aSetter) {
    _setMode.call(this, aAddNewMode, aNewModes);

    // Notify the UI of changes.
    const msg = lazy._(
      "message.usermode",
      (aAddNewMode ? "+" : "-") + aNewModes.join(""),
      this.name,
      aSetter
    );
    this._conv.writeMessage(aSetter, msg, { system: true });
    this._conv.notifyObservers(this, "chat-buddy-update");
  },

  get voiced() {
    return this._modes.has("v");
  },
  get moderator() {
    return this._modes.has("h");
  },
  get admin() {
    return this._modes.has("o");
  },
  get founder() {
    return this._modes.has("O") || this._modes.has("q");
  },
  get typing() {
    return false;
  },
};

export function ircConversation(aAccount, aName) {
  const nick = aAccount.normalize(aName);
  if (aAccount.whoisInformation.has(nick)) {
    aName = aAccount.whoisInformation.get(nick).nick;
  }

  this._init(aAccount, aName);
  this._observedNicks = [];

  // Fetch correctly capitalized name.
  // Always request the info as it may be out of date.
  this._waitingForNick = true;
  this.requestCurrentWhois(aName);
}

ircConversation.prototype = {
  __proto__: GenericConvIMPrototype,
  get buddy() {
    return this._account.buddies.get(this.name);
  },

  unInit() {
    this.unInitIRCConversation();
    GenericConvIMPrototype.unInit.call(this);
  },

  updateNick(aNewNick) {
    this._name = aNewNick;
    this.notifyObservers(null, "update-conv-title");
  },
  writeMessage(aWho, aMsg, aObject) {
    const messageProps = this.handleTags(aWho, aMsg, aObject);
    GenericConvIMPrototype.writeMessage.call(this, aWho, aMsg, messageProps);
  },
};
Object.assign(ircConversation.prototype, GenericIRCConversation);

function ircSocket(aAccount) {
  this._account = aAccount;
  this._initCharsetConverter();
}
ircSocket.prototype = {
  __proto__: Socket,
  // Although RFCs 1459 and 2812 explicitly say that \r\n is the message
  // separator, some networks (euIRC) only send \n.
  delimiter: /\r?\n/,
  connectTimeout: 60, // Failure to connect after 1 minute
  readWriteTimeout: 300, // Failure when no data for 5 minutes
  _converter: null,

  sendPing() {
    // Send a ping using the current timestamp as a payload prefixed with
    // an underscore to signify this was an "automatic" PING (used to avoid
    // socket timeouts).
    this._account.sendMessage("PING", "_" + Date.now());
  },

  _initCharsetConverter() {
    try {
      this._converter = new TextDecoder(this._account._encoding);
    } catch (e) {
      delete this._converter;
      this.ERROR(
        "Failed to set character set to: " +
          this._account._encoding +
          " for " +
          this._account.name +
          "."
      );
    }
  },

  // Implement Section 5 of RFC 2812.
  onDataReceived(aRawMessage) {
    let conversionWarning = "";
    if (this._converter) {
      try {
        const buffer = Uint8Array.from(aRawMessage, c => c.charCodeAt(0));
        aRawMessage = this._converter.decode(buffer);
      } catch (e) {
        conversionWarning =
          "\nThis message doesn't seem to be " +
          this._account._encoding +
          " encoded.";
        // Unfortunately, if the unicode converter failed once,
        // it will keep failing so we need to reinitialize it.
        this._initCharsetConverter();
      }
    }

    // We've received data and are past the authentication stage.
    if (this._account.connected) {
      this.resetPingTimer();
    }

    // Low level dequote: replace quote character \020 followed by 0, n, r or
    // \020 with a \0, \n, \r or \020, respectively. Any other character is
    // replaced with itself.
    const lowDequote = { 0: "\0", n: "\n", r: "\r", "\x10": "\x10" };
    const dequotedMessage = aRawMessage.replace(
      // eslint-disable-next-line no-control-regex
      /\x10./g,
      aStr => lowDequote[aStr[1]] || aStr[1]
    );

    try {
      const message = new ircMessage(
        dequotedMessage,
        this._account._currentServerName
      );
      this.DEBUG(JSON.stringify(message) + conversionWarning);
      if (!lazy.ircHandlers.handleMessage(this._account, message)) {
        // If the message was not handled, throw a warning containing
        // the original quoted message.
        this.WARN("Unhandled IRC message:\n" + aRawMessage);
      }
    } catch (e) {
      // Catch the error, display it and hope the connection can continue with
      // this message in error. Errors are also caught inside of handleMessage,
      // but we expect to handle message parsing errors here.
      this.DEBUG(aRawMessage + conversionWarning);
      this.ERROR(e);
    }
  },
  onConnection() {
    this._account._connectionRegistration();
  },
  disconnect() {
    if (!this._account) {
      return;
    }
    Socket.disconnect.call(this);
    delete this._account;
  },

  // Throw errors if the socket has issues.
  onConnectionClosed() {
    // If the account was already disconnected, e.g. in response to
    // onConnectionReset, do nothing.
    if (!this._account) {
      return;
    }
    const msg = "Connection closed by server.";
    if (this._account.disconnecting) {
      // The server closed the connection before we handled the ERROR
      // response to QUIT.
      this.LOG(msg);
      this._account.gotDisconnected();
    } else {
      this.WARN(msg);
      this._account.gotDisconnected(
        Ci.prplIAccount.ERROR_NETWORK_ERROR,
        lazy._("connection.error.lost")
      );
    }
  },
  onConnectionReset() {
    this.WARN("Connection reset.");
    this._account.gotDisconnected(
      Ci.prplIAccount.ERROR_NETWORK_ERROR,
      lazy._("connection.error.lost")
    );
  },
  onConnectionTimedOut() {
    this.WARN("Connection timed out.");
    this._account.gotDisconnected(
      Ci.prplIAccount.ERROR_NETWORK_ERROR,
      lazy._("connection.error.timeOut")
    );
  },
  onConnectionSecurityError(aTLSError, aNSSErrorMessage) {
    this.WARN(
      "Bad certificate or SSL connection for " +
        this._account.name +
        ":\n" +
        aNSSErrorMessage
    );
    const error = this._account.handleConnectionSecurityError(this);
    this._account.gotDisconnected(error, aNSSErrorMessage);
  },

  get DEBUG() {
    return this._account.DEBUG;
  },
  get LOG() {
    return this._account.LOG;
  },
  get WARN() {
    return this._account.WARN;
  },
  get ERROR() {
    return this._account.ERROR;
  },
};

function ircAccountBuddy(aAccount, aBuddy, aTag, aUserName) {
  this._init(aAccount, aBuddy, aTag, aUserName);
}
ircAccountBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,

  // Returns an array of prplITooltipInfo objects to be displayed when the
  // user hovers over the buddy.
  getTooltipInfo() {
    return this._account.getBuddyInfo(this.normalizedName);
  },

  // Allow sending of messages to buddies even if they are not online since IRC
  // does not always provide status information in a timely fashion. (Note that
  // this is OK since the server will throw an error if the user is not online.)
  get canSendMessage() {
    return this.account.connected;
  },

  // Called when the user wants to chat with the buddy.
  createConversation() {
    return this._account.createConversation(this.userName);
  },

  remove() {
    this._account.removeBuddy(this);
    GenericAccountBuddyPrototype.remove.call(this);
  },
};

function ircRoomInfo(aName, aAccount) {
  this.name = aName;
  this._account = aAccount;
}
ircRoomInfo.prototype = {
  __proto__: ClassInfo("prplIRoomInfo", "IRC RoomInfo Object"),
  get topic() {
    return this._account._channelList.get(this.name).topic;
  },
  get participantCount() {
    return this._account._channelList.get(this.name).participantCount;
  },
  get chatRoomFieldValues() {
    return this._account.getChatRoomDefaultFieldValues(this.name);
  },
};

export function ircAccount(aProtocol, aImAccount) {
  this._init(aProtocol, aImAccount);
  this.buddies = new NormalizedMap(this.normalizeNick.bind(this));
  this.conversations = new NormalizedMap(this.normalize.bind(this));

  // Split the account name into usable parts.
  const [accountNickname, server] = this.protocol.splitUsername(this.name);
  this._accountNickname = accountNickname;
  this._server = server;
  // To avoid _currentServerName being null, initialize it to the server being
  // connected to. This will also get overridden during the 001 response from
  // the server.
  this._currentServerName = this._server;

  this._nickname = this._accountNickname;
  this._requestedNickname = this._nickname;

  // For more information, see where these are defined in the prototype below.
  this.trackQueue = [];
  this.pendingIsOnQueue = [];
  this.whoisInformation = new NormalizedMap(this.normalizeNick.bind(this));
  this._requestedCAPs = new Set();
  this._availableCAPs = new Set();
  this._activeCAPs = new Set();
  this._queuedCAPs = [];
  this._commandBuffers = new Map();
  this._roomInfoCallbacks = new Set();
}

ircAccount.prototype = {
  __proto__: GenericAccountPrototype,
  _socket: null,
  _MODE_WALLOPS: 1 << 2, // mode 'w'
  _MODE_INVISIBLE: 1 << 3, // mode 'i'
  get _mode() {
    return 0;
  },

  // The name of the server we last connected to.
  _currentServerName: null,
  // Whether to attempt authenticating with NickServ.
  shouldAuthenticate: true,
  // Whether the user has successfully authenticated with NickServ.
  isAuthenticated: false,
  // The current in use nickname.
  _nickname: null,
  // The nickname stored in the account name.
  _accountNickname: null,
  // The nickname that was last requested by the user.
  _requestedNickname: null,
  // The nickname that was last requested. This can differ from
  // _requestedNickname when a new nick is automatically generated (e.g. by
  // adding digits).
  _sentNickname: null,
  // If we don't get the desired nick on connect, we try again a bit later,
  // to see if it wasn't just our nick not having timed out yet.
  _nickInUseTimeout: null,
  get username() {
    let username;
    // Use a custom username in a hidden preference.
    if (this.prefs.prefHasUserValue("username")) {
      username = this.getString("username");
    }
    // But fallback to brandShortName if no username is provided (or is empty).
    if (!username) {
      username = Services.appinfo.name;
    }

    return username;
  },
  // The prefix minus the nick (!user@host) as returned by the server, this is
  // necessary for guessing message lengths.
  prefix: null,

  // Parts of the specification give max lengths, keep track of them since a
  // server can overwrite them. The defaults given here are from RFC 2812.
  maxNicknameLength: 9, // 1.2.1 Users
  maxChannelLength: 50, // 1.3 Channels
  maxMessageLength: 512, // 2.3 Messages
  maxHostnameLength: 63, // 2.3.1 Message format in Augmented BNF

  // The default prefixes to modes.
  userPrefixToModeMap: { "@": "o", "!": "n", "%": "h", "+": "v" },
  get userPrefixes() {
    return Object.keys(this.userPrefixToModeMap);
  },
  // Modes that have a nickname parameter and affect a participant. See 4.1
  // Member Status of RFC 2811.
  memberStatuses: ["a", "h", "o", "O", "q", "v", "!"],
  channelPrefixes: ["&", "#", "+", "!"], // 1.3 Channels
  channelRestrictionToModeMap: { "@": "s", "*": "p", "=": null }, // 353 RPL_NAMREPLY

  // Handle Scandanavian lower case (optionally remove status indicators).
  // See Section 2.2 of RFC 2812: the characters {}|^ are considered to be the
  // lower case equivalents of the characters []\~, respectively.
  normalizeExpression: /[\x41-\x5E]/g,
  normalize(aStr, aPrefixes) {
    let str = aStr;

    if (aPrefixes) {
      while (aPrefixes.includes(str[0])) {
        str = str.slice(1);
      }
    }

    return str.replace(this.normalizeExpression, c =>
      String.fromCharCode(c.charCodeAt(0) + 0x20)
    );
  },
  normalizeNick(aNick) {
    return this.normalize(aNick, this.userPrefixes);
  },

  isMUCName(aStr) {
    return this.channelPrefixes.includes(aStr[0]);
  },

  // Tell the server about status changes. IRC is only away or not away;
  // consider the away, idle and unavailable status type to be away.
  isAway: false,
  observe(aSubject, aTopic) {
    if (aTopic != "status-changed") {
      return;
    }

    let { statusType: type, statusText: text } = this.imAccount.statusInfo;
    this.DEBUG("New status received:\ntype = " + type + "\ntext = " + text);

    // Tell the server to mark us as away.
    if (type < Ci.imIStatusInfo.STATUS_AVAILABLE) {
      // We have to have a string in order to set IRC as AWAY.
      if (!text) {
        // If no status is given, use the the default idle/away message.
        const IDLE_PREF_BRANCH = "messenger.status.";
        const IDLE_PREF = "defaultIdleAwayMessage";
        text = Services.prefs.getComplexValue(
          IDLE_PREF_BRANCH + IDLE_PREF,
          Ci.nsIPrefLocalizedString
        ).data;

        if (!text) {
          // Get the default value of the localized preference.
          text = Services.prefs
            .getDefaultBranch(IDLE_PREF_BRANCH)
            .getComplexValue(IDLE_PREF, Ci.nsIPrefLocalizedString).data;
        }
        // The last resort, fallback to a non-localized string.
        if (!text) {
          text = "Away";
        }
      }
      this.sendMessage("AWAY", text); // Mark as away.
    } else if (type == Ci.imIStatusInfo.STATUS_AVAILABLE && this.isAway) {
      // Mark as back.
      this.sendMessage("AWAY");
    }
  },

  // The user's user mode.
  _modes: null,
  _userModeReceived: false,
  setUserMode(aNick, aNewModes, aSetter, aDisplayFullMode) {
    if (this.normalizeNick(aNick) != this.normalizeNick(this._nickname)) {
      this.WARN("Received unexpected mode for " + aNick);
      return false;
    }

    // Are modes being added or removed?
    const addNewMode = aNewModes[0] == "+";
    if (!addNewMode && aNewModes[0] != "-") {
      this.WARN("Invalid mode string: " + aNewModes);
      return false;
    }
    _setMode.call(this, addNewMode, aNewModes.slice(1));

    // The server informs us of the user's mode when connecting.
    // We should not report this initial mode message as a mode change
    // initiated by the user, but instead display the full mode
    // and then remember we have done so.
    this._userModeReceived = true;

    if (this._showServerTab) {
      let msg;
      if (aDisplayFullMode) {
        msg = lazy._("message.yourmode", Array.from(this._modes).join(""));
      } else {
        msg = lazy._(
          "message.usermode",
          aNewModes,
          aNick,
          aSetter || this._currentServerName
        );
      }
      this.getConversation(this._currentServerName).writeMessage(
        this._currentServerName,
        msg,
        { system: true }
      );
    }
    return true;
  },

  // Room info: maps channel names to {topic, participantCount}.
  _channelList: new Map(),
  _roomInfoCallbacks: new Set(),
  // If true, we have sent the LIST request and are waiting for replies.
  _pendingList: false,
  // Callbacks receive this many channels per call while results are incoming.
  _channelsPerBatch: 50,
  _currentBatch: [],
  _lastListTime: 0,
  get isRoomInfoStale() {
    return Date.now() - this._lastListTime > kListRefreshInterval;
  },
  // Called by consumers that want a list of available channels, which are
  // provided through the callback (prplIRoomInfoCallback instance).
  requestRoomInfo(aCallback, aIsUserRequest) {
    // Ignore the automaticList pref if the user explicitly requests /list.
    if (
      !aIsUserRequest &&
      !Services.prefs.getBoolPref("chat.irc.automaticList")
    ) {
      // Pretend we can't return roomInfo.
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
    if (this._roomInfoCallbacks.has(aCallback)) {
      // Callback is not new.
      return;
    }
    // Send a LIST request if the channel list is stale and a current request
    // has not been sent.
    if (this.isRoomInfoStale && !this._pendingList) {
      this._channelList = new Map();
      this._currentBatch = [];
      this._pendingList = true;
      this._lastListTime = Date.now();
      this.sendMessage("LIST");
    } else {
      // Otherwise, pass channels that have already been received to the callback.
      const rooms = [...this._channelList.keys()];
      aCallback.onRoomInfoAvailable(rooms, !this._pendingList);
    }

    if (this._pendingList) {
      this._roomInfoCallbacks.add(aCallback);
    }
  },
  // Pass room info for any remaining channels to callbacks and clean up.
  _sendRemainingRoomInfo() {
    if (this._currentBatch.length) {
      for (const callback of this._roomInfoCallbacks) {
        callback.onRoomInfoAvailable(this._currentBatch, true);
      }
    }
    this._roomInfoCallbacks.clear();
    delete this._pendingList;
    delete this._currentBatch;
  },
  getRoomInfo(aName) {
    return new ircRoomInfo(aName, this);
  },

  // The last time a buffered command was sent.
  _lastCommandSendTime: 0,
  // A map from command names to the parameter buffer for that command.
  // This buffer is a map from first parameter to the corresponding (optional)
  // second parameter, to ensure automatic deduplication.
  _commandBuffers: new Map(),
  _handleCommandBuffer(aCommand) {
    const buffer = this._commandBuffers.get(aCommand);
    if (!buffer || !buffer.size) {
      return;
    }
    // This short delay should usually not affect commands triggered by
    // user action, but helps gather commands together which are sent
    // by the prpl on connection (e.g. WHOIS sent in response to incoming
    // WATCH results).
    const kInterval = 1000;
    const delay = kInterval - (Date.now() - this._lastCommandSendTime);
    if (delay > 0) {
      setTimeout(() => this._handleCommandBuffer(aCommand), delay);
      return;
    }
    this._lastCommandSendTime = Date.now();

    const getParams = aItems => {
      // Taking the JOIN use case as an example, aItems is an array
      // of [channel, key] pairs.
      // To work around an inspircd bug (bug 1108596), we reorder
      // the list so that entries with keys appear first.
      const items = aItems.slice().sort(([, k1], [, k2]) => {
        if (!k1 && k2) {
          return 1;
        }
        if (k1 && !k2) {
          return -1;
        }
        return 0;
      });
      // To send the command, we have to group all the channels and keys
      // together, i.e. grab the columns of this matrix, and build the two
      // parameters of the command from that.
      const channels = items.map(([channel]) => channel);
      const keys = items.map(([, key]) => key).filter(key => !!key);
      const params = [channels.join(",")];
      if (keys.length) {
        params.push(keys.join(","));
      }
      return params;
    };
    const tooMany = aItems => {
      const params = getParams(aItems);
      const length = this.countBytes(this.buildMessage(aCommand, params)) + 2;
      return this.maxMessageLength < length;
    };
    const send = aItems => {
      const params = getParams(aItems);
      // Send the command, but don't log the keys.
      this.sendMessage(
        aCommand,
        params,
        aCommand +
          " " +
          params[0] +
          (params.length > 1 ? " <keys not logged>" : "")
      );
    };

    let items = [];
    for (const item of buffer) {
      items.push(item);
      if (tooMany(items)) {
        items.pop();
        send(items);
        items = [item];
      }
    }
    send(items);
    buffer.clear();
  },
  // For commands which allow an arbitrary number of parameters, we use a
  // buffer to send as few commands as possible, by gathering the parameters.
  // On servers which impose command penalties (e.g. inspircd) this helps
  // avoid triggering fakelags by minimizing the command penalty.
  // aParam is the first and aKey the optional second parameter of a command
  // with the syntax <param> *("," <param>) [<key> *("," <key>)]
  // While this code is mostly abstracted, it is currently assumed the second
  // parameter is only used for JOIN.
  sendBufferedCommand(aCommand, aParam, aKey = "") {
    if (!this._commandBuffers.has(aCommand)) {
      this._commandBuffers.set(aCommand, new Map());
    }
    const buffer = this._commandBuffers.get(aCommand);
    // If the buffer is empty, schedule sending the command, otherwise
    // we just need to add the parameter to the buffer.
    // We use executeSoon so as to not delay the sending of these
    // commands when it is not necessary.
    if (!buffer.size) {
      executeSoon(() => this._handleCommandBuffer(aCommand));
    }
    buffer.set(aParam, aKey);
  },

  // The whois information: nicks are used as keys and refer to a map of field
  // to value.
  whoisInformation: null,
  // Request WHOIS information on a buddy when the user requests more
  // information. If we already have some WHOIS information stored for this
  // nick, a notification with this (potentially out-of-date) information
  // is sent out immediately. It is followed by another notification when
  // the current WHOIS data is returned by the server.
  // If you are only interested in the current WHOIS, requestCurrentWhois
  // should be used instead.
  requestBuddyInfo(aBuddyName) {
    if (!this.connected) {
      return;
    }

    // Return what we have stored immediately.
    if (this.whoisInformation.has(aBuddyName)) {
      this.notifyWhois(aBuddyName);
    }

    // Request the current whois and update.
    this.requestCurrentWhois(aBuddyName);
  },
  // Request fresh WHOIS information on a nick.
  requestCurrentWhois(aNick) {
    if (!this.connected) {
      return;
    }

    this.removeBuddyInfo(aNick);
    this.sendBufferedCommand("WHOIS", aNick);
  },
  notifyWhois(aNick) {
    Services.obs.notifyObservers(
      new nsSimpleEnumerator(this.getBuddyInfo(aNick)),
      "user-info-received",
      this.normalizeNick(aNick)
    );
  },
  // Request WHOWAS information on a buddy when the user requests more
  // information.
  requestOfflineBuddyInfo(aBuddyName) {
    this.removeBuddyInfo(aBuddyName);
    this.sendMessage("WHOWAS", aBuddyName);
  },
  // Return an array of prplITooltipInfo for a given nick.
  getBuddyInfo(aNick) {
    if (!this.whoisInformation.has(aNick)) {
      return [];
    }

    const whoisInformation = this.whoisInformation.get(aNick);
    if (whoisInformation.serverName && whoisInformation.serverInfo) {
      whoisInformation.server = lazy._(
        "tooltip.serverValue",
        whoisInformation.serverName,
        whoisInformation.serverInfo
      );
    }

    // Sort the list of channels, ignoring the prefixes of channel and user.
    const prefixes = this.userPrefixes.concat(this.channelPrefixes);
    const sortWithoutPrefix = function (a, b) {
      a = this.normalize(a, prefixes);
      b = this.normalize(b, prefixes);
      if (a < b) {
        return -1;
      }
      return a > b ? 1 : 0;
    }.bind(this);
    const sortChannels = channels =>
      channels.trim().split(/\s+/).sort(sortWithoutPrefix).join(" ");

    // Convert booleans into a human-readable form.
    const normalizeBool = aBool => lazy._(aBool ? "yes" : "no");

    // Convert timespan in seconds into a human-readable form.
    const normalizeTime = function (aTime) {
      const valuesAndUnits = lazy.DownloadUtils.convertTimeUnits(aTime);
      // If the time is exact to the first set of units, trim off
      // the subsequent zeroes.
      if (!valuesAndUnits[2]) {
        valuesAndUnits.splice(2, 2);
      }
      return lazy._("tooltip.timespan", valuesAndUnits.join(" "));
    };

    // List of the names of the info to actually show in the tooltip and
    // optionally a transform function to apply to the value. Each field here
    // maps to tooltip.<fieldname> in irc.properties.
    // See the various RPL_WHOIS* results for the options.
    const kFields = {
      realname: null,
      server: null,
      connectedFrom: null,
      registered: normalizeBool,
      registeredAs: null,
      secure: normalizeBool,
      ircOp: normalizeBool,
      bot: normalizeBool,
      lastActivity: normalizeTime,
      channels: sortChannels,
    };

    const tooltipInfo = [];
    for (const field in kFields) {
      if (whoisInformation.hasOwnProperty(field) && whoisInformation[field]) {
        let value = whoisInformation[field];
        if (kFields[field]) {
          value = kFields[field](value);
        }
        tooltipInfo.push(new TooltipInfo(lazy._("tooltip." + field), value));
      }
    }

    const kSetIdleStatusAfterSeconds = 3600;
    let statusType = Ci.imIStatusInfo.STATUS_AVAILABLE;
    let statusText = "";
    if ("away" in whoisInformation) {
      statusType = Ci.imIStatusInfo.STATUS_AWAY;
      statusText = whoisInformation.away;
    } else if ("offline" in whoisInformation) {
      statusType = Ci.imIStatusInfo.STATUS_OFFLINE;
    } else if (
      "lastActivity" in whoisInformation &&
      whoisInformation.lastActivity > kSetIdleStatusAfterSeconds
    ) {
      statusType = Ci.imIStatusInfo.STATUS_IDLE;
    }
    tooltipInfo.push(
      new TooltipInfo(statusType, statusText, Ci.prplITooltipInfo.status)
    );

    return tooltipInfo;
  },
  // Remove a WHOIS entry.
  removeBuddyInfo(aNick) {
    return this.whoisInformation.delete(aNick);
  },
  // Copies the fields of aFields into the whois table. If the field already
  // exists, that field is ignored (it is assumed that the first server response
  // is the most up to date information, as is the case for 312/314). Note that
  // the whois info for a nick is reset whenever whois information is requested,
  // so the first response from each whois is recorded.
  setWhois(aNick, aFields = {}) {
    // If the nickname isn't in the list yet, add it.
    if (!this.whoisInformation.has(aNick)) {
      this.whoisInformation.set(aNick, {});
    }

    // Set non-normalized nickname field.
    const whoisInfo = this.whoisInformation.get(aNick);
    whoisInfo.nick = aNick;

    // Set the WHOIS fields, but only the first time a field is set.
    for (const field in aFields) {
      if (!whoisInfo.hasOwnProperty(field)) {
        whoisInfo[field] = aFields[field];
      }
    }

    return true;
  },

  trackBuddy(aNick) {
    // Put the username as the first to be checked on the next ISON call.
    this.trackQueue.unshift(aNick);
  },
  untrackBuddy(aNick) {
    const index = this.trackQueue.indexOf(aNick);
    if (index < 0) {
      this.ERROR(
        "Trying to untrack a nick that was not being tracked: " + aNick
      );
      return;
    }
    this.trackQueue.splice(index, 1);
  },
  addBuddy(aTag, aName) {
    const buddy = new ircAccountBuddy(this, null, aTag, aName);
    this.buddies.set(buddy.normalizedName, buddy);
    this.trackBuddy(buddy.userName);

    IMServices.contacts.accountBuddyAdded(buddy);
  },
  removeBuddy(aBuddy) {
    this.buddies.delete(aBuddy.normalizedName);
    this.untrackBuddy(aBuddy.userName);
  },
  // Loads a buddy from the local storage. Called for each buddy locally stored
  // before connecting to the server.
  loadBuddy(aBuddy, aTag) {
    const buddy = new ircAccountBuddy(this, aBuddy, aTag);
    this.buddies.set(buddy.normalizedName, buddy);
    this.trackBuddy(buddy.userName);

    return buddy;
  },
  changeBuddyNick(aOldNick, aNewNick) {
    if (this.normalizeNick(aOldNick) == this.normalizeNick(this._nickname)) {
      // Your nickname changed!
      this._nickname = aNewNick;
      this.conversations.forEach(conversation => {
        // Update the nick for chats, and inform the user in every conversation.
        if (conversation.isChat) {
          conversation.updateNick(aOldNick, aNewNick, true);
        } else {
          conversation.writeMessage(
            aOldNick,
            lazy._conv("nickSet.you", aNewNick),
            {
              system: true,
            }
          );
        }
      });
    } else {
      this.conversations.forEach(conversation => {
        if (conversation.isChat && conversation._participants.has(aOldNick)) {
          // Update the nick in every chat conversation it is in.
          conversation.updateNick(aOldNick, aNewNick, false);
        }
      });
    }

    // Adjust the whois table where necessary.
    this.removeBuddyInfo(aOldNick);
    this.setWhois(aNewNick);

    // If a private conversation is open with that user, change its title.
    if (this.conversations.has(aOldNick)) {
      // Get the current conversation and rename it.
      const conversation = this.getConversation(aOldNick);

      // Remove the old reference to the conversation and create a new one.
      this.removeConversation(aOldNick);
      this.conversations.set(aNewNick, conversation);

      conversation.updateNick(aNewNick);
      conversation.writeMessage(
        aOldNick,
        lazy._conv("nickSet", aOldNick, aNewNick),
        { system: true }
      );
    }
  },

  /*
   * Ask the server to change the user's nick.
   */
  changeNick(aNewNick) {
    this._sentNickname = aNewNick;
    this.sendMessage("NICK", aNewNick); // Nick message.
  },
  /*
   * Generate a new nick to change to if the user requested nick is already in
   * use or is otherwise invalid.
   *
   * First try all the alternate nicks that were chosen by the user, and if none
   * of them work, then generate a new nick by:
   *  1. If there was not a digit at the end of the nick, append a 1.
   *  2. If there was a digit, then increment the number.
   *  3. Add leading 0s back on.
   *  4. Ensure the nick is an appropriate length.
   */
  tryNewNick(aOldNick) {
    // Split the string on commas, remove whitespace around the nicks and
    // remove empty nicks.
    const allNicks = this.getString("alternateNicks")
      .split(",")
      .map(n => n.trim())
      .filter(n => !!n);
    allNicks.unshift(this._accountNickname);

    // If the previously tried nick is in the array and not the last
    // element, try the next nick in the array.
    const oldIndex = allNicks.indexOf(aOldNick);
    if (oldIndex != -1 && oldIndex < allNicks.length - 1) {
      const newNick = allNicks[oldIndex + 1];
      this.LOG(aOldNick + " is already in use, trying " + newNick);
      this.changeNick(newNick);
      return true;
    }

    // Separate the nick into the text and digits part.
    const kNickPattern = /^(.+?)(\d*)$/;
    const nickParts = kNickPattern.exec(aOldNick);
    let newNick = nickParts[1];

    // No nick found from the user's preferences, so just generating one.
    // If there is not a digit at the end of the nick, just append 1.
    let newDigits = "1";
    // If there is a digit at the end of the nick, increment it.
    if (nickParts[2]) {
      newDigits = (parseInt(nickParts[2], 10) + 1).toString();
      // If there are leading 0s, add them back on, after we've incremented (e.g.
      // 009 --> 010).
      const numLeadingZeros = nickParts[2].length - newDigits.length;
      if (numLeadingZeros > 0) {
        newDigits = "0".repeat(numLeadingZeros) + newDigits;
      }
    }

    // Servers truncate nicks that are too long, compare the previously sent
    // nickname with the returned nickname and check for truncation.
    if (aOldNick.length < this._sentNickname.length) {
      // The nick will be too long, overwrite the end of the nick instead of
      // appending.
      const maxLength = aOldNick.length;

      const sentNickParts = kNickPattern.exec(this._sentNickname);
      // Resend the same digits as last time, but overwrite part of the nick
      // this time.
      if (nickParts[2] && sentNickParts[2]) {
        newDigits = sentNickParts[2];
      }

      // Handle the silly case of a single letter followed by all nines.
      if (newDigits.length == this.maxNicknameLength) {
        newDigits = newDigits.slice(1);
      }
      newNick = newNick.slice(0, maxLength - newDigits.length);
    }
    // Append the digits.
    newNick += newDigits;

    if (this.normalize(newNick) == this.normalize(this._nickname)) {
      // The nick we were about to try next is our current nick. This means
      // the user attempted to change to a version of the nick with a lower or
      // absent number suffix, and this failed.
      const msg = lazy._("message.nick.fail", this._nickname);
      this.conversations.forEach(conversation =>
        conversation.writeMessage(this._nickname, msg, { system: true })
      );
      return true;
    }

    this.LOG(aOldNick + " is already in use, trying " + newNick);
    this.changeNick(newNick);
    return true;
  },

  handlePingReply(aSource, aPongTime) {
    // Received PING response, display to the user.
    const sentTime = new Date(parseInt(aPongTime, 10));

    // The received timestamp is invalid.
    if (isNaN(sentTime)) {
      this.WARN(
        aSource + " returned an invalid timestamp from a PING: " + aPongTime
      );
      return false;
    }

    // Find the delay in milliseconds.
    const delay = Date.now() - sentTime;

    // If the delay is negative or greater than 1 minute, something is
    // feeding us a crazy value. Don't display this to the user.
    if (delay < 0 || 60 * 1000 < delay) {
      this.WARN(aSource + " returned an invalid delay from a PING: " + delay);
      return false;
    }

    const msg = lazy.PluralForm.get(
      delay,
      lazy._("message.ping", aSource)
    ).replace("#2", delay);
    this.getConversation(aSource).writeMessage(aSource, msg, { system: true });
    return true;
  },

  countBytes(aStr) {
    // Assume that if it's not UTF-8 then each character is 1 byte.
    if (this._encoding != "UTF-8") {
      return aStr.length;
    }

    // Count the number of bytes in a UTF-8 encoded string.
    function charCodeToByteCount(c) {
      // UTF-8 stores:
      // - code points below U+0080 are 1 byte,
      // - code points below U+0800 are 2 bytes,
      // - code points U+D800 through U+DFFF are UTF-16 surrogate halves
      // (they indicate that JS has split a 4 bytes UTF-8 character
      // in two halves of 2 bytes each),
      // - other code points are 3 bytes.
      if (c < 0x80) {
        return 1;
      }
      if (c < 0x800 || (c >= 0xd800 && c <= 0xdfff)) {
        return 2;
      }
      return 3;
    }
    let bytes = 0;
    for (let i = 0; i < aStr.length; i++) {
      bytes += charCodeToByteCount(aStr.charCodeAt(i));
    }
    return bytes;
  },

  // To check if users are online, we need to queue multiple messages.
  // An internal queue of all nicks that we wish to know the status of.
  trackQueue: [],
  // The nicks that were last sent to the server that we're waiting for a
  // response about.
  pendingIsOnQueue: [],
  // The time between sending isOn messages (milliseconds).
  _isOnDelay: 60 * 1000,
  _isOnTimer: null,
  // The number of characters that are available to be filled with nicks for
  // each ISON message.
  _isOnLength: null,
  // Generate and send an ISON message to poll for each nick's status.
  sendIsOn() {
    // If no buddies, just look again after the timeout.
    if (this.trackQueue.length) {
      // Calculate the possible length of names we can send.
      if (!this._isOnLength) {
        const length = this.countBytes(this.buildMessage("ISON", " ")) + 2;
        this._isOnLength = this.maxMessageLength - length + 1;
      }

      // Always add the next nickname to the pending queue, this handles a silly
      // case where the next nick is greater than or equal to the maximum
      // message length.
      this.pendingIsOnQueue = [this.trackQueue.shift()];

      // Attempt to maximize the characters used in each message, this may mean
      // that a specific user gets sent very often since they have a short name!
      let buddiesLength = this.countBytes(this.pendingIsOnQueue[0]);
      for (let i = 0; i < this.trackQueue.length; ++i) {
        // If we can fit the nick, add it to the current buffer.
        if (
          buddiesLength + this.countBytes(this.trackQueue[i]) <
          this._isOnLength
        ) {
          // Remove the name from the list and add it to the pending queue.
          const nick = this.trackQueue.splice(i--, 1)[0];
          this.pendingIsOnQueue.push(nick);

          // Keep track of the length of the string, the + 1 is for the spaces.
          buddiesLength += this.countBytes(nick) + 1;

          // If we've filled up the message, stop looking for more nicks.
          if (buddiesLength >= this._isOnLength) {
            break;
          }
        }
      }

      // Send the message.
      this.sendMessage("ISON", this.pendingIsOnQueue.join(" "));

      // Append the pending nicks so trackQueue contains all the nicks.
      this.trackQueue = this.trackQueue.concat(this.pendingIsOnQueue);
    }

    // Call this function again in _isOnDelay seconds.
    // This makes the assumption that this._isOnDelay >> the response to ISON
    // from the server.
    this._isOnTimer = setTimeout(this.sendIsOn.bind(this), this._isOnDelay);
  },

  // The message of the day uses two fields to append messages.
  _motd: null,
  _motdTimer: null,

  connect() {
    this.reportConnecting();

    // Mark existing MUCs as joining if they will be rejoined.
    this.conversations.forEach(conversation => {
      if (conversation.isChat && conversation.chatRoomFields) {
        conversation.joining = true;
      }
    });

    // Load preferences.
    this._port = this.getInt("port");
    this._ssl = this.getBool("ssl");

    // Use the display name as the user's real name.
    this._realname = this.imAccount.statusInfo.displayName;
    this._encoding = this.getString("encoding") || "UTF-8";
    this._showServerTab = this.getBool("showServerTab");

    // Open the socket connection.
    this._socket = new ircSocket(this);
    this._socket.connect(this._server, this._port, this._ssl ? ["ssl"] : []);
  },

  // Functions for keeping track of whether the Client Capabilities is done.
  // If a cap is to be handled, it should be registered with addCAP, where aCAP
  // is a "unique" string defining what is being handled. When the cap is done
  // being handled removeCAP should be called with the same string.
  _availableCAPs: new Set(),
  _activeCAPs: new Set(),
  _requestedCAPs: new Set(),
  _negotiatedCAPs: false,
  _queuedCAPs: [],
  addCAP(aCAP) {
    if (this.connected) {
      this.ERROR("Trying to add CAP " + aCAP + " after connection.");
      return;
    }

    this._requestedCAPs.add(aCAP);
  },
  removeCAP(aDoneCAP) {
    if (!this._requestedCAPs.has(aDoneCAP)) {
      this.ERROR(
        "Trying to remove a CAP (" + aDoneCAP + ") which isn't added."
      );
      return;
    }
    if (this.connected) {
      this.ERROR("Trying to remove CAP " + aDoneCAP + " after connection.");
      return;
    }

    // Remove any reference to the given capability.
    this._requestedCAPs.delete(aDoneCAP);

    // However only notify the server the first time during cap negotiation, not
    // when the server exposes a new cap.
    if (!this._requestedCAPs.size && !this._negotiatedCAPs) {
      this.sendMessage("CAP", "END");
      this._negotiatedCAPs = true;
    }
  },

  // Used to wait for a response from the server.
  _quitTimer: null,
  // RFC 2812 Section 3.1.7.
  quit(aMessage) {
    this._reportDisconnecting(Ci.prplIAccount.NO_ERROR);
    this.sendMessage(
      "QUIT",
      aMessage || this.getString("quitmsg") || undefined
    );
  },
  // When the user clicks "Disconnect" in account manager, or uses /quit.
  // aMessage is an optional parameter containing the quit message.
  disconnect(aMessage) {
    if (this.disconnected || this.disconnecting) {
      return;
    }

    // If there's no socket, disconnect immediately to avoid waiting 2 seconds.
    if (!this._socket || this._socket.disconnected) {
      this.gotDisconnected();
      return;
    }

    // Let the server know we're going to disconnect.
    this.quit(aMessage);

    // Reset original nickname for the next reconnect.
    this._requestedNickname = this._accountNickname;

    // Give the server 2 seconds to respond, otherwise just forcefully
    // disconnect the socket. This will be cancelled if a response is heard from
    // the server.
    this._quitTimer = setTimeout(this.gotDisconnected.bind(this), 2 * 1000);
  },

  createConversation(aName) {
    return this.getConversation(aName);
  },

  // aComponents implements prplIChatRoomFieldValues.
  joinChat(aComponents) {
    let channel = aComponents.getValue("channel");
    // Mildly sanitize input.
    channel = channel.trimLeft().split(",")[0].split(" ")[0];
    if (!channel) {
      this.ERROR("joinChat called without a valid channel name.");
      return null;
    }

    // A channel prefix is required. If the user didn't include one,
    // we prepend # automatically to match the behavior of other
    // clients. Not doing it used to cause user confusion.
    if (!this.channelPrefixes.includes(channel[0])) {
      channel = "#" + channel;
    }

    if (this.conversations.has(channel)) {
      const conv = this.getConversation(channel);
      if (!conv.left) {
        // No need to join a channel we are already in.
        return conv;
      } else if (!conv.chatRoomFields) {
        // We are rejoining a channel that was parted by the user.
        conv._rejoined = true;
      }
    }

    const key = aComponents.getValue("password");
    this.sendBufferedCommand("JOIN", channel, key);

    // Open conversation early for better responsiveness.
    const conv = this.getConversation(channel);
    conv.joining = true;

    // Store the prplIChatRoomFieldValues to enable later reconnections.
    const defaultName = key ? channel + " " + key : channel;
    conv.chatRoomFields = this.getChatRoomDefaultFieldValues(defaultName);

    return conv;
  },

  chatRoomFields: {
    channel: {
      get label() {
        return lazy._("joinChat.channel");
      },
      required: true,
    },
    password: {
      get label() {
        return lazy._("joinChat.password");
      },
      isPassword: true,
    },
  },

  parseDefaultChatName(aDefaultName) {
    const params = aDefaultName.trim().split(/\s+/);
    const chatFields = { channel: params[0] };
    if (params.length > 1) {
      chatFields.password = params[1];
    }
    return chatFields;
  },

  // Attributes
  get canJoinChat() {
    return true;
  },

  // Returns a conversation (creates it if it doesn't exist)
  getConversation(aName) {
    if (!this.conversations.has(aName)) {
      // If the whois information has been received, we have the proper nick
      // capitalization.
      if (this.whoisInformation.has(aName)) {
        aName = this.whoisInformation.get(aName).nick;
      }
      const convClass = this.isMUCName(aName) ? ircChannel : ircConversation;
      this.conversations.set(aName, new convClass(this, aName, this._nickname));
    }
    return this.conversations.get(aName);
  },

  removeConversation(aConversationName) {
    if (this.conversations.has(aConversationName)) {
      this.conversations.delete(aConversationName);
    }
  },

  // This builds the message string that will be sent to the server.
  buildMessage(aCommand, aParams = []) {
    if (!aCommand) {
      this.ERROR("IRC messages must have a command.");
      return null;
    }

    // Ensure a command is only characters or numbers.
    if (!/^[A-Z0-9]+$/i.test(aCommand)) {
      this.ERROR("IRC command invalid: " + aCommand);
      return null;
    }

    let message = aCommand;
    // If aParams is not an array, consider it to be a single parameter and put
    // it into an array.
    const params = Array.isArray(aParams) ? aParams : [aParams];
    if (params.length) {
      if (params.slice(0, -1).some(p => p.includes(" "))) {
        this.ERROR("IRC parameters cannot have spaces: " + params.slice(0, -1));
        return null;
      }
      // Join the parameters with spaces. There are three cases in which the
      // last parameter ("trailing" in RFC 2812) must be prepended with a colon:
      //  1. If the last parameter contains a space.
      //  2. If the first character of the last parameter is a colon.
      //  3. If the last parameter is an empty string.
      const trailing = params.slice(-1)[0];
      if (
        !trailing.length ||
        trailing.includes(" ") ||
        trailing.startsWith(":")
      ) {
        params.push(":" + params.pop());
      }
      message += " " + params.join(" ");
    }

    return message;
  },

  // Shortcut method to build & send a message at once. Use aLoggedData to log
  // something different than what is actually sent.
  // Returns false if the message could not be sent.
  sendMessage(aCommand, aParams, aLoggedData) {
    return this.sendRawMessage(
      this.buildMessage(aCommand, aParams),
      aLoggedData
    );
  },

  // This sends a message over the socket and catches any errors. Use
  // aLoggedData to log something different than what is actually sent.
  // Returns false if the message could not be sent.
  sendRawMessage(aMessage, aLoggedData) {
    // Low level quoting, replace \0, \n, \r or \020 with \0200, \020n, \020r or
    // \020\020, respectively.
    const lowQuote = { "\0": "0", "\n": "n", "\r": "r", "\x10": "\x10" };
    const lowRegex = new RegExp(
      "[" + Object.keys(lowQuote).join("") + "]",
      "g"
    );
    aMessage = aMessage.replace(lowRegex, aChar => "\x10" + lowQuote[aChar]);

    if (!this._socket || this._socket.disconnected) {
      this.gotDisconnected(
        Ci.prplIAccount.ERROR_NETWORK_ERROR,
        lazy._("connection.error.lost")
      );
    }

    const length = this.countBytes(aMessage) + 2;
    if (length > this.maxMessageLength) {
      // Log if the message is too long, but try to send it anyway.
      this.WARN(
        "Message length too long (" +
          length +
          " > " +
          this.maxMessageLength +
          "\n" +
          aMessage
      );
    }

    aMessage += "\r\n";

    try {
      this._socket.sendString(aMessage, this._encoding, aLoggedData);
      return true;
    } catch (e) {
      try {
        this._socket.sendData(aMessage, aLoggedData);
        this.WARN(
          "Failed to convert " +
            aMessage +
            " from Unicode to " +
            this._encoding +
            "."
        );
        return true;
      } catch (e) {
        this.ERROR("Socket error:", e);
        this.gotDisconnected(
          Ci.prplIAccount.ERROR_NETWORK_ERROR,
          lazy._("connection.error.lost")
        );
        return false;
      }
    }
  },

  // CTCP messages are \001<COMMAND> [<parameters>]*\001.
  // Returns false if the message could not be sent.
  sendCTCPMessage(aTarget, aIsNotice, aCtcpCommand, aParams = []) {
    // Combine the CTCP command and parameters into the single IRC param.
    let ircParam = aCtcpCommand;
    // If aParams is not an array, consider it to be a single parameter and put
    // it into an array.
    const params = Array.isArray(aParams) ? aParams : [aParams];
    if (params.length) {
      ircParam += " " + params.join(" ");
    }

    // High/CTCP level quoting, replace \134 or \001 with \134\134 or \134a,
    // respectively. This is only done inside the extended data message.
    // eslint-disable-next-line no-control-regex
    const highRegex = /\\|\x01/g;
    ircParam = ircParam.replace(
      highRegex,
      aChar => "\\" + (aChar == "\\" ? "\\" : "a")
    );

    // Add the CTCP tagging.
    ircParam = "\x01" + ircParam + "\x01";

    // Send the IRC message as a NOTICE or PRIVMSG.
    return this.sendMessage(aIsNotice ? "NOTICE" : "PRIVMSG", [
      aTarget,
      ircParam,
    ]);
  },

  // Implement section 3.1 of RFC 2812
  _connectionRegistration() {
    // Send the Client Capabilities list command version 3.2.
    this.sendMessage("CAP", ["LS", "302"]);

    if (this.prefs.prefHasUserValue("serverPassword")) {
      this.sendMessage(
        "PASS",
        this.getString("serverPassword"),
        "PASS <password not logged>"
      );
    }

    // Send the nick message (section 3.1.2).
    this.changeNick(this._requestedNickname);

    // Send the user message (section 3.1.3).
    this.sendMessage("USER", [
      this.username,
      this._mode.toString(),
      "*",
      this._realname || this._requestedNickname,
    ]);
  },

  _reportDisconnecting(aErrorReason, aErrorMessage) {
    this.reportDisconnecting(aErrorReason, aErrorMessage);

    // Cancel any pending buffered commands.
    this._commandBuffers.clear();

    // Mark all contacts on the account as having an unknown status.
    this.buddies.forEach(aBuddy =>
      aBuddy.setStatus(Ci.imIStatusInfo.STATUS_UNKNOWN, "")
    );
  },

  gotDisconnected(aError = Ci.prplIAccount.NO_ERROR, aErrorMessage = "") {
    if (!this.imAccount || this.disconnected) {
      return;
    }

    // If we are already disconnecting, this call to gotDisconnected
    // is when the server acknowledges our disconnection.
    // Otherwise it's because we lost the connection.
    if (!this.disconnecting) {
      this._reportDisconnecting(aError, aErrorMessage);
    }
    this._socket.disconnect();
    delete this._socket;

    // Reset cap negotiation.
    this._availableCAPs.clear();
    this._activeCAPs.clear();
    this._requestedCAPs.clear();
    this._negotiatedCAPs = false;
    this._queuedCAPs.length = 0;

    clearTimeout(this._isOnTimer);
    delete this._isOnTimer;

    // No need to call gotDisconnected a second time.
    clearTimeout(this._quitTimer);
    delete this._quitTimer;

    // MOTD will be resent.
    delete this._motd;
    clearTimeout(this._motdTimer);
    delete this._motdTimer;

    // We must authenticate if we reconnect.
    delete this.isAuthenticated;

    // Clear any pending attempt to regain our nick.
    clearTimeout(this._nickInUseTimeout);
    delete this._nickInUseTimeout;

    // Clean up each conversation: mark as left and remove participant.
    this.conversations.forEach(conversation => {
      if (conversation.isChat) {
        conversation.joining = false; // In case we never finished joining.
        if (!conversation.left) {
          // Remove the user's nick and mark the conversation as left as that's
          // the final known state of the room.
          conversation.removeParticipant(this._nickname);
          conversation.left = true;
        }
      }
    });

    // If we disconnected during a pending LIST request, make sure callbacks
    // receive any remaining channels.
    if (this._pendingList) {
      this._sendRemainingRoomInfo();
    }

    // Clear whois table.
    this.whoisInformation.clear();

    this.reportDisconnected();
  },

  remove() {
    this.conversations.forEach(conv => conv.close());
    delete this.conversations;
    this.buddies.forEach(aBuddy => aBuddy.remove());
    delete this.buddies;
  },

  unInit() {
    // Disconnect if we're online while this gets called.
    if (this._socket) {
      if (!this.disconnecting) {
        this.quit();
      }
      this._socket.disconnect();
    }
    delete this.imAccount;
    clearTimeout(this._isOnTimer);
    clearTimeout(this._quitTimer);
  },
};
