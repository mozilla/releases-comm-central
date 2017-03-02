/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, results: Cr, utils: Cu} = Components;

Cu.import("resource:///modules/imXPCOMUtils.jsm");
Cu.import("resource:///modules/jsProtoHelper.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

XPCOMUtils.defineLazyModuleGetter(this, "MatrixSDK",
                                  "resource:///modules/matrix-sdk.jsm"
);

function MatrixParticipant(aRoomMember) {
  // FIXME: Should probably use aRoomMember.name, but it's not unique id?
  this._name = aRoomMember.userId;
  this._roomMember = aRoomMember;
}
MatrixParticipant.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
  get alias() { return this._roomMember.name; },
};

/*
 * TODO Other functionality from MatrixClient to implement:
 *  sendNotice
 *  sendReadReceipt
 *  sendTyping
 *  setPowerLevel
 *  setRoomTopic
 */
function MatrixConversation(aAccount, aName, aNick)
{
  this._init(aAccount, aName, aNick);
}
MatrixConversation.prototype = {
  __proto__: GenericConvChatPrototype,
  sendMsg: function(aMsg) {
    this._account._client.sendTextMessage(this._roomId, aMsg);
  },
  get room() { return this._account._client.getRoom(this._roomId); },
  addParticipant: function(aRoomMember) {
    if (this._participants.has(aRoomMember.userId))
      return;

    let participant = new MatrixParticipant(aRoomMember);
    this._participants.set(aRoomMember.userId, participant);
    this.notifyObservers(new nsSimpleEnumerator([participant]),
                         "chat-buddy-add");
  },
  initListOfParticipants: function() {
    let conv = this;
    let participants = [];
    this.room.getJoinedMembers().forEach(function(aRoomMember) {
      if (!conv._participants.has(aRoomMember.userId)) {
        let participant = new MatrixParticipant(aRoomMember)
        participants.push(participant);
        conv._participants.set(aRoomMember.userId, participant);
      }
    });
    if (participants.length)
      this.notifyObservers(new nsSimpleEnumerator(participants),
                           "chat-buddy-add");
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
function MatrixAccount(aProtocol, aImAccount)
{
  this._init(aProtocol, aImAccount);
}
MatrixAccount.prototype = {
  __proto__: GenericAccountPrototype,
  observe: function(aSubject, aTopic, aData) {},
  remove: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  unInit: function() { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },
  connect: function() {
    this.reportConnecting();
    let baseURL = this.getString("server") + ":" + this.getInt("port");
    let account = this;
    // We call MatrixSDK.createClient twice because loginWithPassword does not
    // properly set access token.
    // See https://github.com/matrix-org/matrix-js-sdk/issues/130
    MatrixSDK.createClient(baseURL)
      .loginWithPassword(this.name, this.imAccount.password)
      .then(function(data) {
        // TODO: Check data.errcode to pass more accurate value as the first
        // parameter of reportDisconnecting.
        if (data.error)
          throw new Error(data.error);
        account._client = MatrixSDK.createClient({
          baseUrl: baseURL,
          accessToken: data.access_token,
          userId: data.user_id
        });
        account.startClient();
      }).catch(function(error) {
        account.reportDisconnecting(Ci.prplIAccount.ERROR_OTHER_ERROR, error.message);
        account._client = null;
        account.reportDisconnected();
      }).done();
  },
  /*
   * Hook up the Matrix Client to callbacks to handle various events.
   *
   * These are documented at:
   * https://matrix-org.github.io/matrix-js-sdk/0.7.0/module-client.html#~event:MatrixClient%2522Call.incoming%2522
   */
  startClient: function() {
    let account = this;
    this._client.on("sync", function(state, prevState, data) {
      switch (state) {
        case "PREPARED":
          account.reportConnected();
        break;
        case "STOPPED":
          // XXX Report disconnecting here?
          account._client.logout().done(function() {
            account.reportDisconnected();
            account._client = null;
          });
        break;
        // TODO: Handle other states (RECONNECTING, ERROR, SYNCING).
      }
    });
    this._client.on("RoomMember.membership", function(event, member, oldMembership) {
      if (member.roomId in account._roomList) {
        var room = account._roomList[member.roomId];
        if (member.membership === "join")
          room.addParticipant(member);
        else
          room.removeParticipant(member.userId);
      }
    });
    this._client.on("Room.timeline", function(event, room, toStartOfTimeline) {
      // TODO: Better handle messages!
      if (toStartOfTimeline)
        return;
      if (room.roomId in account._roomList) {
        let body;
        if (event.getType() === "m.room.message") {
          body = event.getContent().body;
        } else {
          body = JSON.stringify(event.getContent());
        }
        account._roomList[room.roomId].
          writeMessage(event.getSender(), body, { incoming: true });
      }
    });

    // TODO Other events to handle:
    //  Room.accountData
    //  Room.localEchoUpdated
    //  Room.name
    //  Room.tags
    //  Room
    //  RoomMember.name
    //  RoomMember.powerLevel
    //  RoomMember.typing
    //  Session.logged_out
    //  User.avatarUrl
    //  User.currentlyActive
    //  User.displayName
    //  User.presence

    this._client.startClient();
  },
  disconnect: function() {
    if (this._client)
      this._client.stopClient();
  },

  get canJoinChat() { return true; },
  chatRoomFields: {
    // XXX Does it make sense to split up the server into a separate field?
    roomIdOrAlias: {
      get label() { return _("chatRoomField.room"); },
      required: true
    },
  },
  parseDefaultChatName: function(aDefaultName) {
    let chatFields = {
      roomIdOrAlias: aDefaultName,
    };

    return chatFields;
  },
  joinChat: function(aComponents) {
    let roomIdOrAlias = aComponents.getValue("roomIdOrAlias").trim();
    let domain = this._client.getDomain();
    // For the format of room id and alias, see the matrix documentation:
    // https://matrix.org/docs/spec/intro.html#room-structure
    // https://matrix.org/docs/spec/intro.html#room-aliases
    if (!roomIdOrAlias.endsWith(":" + domain))
      roomIdOrAlias += ":" + domain;
    if (!roomIdOrAlias.match("^[!#]"))
      roomIdOrAlias = "#" + roomIdOrAlias;

    // TODO: Use getRoom to find existing conversation?
    let conv = new MatrixConversation(this, roomIdOrAlias, this.userId);
    conv.joining = true;
    let account = this;
    this._client.joinRoom(roomIdOrAlias).then(function(room) {
      conv._roomId = room.roomId;
      account._roomList[room.roomId] = conv;
      conv.initListOfParticipants();
      conv.joining = false;
    }).catch(function(error) {
        // TODO: Handle errors?
        // XXX We probably want to display an error in the open conversation
        //     window and leave it as unjoined.
        account.ERROR(error);
        conv.close();

        // TODO Perhaps we should call createRoom if the room doesn't exist.
    }).done();
    return conv;
  },
  createConversation: function(aName) { throw Cr.NS_ERROR_NOT_IMPLEMENTED; },

  get userId() { return this._client.credentials.userId; },
  _client: null,
  _roomList: new Map(),
}

function MatrixProtocol() {
}
MatrixProtocol.prototype = {
  __proto__: GenericProtocolPrototype,
  get normalizedName() { return "matrix"; },
  get name() { return "Matrix"; },
  get iconBaseURI() { return "chrome://prpl-matrix/skin/"; },
  getAccount: function(aImAccount) { return new MatrixAccount(this, aImAccount); },

  options: {
    // XXX Default to matrix.org once we support connection as guest?
    server: {
      get label() { return _("options.connectServer"); },
      default: "https://"
    },
    port: {
      get label() { return _("options.connectPort"); },
      default: 443
    }
  },

  get chatHasTopic() { return true; },

  classID: Components.ID("{e9653ac6-a671-11e6-bf84-60a44c717042}")
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([MatrixProtocol]);
