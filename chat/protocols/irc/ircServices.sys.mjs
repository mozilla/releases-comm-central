/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This attempts to handle dealing with IRC services, which are a diverse set of
 * programs to automate and add features to IRCd. Often these services are seen
 * with the names NickServ, ChanServ, OperServ and MemoServ; but other services
 * do exist and are in use.
 *
 * Since the "protocol" behind services is really just text-based, human
 * readable messages, attempt to parse them, but always fall back to just
 * showing the message to the user if we're unsure what to do.
 *
 * Anope
 *  https://www.anope.org/docgen/1.8/
 */

import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";

/*
 * If a service is found, an extra field (serviceName) is added with the
 * "generic" service name (e.g. a bot which performs NickServ like functionality
 * will be mapped to NickServ).
 */
function ServiceMessage(aAccount, aMessage) {
  // This should be a property of the account or configurable somehow, it maps
  // from server specific service names to our generic service names (e.g. if
  // irc.foo.net has a service called bar, which acts as a NickServ, we would
  // map "bar": "NickServ"). Note that the keys of this map should be
  // normalized.
  const nicknameToServiceName = {
    chanserv: "ChanServ",
    infoserv: "InfoServ",
    nickserv: "NickServ",
    saslserv: "SaslServ",
    "freenode-connect": "freenode-connect",
  };

  const nickname = aAccount.normalize(aMessage.origin);
  if (nicknameToServiceName.hasOwnProperty(nickname)) {
    aMessage.serviceName = nicknameToServiceName[nickname];
  }

  return aMessage;
}

export var ircServices = {
  name: "IRC Services",
  priority: ircHandlerPriorities.HIGH_PRIORITY,
  isEnabled: () => true,
  sendIdentify(aAccount) {
    if (
      aAccount.imAccount.password &&
      aAccount.shouldAuthenticate &&
      !aAccount.isAuthenticated
    ) {
      aAccount.sendMessage(
        "IDENTIFY",
        aAccount.imAccount.password,
        "IDENTIFY <password not logged>"
      );
    }
  },

  commands: {
    // If we automatically reply to a NOTICE message this does not abide by RFC
    // 2812. Oh well.
    NOTICE(ircMessage, ircHandlers) {
      if (!ircHandlers.hasServicesHandlers) {
        return false;
      }

      const message = ServiceMessage(this, ircMessage);

      // If no service was found, return early.
      if (!message.hasOwnProperty("serviceName")) {
        return false;
      }

      // If the name is recognized as a service name, add the service name field
      // and run it through the handlers.
      return ircHandlers.handleServicesMessage(this, message);
    },

    NICK(aMessage) {
      const newNick = aMessage.params[0];
      // We only auto-authenticate for the account nickname.
      if (this.normalize(newNick) != this.normalize(this._accountNickname)) {
        return false;
      }

      // If we're not identified already, try to identify.
      if (!this.isAuthenticated) {
        ircServices.sendIdentify(this);
      }

      // We always want the RFC 2812 handler to handle NICK, so return false.
      return false;
    },

    "001": function () {
      // RPL_WELCOME
      // If SASL authentication failed, attempt IDENTIFY.
      ircServices.sendIdentify(this);

      // We always want the RFC 2812 handler to handle 001, so return false.
      return false;
    },

    421(aMessage) {
      // ERR_UNKNOWNCOMMAND
      // <command> :Unknown command
      // IDENTIFY failed, try NICKSERV IDENTIFY.
      if (
        aMessage.params[1] == "IDENTIFY" &&
        this.imAccount.password &&
        this.shouldAuthenticate &&
        !this.isAuthenticated
      ) {
        this.sendMessage(
          "NICKSERV",
          ["IDENTIFY", this.imAccount.password],
          "NICKSERV IDENTIFY <password not logged>"
        );
        return true;
      }
      if (aMessage.params[1] == "NICKSERV") {
        this.WARN("NICKSERV command does not exist.");
        return true;
      }
      return false;
    },
  },
};

export var servicesBase = {
  name: "IRC Services",
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  commands: {
    ChanServ(aMessage) {
      // [<channel name>] <message>
      let channel = aMessage.params[1].split(" ", 1)[0];
      if (!channel || channel[0] != "[" || channel.slice(-1)[0] != "]") {
        return false;
      }

      // Remove the [ and ].
      channel = channel.slice(1, -1);
      // If it isn't a channel or doesn't exist, return early.
      if (!this.isMUCName(channel) || !this.conversations.has(channel)) {
        return false;
      }

      // Otherwise, display the message in that conversation.
      const params = { incoming: true };
      if (aMessage.command == "NOTICE") {
        params.notification = true;
      }

      // The message starts after the channel name, plus [, ] and a space.
      const message = aMessage.params[1].slice(channel.length + 3);
      this.getConversation(channel).writeMessage(
        aMessage.origin,
        message,
        params
      );
      return true;
    },

    InfoServ(aMessage) {
      const text = aMessage.params[1];

      // Show the message of the day in the server tab.
      if (text == "*** \u0002Message(s) of the Day\u0002 ***") {
        this._infoServMotd = [text];
        return true;
      } else if (text == "*** \u0002End of Message(s) of the Day\u0002 ***") {
        if (this._showServerTab && this._infoServMotd) {
          this._infoServMotd.push(text);
          this.getConversation(aMessage.origin).writeMessage(
            aMessage.origin,
            this._infoServMotd.join("\n"),
            {
              incoming: true,
            }
          );
          delete this._infoServMotd;
        }
        return true;
      } else if (this.hasOwnProperty("_infoServMotd")) {
        this._infoServMotd.push(text);
        return true;
      }

      return false;
    },

    NickServ(message, ircHandlers) {
      // Since we feed the messages back through the system at the end of the
      // timeout when waiting for a log-in, we need to NOT try to handle them
      // here and let them fall through to the default handler.
      if (this.isHandlingQueuedMessages) {
        return false;
      }

      const text = message.params[1];

      // If we have a queue of messages, we're waiting for authentication.
      if (this.nickservMessageQueue) {
        if (
          text == "Password accepted - you are now recognized." || // Anope.
          text.startsWith("You are now identified for \x02")
        ) {
          // Atheme.
          // Password successfully accepted by NickServ, don't display the
          // queued messages.
          this.LOG("Successfully authenticated with NickServ.");
          this.isAuthenticated = true;
          clearTimeout(this.nickservAuthTimeout);
          delete this.nickservAuthTimeout;
          delete this.nickservMessageQueue;
        } else {
          // Queue any other messages that occur during the timeout so they
          // appear in the proper order.
          this.nickservMessageQueue.push(message);
        }
        return true;
      }

      // NickServ wants us to identify.
      if (
        text == "This nick is owned by someone else.  Please choose another." || // Anope.
        text == "This nickname is registered and protected.  If it is your" || // Anope (SECURE enabled).
        text ==
          "This nickname is registered. Please choose a different nickname, or identify via \x02/msg NickServ identify <password>\x02."
      ) {
        // Atheme.
        this.LOG("Authentication requested by NickServ.");

        // Wait one second before showing the message to the user (giving the
        // the server time to process the log-in).
        this.nickservMessageQueue = [message];
        this.nickservAuthTimeout = setTimeout(
          function () {
            this.isHandlingQueuedMessages = true;
            this.nickservMessageQueue.every(aMessage =>
              ircHandlers.handleMessage(this, aMessage)
            );
            delete this.isHandlingQueuedMessages;
            delete this.nickservMessageQueue;
          }.bind(this),
          10000
        );
        return true;
      }

      if (
        !this.isAuthenticated &&
        (text == "You are already identified." || // Anope.
          text.startsWith("You are already logged in as \x02"))
      ) {
        // Atheme.
        // Do not show the message if caused by the automatic reauthentication.
        this.isAuthenticated = true;
        return true;
      }

      return false;
    },

    /**
     * Ignore useless messages from SaslServ (unless showing of server messages
     * is enabled).
     *
     * @param {object} aMessage The IRC message object.
     * @returns {boolean} True if the message was handled, false if it should be
     *    processed by another handler.
     */
    SaslServ(aMessage) {
      // If the user would like to see server messages, fall through to the
      // standard handler.
      if (this._showServerTab) {
        return false;
      }

      // Only ignore the message notifying of last login.
      const text = aMessage.params[1];
      return text.startsWith("Last login from: ");
    },

    /*
     * freenode sends some annoying messages on start-up from a freenode-connect
     * bot. Only show these if the user wants to see server messages. See bug
     * 1521761.
     */
    "freenode-connect": function (aMessage) {
      // If the user would like to see server messages, fall through to the
      // standard handler.
      if (this._showServerTab) {
        return false;
      }

      // Only ignore the message notifying of scanning (and include additional
      // checking of the hostname).
      return (
        aMessage.host.startsWith("freenode/utility-bot/") &&
        aMessage.params[1].includes(
          "connections will be scanned for vulnerabilities"
        )
      );
    },
  },
};
