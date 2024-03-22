/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This implements the ISUPPORT parameters for the 005 numeric to allow a server
 * to notify a client of what capabilities it supports.
 *   The 005 numeric
 *     http://www.irc.org/tech_docs/005.html
 *   RFC Drafts: IRC RPL_ISUPPORT Numeric Definition
 *     https://tools.ietf.org/html/draft-brocklesby-irc-isupport-03
 *     https://tools.ietf.org/html/draft-hardy-irc-isupport-00
 */

import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";

/*
 * Parses an ircMessage into an ISUPPORT message for each token of the form:
 *   <parameter>=<value> or -<value>
 * The isupport field is added to the message and it has the following fields:
 *   parameter  What is being configured by this ISUPPORT token.
 *   useDefault Whether this parameter should be reset to the default value, as
 *              defined by the RFC.
 *   value      The new value for the parameter.
 */
function isupportMessage(aMessage) {
  // Separate the ISUPPORT parameters.
  const tokens = aMessage.params.slice(1, -1);

  const message = aMessage;
  message.isupport = {};

  return tokens.map(function (aToken) {
    const newMessage = JSON.parse(JSON.stringify(message));
    newMessage.isupport.useDefault = aToken[0] == "-";
    const token = (
      newMessage.isupport.useDefault ? aToken.slice(1) : aToken
    ).split("=");
    newMessage.isupport.parameter = token[0];
    newMessage.isupport.value = token[1] || null;
    return newMessage;
  });
}

export var ircISUPPORT = {
  name: "ISUPPORT",
  // Slightly above default RFC 2812 priority.
  priority: ircHandlerPriorities.DEFAULT_PRIORITY + 10,
  isEnabled: () => true,

  commands: {
    // RPL_ISUPPORT
    // [-]<parameter>[=<value>] :are supported by this server
    "005": function (message, ircHandlers) {
      let messages = isupportMessage(message);

      messages = messages.filter(
        aMessage => !ircHandlers.handleISUPPORTMessage(this, aMessage)
      );
      if (messages.length) {
        // Display the list of unhandled ISUPPORT messages.
        const unhandledMessages = messages
          .map(aMsg => aMsg.isupport.parameter)
          .join(" ");
        this.LOG(
          "Unhandled ISUPPORT messages: " +
            unhandledMessages +
            "\nRaw message: " +
            message.rawMessage
        );
      }

      return true;
    },
  },
};

function setSimpleNumber(aAccount, aField, aMessage, aDefaultValue) {
  const value = aMessage.isupport.value
    ? Number(aMessage.isupport.value)
    : null;
  aAccount[aField] = value && !isNaN(value) ? value : aDefaultValue;
  return true;
}

// Generates an expression to search for the ASCII range of a-b.
function generateNormalize(a, b) {
  return new RegExp(
    "[\\x" + a.toString(16) + "-\\x" + b.toString(16) + "]",
    "g"
  );
}

export var isupportBase = {
  name: "ISUPPORT",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    CASEMAPPING(aMessage) {
      // CASEMAPPING=<mapping>
      // Allows the server to specify which method it uses to compare equality
      // of case-insensitive strings.

      // By default, use rfc1459 type case mapping.
      const value = aMessage.isupport.useDefault
        ? "rfc1493"
        : aMessage.isupport.value;

      // Set the normalize function of the account to use the proper case
      // mapping.
      if (value == "ascii") {
        // The ASCII characters 97 to 122 (decimal) are the lower-case
        // characters of ASCII 65 to 90 (decimal).
        this.normalizeExpression = generateNormalize(65, 90);
      } else if (value == "rfc1493") {
        // The ASCII characters 97 to 126 (decimal) are the lower-case
        // characters of ASCII 65 to 94 (decimal).
        this.normalizeExpression = generateNormalize(65, 94);
      } else if (value == "strict-rfc1459") {
        // The ASCII characters 97 to 125 (decimal) are the lower-case
        // characters of ASCII 65 to 93 (decimal).
        this.normalizeExpression = generateNormalize(65, 93);
      }
      return true;
    },
    CHANLIMIT(aMessage) {
      // CHANLIMIT=<prefix>:<number>[,<prefix>:<number>]*
      // Note that each <prefix> can actually contain multiple prefixes, this
      // means the sum of those prefixes is given.
      this.maxChannels = {};

      const pairs = aMessage.isupport.value.split(",");
      for (const pair of pairs) {
        const [prefix, num] = pair.split(":");
        this.maxChannels[prefix] = num;
      }
      return true;
    },
    CHANMODES: () => false,
    CHANNELLEN(aMessage) {
      // CHANNELLEN=<number>
      // Default is from RFC 1493.
      return setSimpleNumber(this, "maxChannelLength", aMessage, 200);
    },
    CHANTYPES(aMessage) {
      // CHANTYPES=[<channel prefix>]*
      const value = aMessage.isupport.useDefault
        ? "#&"
        : aMessage.isupport.value;
      this.channelPrefixes = value.split("");
      return true;
    },
    EXCEPTS: () => false,
    IDCHAN: () => false,
    INVEX: () => false,
    KICKLEN(aMessage) {
      // KICKLEN=<number>
      // Default value is Infinity.
      return setSimpleNumber(this, "maxKickLength", aMessage, Infinity);
    },
    MAXLIST: () => false,
    MODES: () => false,
    NETWORK: () => false,
    NICKLEN(aMessage) {
      // NICKLEN=<number>
      // Default value is from RFC 1493.
      return setSimpleNumber(this, "maxNicknameLength", aMessage, 9);
    },
    PREFIX(aMessage) {
      // PREFIX=[(<mode character>*)<prefix>*]
      const value = aMessage.isupport.useDefault
        ? "(ov)@+"
        : aMessage.isupport.value;

      this.userPrefixToModeMap = {};
      // A null value specifier indicates that no prefixes are supported.
      if (!value.length) {
        return true;
      }

      const matches = /\(([a-z]*)\)(.*)/i.exec(value);
      if (!matches) {
        // The pattern doesn't match.
        this.WARN("Invalid PREFIX value: " + value);
        return false;
      }
      if (matches[1].length != matches[2].length) {
        this.WARN(
          "Invalid PREFIX value, does not provide one-to-one mapping:" + value
        );
        return false;
      }

      for (let i = 0; i < matches[2].length; i++) {
        this.userPrefixToModeMap[matches[2][i]] = matches[1][i];
      }
      return true;
    },
    // SAFELIST allows the client to request the server buffer LIST responses to
    // avoid flooding the client. This is not an issue for us, so just ignore
    // it.
    SAFELIST: () => true,
    // SECURELIST tells us that the server won't send LIST data directly after
    // connection. Unfortunately, the exact time the client has to wait is
    // configurable, so we can't do anything with this information.
    SECURELIST: () => true,
    STATUSMSG: () => false,
    STD(aMessage) {
      // This was never updated as the RFC was never formalized.
      if (aMessage.isupport.value != "rfcnnnn") {
        this.WARN("Unknown ISUPPORT numeric form: " + aMessage.isupport.value);
      }
      return true;
    },
    TARGMAX(aMessage) {
      // TARGMAX=<command>:<max targets>[,<command>:<max targets>]*
      if (aMessage.isupport.useDefault) {
        this.maxTargets = 1;
        return true;
      }

      this.maxTargets = {};
      const commands = aMessage.isupport.value.split(",");
      for (let i = 0; i < commands.length; i++) {
        const [command, limitStr] = commands[i].split("=");
        const limit = limitStr ? Number(limit) : Infinity;
        if (isNaN(limit)) {
          this.WARN("Invalid maximum number of targets: " + limitStr);
          continue;
        }
        this.maxTargets[command] = limit;
      }
      return true;
    },
    TOPICLEN(aMessage) {
      // TOPICLEN=<number>
      // Default value is Infinity.
      return setSimpleNumber(this, "maxTopicLength", aMessage, Infinity);
    },

    // The following are considered "obsolete" by the RFC, but are still in use.
    CHARSET: () => false,
    MAXBANS: () => false,
    MAXCHANNELS: () => false,
    MAXTARGETS(aMessage) {
      return setSimpleNumber(this, "maxTargets", aMessage, 1);
    },
  },
};
