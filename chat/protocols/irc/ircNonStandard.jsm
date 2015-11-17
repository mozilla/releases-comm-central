/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * There are a variety of non-standard extensions to IRC that are implemented by
 * different servers. This implementation is based on a combination of
 * documentation and reverse engineering. Each handler must include a comment
 * listing the known servers that support this extension.
 *
 * Resources for these commands include:
 *  https://github.com/atheme/charybdis/blob/master/include/numeric.h
 *  http://hg.unrealircd.com/hg/unreal/raw-file/tip/include/numeric.h
 */
this.EXPORTED_SYMBOLS = ["ircNonStandard"];

var {interfaces: Ci, utils: Cu} = Components;

Cu.import("resource:///modules/ircHandlers.jsm");
Cu.import("resource:///modules/ircUtils.jsm");

var ircNonStandard = {
  name: "Non-Standard IRC Extensions",
  priority: ircHandlers.DEFAULT_PRIORITY + 1,
  isEnabled: () => true,

  commands: {
    "NOTICE": function(aMessage) {
      // NOTICE <msgtarget> <text>

      if (aMessage.params[1].startsWith("*** You cannot list within the first")) {
        // SECURELIST: "You cannot list within the first N seconds of connecting.
        // Please try again later." This NOTICE will be followed by a 321/323
        // pair, but no list data.
        // We fake the last LIST time so that we will retry LIST the next time
        // the user requires it after the interval specified.
        const kMinute = 60000;
        let waitTime = (aMessage.params[1].split(" ")[7] * 1000) || kMinute;
        this._lastListTime = Date.now() + waitTime - kListRefreshInterval;
        return true;
      }

      // If the user is connected, fallback to normal processing, everything
      // past this points deals with NOTICE messages that occur before 001 is
      // received.
      if (this.connected)
        return false;

      let target = aMessage.params[0].toLowerCase();

      // If we receive a ZNC error message requesting a password, the
      // serverPassword preference was not set by the user. Attempt to log into
      // ZNC using the account password.
      if (target == "auth" &&
          aMessage.params[1].startsWith("*** You need to send your password.")) {
        if (this.imAccount.password) {
          // Send the password now, if it is available.
          this.shouldAuthenticate = false;
          this.sendMessage("PASS", this.imAccount.password,
                           "PASS <password not logged>");
        }
        else {
          // Otherwise, put the account in an error state.
          this.gotDisconnected(Ci.prplIAccount.ERROR_AUTHENTICATION_IMPOSSIBLE,
                               _("connection.error.passwordRequired"));
        }

        // All done for ZNC.
        return true;
      }

      // Some servers, e.g. irc.umich.edu, use NOTICE during connection
      // negotation to give directions to users, these MUST be shown to the
      // user. If the message starts with ***, we assume it is probably an AUTH
      // message, which falls through to normal NOTICE processing.
      // Note that if the user's nick is auth this COULD be a notice directed at
      // them. For reference: moznet sends Auth (previously sent AUTH), freenode
      // sends *.
      let isAuth = target == "auth" && this._nickname.toLowerCase() != "auth";
      if (!aMessage.params[1].startsWith("***") && !isAuth) {
        this.getConversation(aMessage.origin)
            .writeMessage(aMessage.origin, aMessage.params[1],
                          {incoming: true});
        return true;
      }

      return false;
    },

    "042": function(aMessage) { // RPL_YOURID (IRCnet)
      // <nick> <id> :your unique ID
      return true;
    },

    "307": function(aMessage) {
      // TODO RPL_SUSERHOST (AustHex)
      // TODO RPL_USERIP (Undernet)
      // <user ips>

      // RPL_WHOISREGNICK (Unreal & Bahamut)
      // <nick> :is a registered nick
      if (aMessage.params.length == 3)
        return this.setWhois(aMessage.params[1], {registered: true});

      return false;
    },

    "317": function(aMessage) { // RPL_WHOISIDLE (Unreal & Charybdis)
      // <nick> <integer> <integer> :seconds idle, signon time
      // This is a non-standard extension to RPL_WHOISIDLE which includes the
      // sign-on time.
      if (aMessage.params.length == 5)
        this.setWhois(aMessage.params[1], {signonTime: aMessage.params[3]});

      return false;
    },

    "328": function(aMessage) { // RPL_CHANNEL_URL (Bahamut & Austhex)
      // <channel> :<URL>
      return true;
    },

    "329": function(aMessage) { // RPL_CREATIONTIME (Bahamut & Unreal)
      // <channel> <creation time>
      return true;
    },

    "330": function(aMessage) {
      // TODO RPL_WHOWAS_TIME

      // RPL_WHOISACCOUNT (Charybdis, ircu & Quakenet)
      // <nick> <authname> :is logged in as
      if (aMessage.params.length == 4) {
        let [, nick, authname] = aMessage.params;
        // If the authname differs from the nickname, add it to the WHOIS
        // information; otherwise, ignore it.
        if (this.normalize(nick) != this.normalize(authname))
          this.setWhois(nick, {registeredAs: authname});
      }
      return true;
    },

    "335": function(aMessage) { // RPL_WHOISBOT (Unreal)
      // <nick> :is a \002Bot\002 on <network>
      return this.setWhois(aMessage.params[1], {bot: true});
    },

    "338": function(aMessage) {
      // RPL_CHANPASSOK
      // RPL_WHOISACTUALLY (ircu, Bahamut, Charybdis)
      // <nick> <user> <ip> :actually using host
      return true;
    },

    "378": function(aMessage) { // RPL_WHOISHOST (Unreal & Charybdis)
      // <nick> :is connecting from <host> <ip>
      let [host, ip] = aMessage.params[2].split(" ").slice(-2);
      return this.setWhois(aMessage.params[1], {host: host, ip: ip});
    },

    "379": function(aMessage) { // RPL_WHOISMODES (Unreal, Inspircd)
      // <nick> :is using modes <modes>
      // Sent in response to a WHOIS on the user.
      return true;
    },

    "396": function(aMessage) {
      // RPL_HOSTHIDDEN (Charybdis, Hybrid, ircu, etc.)
      // RPL_VISIBLEHOST (Plexus)
      // RPL_YOURDISPLAYEDHOST (Inspircd)
      // <host> :is now your hidden host

      // This is the host that will be sent to other users.
      this.prefix = "!" + aMessage.user + "@" + aMessage.params[1];
      return true;
    },

    "464": function(aMessage) {
      // :Password required
      // If we receive a ZNC error message requesting a password, eat it since
      // a NOTICE AUTH will follow causing us to send the password. This numeric
      // is, unfortunately, also sent if you give a wrong password. The
      // parameter in that case is "Invalid Password".
      return aMessage.origin == "irc.znc.in" &&
             aMessage.params[1] == "Password required";
    },

    "470": function(aMessage) { // Channel forward (Unreal, inspircd)
      // <requested channel> <redirect channel>: You may not join this channel,
      // so you are automatically being transferred to the redirect channel.
      // Join redirect channel so when the automatic join happens, we are
      // not surprised.
      this.joinChat(this.getChatRoomDefaultFieldValues(aMessage.params[2]));
      // Mark requested channel as left and add a system message.
      return conversationErrorMessage(this, aMessage, "error.channelForward",
        true, false);
    },

    "499": function(aMessage) { // ERR_CHANOWNPRIVNEEDED (Unreal)
      // <channel> :You're not the channel owner (status +q is needed)
      return conversationErrorMessage(this, aMessage, "error.notChannelOwner");
    },

    "671": function(aMessage) { // RPL_WHOISSECURE (Unreal & Charybdis)
      // <nick> :is using a Secure connection
      return this.setWhois(aMessage.params[1], {secure: true});
    },

    "998": function(aMessage) {
      // irc.umich.edu shows an ASCII captcha that must be typed in by the user.
      this.getConversation(aMessage.origin)
          .writeMessage(aMessage.origin, aMessage.params[1],
                        {incoming: true, noFormat: true});
      return true;
    }
  }
};
