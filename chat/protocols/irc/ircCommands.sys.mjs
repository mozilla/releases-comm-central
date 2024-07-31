/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is to be exported directly onto the IRC prplIProtocol object, directly
// implementing the commands field before we register them.
import { IMServices } from "resource:///modules/IMServices.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/irc.ftl"], true)
);

// Shortcut to get the JavaScript conversation object.
function getConv(aConv) {
  return aConv.wrappedJSObject;
}

// Shortcut to get the JavaScript account object.
function getAccount(aConv) {
  return getConv(aConv)._account;
}

// Trim leading and trailing spaces and split a string by any type of space.
function splitInput(aString) {
  return aString.trim().split(/\s+/);
}

// Kick a user from a channel
// aMsg is <user> [comment]
function kickCommand(aMsg, aConv) {
  if (!aMsg.length) {
    return false;
  }

  const params = [aConv.name];
  const offset = aMsg.indexOf(" ");
  if (offset != -1) {
    params.push(aMsg.slice(0, offset));
    params.push(aMsg.slice(offset + 1));
  } else {
    params.push(aMsg);
  }

  getAccount(aConv).sendMessage("KICK", params);
  return true;
}

// Send a message directly to a user.
// aMsg is <user> <message>
// aReturnedConv is optional and returns the resulting conversation.
function messageCommand(aMsg, aConv, aReturnedConv, aIsNotice = false) {
  // Trim leading whitespace.
  aMsg = aMsg.trimLeft();

  let nickname = aMsg;
  let message = "";

  const sep = aMsg.indexOf(" ");
  if (sep > -1) {
    nickname = aMsg.slice(0, sep);
    message = aMsg.slice(sep + 1);
  }
  if (!nickname.length) {
    return false;
  }

  const conv = getAccount(aConv).getConversation(nickname);
  if (aReturnedConv) {
    aReturnedConv.value = conv;
  }

  if (!message.length) {
    return true;
  }

  return privateMessage(aConv, message, nickname, aReturnedConv, aIsNotice);
}

// aAdd is true to add a mode, false to remove a mode.
function setMode(aNickname, aConv, aMode, aAdd) {
  if (!aNickname.length) {
    return false;
  }

  // Change the mode for each nick, as separator by spaces.
  return splitInput(aNickname).every(aNick =>
    simpleCommand(aConv, "MODE", [
      aConv.name,
      (aAdd ? "+" : "-") + aMode,
      aNick,
    ])
  );
}

function actionCommand(aMsg, aConv) {
  // Don't try to send an empty action.
  if (!aMsg || !aMsg.trim().length) {
    return false;
  }

  const conv = getConv(aConv);

  conv.sendMsg(aMsg, true);

  return true;
}

// This will open the conversation, and send and display the text.
// aReturnedConv is optional and returns the resulting conversation.
// aIsNotice is optional and sends a NOTICE instead of a PRIVMSG.
function privateMessage(aConv, aMsg, aNickname, aReturnedConv, aIsNotice) {
  if (!aMsg.length) {
    return false;
  }

  const conv = getAccount(aConv).getConversation(aNickname);
  conv.sendMsg(aMsg, false, aIsNotice);
  if (aReturnedConv) {
    aReturnedConv.value = conv;
  }
  return true;
}

// This will send a command to the server, if no parameters are given, it is
// assumed that the command takes no parameters. aParams can be either a single
// string or an array of parameters.
function simpleCommand(aConv, aCommand, aParams) {
  if (!aParams || !aParams.length) {
    getAccount(aConv).sendMessage(aCommand);
  } else {
    getAccount(aConv).sendMessage(aCommand, aParams);
  }
  return true;
}

// Sends a CTCP message to aTarget using the CTCP command aCommand and aMsg as
// a CTCP parameter.
function ctcpCommand(aConv, aTarget, aCommand, aParams) {
  return getAccount(aConv).sendCTCPMessage(aTarget, false, aCommand, aParams);
}

// Replace the command name in the help string so translators do not attempt to
// translate it.
export var commands = [
  {
    name: "action",
    get helpString() {
      return lazy.l10n.formatValueSync("command-action", {
        commandName: "action",
      });
    },
    run: actionCommand,
  },
  {
    name: "ban",
    get helpString() {
      return lazy.l10n.formatValueSync("command-ban", { commandName: "ban" });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: (aMsg, aConv) => setMode(aMsg, aConv, "b", true),
  },
  {
    name: "ctcp",
    get helpString() {
      return lazy.l10n.formatValueSync("command-ctcp", { commandName: "ctcp" });
    },
    run(aMsg, aConv) {
      const separator = aMsg.indexOf(" ");
      // Ensure we have two non-empty parameters.
      if (separator < 1 || separator + 1 == aMsg.length) {
        return false;
      }

      // The first word is used as the target, the rest is used as CTCP command
      // and parameters.
      ctcpCommand(aConv, aMsg.slice(0, separator), aMsg.slice(separator + 1));
      return true;
    },
  },
  {
    name: "chanserv",
    get helpString() {
      return lazy.l10n.formatValueSync("command-chanserv", {
        commandName: "chanserv",
      });
    },
    run: (aMsg, aConv) => privateMessage(aConv, aMsg, "ChanServ"),
  },
  {
    name: "deop",
    get helpString() {
      return lazy.l10n.formatValueSync("command-deop", { commandName: "deop" });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: (aMsg, aConv) => setMode(aMsg, aConv, "o", false),
  },
  {
    name: "devoice",
    get helpString() {
      return lazy.l10n.formatValueSync("command-devoice", {
        commandName: "devoice",
      });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: (aMsg, aConv) => setMode(aMsg, aConv, "v", false),
  },
  {
    name: "invite",
    get helpString() {
      return lazy.l10n.formatValueSync("command-invite2", {
        commandName: "invite",
      });
    },
    run(aMsg, aConv) {
      const params = splitInput(aMsg);

      // Try to find one, and only one, channel in the list of parameters.
      let channel;
      const account = getAccount(aConv);
      // Find the first param that could be a channel name.
      for (let i = 0; i < params.length; ++i) {
        if (account.isMUCName(params[i])) {
          // If channel is set, two channel names have been found.
          if (channel) {
            return false;
          }

          // Remove that parameter and store it.
          channel = params.splice(i, 1)[0];
        }
      }

      // If no parameters or only a channel are given.
      if (!params[0].length) {
        return false;
      }

      // Default to using the current conversation as the channel to invite to.
      if (!channel) {
        channel = aConv.name;
      }

      params.forEach(p => simpleCommand(aConv, "INVITE", [p, channel]));
      return true;
    },
  },
  {
    name: "join",
    get helpString() {
      return lazy.l10n.formatValueSync("command-join", { commandName: "join" });
    },
    run(aMsg, aConv, aReturnedConv) {
      let params = aMsg.trim().split(/,\s*/);
      const account = getAccount(aConv);
      let conv;
      if (!params[0]) {
        conv = getConv(aConv);
        if (!conv.isChat || !conv.left) {
          return false;
        }
        // Rejoin the current channel. If the channel was explicitly parted
        // by the user, chatRoomFields will have been deleted.
        // Otherwise, make use of it (e.g. if the user was kicked).
        if (conv.chatRoomFields) {
          account.joinChat(conv.chatRoomFields);
          return true;
        }
        params = [conv.name];
      }
      params.forEach(function (joinParam) {
        if (joinParam) {
          const chatroomfields =
            account.getChatRoomFieldValuesFromString(joinParam);
          conv = account.joinChat(chatroomfields);
        }
      });
      if (aReturnedConv) {
        aReturnedConv.value = conv;
      }
      return true;
    },
  },
  {
    name: "kick",
    get helpString() {
      return lazy.l10n.formatValueSync("command-kick", { commandName: "kick" });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: kickCommand,
  },
  {
    name: "list",
    get helpString() {
      return lazy.l10n.formatValueSync("command-list", { commandName: "list" });
    },
    run(aMsg, aConv, aReturnedConv) {
      const account = getAccount(aConv);
      const serverName = account._currentServerName;
      const serverConv = account.getConversation(serverName);
      let pendingChats = [];
      account.requestRoomInfo(
        {
          onRoomInfoAvailable(aRooms) {
            if (!pendingChats.length) {
              (async function () {
                // pendingChats has no rooms added yet, so ensure we wait a tick.
                let t = 0;
                const kMaxBlockTime = 10; // Unblock every 10ms.
                do {
                  if (Date.now() > t) {
                    await new Promise(resolve =>
                      Services.tm.dispatchToMainThread(resolve)
                    );
                    t = Date.now() + kMaxBlockTime;
                  }
                  const name = pendingChats.pop();
                  const roomInfo = account.getRoomInfo(name);
                  serverConv.writeMessage(
                    serverName,
                    name +
                      " (" +
                      roomInfo.participantCount +
                      ") " +
                      roomInfo.topic,
                    {
                      incoming: true,
                      noLog: true,
                    }
                  );
                } while (pendingChats.length);
              })();
            }
            pendingChats = pendingChats.concat(aRooms);
          },
        },
        true
      );
      if (aReturnedConv) {
        aReturnedConv.value = serverConv;
      }
      return true;
    },
  },
  {
    name: "me",
    get helpString() {
      return lazy.l10n.formatValueSync("command-action", { commandName: "me" });
    },
    run: actionCommand,
  },
  {
    name: "memoserv",
    get helpString() {
      return lazy.l10n.formatValueSync("command-memoserv", {
        commandName: "memoserv",
      });
    },
    run: (aMsg, aConv) => privateMessage(aConv, aMsg, "MemoServ"),
  },
  {
    name: "mode",
    get helpString() {
      return (
        lazy.l10n.formatValueSync("command-mode-user2", {
          commandName: "mode",
        }) +
        "\n" +
        lazy.l10n.formatValueSync("command-mode-channel2", {
          commandName: "mode",
        })
      );
    },
    run(aMsg, aConv) {
      function isMode(aString) {
        return "+-".includes(aString[0]);
      }
      let params = splitInput(aMsg);
      const channel = aConv.name;
      // Add the channel as parameter when the target is not specified. i.e
      // 1. message is empty.
      // 2. the first parameter is a mode.
      if (!aMsg) {
        params = [channel];
      } else if (isMode(params[0])) {
        params.unshift(channel);
      }

      // Ensure mode string to be the second argument.
      if (params.length >= 2 && !isMode(params[1])) {
        return false;
      }

      return simpleCommand(aConv, "MODE", params);
    },
  },
  {
    name: "msg",
    get helpString() {
      return lazy.l10n.formatValueSync("command-msg", { commandName: "msg" });
    },
    run: messageCommand,
  },
  {
    name: "nick",
    get helpString() {
      return lazy.l10n.formatValueSync("command-nick", { commandName: "nick" });
    },
    run(aMsg, aConv) {
      const newNick = aMsg.trim();
      // eslint-disable-next-line mozilla/use-includes-instead-of-indexOf
      if (newNick.indexOf(/\s+/) != -1) {
        return false;
      }

      const account = getAccount(aConv);
      // The user wants to change their nick, so overwrite the account
      // nickname for this session.
      account._requestedNickname = newNick;
      account.changeNick(newNick);

      return true;
    },
  },
  {
    name: "nickserv",
    get helpString() {
      return lazy.l10n.formatValueSync("command-nickserv", {
        commandName: "nickserv",
      });
    },
    run: (aMsg, aConv) => privateMessage(aConv, aMsg, "NickServ"),
  },
  {
    name: "notice",
    get helpString() {
      return lazy.l10n.formatValueSync("command-notice", "notice");
    },
    run: (aMsg, aConv, aReturnedConv) =>
      messageCommand(aMsg, aConv, aReturnedConv, true),
  },
  {
    name: "op",
    get helpString() {
      return lazy.l10n.formatValueSync("command-op", "op");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: (aMsg, aConv) => setMode(aMsg, aConv, "o", true),
  },
  {
    name: "operserv",
    get helpString() {
      return lazy.l10n.formatValueSync("command-operserv", {
        commandName: "operserv",
      });
    },
    run: (aMsg, aConv) => privateMessage(aConv, aMsg, "OperServ"),
  },
  {
    name: "part",
    get helpString() {
      return lazy.l10n.formatValueSync("command-part", "part");
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      getConv(aConv).part(aMsg);
      return true;
    },
  },
  {
    name: "ping",
    get helpString() {
      return lazy.l10n.formatValueSync("command-ping", { commandName: "ping" });
    },
    run(aMsg, aConv) {
      // Send a ping to the entered nick using the current time (in
      // milliseconds) as the param. If no nick is entered, ping the
      // server.
      if (aMsg && aMsg.trim().length) {
        ctcpCommand(aConv, aMsg, "PING", Date.now());
      } else {
        getAccount(aConv).sendMessage("PING", Date.now());
      }

      return true;
    },
  },
  {
    name: "query",
    get helpString() {
      return lazy.l10n.formatValueSync("command-msg", { commandName: "query" });
    },
    run: messageCommand,
  },
  {
    name: "quit",
    get helpString() {
      return lazy.l10n.formatValueSync("command-quit", { commandName: "quit" });
    },
    run(aMsg, aConv) {
      const account = getAccount(aConv);
      account.disconnect(aMsg);
      // While prpls shouldn't usually touch imAccount, this disconnection
      // is an action the user requested via the UI. Without this call,
      // the imAccount would immediately reconnect the account.
      account.imAccount.disconnect();
      return true;
    },
  },
  {
    name: "quote",
    get helpString() {
      return lazy.l10n.formatValueSync("command-quote", {
        commandName: "quote",
      });
    },
    run(aMsg, aConv) {
      if (!aMsg.length) {
        return false;
      }

      getAccount(aConv).sendRawMessage(aMsg);
      return true;
    },
  },
  {
    name: "remove",
    get helpString() {
      return lazy.l10n.formatValueSync("command-kick", {
        commandName: "remove",
      });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: kickCommand,
  },
  {
    name: "time",
    get helpString() {
      return lazy.l10n.formatValueSync("command-time", { commandName: "time" });
    },
    run(aMsg, aConv) {
      // Send a time command to the entered nick using the current time (in
      // milliseconds) as the param. If no nick is entered, get the current
      // server time.
      if (aMsg && aMsg.trim().length) {
        ctcpCommand(aConv, aMsg, "TIME");
      } else {
        getAccount(aConv).sendMessage("TIME");
      }

      return true;
    },
  },
  {
    name: "topic",
    get helpString() {
      return lazy.l10n.formatValueSync("command-topic", {
        commandName: "topic",
      });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run(aMsg, aConv) {
      aConv.topic = aMsg;
      return true;
    },
  },
  {
    name: "umode",
    get helpString() {
      return lazy.l10n.formatValueSync("command-umode", {
        commandName: "umode",
      });
    },
    run(aMsg, aConv) {
      const params = aMsg ? splitInput(aMsg) : [];
      params.unshift(getAccount(aConv)._nickname);
      return simpleCommand(aConv, "MODE", params);
    },
  },
  {
    name: "version",
    get helpString() {
      return lazy.l10n.formatValueSync("command-version", {
        commandName: "version",
      });
    },
    run(aMsg, aConv) {
      if (!aMsg || !aMsg.trim().length) {
        return false;
      }
      ctcpCommand(aConv, aMsg, "VERSION");
      return true;
    },
  },
  {
    name: "voice",
    get helpString() {
      return lazy.l10n.formatValueSync("command-voice", {
        commandName: "voice",
      });
    },
    usageContext: IMServices.cmd.COMMAND_CONTEXT.CHAT,
    run: (aMsg, aConv) => setMode(aMsg, aConv, "v", true),
  },
  {
    name: "whois",
    get helpString() {
      return lazy.l10n.formatValueSync("command-whois2", {
        commandName: "whois",
      });
    },
    run(aMsg, aConv) {
      // Note that this will automatically run whowas if the nick is offline.
      aMsg = aMsg.trim();
      // If multiple parameters are given, this is an error.
      if (aMsg.includes(" ")) {
        return false;
      }
      // If the user does not provide a nick, but is in a private conversation,
      // assume the user is trying to whois the person they are talking to.
      if (!aMsg) {
        if (aConv.isChat) {
          return false;
        }
        aMsg = aConv.name;
      }
      getConv(aConv).requestCurrentWhois(aMsg);
      return true;
    },
  },
];
