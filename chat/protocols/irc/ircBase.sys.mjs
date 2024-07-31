/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * This contains the implementation for the basic Internet Relay Chat (IRC)
 * protocol covered by RFCs 2810, 2811, 2812 and 2813 (which obsoletes RFC
 * 1459). RFC 2812 covers the client commands and protocol.
 *   RFC 2810: Internet Relay Chat: Architecture
 *     http://tools.ietf.org/html/rfc2810
 *   RFC 2811: Internet Relay Chat: Channel Management
 *     http://tools.ietf.org/html/rfc2811
 *   RFC 2812: Internet Relay Chat: Client Protocol
 *     http://tools.ietf.org/html/rfc2812
 *   RFC 2813: Internet Relay Chat: Server Protocol
 *     http://tools.ietf.org/html/rfc2813
 *   RFC 1459: Internet Relay Chat Protocol
 *     http://tools.ietf.org/html/rfc1459
 */
import { nsSimpleEnumerator } from "resource:///modules/imXPCOMUtils.sys.mjs";
import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { ircHandlerPriorities } from "resource:///modules/ircHandlerPriorities.sys.mjs";
import {
  ctcpFormatToText,
  conversationErrorMessage,
  displayMessage,
  kListRefreshInterval,
} from "resource:///modules/ircUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/irc.ftl"], true)
);

// Display the message and remove them from the rooms they're in.
function leftRoom(aAccount, aNicks, aChannels, aSource, aReason, aKicked) {
  // If a part message was included, include it.
  let reason = "";
  if (aReason) {
    if (aKicked) {
      reason = lazy.l10n.formatValueSync("message-kicked-reason", {
        kickMessage: aReason,
      });
    }
    reason = lazy.l10n.formatValueSync("message-parted-reason", {
      partMessage: aReason,
    });
  }

  function __(aNick, aYou) {
    // If the user is kicked, we need to say who kicked them.
    if (aKicked) {
      if (aYou) {
        return lazy.l10n.formatValueSync("message-kicked-you", {
          nick: aSource,
          messageKickedReason: reason,
        });
      }
      return lazy.l10n.formatValueSync("message-kicked", {
        kickedNick: aNick,
        kickerNick: aSource,
        messageKickedReason: reason,
      });
    }
    if (aYou) {
      return lazy.l10n.formatValueSync("message-parted-you", {
        messagePartedReason: reason,
      });
    }
    return lazy.l10n.formatValueSync("message-parted", {
      messagePartedReason: aNick,
      partMessage: reason,
    });
  }

  for (const channelName of aChannels) {
    if (!aAccount.conversations.has(channelName)) {
      // Handle when we closed the window.
      continue;
    }
    const conversation = aAccount.getConversation(channelName);
    for (const nick of aNicks) {
      let msg;
      if (aAccount.normalize(nick) == aAccount.normalize(aAccount._nickname)) {
        msg = __(nick, true);
        // If the user left, mark the conversation as no longer being active.
        conversation.left = true;
      } else {
        msg = __(nick);
      }

      conversation.writeMessage(aSource, msg, { system: true });
      conversation.removeParticipant(nick);
    }
  }
  return true;
}

function writeMessage(aAccount, aMessage, aString, aType) {
  const type = {};
  type[aType] = true;
  type.tags = aMessage.tags;
  aAccount
    .getConversation(aMessage.origin)
    .writeMessage(aMessage.origin, aString, type);
  return true;
}

// If aNoLastParam is true, the last parameter is not printed out.
function serverMessage(aAccount, aMsg, aNoLastParam) {
  // If we don't want to show messages from the server, just mark it as handled.
  if (!aAccount._showServerTab) {
    return true;
  }

  return writeMessage(
    aAccount,
    aMsg,
    aMsg.params.slice(1, aNoLastParam ? -1 : undefined).join(" "),
    "system"
  );
}

function serverErrorMessage(aAccount, aMessage, aError) {
  // If we don't want to show messages from the server, just mark it as handled.
  if (!aAccount._showServerTab) {
    return true;
  }

  return writeMessage(aAccount, aMessage, aError, "error");
}

function addMotd(aAccount, aMessage) {
  // If there is no current MOTD to append to, start a new one.
  if (!aAccount._motd) {
    aAccount._motd = [];
  }

  // Traditionally, MOTD messages start with "- ", but this is not always
  // true, try to handle that sanely.
  let message = aMessage.params[1];
  if (message.startsWith("-")) {
    message = message.slice(1).trim();
  }
  // And traditionally, the initial message ends in " -", remove that.
  if (message.endsWith("-")) {
    message = message.slice(0, -1).trim();
  }

  // Actually add the message (if it still exists).
  if (message) {
    aAccount._motd.push(message);
  }

  // Oh, also some servers don't send a RPL_ENDOFMOTD (e.g. irc.ppy.sh), so if
  // we don't receive another MOTD message after 1 second, consider it to be
  // RPL_ENDOFMOTD.
  clearTimeout(aAccount._motdTimer);
  aAccount._motdTimer = setTimeout(
    ircBase.commands["376"].bind(aAccount),
    1000,
    aMessage
  );

  return true;
}

// See RFCs 2811 & 2812 (which obsoletes RFC 1459) for a description of these
// commands.
export var ircBase = {
  // Parameters
  name: "RFC 2812", // Name identifier
  priority: ircHandlerPriorities.DEFAULT_PRIORITY,
  isEnabled: () => true,

  // The IRC commands that can be handled.
  commands: {
    ERROR(aMessage) {
      // ERROR <error message>
      // Client connection has been terminated.
      if (!this.disconnecting) {
        // We received an ERROR message when we weren't expecting it, this is
        // probably the server giving us a ping timeout.
        this.WARN("Received unexpected ERROR response:\n" + aMessage.params[0]);
        this.gotDisconnected(
          Ci.prplIAccount.ERROR_NETWORK_ERROR,
          lazy.l10n.formatValueSync("connection-error-lost")
        );
      } else {
        // We received an ERROR message when expecting it (i.e. we've sent a
        // QUIT command). Notify account manager.
        this.gotDisconnected();
      }
      return true;
    },
    INVITE(aMessage) {
      // INVITE <nickname> <channel>
      const channel = aMessage.params[1];
      this.addChatRequest(
        channel,
        () => {
          this.joinChat(this.getChatRoomFieldValuesFromString(channel));
        },
        request => {
          // Inform the user when an invitation was automatically ignored.
          if (!request) {
            // Otherwise just notify the user.
            this.getConversation(channel).writeMessage(
              aMessage.origin,
              lazy.l10n.formatValueSync("message-invite-received", {
                nick: aMessage.origin,
                conversationName: channel,
              }),
              { system: true }
            );
          }
        }
      );
      return true;
    },
    JOIN(aMessage) {
      // JOIN ( <channel> *( "," <channel> ) [ <key> *( "," <key> ) ] ) / "0"
      // Iterate over each channel.
      for (const channelName of aMessage.params[0].split(",")) {
        const conversation = this.getConversation(channelName);

        // Check whether we joined the channel or if someone else did.
        if (
          this.normalize(aMessage.origin, this.userPrefixes) ==
          this.normalize(this._nickname)
        ) {
          // If we join, clear the participants list to avoid errors with
          // repeated participants.
          conversation.removeAllParticipants();
          conversation.left = false;
          conversation.joining = false;

          // Update the channel name if it has improper capitalization.
          if (channelName != conversation.name) {
            conversation._name = channelName;
            conversation.notifyObservers(null, "update-conv-title");
          }

          // If the user parted from this room earlier, confirm the rejoin.
          if (conversation._rejoined) {
            conversation.writeMessage(
              aMessage.origin,
              lazy.l10n.formatValueSync("message-rejoined"),
              {
                system: true,
              }
            );
            delete conversation._rejoined;
          }

          // Ensure chatRoomFields information is available for reconnection.
          if (!conversation.chatRoomFields) {
            this.WARN(
              "Opening a MUC without storing its " +
                "prplIChatRoomFieldValues first: " +
                channelName
            );
            conversation.chatRoomFields =
              this.getChatRoomFieldValuesFromString(channelName);
          }
        } else {
          // Don't worry about adding ourself, RPL_NAMREPLY takes care of that
          // case.
          conversation.getParticipant(aMessage.origin, true);
          const msg = lazy.l10n.formatValueSync("message-join", {
            nick: aMessage.origin,
            nickAndHost: aMessage.source,
          });
          conversation.writeMessage(aMessage.origin, msg, {
            system: true,
            noLinkification: true,
          });
        }
      }
      // If the joiner is a buddy, mark as online.
      const buddy = this.buddies.get(aMessage.origin);
      if (buddy) {
        buddy.setStatus(Ci.imIStatusInfo.STATUS_AVAILABLE, "");
      }
      return true;
    },
    KICK(aMessage) {
      // KICK <channel> *( "," <channel> ) <user> *( "," <user> ) [<comment>]
      let comment = aMessage.params.length == 3 ? aMessage.params[2] : null;
      // Some servers (moznet) send the kicker as the comment.
      if (comment == aMessage.origin) {
        comment = null;
      }
      return leftRoom(
        this,
        aMessage.params[1].split(","),
        aMessage.params[0].split(","),
        aMessage.origin,
        comment,
        true
      );
    },
    MODE(aMessage) {
      // MODE <nickname> *( ( "+" / "-") *( "i" / "w" / "o" / "O" / "r" ) )
      // MODE <channel> *( ( "-" / "+" ) *<modes> *<modeparams> )
      if (this.isMUCName(aMessage.params[0])) {
        // If the first parameter is a channel name, a channel/participant mode
        // was updated.
        this.getConversation(aMessage.params[0]).setMode(
          aMessage.params[1],
          aMessage.params.slice(2),
          aMessage.origin
        );

        return true;
      }

      // Otherwise the user's own mode is being returned to them.
      return this.setUserMode(
        aMessage.params[0],
        aMessage.params[1],
        aMessage.origin,
        !this._userModeReceived
      );
    },
    NICK(aMessage) {
      // NICK <nickname>
      this.changeBuddyNick(aMessage.origin, aMessage.params[0]);
      return true;
    },
    NOTICE(aMessage) {
      // NOTICE <msgtarget> <text>
      // If the message is from the server, don't show it unless the user wants
      // to see it.
      if (!this.connected || aMessage.origin == this._currentServerName) {
        return serverMessage(this, aMessage);
      }
      return displayMessage(this, aMessage, { notification: true });
    },
    PART(aMessage) {
      // PART <channel> *( "," <channel> ) [ <Part Message> ]
      return leftRoom(
        this,
        [aMessage.origin],
        aMessage.params[0].split(","),
        aMessage.source,
        aMessage.params.length == 2 ? aMessage.params[1] : null
      );
    },
    PING(aMessage) {
      // PING <server1> [ <server2> ]
      // Keep the connection alive.
      this.sendMessage("PONG", aMessage.params[0]);
      return true;
    },
    PONG(aMessage) {
      // PONG <server> [ <server2> ]
      const pongTime = aMessage.params[1];

      // Ping to keep the connection alive.
      if (pongTime.startsWith("_")) {
        this._socket.cancelDisconnectTimer();
        return true;
      }
      // Otherwise, the ping was from a user command.
      return this.handlePingReply(aMessage.origin, pongTime);
    },
    PRIVMSG(aMessage) {
      // PRIVMSG <msgtarget> <text to be sent>
      // Display message in conversation
      return displayMessage(this, aMessage);
    },
    QUIT(aMessage) {
      // QUIT [ < Quit Message> ]
      // Some IRC servers automatically prefix a "Quit: " string. Remove the
      // duplication and use a localized version.
      let quitMsg = aMessage.params[0] || "";
      if (quitMsg.startsWith("Quit: ")) {
        quitMsg = quitMsg.slice(6); // "Quit: ".length
      }
      // If a quit message was included, show it.
      const nick = aMessage.origin;
      const msg = lazy.l10n.formatValueSync("message-quit", {
        nick,
        quitMessage: quitMsg.length
          ? lazy.l10n.formatValueSync("message-quit2", { nick: quitMsg })
          : "",
      });
      // Loop over every conversation with the user and display that they quit.
      this.conversations.forEach(conversation => {
        if (conversation.isChat && conversation._participants.has(nick)) {
          conversation.writeMessage(nick, msg, { system: true });
          conversation.removeParticipant(nick);
        }
      });

      // Remove from the whois table.
      this.removeBuddyInfo(nick);

      // If the leaver is a buddy, mark as offline.
      const buddy = this.buddies.get(nick);
      if (buddy) {
        buddy.setStatus(Ci.imIStatusInfo.STATUS_OFFLINE, "");
      }

      // If we wanted this nickname, grab it.
      if (nick == this._requestedNickname && nick != this._nickname) {
        this.changeNick(this._requestedNickname);
        clearTimeout(this._nickInUseTimeout);
        delete this._nickInUseTimeout;
      }
      return true;
    },
    SQUIT() {
      // <server> <comment>
      return true;
    },
    TOPIC(aMessage) {
      // TOPIC <channel> [ <topic> ]
      // Show topic as a message.
      const conversation = this.getConversation(aMessage.params[0]);
      const topic = aMessage.params[1];
      // Set the topic in the conversation and update the UI.
      conversation.setTopic(
        topic ? ctcpFormatToText(topic) : "",
        aMessage.origin
      );
      return true;
    },
    "001": function (aMessage) {
      // RPL_WELCOME
      // Welcome to the Internet Relay Network <nick>!<user>@<host>
      this._socket.resetPingTimer();
      // This seems a little strange, but we don't differentiate between a
      // nickname and the servername since it can be ambiguous.
      this._currentServerName = aMessage.origin;

      // Clear user mode.
      this._modes = new Set();
      this._userModeReceived = false;

      // Check if autoUserMode is set in the account preferences. If it is set,
      // then notify the server that the user wants a specific mode.
      if (this.prefs.prefHasUserValue("autoUserMode")) {
        this.sendMessage("MODE", [
          this._nickname,
          this.getString("autoUserMode"),
        ]);
      }

      // Check if our nick has changed.
      if (aMessage.params[0] != this._nickname) {
        this.changeBuddyNick(this._nickname, aMessage.params[0]);
      }

      // Request our own whois entry so we can set the prefix.
      this.requestCurrentWhois(this._nickname);

      // If our status is Unavailable, tell the server.
      if (
        this.imAccount.statusInfo.statusType < Ci.imIStatusInfo.STATUS_AVAILABLE
      ) {
        this.observe(null, "status-changed");
      }

      // Check if any of our buddies are online!
      const kInitialIsOnDelay = 1000;
      this._isOnTimer = setTimeout(this.sendIsOn.bind(this), kInitialIsOnDelay);

      // If we didn't handle all the CAPs we added, something is wrong.
      if (this._requestedCAPs.size) {
        this.ERROR(
          "Connected without removing CAPs: " + [...this._requestedCAPs]
        );
      }

      // Done!
      this.reportConnected();
      return serverMessage(this, aMessage);
    },
    "002": function (aMessage) {
      // RPL_YOURHOST
      // Your host is <servername>, running version <ver>
      return serverMessage(this, aMessage);
    },
    "003": function (aMessage) {
      // RPL_CREATED
      // This server was created <date>
      // TODO parse this date and keep it for some reason? Do we care?
      return serverMessage(this, aMessage);
    },
    "004": function (aMessage) {
      // RPL_MYINFO
      // <servername> <version> <available user modes> <available channel modes>
      // TODO parse the available modes, let the UI respond and inform the user
      return serverMessage(this, aMessage);
    },
    "005": function (aMessage) {
      // RPL_BOUNCE
      // Try server <server name>, port <port number>
      return serverMessage(this, aMessage);
    },

    /*
     * Handle response to TRACE message
     */
    200(aMessage) {
      // RPL_TRACELINK
      // Link <version & debug level> <destination> <next server>
      // V<protocol version> <link updateime in seconds> <backstream sendq>
      // <upstream sendq>
      return serverMessage(this, aMessage);
    },
    201(aMessage) {
      // RPL_TRACECONNECTING
      // Try. <class> <server>
      return serverMessage(this, aMessage);
    },
    202(aMessage) {
      // RPL_TRACEHANDSHAKE
      // H.S. <class> <server>
      return serverMessage(this, aMessage);
    },
    203(aMessage) {
      // RPL_TRACEUNKNOWN
      // ???? <class> [<client IP address in dot form>]
      return serverMessage(this, aMessage);
    },
    204(aMessage) {
      // RPL_TRACEOPERATOR
      // Oper <class> <nick>
      return serverMessage(this, aMessage);
    },
    205(aMessage) {
      // RPL_TRACEUSER
      // User <class> <nick>
      return serverMessage(this, aMessage);
    },
    206(aMessage) {
      // RPL_TRACESERVER
      // Serv <class> <int>S <int>C <server> <nick!user|*!*>@<host|server>
      // V<protocol version>
      return serverMessage(this, aMessage);
    },
    207(aMessage) {
      // RPL_TRACESERVICE
      // Service <class> <name> <type> <active type>
      return serverMessage(this, aMessage);
    },
    208(aMessage) {
      // RPL_TRACENEWTYPE
      // <newtype> 0 <client name>
      return serverMessage(this, aMessage);
    },
    209(aMessage) {
      // RPL_TRACECLASS
      // Class <class> <count>
      return serverMessage(this, aMessage);
    },
    210(aMessage) {
      // RPL_TRACERECONNECTION
      // Unused.
      return serverMessage(this, aMessage);
    },

    /*
     * Handle stats messages.
     **/
    211(aMessage) {
      // RPL_STATSLINKINFO
      // <linkname> <sendq> <sent messages> <sent Kbytes> <received messages>
      // <received Kbytes> <time open>
      return serverMessage(this, aMessage);
    },
    212(aMessage) {
      // RPL_STATSCOMMAND
      // <command> <count> <byte count> <remote count>
      return serverMessage(this, aMessage);
    },
    213(aMessage) {
      // RPL_STATSCLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    214(aMessage) {
      // RPL_STATSNLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    215(aMessage) {
      // RPL_STATSILINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    216(aMessage) {
      // RPL_STATSKLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    217(aMessage) {
      // RPL_STATSQLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    218(aMessage) {
      // RPL_STATSYLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    219(aMessage) {
      // RPL_ENDOFSTATS
      // <stats letter> :End of STATS report
      return serverMessage(this, aMessage);
    },

    221(aMessage) {
      // RPL_UMODEIS
      // <user mode string>
      return this.setUserMode(
        aMessage.params[0],
        aMessage.params[1],
        aMessage.origin,
        true
      );
    },

    /*
     * Services
     */
    231(aMessage) {
      // RPL_SERVICEINFO
      // Non-generic
      return serverMessage(this, aMessage);
    },
    232(aMessage) {
      // RPL_ENDOFSERVICES
      // Non-generic
      return serverMessage(this, aMessage);
    },
    233(aMessage) {
      // RPL_SERVICE
      // Non-generic
      return serverMessage(this, aMessage);
    },

    /*
     * Server
     */
    234(aMessage) {
      // RPL_SERVLIST
      // <name> <server> <mask> <type> <hopcount> <info>
      return serverMessage(this, aMessage);
    },
    235(aMessage) {
      // RPL_SERVLISTEND
      // <mask> <type> :End of service listing
      return serverMessage(this, aMessage, true);
    },

    /*
     * Stats
     * TODO some of these have real information we could try to parse.
     */
    240(aMessage) {
      // RPL_STATSVLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    241(aMessage) {
      // RPL_STATSLLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    242(aMessage) {
      // RPL_STATSUPTIME
      // :Server Up %d days %d:%02d:%02d
      return serverMessage(this, aMessage);
    },
    243(aMessage) {
      // RPL_STATSOLINE
      // O <hostmask> * <name>
      return serverMessage(this, aMessage);
    },
    244(aMessage) {
      // RPL_STATSHLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    245(aMessage) {
      // RPL_STATSSLINE
      // Non-generic
      // Note that this is given as 244 in RFC 2812, this seems to be incorrect.
      return serverMessage(this, aMessage);
    },
    246(aMessage) {
      // RPL_STATSPING
      // Non-generic
      return serverMessage(this, aMessage);
    },
    247(aMessage) {
      // RPL_STATSBLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },
    250(aMessage) {
      // RPL_STATSDLINE
      // Non-generic
      return serverMessage(this, aMessage);
    },

    /*
     * LUSER messages
     */
    251(aMessage) {
      // RPL_LUSERCLIENT
      // :There are <integer> users and <integer> services on <integer> servers
      return serverMessage(this, aMessage);
    },
    252(aMessage) {
      // RPL_LUSEROP, 0 if not sent
      // <integer> :operator(s) online
      return serverMessage(this, aMessage);
    },
    253(aMessage) {
      // RPL_LUSERUNKNOWN, 0 if not sent
      // <integer> :unknown connection(s)
      return serverMessage(this, aMessage);
    },
    254(aMessage) {
      // RPL_LUSERCHANNELS, 0 if not sent
      // <integer> :channels formed
      return serverMessage(this, aMessage);
    },
    255(aMessage) {
      // RPL_LUSERME
      // :I have <integer> clients and <integer> servers
      return serverMessage(this, aMessage);
    },

    /*
     * ADMIN messages
     */
    256(aMessage) {
      // RPL_ADMINME
      // <server> :Administrative info
      return serverMessage(this, aMessage);
    },
    257(aMessage) {
      // RPL_ADMINLOC1
      // :<admin info>
      // City, state & country
      return serverMessage(this, aMessage);
    },
    258(aMessage) {
      // RPL_ADMINLOC2
      // :<admin info>
      // Institution details
      return serverMessage(this, aMessage);
    },
    259(aMessage) {
      // RPL_ADMINEMAIL
      // :<admin info>
      // TODO We could parse this for a contact email.
      return serverMessage(this, aMessage);
    },

    /*
     * TRACELOG
     */
    261(aMessage) {
      // RPL_TRACELOG
      // File <logfile> <debug level>
      return serverMessage(this, aMessage);
    },
    262(aMessage) {
      // RPL_TRACEEND
      // <server name> <version & debug level> :End of TRACE
      return serverMessage(this, aMessage, true);
    },

    /*
     * Try again.
     */
    263(aMessage) {
      // RPL_TRYAGAIN
      // <command> :Please wait a while and try again.
      if (aMessage.params[1] == "LIST" && this._pendingList) {
        // We may receive this from servers which rate-limit LIST if the
        // server believes us to be asking for LIST data too soon after the
        // previous request.
        // Tidy up as we won't be receiving any more channels.
        this._sendRemainingRoomInfo();
        // Fake the last LIST time so that we may try again in one hour.
        const kHour = 60 * 60 * 1000;
        this._lastListTime = Date.now() - kListRefreshInterval + kHour;
        return true;
      }
      return serverMessage(this, aMessage);
    },

    265(aMessage) {
      // nonstandard
      // :Current Local Users: <integer>  Max: <integer>
      return serverMessage(this, aMessage);
    },
    266(aMessage) {
      // nonstandard
      // :Current Global Users: <integer>  Max: <integer>
      return serverMessage(this, aMessage);
    },
    300(aMessage) {
      // RPL_NONE
      // Non-generic
      return serverMessage(this, aMessage);
    },

    /*
     * Status messages
     */
    301(aMessage) {
      // RPL_AWAY
      // <nick> :<away message>
      // TODO set user as away on buddy list / conversation lists
      // TODO Display an autoResponse if this is after sending a private message
      // If the conversation is waiting for a response, it's received one.
      if (this.conversations.has(aMessage.params[1])) {
        delete this.getConversation(aMessage.params[1])._pendingMessage;
      }
      return this.setWhois(aMessage.params[1], { away: aMessage.params[2] });
    },
    302() {
      // RPL_USERHOST
      // :*1<reply> *( " " <reply )"
      // reply = nickname [ "*" ] "=" ( "+" / "-" ) hostname
      // TODO Can tell op / away from this
      return false;
    },
    303(aMessage) {
      // RPL_ISON
      // :*1<nick> *( " " <nick> )"
      // Set the status of the buddies based the latest ISON response.
      let receivedBuddyNames = [];
      // The buddy names as returned by the server.
      if (aMessage.params.length > 1) {
        receivedBuddyNames = aMessage.params[1].trim().split(" ");
      }

      // This was received in response to the last ISON message sent.
      for (const buddyName of this.pendingIsOnQueue) {
        // If the buddy name is in the list returned from the server, they're
        // online.
        const status = !receivedBuddyNames.includes(buddyName)
          ? Ci.imIStatusInfo.STATUS_OFFLINE
          : Ci.imIStatusInfo.STATUS_AVAILABLE;

        // Set the status with no status message, only if the buddy actually
        // exists in the buddy list.
        const buddy = this.buddies.get(buddyName);
        if (buddy) {
          buddy.setStatus(status, "");
        }
      }
      return true;
    },
    305() {
      // RPL_UNAWAY
      // :You are no longer marked as being away
      this.isAway = false;
      return true;
    },
    306() {
      // RPL_NOWAWAY
      // :You have been marked as away
      this.isAway = true;
      return true;
    },

    /*
     * WHOIS
     */
    311(aMessage) {
      // RPL_WHOISUSER
      // <nick> <user> <host> * :<real name>
      // <username>@<hostname>
      const nick = aMessage.params[1];
      const source = aMessage.params[2] + "@" + aMessage.params[3];
      // Some servers obfuscate the host when sending messages. Therefore,
      // we set the account prefix by using the host from this response.
      // We store it separately to avoid glitches due to the whois entry
      // being temporarily deleted during future updates of the entry.
      if (this.normalize(nick) == this.normalize(this._nickname)) {
        this.prefix = "!" + source;
      }
      return this.setWhois(nick, {
        realname: aMessage.params[5],
        connectedFrom: source,
      });
    },
    312(aMessage) {
      // RPL_WHOISSERVER
      // <nick> <server> :<server info>
      return this.setWhois(aMessage.params[1], {
        serverName: aMessage.params[2],
        serverInfo: aMessage.params[3],
      });
    },
    313(aMessage) {
      // RPL_WHOISOPERATOR
      // <nick> :is an IRC operator
      return this.setWhois(aMessage.params[1], { ircOp: true });
    },
    314(aMessage) {
      // RPL_WHOWASUSER
      // <nick> <user> <host> * :<real name>
      const source = aMessage.params[2] + "@" + aMessage.params[3];
      return this.setWhois(aMessage.params[1], {
        offline: true,
        realname: aMessage.params[5],
        connectedFrom: source,
      });
    },
    315() {
      // RPL_ENDOFWHO
      // <name> :End of WHO list
      return false;
    },
    316() {
      // RPL_WHOISCHANOP
      // Non-generic
      return false;
    },
    317(aMessage) {
      // RPL_WHOISIDLE
      // <nick> <integer> :seconds idle
      return this.setWhois(aMessage.params[1], {
        lastActivity: parseInt(aMessage.params[2]),
      });
    },
    318(aMessage) {
      // RPL_ENDOFWHOIS
      // <nick> :End of WHOIS list
      // We've received everything about WHOIS, tell the tooltip that is waiting
      // for this information.
      const nick = aMessage.params[1];

      if (this.whoisInformation.has(nick)) {
        this.notifyWhois(nick);
      } else {
        // If there is no whois information stored at this point, the nick
        // is either offline or does not exist, so we run WHOWAS.
        this.requestOfflineBuddyInfo(nick);
      }
      return true;
    },
    319(aMessage) {
      // RPL_WHOISCHANNELS
      // <nick> :*( ( "@" / "+" ) <channel> " " )
      return this.setWhois(aMessage.params[1], {
        channels: aMessage.params[2],
      });
    },

    /*
     * LIST
     */
    321() {
      // RPL_LISTSTART
      // Channel :Users Name
      // Obsolete. Not used.
      return true;
    },
    322(aMessage) {
      // RPL_LIST
      // <channel> <# visible> :<topic>
      const name = aMessage.params[1];
      const participantCount = aMessage.params[2];
      let topic = aMessage.params[3];
      // Some servers (e.g. Unreal) include the channel's modes before the topic.
      // Omit this.
      topic = topic.replace(/^\[\+[a-zA-Z]*\] /, "");
      // Force the allocation of a new copy of the string so as to prevent
      // the JS engine from retaining the whole original socket string. See bug
      // 1058584. This hack can be removed when bug 1058653 is fixed.
      topic = topic ? topic.normalize() : "";

      this._channelList.set(name, { topic, participantCount });
      this._currentBatch.push(name);
      // Give callbacks a batch of channels of length _channelsPerBatch.
      if (this._currentBatch.length == this._channelsPerBatch) {
        for (const callback of this._roomInfoCallbacks) {
          callback.onRoomInfoAvailable(this._currentBatch, false);
        }
        this._currentBatch = [];
      }
      return true;
    },
    323() {
      // RPL_LISTEND
      // :End of LIST
      this._sendRemainingRoomInfo();
      return true;
    },

    /*
     * Channel functions
     */
    324(aMessage) {
      // RPL_CHANNELMODEIS
      // <channel> <mode> <mode params>
      this.getConversation(aMessage.params[1]).setMode(
        aMessage.params[2],
        aMessage.params.slice(3),
        aMessage.origin
      );

      return true;
    },
    325() {
      // RPL_UNIQOPIS
      // <channel> <nickname>
      // TODO parse this and have the UI respond accordingly.
      return false;
    },
    331(aMessage) {
      // RPL_NOTOPIC
      // <channel> :No topic is set
      const conversation = this.getConversation(aMessage.params[1]);
      // Clear the topic.
      conversation.setTopic("");
      return true;
    },
    332(aMessage) {
      // RPL_TOPIC
      // <channel> :<topic>
      // Update the topic UI
      const conversation = this.getConversation(aMessage.params[1]);
      const topic = aMessage.params[2];
      conversation.setTopic(topic ? ctcpFormatToText(topic) : "");
      return true;
    },
    333() {
      // nonstandard
      // <channel> <nickname> <time>
      return true;
    },

    /*
     * Invitations
     */
    341(aMessage) {
      // RPL_INVITING
      // <channel> <nick>
      // Note that servers reply with parameters in the reverse order from the
      // above (which is as specified by RFC 2812).
      this.getConversation(aMessage.params[2]).writeMessage(
        aMessage.origin,
        lazy.l10n.formatValueSync("message-invited", {
          nick: aMessage.params[1],
          conversationName: aMessage.params[2],
        }),
        { system: true }
      );
      return true;
    },
    342(aMessage) {
      // RPL_SUMMONING
      // <user> :Summoning user to IRC
      return writeMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("message-summoned", {
          nick: aMessage.params[0],
        })
      );
    },
    346() {
      // RPL_INVITELIST
      // <channel> <invitemask>
      // TODO what do we do?
      return false;
    },
    347() {
      // RPL_ENDOFINVITELIST
      // <channel> :End of channel invite list
      // TODO what do we do?
      return false;
    },
    348() {
      // RPL_EXCEPTLIST
      // <channel> <exceptionmask>
      // TODO what do we do?
      return false;
    },
    349() {
      // RPL_ENDOFEXCEPTIONLIST
      // <channel> :End of channel exception list
      // TODO update UI?
      return false;
    },

    /*
     * Version
     */
    351(aMessage) {
      // RPL_VERSION
      // <version>.<debuglevel> <server> :<comments>
      return serverMessage(this, aMessage);
    },

    /*
     * WHO
     */
    352() {
      // RPL_WHOREPLY
      // <channel> <user> <host> <server> <nick> ( "H" / "G" ) ["*"] [ ("@" / "+" ) ] :<hopcount> <real name>
      // TODO parse and display this?
      return false;
    },

    /*
     * NAMREPLY
     */
    353(aMessage) {
      // RPL_NAMREPLY
      // <target> ( "=" / "*" / "@" ) <channel> :[ "@" / "+" ] <nick> *( " " [ "@" / "+" ] <nick> )
      const conversation = this.getConversation(aMessage.params[2]);
      // Keep if this is secret (@), private (*) or public (=).
      conversation.setModesFromRestriction(aMessage.params[1]);
      // Add the participants.
      const newParticipants = [];
      aMessage.params[3]
        .trim()
        .split(" ")
        .forEach(aNick =>
          newParticipants.push(conversation.getParticipant(aNick, false))
        );
      conversation.notifyObservers(
        new nsSimpleEnumerator(newParticipants),
        "chat-buddy-add"
      );
      return true;
    },

    361() {
      // RPL_KILLDONE
      // Non-generic
      // TODO What is this?
      return false;
    },
    362() {
      // RPL_CLOSING
      // Non-generic
      // TODO What is this?
      return false;
    },
    363() {
      // RPL_CLOSEEND
      // Non-generic
      // TODO What is this?
      return false;
    },

    /*
     * Links.
     */
    364(aMessage) {
      // RPL_LINKS
      // <mask> <server> :<hopcount> <server info>
      return serverMessage(this, aMessage);
    },
    365() {
      // RPL_ENDOFLINKS
      // <mask> :End of LINKS list
      return true;
    },

    /*
     * Names
     */
    366(aMessage) {
      // RPL_ENDOFNAMES
      // <target> <channel> :End of NAMES list
      // All participants have already been added by the 353 handler.

      // This assumes that this is the last message received when joining a
      // channel, so a few "clean up" tasks are done here.
      const conversation = this.getConversation(aMessage.params[1]);

      // Update the topic as we may have added the participant for
      // the user after the mode message was handled, and so
      // topicSettable may have changed.
      conversation.notifyObservers(this, "chat-update-topic");

      // If we haven't received the MODE yet, request it.
      if (!conversation._receivedInitialMode) {
        this.sendMessage("MODE", aMessage.params[1]);
      }

      return true;
    },
    /*
     * End of a bunch of lists
     */
    367(aMessage) {
      // RPL_BANLIST
      // <channel> <banmask>
      const conv = this.getConversation(aMessage.params[1]);
      if (!conv.banMasks.includes(aMessage.params[2])) {
        conv.banMasks.push(aMessage.params[2]);
      }
      return true;
    },
    368(aMessage) {
      // RPL_ENDOFBANLIST
      // <channel> :End of channel ban list
      const conv = this.getConversation(aMessage.params[1]);
      let msg;
      if (conv.banMasks.length) {
        msg = [
          lazy.l10n.formatValueSync("message-ban-masks", {
            place: aMessage.params[1],
          }),
        ]
          .concat(conv.banMasks)
          .join("\n");
      } else {
        msg = lazy.l10n.formatValueSync("message-no-ban-masks", {
          place: aMessage.params[1],
        });
      }
      conv.writeMessage(aMessage.origin, msg, { system: true });
      return true;
    },
    369(aMessage) {
      // RPL_ENDOFWHOWAS
      // <nick> :End of WHOWAS
      // We've received everything about WHOWAS, tell the tooltip that is waiting
      // for this information.
      this.notifyWhois(aMessage.params[1]);
      return true;
    },

    /*
     * Server info
     */
    371(aMessage) {
      // RPL_INFO
      // :<string>
      return serverMessage(this, aMessage);
    },
    372(aMessage) {
      // RPL_MOTD
      // :- <text>
      return addMotd(this, aMessage);
    },
    373() {
      // RPL_INFOSTART
      // Non-generic
      // This is unnecessary and servers just send RPL_INFO.
      return true;
    },
    374() {
      // RPL_ENDOFINFO
      // :End of INFO list
      return true;
    },
    375(aMessage) {
      // RPL_MOTDSTART
      // :- <server> Message of the day -
      return addMotd(this, aMessage);
    },
    376(aMessage) {
      // RPL_ENDOFMOTD
      // :End of MOTD command
      // Show the MOTD if the user wants to see server messages or if
      // RPL_WELCOME has not been received since some servers (e.g. irc.ppy.sh)
      // use this as a CAPTCHA like mechanism before login can occur.
      if (this._showServerTab || !this.connected) {
        writeMessage(this, aMessage, this._motd.join("\n"), "incoming");
      }
      // No reason to keep the MOTD in memory.
      delete this._motd;
      // Clear the MOTD timer.
      clearTimeout(this._motdTimer);
      delete this._motdTimer;

      return true;
    },

    /*
     * OPER
     */
    381(aMessage) {
      // RPL_YOUREOPER
      // :You are now an IRC operator
      // TODO update UI accordingly to show oper status
      return serverMessage(this, aMessage);
    },
    382(aMessage) {
      // RPL_REHASHING
      // <config file> :Rehashing
      return serverMessage(this, aMessage);
    },
    383() {
      // RPL_YOURESERVICE
      // You are service <servicename>
      this.WARN('Received "You are a service" message.');
      return true;
    },

    /*
     * Info
     */
    384() {
      // RPL_MYPORTIS
      // Non-generic
      // TODO Parse and display?
      return false;
    },
    391(aMessage) {
      // RPL_TIME
      // <server> :<string showing server's local time>

      const msg = lazy.l10n.formatValueSync("ctcp-time", {
        username: aMessage.params[1],
        timeResponse: aMessage.params[2],
      });
      // Show the date returned from the server, note that this doesn't use
      // the serverMessage function: since this is in response to a command, it
      // should always be shown.
      return writeMessage(this, aMessage, msg, "system");
    },
    392() {
      // RPL_USERSSTART
      // :UserID   Terminal  Host
      // TODO
      return false;
    },
    393() {
      // RPL_USERS
      // :<username> <ttyline> <hostname>
      // TODO store into buddy list? List out?
      return false;
    },
    394() {
      // RPL_ENDOFUSERS
      // :End of users
      // TODO Notify observers of the buddy list?
      return false;
    },
    395() {
      // RPL_NOUSERS
      // :Nobody logged in
      // TODO clear buddy list?
      return false;
    },

    // Error messages, Implement Section 5.2 of RFC 2812
    401(aMessage) {
      // ERR_NOSUCHNICK
      // <nickname> :No such nick/channel
      // Can arise in response to /mode, /invite, /kill, /msg, /whois.
      // TODO Handled in the conversation for /whois and /mgs so far.
      const msgSuffix = this.isMUCName(aMessage.params[1]) ? "channel" : "nick";
      const msgId = `error-no-such-${msgSuffix}`;
      if (this.conversations.has(aMessage.params[1])) {
        // If the conversation exists and we just sent a message from it, then
        // notify that the user is offline.
        if (this.getConversation(aMessage.params[1])._pendingMessage) {
          conversationErrorMessage(this, aMessage, msgId);
        }
      }

      return serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync(msgId, {
          name: aMessage.params[1],
        })
      );
    },
    402() {
      // ERR_NOSUCHSERVER
      // <server name> :No such server
      // TODO Parse & display an error to the user.
      return false;
    },
    403(aMessage) {
      // ERR_NOSUCHCHANNEL
      // <channel name> :No such channel
      return conversationErrorMessage(
        this,
        aMessage,
        "error-no-channel",
        true,
        false
      );
    },
    404(aMessage) {
      // ERR_CANNOTSENDTOCHAN
      // <channel name> :Cannot send to channel
      // Notify the user that they can't send to that channel.
      return conversationErrorMessage(
        this,
        aMessage,
        "error-cannot-send-to-channel"
      );
    },
    405(aMessage) {
      // ERR_TOOMANYCHANNELS
      // <channel name> :You have joined too many channels
      return conversationErrorMessage(
        this,
        aMessage,
        "error-too-many-channels",
        true
      );
    },
    406(aMessage) {
      // ERR_WASNOSUCHNICK
      // <nickname> :There was no such nickname
      // Can arise in response to WHOWAS.
      return serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("error-was-no-such-nick", {
          name: aMessage.params[1],
        })
      );
    },
    407(aMessage) {
      // ERR_TOOMANYTARGETS
      // <target> :<error code> recipients. <abort message>
      return conversationErrorMessage(
        this,
        aMessage,
        "error-non-unique-target",
        false,
        false
      );
    },
    408() {
      // ERR_NOSUCHSERVICE
      // <service name> :No such service
      // TODO
      return false;
    },
    409() {
      // ERR_NOORIGIN
      // :No origin specified
      // TODO failed PING/PONG message, this should never occur?
      return false;
    },
    411() {
      // ERR_NORECIPIENT
      // :No recipient given (<command>)
      // If this happens a real error with the protocol occurred.
      this.ERROR("ERR_NORECIPIENT: No recipient given for PRIVMSG.");
      return true;
    },
    412() {
      // ERR_NOTEXTTOSEND
      // :No text to send
      // If this happens a real error with the protocol occurred: we should
      // always block the user from sending empty messages.
      this.ERROR("ERR_NOTEXTTOSEND: No text to send for PRIVMSG.");
      return true;
    },
    413() {
      // ERR_NOTOPLEVEL
      // <mask> :No toplevel domain specified
      // If this response is received, a real error occurred in the protocol.
      this.ERROR("ERR_NOTOPLEVEL: Toplevel domain not specified.");
      return true;
    },
    414() {
      // ERR_WILDTOPLEVEL
      // <mask> :Wildcard in toplevel domain
      // If this response is received, a real error occurred in the protocol.
      this.ERROR("ERR_WILDTOPLEVEL: Wildcard toplevel domain specified.");
      return true;
    },
    415() {
      // ERR_BADMASK
      // <mask> :Bad Server/host mask
      // If this response is received, a real error occurred in the protocol.
      this.ERROR("ERR_BADMASK: Bad server/host mask specified.");
      return true;
    },
    421() {
      // ERR_UNKNOWNCOMMAND
      // <command> :Unknown command
      // TODO This shouldn't occur.
      return false;
    },
    422() {
      // ERR_NOMOTD
      // :MOTD File is missing
      // No message of the day to display.
      return true;
    },
    423() {
      // ERR_NOADMININFO
      // <server> :No administrative info available
      // TODO
      return false;
    },
    424() {
      // ERR_FILEERROR
      // :File error doing <file op> on <file>
      // TODO
      return false;
    },
    431() {
      // ERR_NONICKNAMEGIVEN
      // :No nickname given
      // TODO
      return false;
    },
    432(aMessage) {
      // ERR_ERRONEUSNICKNAME
      // <nick> :Erroneous nickname
      const msg = lazy.l10n.formatValueSync("error-erroneous-nickname", {
        name: this._requestedNickname,
      });
      serverErrorMessage(this, aMessage, msg);
      if (this._requestedNickname == this._accountNickname) {
        // The account has been set up with an illegal nickname.
        this.ERROR(
          "Erroneous nickname " +
            this._requestedNickname +
            ": " +
            aMessage.params.slice(1).join(" ")
        );
        this.gotDisconnected(Ci.prplIAccount.ERROR_INVALID_USERNAME, msg);
      } else {
        // Reset original nickname to the account nickname in case of
        // later reconnections.
        this._requestedNickname = this._accountNickname;
      }
      return true;
    },
    433(aMessage) {
      // ERR_NICKNAMEINUSE
      // <nick> :Nickname is already in use
      // Try to get the desired nick back in 2.5 minutes if this happens when
      // connecting, in case it was just due to the user's nick not having
      // timed out yet on the server.
      if (this.connecting && aMessage.params[1] == this._requestedNickname) {
        this._nickInUseTimeout = setTimeout(() => {
          this.changeNick(this._requestedNickname);
          delete this._nickInUseTimeout;
        }, 150000);
      }
      return this.tryNewNick(aMessage.params[1]);
    },
    436(aMessage) {
      // ERR_NICKCOLLISION
      // <nick> :Nickname collision KILL from <user>@<host>
      return this.tryNewNick(aMessage.params[1]);
    },
    437(aMessage) {
      // ERR_UNAVAILRESOURCE
      // <nick/channel> :Nick/channel is temporarily unavailable
      return conversationErrorMessage(
        this,
        aMessage,
        "error-unavailable",
        true
      );
    },
    441() {
      // ERR_USERNOTINCHANNEL
      // <nick> <channel> :They aren't on that channel
      // TODO
      return false;
    },
    442(aMessage) {
      // ERR_NOTONCHANNEL
      // <channel> :You're not on that channel
      this.ERROR(
        "A command affecting " +
          aMessage.params[1] +
          " failed because you aren't in that channel."
      );
      return true;
    },
    443(aMessage) {
      // ERR_USERONCHANNEL
      // <user> <channel> :is already on channel
      this.getConversation(aMessage.params[2]).writeMessage(
        aMessage.origin,
        lazy.l10n.formatValueSync("message-already-in-channel", {
          nick: aMessage.params[1],
          conversationName: aMessage.params[2],
        }),
        { system: true }
      );
      return true;
    },
    444() {
      // ERR_NOLOGIN
      // <user> :User not logged in
      // TODO
      return false;
    },
    445() {
      // ERR_SUMMONDISABLED
      // :SUMMON has been disabled
      // TODO keep track of this and disable UI associated?
      return false;
    },
    446() {
      // ERR_USERSDISABLED
      // :USERS has been disabled
      // TODO Disabled all buddy list etc.
      return false;
    },
    451(aMessage) {
      // ERR_NOTREGISTERED
      // :You have not registered
      // If the server doesn't understand CAP it might return this error.
      if (aMessage.params[0] == "CAP") {
        this.LOG("Server doesn't support CAP.");
        return true;
      }
      // TODO
      return false;
    },
    461() {
      // ERR_NEEDMOREPARAMS
      // <command> :Not enough parameters

      if (!this.connected) {
        // The account has been set up with an illegal username.
        this.ERROR("Erroneous username: " + this.username);
        this.gotDisconnected(
          Ci.prplIAccount.ERROR_INVALID_USERNAME,
          lazy.l10n.formatValueSync("connection-error-invalid-username", {
            username: this.user,
          })
        );
        return true;
      }

      return false;
    },
    462() {
      // ERR_ALREADYREGISTERED
      // :Unauthorized command (already registered)
      // TODO
      return false;
    },
    463() {
      // ERR_NOPERMFORHOST
      // :Your host isn't among the privileged
      // TODO
      return false;
    },
    464() {
      // ERR_PASSWDMISMATCH
      // :Password incorrect
      this.gotDisconnected(
        Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
        lazy.l10n.formatValueSync("connection-error-invalid-password")
      );
      return true;
    },
    465(aMessage) {
      // ERR_YOUREBANEDCREEP
      // :You are banned from this server
      serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("error-banned")
      );
      this.gotDisconnected(
        Ci.prplIAccount.ERROR_OTHER_ERROR,
        lazy.l10n.formatValueSync("error-banned")
      ); // Notify account manager.
      return true;
    },
    466(aMessage) {
      // ERR_YOUWILLBEBANNED
      return serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("error-banned-soon")
      );
    },
    467() {
      // ERR_KEYSET
      // <channel> :Channel key already set
      // TODO
      return false;
    },
    471(aMessage) {
      // ERR_CHANNELISFULL
      // <channel> :Cannot join channel (+l)
      return conversationErrorMessage(
        this,
        aMessage,
        "error-channel-full",
        true
      );
    },
    472() {
      // ERR_UNKNOWNMODE
      // <char> :is unknown mode char to me for <channel>
      // TODO
      return false;
    },
    473(aMessage) {
      // ERR_INVITEONLYCHAN
      // <channel> :Cannot join channel (+i)
      return conversationErrorMessage(
        this,
        aMessage,
        "error-invite-only",
        true,
        false
      );
    },
    474(aMessage) {
      // ERR_BANNEDFROMCHAN
      // <channel> :Cannot join channel (+b)
      return conversationErrorMessage(
        this,
        aMessage,
        "error-channel-banned",
        true,
        false
      );
    },
    475(aMessage) {
      // ERR_BADCHANNELKEY
      // <channel> :Cannot join channel (+k)
      return conversationErrorMessage(
        this,
        aMessage,
        "error-wrong-key",
        true,
        false
      );
    },
    476() {
      // ERR_BADCHANMASK
      // <channel> :Bad Channel Mask
      // TODO
      return false;
    },
    477() {
      // ERR_NOCHANMODES
      // <channel> :Channel doesn't support modes
      // TODO
      return false;
    },
    478() {
      // ERR_BANLISTFULL
      // <channel> <char> :Channel list is full
      // TODO
      return false;
    },
    481() {
      // ERR_NOPRIVILEGES
      // :Permission Denied- You're not an IRC operator
      // TODO ask to auth?
      return false;
    },
    482(aMessage) {
      // ERR_CHANOPRIVSNEEDED
      // <channel> :You're not channel operator
      return conversationErrorMessage(this, aMessage, "error-not-channel-op");
    },
    483() {
      // ERR_CANTKILLSERVER
      // :You can't kill a server!
      // TODO Display error?
      return false;
    },
    484() {
      // ERR_RESTRICTED
      // :Your connection is restricted!
      // Indicates user mode +r
      // TODO
      return false;
    },
    485() {
      // ERR_UNIQOPPRIVSNEEDED
      // :You're not the original channel operator
      // TODO ask to auth?
      return false;
    },
    491() {
      // ERR_NOOPERHOST
      // :No O-lines for your host
      // TODO
      return false;
    },
    492() {
      // ERR_NOSERVICEHOST
      // Non-generic
      // TODO
      return false;
    },
    501(aMessage) {
      // ERR_UMODEUNKNOWNFLAGS
      // :Unknown MODE flag
      return serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("error-unknown-mode", {
          mode: aMessage.params[1],
        })
      );
    },
    502(aMessage) {
      // ERR_USERSDONTMATCH
      // :Cannot change mode for other users
      return serverErrorMessage(
        this,
        aMessage,
        lazy.l10n.formatValueSync("error-mode-wrong-user")
      );
    },
  },
};
