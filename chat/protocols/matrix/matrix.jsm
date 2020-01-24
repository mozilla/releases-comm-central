/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MatrixProtocol"];

var {
  XPCOMUtils,
  EmptyEnumerator,
  nsSimpleEnumerator,
  l10nHelper,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var {
  GenericAccountPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericProtocolPrototype,
  TooltipInfo,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineModuleGetter(
  this,
  "MatrixSDK",
  "resource:///modules/matrix-sdk.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "getHttpUriForMxc",
  "resource:///modules/matrix-sdk.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "DownloadUtils",
  "resource://gre/modules/DownloadUtils.jsm"
);

function MatrixParticipant(aRoomMember) {
  this._id = aRoomMember.userId;
  this._roomMember = aRoomMember;
}
MatrixParticipant.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
  get alias() {
    return this._roomMember.name;
  },
  get name() {
    return this._roomMember.name;
  },

  // See https://matrix.org/docs/spec/client_server/r0.5.0#m-room-power-levels
  get voiced() {
    return this._roomMember.powerLevelNorm >= 10;
  },
  get halfOp() {
    return this._roomMember.powerLevelNorm >= 25;
  },
  get op() {
    return this._roomMember.powerLevelNorm >= 50;
  },
  get founder() {
    return this._roomMember.powerLevelNorm == 100;
  },
};

/*
 * TODO Other functionality from MatrixClient to implement:
 *  sendNotice
 *  sendReadReceipt
 *  sendTyping
 *  setPowerLevel
 *  setRoomTopic
 */
function MatrixConversation(aAccount, aName, aNick) {
  this._init(aAccount, aName, aNick);
}
MatrixConversation.prototype = {
  __proto__: GenericConvChatPrototype,
  sendMsg(aMsg) {
    this._account._client.sendTextMessage(this._roomId, aMsg);
  },
  get room() {
    return this._account._client.getRoom(this._roomId);
  },
  addParticipant(aRoomMember) {
    if (this._participants.has(aRoomMember.userId)) {
      return;
    }

    let participant = new MatrixParticipant(aRoomMember);
    this._participants.set(aRoomMember.userId, participant);
    this.notifyObservers(
      new nsSimpleEnumerator([participant]),
      "chat-buddy-add"
    );
  },

  /*
   * Initialize the room after the response from the Matrix client.
   */
  initRoom(aRoom) {
    // Store the ID of the room to look up information in the future.
    this._roomId = aRoom.roomId;

    // If there are any participants, create them.
    let participants = [];
    aRoom.getJoinedMembers().forEach(aRoomMember => {
      if (!this._participants.has(aRoomMember.userId)) {
        let participant = new MatrixParticipant(aRoomMember);
        participants.push(participant);
        this._participants.set(aRoomMember.userId, participant);
      }
    });
    if (participants.length) {
      this.notifyObservers(
        new nsSimpleEnumerator(participants),
        "chat-buddy-add"
      );
    }
  },
};

/*
 * TODO Other random functionality from MatrixClient that will be useful:
 *  getRooms / getUsers / publicRooms
 *  invite
 *  ban / kick
 *  leave
 *  redactEvent
 *  scrollback
 *  setAvatarUrl
 *  setDisplayName
 *  setPassword
 *  setPresence
 */
function MatrixAccount(aProtocol, aImAccount) {
  this._init(aProtocol, aImAccount);
}
MatrixAccount.prototype = {
  __proto__: GenericAccountPrototype,
  observe(aSubject, aTopic, aData) {},
  remove() {},
  unInit() {},
  connect() {
    this.reportConnecting();
    let baseURL = this.getString("server") + ":" + this.getInt("port");

    this._client = MatrixSDK.createClient(baseURL);

    // Send the login request to the server.
    // See https://matrix-org.github.io/matrix-js-sdk/2.4.1/module-client-MatrixClient.html#loginWithPassword
    this._client
      .loginWithPassword(this.name, this.imAccount.password)
      .then(data => {
        // TODO: Check data.errcode to pass more accurate value as the first
        // parameter of reportDisconnecting.
        if (data.error) {
          throw new Error(data.error);
        }
        this.startClient();
      })
      .catch(error => {
        this.reportDisconnecting(
          Ci.prplIAccount.ERROR_OTHER_ERROR,
          error.message
        );
        this._client = null;
        this.reportDisconnected();
      });
  },
  /*
   * Hook up the Matrix Client to callbacks to handle various events.
   *
   * The possible events are documented starting at:
   * https://matrix-org.github.io/matrix-js-sdk/2.4.1/module-client.html#~event:MatrixClient%22accountData%22
   */
  startClient() {
    this._client.on("sync", (state, prevState, data) => {
      switch (state) {
        case "PREPARED":
          this.reportConnected();
          break;
        case "STOPPED":
          // XXX Report disconnecting here?
          this._client.logout().then(() => {
            this.reportDisconnected();
            this._client = null;
          });
          break;
        // TODO: Handle other states (RECONNECTING, ERROR, SYNCING).
      }
    });
    this._client.on("RoomMember.membership", (event, member, oldMembership) => {
      if (member.roomId in this._roomList) {
        var room = this._roomList[member.roomId];
        if (member.membership === "join") {
          room.addParticipant(member);
        } else if (member.membership === "leave") {
          room.removeParticipant(member.userId);
        }
        // Other options include "invite".
      }
    });
    this._client.on(
      "Room.timeline",
      (event, room, toStartOfTimeline, removed, data) => {
        // TODO: Better handle messages!
        if (toStartOfTimeline) {
          return;
        }
        if (room.roomId in this._roomList) {
          let body;
          if (event.getType() === "m.room.message") {
            body = event.getContent().body;
          } else {
            // TODO Any event that is not understood gets the raw content added to the conversation.
            body = JSON.stringify(event.getContent());
          }
          this._roomList[room.roomId].writeMessage(event.getSender(), body, {
            incoming: true,
          });
        }
      }
    );
    // Update the chat participant information.
    this._client.on("RoomMember.name", this.updateRoomMember);
    this._client.on("RoomMember.powerLevel", this.updateRoomMember);

    // TODO Other events to handle:
    //  Room.accountData
    //  Room.localEchoUpdated
    //  Room.name
    //  Room.tags
    //  Room
    //  RoomMember.typing
    //  Session.logged_out
    //  User.avatarUrl
    //  User.currentlyActive
    //  User.displayName
    //  User.presence

    this._client.startClient();

    // Get the list of joined rooms on the server and create those conversations.
    this._client.getJoinedRooms().then(response => {
      for (let roomId of response.joined_rooms) {
        let conv = new MatrixConversation(this, roomId, this.userId);
        this._roomList[roomId] = conv;
        let room = this._client.getRoom(roomId);
        if (room) {
          conv.initRoom(room);
        }
      }
    });
  },

  updateRoomMember(event, member) {
    if (member.roomId in this._roomList) {
      let conv = this._roomList[member.roomId];
      let participant = conv._participants.get(member.userId);
      // A participant might not exist (for example, this happens if the user
      // has only been invited, but has not yet joined).
      if (participant) {
        participant._roomMember = member;
        conv.notifyObservers(participant, "chat-buddy-update");
      }
    }
  },

  disconnect() {
    if (this._client) {
      this._client.stopClient();
    }
  },

  get canJoinChat() {
    return true;
  },
  chatRoomFields: {
    // XXX Does it make sense to split up the server into a separate field?
    roomIdOrAlias: {
      get label() {
        return _("chatRoomField.room");
      },
      required: true,
    },
  },
  parseDefaultChatName(aDefaultName) {
    let chatFields = {
      roomIdOrAlias: aDefaultName,
    };

    return chatFields;
  },
  joinChat(aComponents) {
    let roomIdOrAlias = aComponents.getValue("roomIdOrAlias").trim();
    let domain = this._client.getDomain();
    // For the format of room id and alias, see the matrix documentation:
    // https://matrix.org/docs/spec/intro.html#room-structure
    // https://matrix.org/docs/spec/intro.html#room-aliases
    if (!roomIdOrAlias.endsWith(":" + domain)) {
      roomIdOrAlias += ":" + domain;
    }
    if (!roomIdOrAlias.match(/^[!#]/)) {
      roomIdOrAlias = "#" + roomIdOrAlias;
    }

    // TODO: Use getRoom to find existing conversation?
    let conv = new MatrixConversation(this, roomIdOrAlias, this.userId);
    conv.joining = true;
    this._client
      .joinRoom(roomIdOrAlias)
      .then(room => {
        this._roomList[room.roomId] = conv;
        conv.initRoom(room);
        conv.joining = false;
      })
      .catch(error => {
        // TODO: Handle errors?
        // XXX We probably want to display an error in the open conversation
        //     window.
        this.ERROR(error);
        conv.joining = false;
        conv.left = true;

        // TODO Perhaps we should call createRoom if the room doesn't exist.
      });
    return conv;
  },
  createConversation(aName) {
    throw Cr.NS_ERROR_NOT_IMPLEMENTED;
  },

  requestBuddyInfo(aUserId) {
    let user = this._client.getUser(aUserId);
    if (!user) {
      Services.obs.notifyObservers(
        EmptyEnumerator,
        "user-info-received",
        aUserId
      );
      return;
    }

    // Convert timespan in milli-seconds into a human-readable form.
    let getNormalizedTime = function(aTime) {
      let valuesAndUnits = DownloadUtils.convertTimeUnits(aTime / 1000);
      // If the time is exact to the first set of units, trim off
      // the subsequent zeroes.
      if (!valuesAndUnits[2]) {
        valuesAndUnits.splice(2, 2);
      }
      return _("tooltip.timespan", valuesAndUnits.join(" "));
    };

    let tooltipInfo = [];

    if (user.displayName) {
      tooltipInfo.push(
        new TooltipInfo(_("tooltip.displayName"), user.displayName)
      );
    }

    // Add the user's current status.
    const kSetIdleStatusAfterSeconds = 3600;
    const kPresentToStatusEnum = {
      online: Ci.imIStatusInfo.STATUS_AVAILABLE,
      offline: Ci.imIStatusInfo.STATUS_AWAY,
      unavailable: Ci.imIStatusInfo.STATUS_OFFLINE,
    };
    let status = kPresentToStatusEnum[user.presence];
    // If the user hasn't been seen in a long time, consider them idle.
    if (
      !user.currentlyActive &&
      user.lastActiveAgo > kSetIdleStatusAfterSeconds
    ) {
      status = Ci.imIStatusInfo.STATUS_IDLE;

      tooltipInfo.push(
        new TooltipInfo(
          _("tooltip.lastActive"),
          getNormalizedTime(user.lastActiveAgo)
        )
      );
    }
    tooltipInfo.push(
      new TooltipInfo(
        status,
        user.presenceStatusMsg,
        Ci.prplITooltipInfo.status
      )
    );

    if (user.avatarUrl) {
      // This matches the configuration of the .userIcon class in chat.css.
      const width = 48;
      const height = 48;

      // Convert the MXC URL to an HTTP URL.
      let realUrl = getHttpUriForMxc(
        this._client.getHomeserverUrl(),
        user.avatarUrl,
        width,
        height,
        "scale",
        false
      );
      // TODO Cache the photo URI for this participant.
      tooltipInfo.push(
        new TooltipInfo(null, realUrl, Ci.prplITooltipInfo.icon)
      );
    }

    Services.obs.notifyObservers(
      new nsSimpleEnumerator(tooltipInfo),
      "user-info-received",
      aUserId
    );
  },

  get userId() {
    return this._client.credentials.userId;
  },
  _client: null,
  _roomList: new Map(),
};

function MatrixProtocol() {}
MatrixProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() {
    return "matrix";
  },
  get name() {
    return "Matrix";
  },
  get iconBaseURI() {
    return "chrome://prpl-matrix/skin/";
  },
  getAccount(aImAccount) {
    return new MatrixAccount(this, aImAccount);
  },

  options: {
    // XXX Default to matrix.org once we support connection as guest?
    server: {
      get label() {
        return _("options.connectServer");
      },
      default: "https://",
    },
    port: {
      get label() {
        return _("options.connectPort");
      },
      default: 443,
    },
  },

  get chatHasTopic() {
    return true;
  },
};
