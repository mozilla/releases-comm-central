/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MatrixProtocol"];

const { clearTimeout, setTimeout } = ChromeUtils.import(
  "resource://gre/modules/Timer.jsm"
);
var { XPCOMUtils, nsSimpleEnumerator, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var {
  GenericAccountPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericProtocolPrototype,
  GenericConversationPrototype,
  GenericConvIMPrototype,
  GenericAccountBuddyPrototype,
  GenericMessagePrototype,
  TooltipInfo,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");

Cu.importGlobalProperties(["indexedDB"]);

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

XPCOMUtils.defineLazyModuleGetters(this, {
  MatrixSDK: "resource:///modules/matrix-sdk.jsm",
  getHttpUriForMxc: "resource:///modules/matrix-sdk.jsm",
  EventTimeline: "resource:///modules/matrix-sdk.jsm",
  EventType: "resource:///modules/matrix-sdk.jsm",
  MsgType: "resource:///modules/matrix-sdk.jsm",
  MatrixPowerLevels: "resource:///modules/matrixPowerLevels.jsm",
  DownloadUtils: "resource://gre/modules/DownloadUtils.jsm",
  InteractiveBrowser: "resource:///modules/InteractiveBrowser.jsm",
  getMatrixTextForEvent: "resource:///modules/matrixTextForEvent.jsm",
});

/**
 * Homeserver information in client .well-known payload.
 * @const {string}
 */
const HOMESERVER_WELL_KNOWN = "m.homeserver";

// This matches the configuration of the .userIcon class in chat.css, which
// expects square icons.
const USER_ICON_SIZE = 48;
const SERVER_NOTICE_TAG = "m.server_notice";

/**
 * @param {string} who - Message sender ID.
 * @param {string} text - Message text.
 * @param {object} properties - Message properties, should also have an event
 *   property containing the corresponding MatrixEvent instance.
 */
function MatrixMessage(who, text, properties) {
  this._init(who, text, properties);
}
MatrixMessage.prototype = {
  __proto__: GenericMessagePrototype,

  /**
   * @type {MatrixEvent}
   */
  event: null,

  hideReadReceipts() {
    // Cache pref value. If this pref gets exposed in UI we need cache busting.
    if (this._hideReadReceipts === undefined) {
      this._hideReadReceipts = !Services.prefs.getBoolPref(
        "purple.conversations.im.send_read"
      );
    }
    return this._hideReadReceipts;
  },

  _displayed: false,
  _read: false,

  whenDisplayed() {
    if (this._displayed) {
      return;
    }
    this._displayed = true;
    this.conversation._account._client
      .sendReadReceipt(this.event, {
        hidden: this.hideReadReceipts,
      })
      .catch(error => this.conversation.ERROR(error));
  },

  whenRead() {
    // whenRead is also called when the conversation is closed.
    if (
      this._read ||
      !this.conversation._account ||
      this.conversation._account.noFullyRead
    ) {
      return;
    }
    this._read = true;
    this.conversation._account._client
      .setRoomReadMarkers(
        this.conversation._roomId,
        this.event.getId(),
        undefined,
        {
          hidden: this.hideReadReceipts,
        }
      )
      .catch(error => {
        if (error.errcode === "M_UNRECOGNIZED") {
          // Server does not support setting the fully read marker.
          this.conversation._account.noFullyRead = true;
        } else {
          this.conversation.ERROR(error);
        }
      });
  },
};

function MatrixParticipant(roomMember, account) {
  this._id = roomMember.userId;
  this._roomMember = roomMember;
  this._account = account;
}
MatrixParticipant.prototype = {
  __proto__: GenericConvChatBuddyPrototype,
  get alias() {
    return this._roomMember.name;
  },
  get name() {
    return this._id;
  },

  get buddyIconFilename() {
    return (
      this._roomMember.getAvatarUrl(
        this._account._client.getHomeserverUrl(),
        USER_ICON_SIZE,
        USER_ICON_SIZE,
        "scale",
        false
      ) || ""
    );
  },

  get voiced() {
    //TODO this should require the power level specified in m.room.power_levels for m.room.message.
    return this._roomMember.powerLevelNorm >= MatrixPowerLevels.voice;
  },
  get moderator() {
    return this._roomMember.powerLevelNorm >= MatrixPowerLevels.moderator;
  },
  get admin() {
    return this._roomMember.powerLevelNorm >= MatrixPowerLevels.admin;
  },
};

const kPresenceToStatusEnum = {
  online: Ci.imIStatusInfo.STATUS_AVAILABLE,
  offline: Ci.imIStatusInfo.STATUS_OFFLINE,
  unavailable: Ci.imIStatusInfo.STATUS_IDLE,
};
const kSetIdleStatusAfterSeconds = 300;

/**
 * Map matrix presence information to a Ci.imIStatusInfo statusType.
 *
 * @param {User} user - Matrix JS SDK User instance to get the status for.
 * @returns {number} Status enum value for the user.
 */
function getStatusFromPresence(user) {
  let status = kPresenceToStatusEnum[user.presence];
  // If the user hasn't been seen in a long time, consider them idle.
  if (
    user.presence === "online" &&
    !user.currentlyActive &&
    user.lastActiveAgo > kSetIdleStatusAfterSeconds
  ) {
    status = Ci.imIStatusInfo.STATUS_IDLE;
  }
  if (!status) {
    status = Ci.imIStatusInfo.STATUS_UNKNOWN;
  }
  return status;
}

/**
 * Matrix buddies only exist in association with at least one direct
 * conversation. They serve primarily to provide metadata to the
 * direct conversation rooms.
 *
 * @param {imIAccount} account
 * @param {imIBuddy|null} buddy
 * @param {imITag|null} tag
 * @param {string} [userId] - Matrix user ID, only required if no buddy is provided.
 */
function MatrixBuddy(account, buddy, tag, userId) {
  this._init(account, buddy, tag, userId);
}

MatrixBuddy.prototype = {
  __proto__: GenericAccountBuddyPrototype,

  get buddyIconFilename() {
    return (
      (this._user &&
        getHttpUriForMxc(this._account._baseURL, this._user.avatarUrl)) ||
      ""
    );
  },

  get canSendMessage() {
    return true;
  },

  /**
   * Initialize the buddy with a user.
   *
   * @param {User} user - Matrix user.
   */
  setUser(user) {
    this._user = user;
    this._serverAlias = user.displayName;
    this.setStatus(getStatusFromPresence(user), user.presenceStatusMsg ?? "");
  },

  /**
   * Updates the buddy's status based on its JS SDK user's presence.
   */
  setStatusFromPresence() {
    this.setStatus(
      getStatusFromPresence(this._user),
      this._user.presenceStatusMsg ?? ""
    );
  },

  remove() {
    const otherDMRooms = this._account._userToRoom[this.userName];
    for (const roomId of otherDMRooms) {
      if (this._account.roomList.has(roomId)) {
        const conversation = this._account.roomList.get(roomId);
        if (!conversation.isChat) {
          // Prevent the conversation from doing buddy cleanup
          delete conversation.buddy;
          conversation.close();
        }
      }
    }
    this._account.buddies.delete(this.userName);
    GenericAccountBuddyPrototype.remove.call(this);
  },

  getTooltipInfo() {
    return this._account.getBuddyInfo(this.userName);
  },

  createConversation() {
    return this._account.getDirectConversation(this.userName);
  },
};

/**
 * Matrix rooms are androgynous. Sometimes they are DM conversations, other
 * times they are MUCs.
 * This class implements both conversations state and transition between the
 * two. Methods are grouped by shared/MUC/DM.
 * The type is only changed on explicit request.
 *
 * @param {MatrixAccount} account - Account this room belongs to.
 * @param {boolean} isMUC - True if this is a group conversation.
 * @param {string} name - Name of the room.
 */
function MatrixRoom(account, isMUC, name) {
  this._isChat = isMUC;
  this._init(account, name, account.userId);
  this._initialized = new Promise(resolve => {
    this._resolveInitializer = resolve;
  });
}
MatrixRoom.prototype = {
  __proto__: GenericConvChatPrototype,
  /**
   * This conversation implements both the IM and the Chat prototype.
   */
  _interfaces: [Ci.prplIConversation, Ci.prplIConvIM, Ci.prplIConvChat],

  get isChat() {
    return this._isChat;
  },

  /**
   * ID of the most recent event written to the conversation.
   */
  _mostRecentEventId: null,

  /**
   * Leave the room if we close the conversation.
   */
  close() {
    this._account._client.leave(this._roomId);
    this.forget();
  },

  /**
   * Forget about this conversation instance. This closes the conversation in
   * the UI, but doesn't update the user's membership in the room.
   */
  forget() {
    if (!this.isChat) {
      this.closeDm();
    }
    this._account.roomList.delete(this._roomId);
    GenericConversationPrototype.close.call(this);
  },

  /**
   * Sends the given message as a text message to the Matrix room. Does not
   * create the local copy, that is handled by the local echo of the SDK.
   *
   * @param {string} msg - Message to send.
   */
  sendMsg(msg) {
    let content = {
      body: msg,
      msgtype: MsgType.Text,
    };
    this._account._client
      .sendEvent(this._roomId, EventType.RoomMessage, content, "")
      .catch(error => {
        this._account.ERROR("Failed to send message to: " + this._roomId);
      });
  },

  /**
   * Shared init function between conversation types
   *
   * @param {Room} room - associated room with the conversation.
   */
  initRoom(room) {
    if (!room) {
      return;
    }
    if (room.isSpaceRoom()) {
      this.writeMessage(this._account.userId, _("message.spaceNotSupported"), {
        system: true,
        incoming: true,
        error: true,
      });
      this._setInitialized();
      this.left = true;
      return;
    }
    // Store the ID of the room to look up information in the future.
    this._roomId = room.roomId;

    // Update the title to the human readable version.
    if (
      room.summary &&
      room.summary.info &&
      room.summary.info.title &&
      this._name != room.summary.info.title
    ) {
      this._name = room.summary.info.title;
      this.notifyObservers(null, "update-conv-title");
    }

    this.updateConvIcon();

    if (this.isChat) {
      this.initRoomMuc(room);
    } else {
      this.initRoomDm(room);
    }

    this._setInitialized();
  },

  /**
   * Mark conversation as initialized, meaning it has an associated room in the
   * state of the SDK. Sets the joining state to false and resolves
   * _initialized.
   */
  _setInitialized() {
    this.joining = false;
    this._resolveInitializer();
  },

  /**
   * Function to mark this room instance superceded by another one.
   * Useful when converting between DM and MUC or possibly room version
   * upgrades.
   *
   * @param {MatrixRoom} newRoom - Room that replaces this room.
   */
  replaceRoom(newRoom) {
    this._replacedBy = newRoom;
    newRoom._mostRecentEventId = this._mostRecentEventId;
    this._setInitialized();
  },

  /**
   * Wait until the conversation is fully initialized. Handles replacements of
   * the conversation in the meantime.
   *
   * @returns {MatrixRoom} The most recent instance of this room
   * that is fully initialized.
   */
  async waitForRoom() {
    await this._initialized;
    if (this._replacedBy) {
      return this._replacedBy.waitForRoom();
    }
    return this;
  },

  /**
   * Write all missing events to the conversation. Should be called once the
   * client is in a stable sync state again.
   *
   * @returns {Promise}
   */
  async catchup() {
    await this.waitForRoom();
    if (this.isChat) {
      const members = this.room.getJoinedMembers();
      const memberUserIds = members.map(member => member.userId);
      for (const userId of this._participants.keys()) {
        if (!memberUserIds.includes(userId)) {
          this.removeParticipant(userId);
        }
      }
      for (const member of members) {
        this.addParticipant(member);
      }

      this._name = this.room.summary.info.title;
      this.notifyObservers(null, "update-conv-title");
    }

    // Find the newest event id the user has already seen
    let latestOldEvent;
    if (this._mostRecentEventId) {
      latestOldEvent = this._mostRecentEventId;
    } else {
      // Last message the user has read with high certainty.
      const fullyRead = this.room.getAccountData(EventType.FullyRead);
      if (fullyRead) {
        latestOldEvent = fullyRead.getContent().event_id;
      }
    }
    // Get the timeline for the event, or just the current live timeline of the room
    let timelineWindow = new MatrixSDK.TimelineWindow(
      this._account._client,
      this.room.getUnfilteredTimelineSet()
    );
    const windowChunkSize = 100;
    await timelineWindow.load(latestOldEvent, windowChunkSize);
    // load() only makes sure the event is in the timeline window. The following
    // ensures that the first event in the window is the event immediately after
    // latestOldEvent.
    let firstEventOffset = 0;
    if (latestOldEvent) {
      for (const event of timelineWindow.getEvents()) {
        ++firstEventOffset;
        if (event.getId() === latestOldEvent) {
          break;
        }
      }
    }
    // Remove the old event from the window.
    timelineWindow.unpaginate(firstEventOffset, true);
    let newEvents = timelineWindow.getEvents();
    for (const event of newEvents) {
      this.addEvent(event, true);
    }
    while (timelineWindow.canPaginate(EventTimeline.FORWARDS)) {
      if (
        await timelineWindow.paginate(EventTimeline.FORWARDS, windowChunkSize)
      ) {
        timelineWindow.unpaginate(newEvents.length, true);
        newEvents = timelineWindow.getEvents();
        for (const event of newEvents) {
          this.addEvent(event, true);
        }
      } else {
        // Pagination was unable to add any more events
        break;
      }
    }
  },

  /**
   * Add a matrix event to the conversation's logs.
   *
   * @param {MatrixEvent} event
   * @param {boolean} [delayed=false] - Event is added while catching up to a live state.
   */
  addEvent(event, delayed = false) {
    // Redacted events have no content, nothing for us to display.
    // TODO full redaction support is Bug 1701218
    if (event.isRedacted()) {
      this._mostRecentEventId = event.getId();
      return;
    }
    const eventType = event.getType();
    if (eventType === EventType.RoomMessage) {
      const isOutgoing = event.getSender() == this._account.userId;
      const eventContent = event.getContent();
      // Only print server notices when we're in a server notice room.
      if (
        eventContent.msgtype === "m.server_notice" &&
        !this?.room.tags[SERVER_NOTICE_TAG]
      ) {
        return;
      }
      //TODO We should prefer the formatted body (when it's html)
      let message = eventContent.body;
      if (eventContent.msgtype === MsgType.Emote) {
        message = "/me " + message;
      }
      //TODO handle media messages better (currently just show file name)
      this.writeMessage(event.getSender(), message, {
        outgoing: isOutgoing,
        incoming: !isOutgoing,
        system: [MsgType.Notice, "m.server_notice"].includes(
          eventContent.msgtype
        ),
        time: Math.floor(event.getDate() / 1000),
        _alias: event.sender.name,
        delayed,
        event,
      });
    } else if (eventType == EventType.RoomTopic) {
      this.setTopic(event.getContent().topic, event.getSender());
    } else if (eventType == EventType.RoomTombstone) {
      // Room version update
      this.writeMessage(event.getSender(), event.getContent().body, {
        system: true,
        incoming: true,
        time: Math.floor(event.getDate() / 1000),
      });
      let newConversation = this._account.getGroupConversation(
        event.getContent().replacement_room,
        this.name
      );
      // Make sure the new room gets the correct conversation type.
      newConversation.checkForUpdate();
      this.replaceRoom(newConversation);
      this.forget();
      //TODO link to the old logs based on the |predecessor| field of m.room.create
    } else if (eventType == EventType.RoomAvatar) {
      // Update the icon of this room.
      this.updateConvIcon();
    } else {
      let message = getMatrixTextForEvent(event);
      // We don't think we should show a notice for this event.
      if (!message) {
        this.LOG("Unhandled event: " + JSON.stringify(event.toJSON()));
        this._mostRecentEventId = event.getId();
        return;
      }
      this.writeMessage(event.getSender(), message, {
        system: true,
        time: Math.floor(event.getDate() / 1000),
        _alias: event.sender.name,
        delayed,
        event,
      });
    }
    this._mostRecentEventId = event.getId();
  },

  _typingTimer: null,
  _typingState: false,

  /**
   * Sets up the composing end timeout and sets the typing state based on the
   * draft message if typing notifications should be sent.
   *
   * @param {string} string - Current draft message.
   * @returns {number} Amount of remaining characters.
   */
  sendTyping(string) {
    if (!this.shouldSendTypingNotifications) {
      return Ci.prplIConversation.NO_TYPING_LIMIT;
    }

    this._cancelTypingTimer();
    if (string.length) {
      this._typingTimer = setTimeout(this.finishedComposing.bind(this), 10000);
    }

    this._setTypingState(!!string.length);

    return Ci.prplIConversation.NO_TYPING_LIMIT;
  },

  /**
   * Set the typing status to false if typing notifications are sent.
   * @returns {undefined}
   */
  finishedComposing() {
    if (!this.shouldSendTypingNotifications) {
      return;
    }

    this._setTypingState(false);
  },

  /**
   * Send the given typing state, if it is changed.
   *
   * @param {boolean} isTyping - If the user is currently composing a message.
   * @returns {undefined}
   */
  _setTypingState(isTyping) {
    if (this._typingState == isTyping) {
      return;
    }

    this._account._client.sendTyping(this._roomId, isTyping);
    this._typingState = isTyping;
  },
  /**
   * Cancel the typing end timer.
   */
  _cancelTypingTimer() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      delete this._typingTimer;
    }
  },

  /**
   * Write a message to the local conversation. Sets the containsNick flag on
   * the message if appropriate.
   *
   * @param {string} aWho - MXID that composed the message.
   * @param {string} aText - Message text.
   * @param {object} aProperties - Extra attributes for the MatrixMessage.
   */
  writeMessage(aWho, aText, aProperties) {
    if (this.isChat) {
      //TODO respect room notification settings
      aProperties.containsNick =
        aProperties.incoming && this._pingRegexp.test(aText);
    }
    const message = new MatrixMessage(aWho, aText, aProperties);
    message.conversation = this;
  },

  /**
   * @type {Room}
   */
  get room() {
    return this._account._client.getRoom(this._roomId);
  },
  get roomState() {
    return this.room.getLiveTimeline().getState(EventTimeline.FORWARDS);
  },
  /**
   * If we should send typing notifications to the remote server.
   * @type {boolean}
   */
  get shouldSendTypingNotifications() {
    return Services.prefs.getBoolPref("purple.conversations.im.send_typing");
  },
  /**
   * The ID of the room.
   * @type {string}
   */
  get normalizedName() {
    return this._roomId;
  },

  /**
   * Check if the type of the conversation (MUC or DM) needs to be changed and
   * if it needs to change, update it. If the conv was replaced this will
   * check for an update on the new conversation.
   *
   * @returns {Promise<void>}
   */
  async checkForUpdate() {
    if (this._waitingForUpdate || this.left) {
      return;
    }
    this._waitingForUpdate = true;
    const conv = await this.waitForRoom();
    if (conv !== this) {
      await conv.checkForUpdate();
      return;
    }
    this._waitingForUpdate = false;
    if (this.left) {
      return;
    }
    const shouldBeMuc = this.expectedToBeMuc();
    if (shouldBeMuc === this.isChat) {
      return;
    }
    this._isChat = shouldBeMuc;
    this.notifyObservers(null, "chat-update-type");
    if (shouldBeMuc) {
      this.makeMuc();
    } else {
      this.makeDm();
    }
    this.updateConvIcon();
  },

  /**
   * Check if the current conversation should be a MUC.
   *
   * @returns {boolean} If this conversation should be a MUC.
   */
  expectedToBeMuc() {
    return !this._account.isDirectRoom(this._roomId);
  },

  /**
   * Change the data in this conversation to match what we expect for a DM.
   * This means setting a buddy and no participants.
   */
  makeDm() {
    this._participants.clear();
    this.initRoomDm(this.room);
  },

  /**
   * Change the data in this conversation to match what we expect for a MUC.
   * This means removing the associated buddy, initializing the participants
   * list and updating the topic.
   */
  makeMuc() {
    this.closeDm();
    this.initRoomMuc(this.room);
  },

  /**
   * Set the convIconFilename field for the conversation. Only writes to the
   * field when the value changes.
   */
  updateConvIcon() {
    const avatarUrl = this.room.getAvatarUrl(
      this._account._client.getHomeserverUrl(),
      USER_ICON_SIZE,
      USER_ICON_SIZE,
      "scale",
      false
    );
    if (avatarUrl && this.convIconFilename !== avatarUrl) {
      this.convIconFilename = avatarUrl;
    } else if (!avatarUrl && this.convIconFilename) {
      this.convIconFilename = "";
    }
  },

  // mostly copied from jsProtoHelper but made type independent
  _convIconFilename: "",
  get convIconFilename() {
    // By default, pass through information from the buddy for IM conversations
    // that don't have their own icon.
    const convIconFilename = this._convIconFilename;
    if (convIconFilename || this.isChat) {
      return convIconFilename;
    }
    return this.buddy?.buddyIconFilename;
  },
  set convIconFilename(aNewFilename) {
    this._convIconFilename = aNewFilename;
    this.notifyObservers(this, "update-conv-icon");
  },

  /* MUC */

  addParticipant(roomMember) {
    if (this._participants.has(roomMember.userId)) {
      return;
    }

    let participant = new MatrixParticipant(roomMember, this._account);
    this._participants.set(roomMember.userId, participant);
    this.notifyObservers(
      new nsSimpleEnumerator([participant]),
      "chat-buddy-add"
    );
  },

  removeParticipant(userId) {
    if (!this._participants.has(userId)) {
      return;
    }
    let participant = this._participants.get(userId);
    this._participants.delete(userId);
    this.notifyObservers(
      new nsSimpleEnumerator([participant]),
      "chat-buddy-remove"
    );
  },

  /**
   * Initialize the room after the response from the Matrix client.
   *
   * @param {Object} room - associated room with the conversation.
   */
  initRoomMuc(room) {
    // If there are any participants, create them.
    let participants = [];
    room.getJoinedMembers().forEach(roomMember => {
      if (!this._participants.has(roomMember.userId)) {
        let participant = new MatrixParticipant(roomMember, this._account);
        participants.push(participant);
        this._participants.set(roomMember.userId, participant);
      }
    });
    if (participants.length) {
      this.notifyObservers(
        new nsSimpleEnumerator(participants),
        "chat-buddy-add"
      );
    }

    let roomState = this.roomState;
    if (roomState.getStateEvents(EventType.RoomTopic).length) {
      let event = roomState.getStateEvents(EventType.RoomTopic)[0];
      this.setTopic(event.getContent().topic, event.getSender(), true);
    }
  },

  get topic() {
    return this._topic;
  },

  set topic(aTopic) {
    // Check if our user has the permissions to set the topic.
    if (this.topicSettable && aTopic !== this.topic) {
      this._account._client.setRoomTopic(this._roomId, aTopic);
    }
  },

  get topicSettable() {
    if (this.room) {
      return this.roomState.maySendEvent(
        EventType.RoomTopic,
        this._account.userId
      );
    }
    return false;
  },

  /* DM */

  /**
   * Initialize the room after the response from the Matrix client.
   *
   * @param {Room} room - associated room with the conversation.
   */
  initRoomDm(room) {
    const dmUserId = room.guessDMUserId();
    if (dmUserId === this._account.userId) {
      // We are the only member of the room that we know of.
      // This can sometimes happen when we get a room before all membership
      // events got synced in.
      return;
    }
    if (!this.buddy) {
      this.initBuddy(dmUserId);
    }
  },

  /**
   * Initialize the buddy for this conversation.
   *
   * @param {string} dmUserId - MXID of the user on the other side of this DM.
   */
  initBuddy(dmUserId) {
    if (this._account.buddies.has(dmUserId)) {
      this.buddy = this._account.buddies.get(dmUserId);
      if (!this.buddy._user) {
        const user = this._account._client.getUser(dmUserId);
        this.buddy.setUser(user);
      }
      return;
    }
    const user = this._account._client.getUser(dmUserId);
    this.buddy = new MatrixBuddy(
      this._account,
      null,
      Services.tags.defaultTag,
      user.userId
    );
    this.buddy.setUser(user);
    Services.contacts.accountBuddyAdded(this.buddy);
    this._account.buddies.set(dmUserId, this.buddy);
  },

  /**
   * Clean up the buddy associated with this DM conversation if it is the last
   * conversation associated with it.
   */
  closeDm() {
    if (this.buddy) {
      const dmUserId = this.buddy.userName;
      const otherDMRooms = Array.from(this._account.roomList.values()).filter(
        conv => conv.buddy && conv.buddy === this.buddy && conv !== this
      );
      if (otherDMRooms.length == 0) {
        Services.contacts.accountBuddyRemoved(this.buddy);
        this._account.buddies.delete(dmUserId);
        delete this.buddy;
      }
    }
  },

  updateTyping: GenericConvIMPrototype.updateTyping,
  typingState: Ci.prplIConvIM.NOT_TYPING,
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
 *  setPassword
 */
function MatrixAccount(aProtocol, aImAccount) {
  this._init(aProtocol, aImAccount);
  this.roomList = new Map();
  this._userToRoom = {};
  this.buddies = new Map();
  this._pendingDirectChats = new Map();
  this._pendingRoomAliases = new Map();
}
MatrixAccount.prototype = {
  __proto__: GenericAccountPrototype,
  observe(aSubject, aTopic, aData) {
    if (aTopic === "status-changed") {
      this.setPresence(aSubject);
    } else if (aTopic === "user-display-name-changed") {
      this._client.setDisplayName(aData);
    }
  },
  remove() {
    for (let conv of this.roomList.values()) {
      // We want to remove all the conversations. We are not using conv.close
      // function call because we don't want user to leave all the matrix rooms.
      // User just want to remove the account so we need to remove the listed
      // conversations.
      conv.forget();
    }
    delete this.roomList;
    // We want to clear data stored for syncing in indexedDB so when
    // user logins again, one gets the fresh start.
    if (this._client) {
      let sessionDisposed = Promise.resolve();
      if (this._client.isLoggedIn()) {
        sessionDisposed = this._client.logout();
      }
      sessionDisposed.finally(() => {
        this._client.clearStores();
      });
    }
  },
  unInit() {
    if (this._client) {
      this._client.stopClient();
    }
  },
  connect() {
    this.reportConnecting();
    this.connectClient().catch(error => {
      this.reportDisconnecting(
        Ci.prplIAccount.ERROR_OTHER_ERROR,
        error.message
      );
      this.reportDisconnected();
    });
  },
  async connectClient() {
    this._baseURL = await this.getServer();

    let deviceId = this.prefs.getStringPref("deviceId", "") || undefined;
    let accessToken = this.prefs.getStringPref("accessToken", "") || undefined;
    // Make sure accessToken saved as deviceId is disposed of.
    if (deviceId && deviceId === accessToken) {
      // Revoke accessToken stored in deviceId
      const tempClient = MatrixSDK.createClient({
        useAuthorizationHeader: true,
        baseUrl: this._baseURL,
        accessToken: deviceId,
      });
      if (tempClient.isLoggedIn()) {
        tempClient.logout();
      }
      this.prefs.clearUserPref("deviceId");
      this.prefs.clearUserPref("accessToken");
      deviceId = undefined;
      accessToken = undefined;
    }

    const opts = this.getClientOptions();

    await opts.store.startup();
    this._client = MatrixSDK.createClient(opts);
    if (this._client.isLoggedIn()) {
      this.startClient();
      return;
    }
    const { flows } = await this._client.loginFlows();
    const usePasswordFlow = Boolean(this.imAccount.password);
    let wantedFlows = [];
    if (usePasswordFlow) {
      wantedFlows.push("m.login.password");
    } else {
      wantedFlows.push("m.login.sso", "m.login.token");
    }
    if (
      wantedFlows.every(flowType => flows.some(flow => flow.type === flowType))
    ) {
      if (usePasswordFlow) {
        let user = this.name;
        // extract user localpart in case server is not the canonical one for the matrix ID.
        if (this.nameIsMXID) {
          user = this.protocol.splitUsername(user)[0];
        }
        await this.loginToClient("m.login.password", {
          identifier: {
            type: "m.id.user",
            user,
          },
          password: this.imAccount.password,
        });
      } else {
        this.requestAuthorization();
      }
    } else {
      this.reportDisconnecting(
        Ci.prplIAccount.ERROR_AUTHENTICATION_IMPOSSIBLE,
        _("connection.error.noSupportedFlow")
      );
      this.reportDisconnected();
    }
  },

  /**
   * Run autodiscovery to find the matrix server base URL for the account.
   * For accounts created before the username split was implemented, we will
   * most likely use the server preference that was set during setup.
   * All other accounts that have a full MXID as identifier will use the host
   * from the MXID as start for the auto discovery.
   *
   * @returns {string} Matrix server base URL.
   * @throws {Error} When the autodiscovery failed.
   */
  async getServer() {
    let domain = "https://matrix.org";
    if (this.nameIsMXID) {
      domain = this.protocol.splitUsername(this.name)[1];
    } else if (this.prefs.prefHasUserValue("server")) {
      // Use legacy server field
      return (
        this.prefs.getStringPref("server") +
        ":" +
        this.prefs.getIntPref("port", 443)
      );
    }
    const discoveredInfo = await MatrixSDK.AutoDiscovery.findClientConfig(
      domain
    );
    const homeserverResult = discoveredInfo[HOMESERVER_WELL_KNOWN];
    if (homeserverResult.state === MatrixSDK.AutoDiscovery.PROMPT) {
      throw new Error(_("connection.error.serverNotFound"));
    }
    if (homeserverResult.state !== MatrixSDK.AutoDiscovery.SUCCESS) {
      throw new Error(homeserverResult.error);
    }
    return homeserverResult.base_url;
  },

  /**
   * If the |name| property of this account looks like a valid Matrix ID.
   * @type {boolean}
   */
  get nameIsMXID() {
    return (
      this.name[0] === this.protocol.usernamePrefix &&
      this.name.includes(this.protocol.usernameSplits[0].separator)
    );
  },

  /**
   * Builds the options for the |createClient| call to the SDK including all
   * stores.
   * @returns {Object}
   */
  getClientOptions() {
    let dbName = "chat:matrix:" + this.imAccount.id;

    // Create a storage principal unique to this account.
    const accountPrincipal = Services.scriptSecurityManager.createContentPrincipal(
      Services.io.newURI("https://" + this.imAccount.id + ".matrix.localhost"),
      {}
    );
    const localStorage = Services.domStorageManager.createStorage(
      Services.appShell.hiddenDOMWindow,
      accountPrincipal,
      accountPrincipal,
      ""
    );

    return {
      useAuthorizationHeader: true,
      baseUrl: this._baseURL,
      store: new MatrixSDK.IndexedDBStore({
        indexedDB,
        dbName,
      }),
      sessionStore: new MatrixSDK.WebStorageSessionStore(localStorage),
      cryptoStore: new MatrixSDK.IndexedDBCryptoStore(
        indexedDB,
        dbName + ":crypto"
      ),
      deviceId: this.prefs.getStringPref("deviceId", "") || undefined,
      accessToken: this.prefs.getStringPref("accessToken", "") || undefined,
      userId: this.prefs.getStringPref("userId", "") || undefined,
      timelineSupport: true,
    };
  },

  /**
   * Log the client in. Sets the session device display name if configured and
   * stores the session information on successful login.
   *
   * @param {string} loginType - The m.login.* flow to use.
   * @param {object} loginInfo - Params for the login flow.
   * @param {boolean} [retry=false] - If we should retry SSO if the error isn't failed auth.
   */
  async loginToClient(loginType, loginInfo, retry = false) {
    try {
      if (this.getString("deviceDisplayName")) {
        loginInfo.initial_device_display_name = this.getString(
          "deviceDisplayName"
        );
      }
      const data = await this._client.login(loginType, loginInfo);
      if (data.error) {
        throw new Error(data.error);
      }
      if (data.well_known?.[HOMESERVER_WELL_KNOWN]?.base_url) {
        this._baseURL = data.well_known[HOMESERVER_WELL_KNOWN].base_url;
      }
      this.storeSessionInformation(data);
      // Need to create a new client with the device ID set.
      this._client = MatrixSDK.createClient(this.getClientOptions());
      if (!this._client.isLoggedIn()) {
        throw new Error("Client has no access token after login");
      }
      this.startClient();
    } catch (error) {
      let errorType = Ci.prplIAccount.ERROR_OTHER_ERROR;
      if (error.errcode === "M_FORBIDDEN") {
        errorType = Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED;
      }
      this.reportDisconnecting(errorType, error.message);
      this.reportDisconnected();
      if (errorType !== Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED && retry) {
        this.requestAuthorization();
      }
    }
  },

  /**
   * Login to the homeserver using m.login.token.
   *
   * @param {string} token - The auth token received from the SSO flow.
   */
  loginWithToken(token) {
    return this.loginToClient("m.login.token", { token }, true);
  },

  /**
   * Show SSO prompt and handle response token.
   */
  requestAuthorization() {
    this.reportConnecting(_("connection.requestAuth"));
    let url = this._client.getSsoLoginUrl(
      InteractiveBrowser.COMPLETION_URL,
      "sso"
    );
    InteractiveBrowser.waitForRedirect(url, `${this.name} - ${this._baseURL}`)
      .then(resultUrl => {
        let parsedUrl = new URL(resultUrl);
        let rawUrlData = parsedUrl.searchParams;
        let urlData = new URLSearchParams(rawUrlData);
        if (!urlData.has("loginToken")) {
          throw new Error("No token in redirect");
        }

        this.reportConnecting(_("connection.requestAccess"));
        this.loginWithToken(urlData.get("loginToken"));
      })
      .catch(() => {
        this.reportDisconnecting(
          Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
          _("connection.error.authCancelled")
        );
        this.reportDisconnected();
      });
  },

  /**
   * Stores the device ID and if enabled the access token in the account preferences, so they can be
   * re-used in the next Thunderbird session.
   *
   * @param {object} data - Response data from a matrix login request.
   */
  storeSessionInformation(data) {
    if (this.getBool("saveToken")) {
      this.prefs.setStringPref("accessToken", data.access_token);
    }
    this.prefs.setStringPref("deviceId", data.device_id);
    this.prefs.setStringPref("userId", data.user_id);
  },

  get _catchingUp() {
    return this._client?.getSyncState() !== "SYNCING";
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
          if (prevState !== state) {
            this.setPresence(this.imAccount.statusInfo);
          }
          this.reportConnected();
          break;
        case "STOPPED":
          this.reportDisconnected();
          break;
        case "SYNCING":
          if (prevState !== state) {
            this.reportConnected();
            this.handleCaughtUp();
          }
          break;
        case "RECONNECTING":
          this.reportConnecting();
          break;
        case "ERRROR":
          this.reportDisconnecting(
            Ci.prplIAccount.ERROR_OTHER_ERROR,
            data.error.message
          );
          this.reportDisconnected();
          break;
        case "CATCHUP":
          this.reportConnecting();
          break;
      }
    });
    this._client.on("RoomMember.membership", (event, member, oldMembership) => {
      if (this._catchingUp) {
        return;
      }
      if (this.roomList.has(member.roomId)) {
        let conv = this.roomList.get(member.roomId);
        if (conv.isChat) {
          if (member.membership === "join") {
            conv.addParticipant(member);
          } else if (member.membership === "leave") {
            conv.removeParticipant(member.userId);
          }
        }
        // If we are leaving the room, remove the conversation. If any user gets
        // added or removed in the direct chat, update the conversation type. We
        // are treating the direct chat with two people as a direct conversation
        // only. Matrix supports multiple users in the direct chat. So we will
        // treat all the rooms which have 2 users including us and classified as
        // a DM room by SDK a direct conversation and all other rooms as a group
        // conversations.
        if (member.membership === "leave" && member.userId == this.userId) {
          conv.forget();
        } else if (
          member.membership === "join" ||
          member.membership === "leave"
        ) {
          conv.checkForUpdate();
        }
      }
    });

    /*
     * Get the map of direct messaging rooms.
     */
    this._client.on("accountData", event => {
      if (event.getType() == EventType.Direct) {
        const oldRooms = Object.values(this._userToRoom ?? {}).flat();
        this._userToRoom = event.getContent();
        // Check type for all conversations that were added or removed from the
        // m.direct state.
        const newRooms = Object.values(this._userToRoom ?? {}).flat();
        for (const roomId of oldRooms) {
          if (!newRooms.includes(roomId)) {
            this.roomList.get(roomId)?.checkForUpdate();
          }
        }
        for (const roomId of newRooms) {
          if (!oldRooms.includes(roomId)) {
            this.roomList.get(roomId)?.checkForUpdate();
          }
        }
      }
    });

    this._client.on(
      "Room.timeline",
      (event, room, toStartOfTimeline, removed, data) => {
        if (toStartOfTimeline || this._catchingUp || room.isSpaceRoom()) {
          return;
        }
        let conv = this.roomList.get(room.roomId);
        if (!conv) {
          return;
        }
        conv.addEvent(event);
      }
    );
    // Update the chat participant information.
    this._client.on("RoomMember.name", this.updateRoomMember.bind(this));
    this._client.on("RoomMember.powerLevel", this.updateRoomMember.bind(this));

    this._client.on("Room.name", room => {
      if (room.isSpaceRoom()) {
        return;
      }
      // Update the title to the human readable version.
      let conv = this.roomList.get(room.roomId);
      if (
        !this._catchingUp &&
        conv &&
        room?.summary?.info?.title &&
        conv._name != room.summary.info.title
      ) {
        conv._name = room.summary.info.title;
        conv.notifyObservers(null, "update-conv-title");
      }
    });

    /*
     * We auto join all the rooms in which we are invited. This will also be
     * fired for all the rooms we have joined earlier when SDK gets connected.
     * We will use that part to to make conversations, direct or group.
     */
    this._client.on("Room", room => {
      if (this._catchingUp || room.isSpaceRoom()) {
        return;
      }
      let me = room.getMember(this.userId);
      // For now just auto accept the invites by joining the room.
      if (me && me.membership == "invite") {
        if (me.events.member.getContent().is_direct) {
          this.invitedToDM(room);
        } else {
          //TODO rejecting a server notice room invite will error
          this.getGroupConversation(room.roomId, room.summary.info.title);
        }
      } else if (me && me.membership == "join") {
        // To avoid the race condition. Whenever we will create the room,
        // this will also be fired. So we want to avoid creating duplicate
        // conversations for the same room.
        if (
          this.roomList.has(room.roomId) ||
          this._pendingRoomAliases.size + this._pendingDirectChats.size > 0
        ) {
          return;
        }
        // Joined a new room that we don't know about yet.
        if (this.isDirectRoom(room.roomId)) {
          let interlocutorId;
          for (let roomMember of room.getJoinedMembers()) {
            if (roomMember.userId != this.userId) {
              interlocutorId = roomMember.userId;
              break;
            }
          }
          this.getDirectConversation(interlocutorId);
        } else {
          this.getGroupConversation(room.roomId);
        }
      }
    });

    this._client.on("RoomMember.typing", (event, member) => {
      if (member.userId != this.userId) {
        let conv = this.roomList.get(member.roomId);
        if (!conv.isChat) {
          let typingState = Ci.prplIConvIM.NOT_TYPING;
          if (member.typing) {
            typingState = Ci.prplIConvIM.TYPING;
          }
          conv.updateTyping(typingState, member.name);
        }
      }
    });

    this._client.on("Session.logged_out", error => {
      this.prefs.clearUserPref("accessToken");
      // https://spec.matrix.org/unstable/client-server-api/#soft-logout
      if (!error.data.soft_logout) {
        this.prefs.clearUserPref("deviceId");
        this.prefs.clearUserPref("userId");
      }
      // TODO handle soft logout with an auto reconnect
      this.reportDisconnecting(
        Ci.prplIAccount.ERROR_OTHER_ERROR,
        _("connection.error.sessionEnded")
      );
      this.reportDisconnected();
    });

    this._client.on("User.avatarUrl", this.updateBuddy.bind(this));
    this._client.on("User.displayName", this.updateBuddy.bind(this));
    this._client.on("User.presence", this.updateBuddy.bind(this));
    this._client.on("User.currentlyActive", this.updateBuddy.bind(this));

    // TODO Other events to handle:
    //  Room.localEchoUpdated
    //  Room.tags

    this._client
      .initCrypto()
      .then(() => this._client.startClient())
      .catch(error => this.ERROR(error));
  },

  /**
   * Update UI state to reflect the current state of the SDK after a full sync.
   * This includes adding and removing rooms and catching up their contents.
   */
  handleCaughtUp() {
    const joinedRooms = this._client
      .getRooms()
      .filter(room => room.getMyMembership() === "join" && !room.isSpaceRoom())
      .map(room => room.roomId);
    // Ensure existing conversations are up to date
    for (const [roomId, conv] of this.roomList.entries()) {
      if (!joinedRooms.includes(roomId)) {
        conv.forget();
      } else {
        conv
          .checkForUpdate()
          .then(() => conv.catchup())
          .catch(error => this.ERROR(error));
      }
    }
    // Create new conversations
    for (const roomId of joinedRooms) {
      if (!this.roomList.has(roomId)) {
        let conv;
        if (this.isDirectRoom(roomId)) {
          const room = this._client.getRoom(roomId);
          const interlocutorId = room
            .getJoinedMembers()
            .find(member => member.userId != this.userId)?.userId;
          if (!interlocutorId) {
            this.ERROR(
              "Could not find opposing party for " +
                roomId +
                ". No conversation was created."
            );
            continue;
          }
          conv = this.getDirectConversation(interlocutorId);
        } else {
          conv = this.getGroupConversation(roomId);
        }
        conv.catchup().catch(error => this.ERROR(error));
      }
    }
    // Remove orphaned buddies.
    for (const [userId, buddy] of this.buddies) {
      // getDMRoomIdsForUserId uses the room list from the client, so we don't
      // have to wait for the room mutations above to propagate to our internal
      // state.
      if (this.getDMRoomIdsForUserId(userId).length === 0) {
        buddy.remove();
      }
    }
  },

  /**
   * A user invited this user to a DM room.
   *
   * @param {Room} room - Room we're invited to.
   */
  invitedToDM(room) {
    let userId = room.getDMInviter();
    this.addBuddyRequest(
      userId,
      () => {
        this.setDirectRoom(userId, room.roomId);
        // For the invited rooms, we will not get the summary info from
        // the room object created after the joining. So we need to use
        // the name from the room object here.
        const conversation = this.getDirectConversation(
          userId,
          room.roomId,
          room.summary.info.title
        );
        if (room.getInvitedAndJoinedMemberCount() !== 2) {
          conversation.checkForUpdate();
        }
      },
      () => {
        this._client.leave(room.roomId);
      }
    );
  },

  /**
   * Set the matrix user presence based on the given status info.
   *
   * @param {imIStatus} statusInfo
   */
  setPresence(statusInfo) {
    const presenceDetails = {
      presence: "offline",
      status_msg: statusInfo.statusText,
    };
    if (statusInfo.statusType === Ci.imIStatusInfo.STATUS_AVAILABLE) {
      presenceDetails.presence = "online";
    } else if (
      statusInfo.statusType === Ci.imIStatusInfo.STATUS_AWAY ||
      statusInfo.statusType === Ci.imIStatusInfo.STATUS_IDLE
    ) {
      presenceDetails.presence = "unavailable";
    }
    this._client.setPresence(presenceDetails);
  },

  /**
   * Update the local buddy with the latest information given the changes from
   * the event.
   *
   * @param {MatrixEvent} event
   * @param {User} user
   */
  updateBuddy(event, user) {
    const buddy = this.buddies.get(user.userId);
    if (!buddy) {
      return;
    }
    if (!buddy._user) {
      buddy.setUser(user);
    } else {
      buddy._user = user;
    }
    if (event.getType() === "User.avatarUrl") {
      buddy._notifyObservers("icon-changed");
    } else if (
      event.getType() === "User.presence" ||
      event.getType() === "User.currentlyActive"
    ) {
      buddy.setStatusFromPresence();
    } else if (event.getType() === "User.displayName") {
      buddy.serverAlias = user.displayName;
    }
  },

  /**
   * Checks if the room is the direct messaging room or not. We also check
   * if number of joined users are two including us.
   *
   * @param {string} checkRoomId - ID of the room to check if it is direct
   *                               messaging room or not.
   * @return {boolean} - If room is direct direct messaging room or not.
   */
  isDirectRoom(checkRoomId) {
    for (let user of Object.keys(this._userToRoom)) {
      for (let roomId of this._userToRoom[user]) {
        if (roomId == checkRoomId) {
          let room = this._client.getRoom(roomId);
          if (room && room.getJoinedMembers().length == 2) {
            return true;
          }
        }
      }
    }
    return false;
  },

  /**
   * Room aliases and their conversation that are currently being created.
   * @type {Map<string, MatrixRoom>}
   */
  _pendingRoomAliases: null,

  /**
   * Returns the group conversation according to the room-id.
   * 1) If we have a group conversation already, we will return that.
   * 2) If the user is already in the room but we don't have a conversation for
   *    it yet, create one.
   * 3) Else we try to join the room and create a new conversation for it.
   * 4) Create a new room if the room does not exist and is local to our server.
   *
   * @param {string} roomId - ID of the room.
   * @param {string} [roomName] - Name of the room.
   *
   * @return {MatrixRoom?} - The resulted conversation.
   */
  getGroupConversation(roomId, roomName) {
    if (!roomId) {
      return null;
    }

    const existingConv = this.getConversationByIdOrAlias(roomId);
    if (existingConv) {
      return existingConv;
    }

    const conv = new MatrixRoom(this, true, roomName || roomId);
    conv.joining = true;

    // If we are already in the room, just initialize the conversation with it.
    const existingRoom = this._client.getRoom(roomId);
    if (existingRoom?.getMyMembership() === "join") {
      this.roomList.set(existingRoom.roomId, conv);
      conv.initRoom(existingRoom);
      return conv;
    }

    // Try to join the room
    this._client
      .joinRoom(roomId)
      .then(
        room => {
          this.roomList.set(room.roomId, conv);
          conv.initRoom(room);
        },
        error => {
          // If room does not exist and it is local to our server, create it.
          if (
            error.errcode === "M_NOT_FOUND" &&
            roomId.endsWith(":" + this._client.getDomain()) &&
            roomId[0] !== "!"
          ) {
            this.LOG(
              "Creating room " + roomId + ", since we could not join: " + error
            );
            if (this._pendingRoomAliases.has(roomId)) {
              conv.replaceRoom(this._pendingRoomAliases.get(roomId));
              conv.forget();
              return null;
            }
            // extract alias from #<alias>:<domain>
            const alias = roomId.split(":", 1)[0].slice(1);
            return this.createRoom(this._pendingRoomAliases, roomId, conv, {
              room_alias_name: alias,
              name: roomName || alias,
              visibility: "private",
              preset: "private_chat",
              content: {
                guest_access: "can_join",
              },
              type: EventType.RoomGuestAccess,
              state_key: "",
            });
          }
          conv.joining = false;
          conv.close();
          throw error;
        }
      )
      .catch(error => {
        this.ERROR(error);
        if (conv.joining) {
          conv.joining = false;
          conv.forget();
        }
      });

    return conv;
  },

  /**
   * Get an existing conversation for a room ID or alias.
   *
   * @param {string} roomIdOrAlias - Identifier for the conversation.
   * @returns {GenericMatrixConversation?}
   */
  getConversationByIdOrAlias(roomIdOrAlias) {
    if (!roomIdOrAlias) {
      return null;
    }

    const conv = this.getConversationById(roomIdOrAlias);
    if (conv) {
      return conv;
    }
    const existingRoom = this._client.getRoom(roomIdOrAlias);
    if (!existingRoom) {
      return null;
    }
    return this.getConversationById(existingRoom.roomId);
  },

  /**
   * Get an existing conversation for a room ID.
   *
   * @param {string} roomId - Room ID of the conversation.
   * @returns {GenericMatrixConversation?}
   */
  getConversationById(roomId) {
    if (!roomId) {
      return null;
    }

    // If there is a conversation return it.
    if (this.roomList.has(roomId)) {
      return this.roomList.get(roomId);
    }

    // Are we already creating a room with the ID?
    if (this._pendingRoomAliases.has(roomId)) {
      return this._pendingRoomAliases.get(roomId);
    }
    return null;
  },

  /**
   * Returns the room ID for user ID if exists for direct messaging.
   *
   * @param {string} roomId - ID of the user.
   *
   * @return {string} - ID of the room.
   */
  getDMRoomIdForUserId(userId) {
    // Check in the 'other' user's roomList for common m.direct rooms.
    // Select the most recent room based on the timestamp of the
    // most recent event in the room's timeline.
    const rooms = this.getDMRoomIdsForUserId(userId)
      .map(roomId => {
        const room = this._client.getRoom(roomId);
        const mostRecentTimestamp = room.getLastActiveTimestamp();
        return {
          roomId,
          mostRecentTimestamp,
        };
      })
      .sort(
        (roomA, roomB) => roomB.mostRecentTimestamp - roomA.mostRecentTimestamp
      );
    if (rooms.length) {
      return rooms[0].roomId;
    }
    return null;
  },

  /**
   * Get all room IDs of active DM rooms with the given user.
   *
   * @param {string} userId - User ID to find rooms for.
   * @returns {string[]} Array of rooom IDs.
   */
  getDMRoomIdsForUserId(userId) {
    if (!Array.isArray(this._userToRoom[userId])) {
      return [];
    }
    return this._userToRoom[userId].filter(roomId => {
      const room = this._client.getRoom(roomId);
      if (!room || room.isSpaceRoom()) {
        return false;
      }
      const accountMembership = room.getMyMembership() ?? "leave";
      // Default to invite, since the invite for the other member may not be in
      // the room events yet.
      let userMembership = room.getMember(userId)?.membership ?? "invite";
      // If either party left the room we shouldn't try to rejoin.
      return userMembership !== "leave" && accountMembership !== "leave";
    });
  },

  /**
   * Sets the room ID for for corresponding user ID for direct messaging
   * by setting the "m.direct" event of accont data of the SDK client.
   *
   * @param {string} roomId - ID of the user.
   *
   * @param {string} - ID of the room.
   */
  setDirectRoom(userId, roomId) {
    let dmRoomMap = this._userToRoom;
    let roomList = dmRoomMap[userId] || [];
    if (!roomList.includes(roomId)) {
      roomList.push(roomId);
      dmRoomMap[userId] = roomList;
      this._client.setAccountData(EventType.Direct, dmRoomMap);
    }
  },

  updateRoomMember(event, member) {
    if (this.roomList && this.roomList.has(member.roomId)) {
      let conv = this.roomList.get(member.roomId);
      if (conv.isChat) {
        let participant = conv._participants.get(member.userId);
        // A participant might not exist (for example, this happens if the user
        // has only been invited, but has not yet joined).
        if (participant) {
          participant._roomMember = member;
          conv.notifyObservers(participant, "chat-buddy-update");
          conv.notifyObservers(null, "chat-update-topic");
        }
      }
    }
  },

  disconnect() {
    this._client.setPresence({ presence: "offline" });
    this._client.stopClient();
    this.reportDisconnected();
  },

  get canJoinChat() {
    return true;
  },
  chatRoomFields: {
    //TODO should split the fields like in account setup, though we would
    // probably want to keep the type prefix
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
  joinChat(components) {
    // For the format of room id and alias, see the matrix documentation:
    // https://matrix.org/docs/spec/appendices#room-ids-and-event-ids
    // https://matrix.org/docs/spec/appendices#room-aliases
    let roomIdOrAlias = components.getValue("roomIdOrAlias").trim();

    // If domain is missing, append the domain from the user's server.
    if (!roomIdOrAlias.includes(":")) {
      roomIdOrAlias += ":" + this._client.getDomain();
    }

    // There will be following types of ids:
    // !fubIsJzeAcCcjYTQvm:mozilla.org => General room id.
    // #maildev:mozilla.org => Group Conversation room id.
    // @clokep:mozilla.org => Direct Conversation room id.
    if (roomIdOrAlias.startsWith("!")) {
      // We create the group conversation initially. Then we check if the room
      // is the direct messaging room or not.
      //TODO init with correct type from isDirectMessage(roomIdOrAlias)
      let conv = this.getGroupConversation(roomIdOrAlias);
      if (!conv) {
        return null;
      }
      // It can be any type of room so update it according to direct conversation
      // or group conversation.
      conv.checkForUpdate();
      return conv;
    }

    // If the ID does not start with @ or #, assume it is a group conversation and append #.
    if (!roomIdOrAlias.startsWith("@") && !roomIdOrAlias.startsWith("#")) {
      roomIdOrAlias = "#" + roomIdOrAlias;
    }
    // If the ID starts with a @, it is a direct conversation.
    if (roomIdOrAlias.startsWith("@")) {
      return this.getDirectConversation(roomIdOrAlias);
    }
    // Otherwise, it is a group conversation.
    return this.getGroupConversation(roomIdOrAlias);
  },

  createConversation(userId) {
    if (userId == this.userId) {
      return null;
    }
    return this.getDirectConversation(userId);
  },

  /**
   * User IDs and their DM conversations which are being created.
   * @type {Map<string, MatrixRoom>}
   */
  _pendingDirectChats: null,

  /**
   * Returns the direct conversation according to the room-id or user-id.
   * 1) If we have a direct conversation already, we will return that.
   * 2) If the room exists on the server, we will join it. It will not do
   *    anything if we are already joined, it will just create the
   *    conversation. This is used mainly when a new room gets added.
   * 3) Create a new room if the conversation does not exist.
   *
   * @param {string} userId - ID of the user for which we want to get the
   *                          direct conversation.
   * @param {string} [roomId] - ID of the room.
   * @param {string} [roomName] - Name of the room.
   *
   * @return {MatrixRoom} - The resulted conversation.
   */
  getDirectConversation(userId, roomID, roomName) {
    let DMRoomId = this.getDMRoomIdForUserId(userId);
    if (DMRoomId && this.roomList.has(DMRoomId)) {
      return this.roomList.get(DMRoomId);
    }

    // If user is invited to the room then DMRoomId will be null. In such
    // cases, we will pass roomID so that user will be joined to the room
    // and we will create corresponding conversation.
    if (DMRoomId || roomID) {
      let conv = new MatrixRoom(this, false, roomName || DMRoomId || roomID);
      this.roomList.set(DMRoomId || roomID, conv);
      conv.joining = true;
      this._client
        .joinRoom(DMRoomId || roomID)
        .catch(error => {
          conv.joining = false;
          conv.close();
          throw error;
        })
        .then(room => {
          conv.initRoom(room);
          // The membership events will sometimes be missing to initialize the
          // buddy correctly in the normal room init.
          if (!conv.buddy) {
            conv.initBuddy(userId);
          }
        })
        .catch(error => {
          this.ERROR(
            "Error creating conversation " + (DMRoomId || roomID) + ": " + error
          );
          if (conv.joining) {
            conv.joining = false;
            conv.forget();
          }
        });

      return conv;
    }

    if (this._pendingDirectChats.has(userId)) {
      return this._pendingDirectChats.get(userId);
    }

    let conv = new MatrixRoom(this, false, userId);
    this.createRoom(
      this._pendingDirectChats,
      userId,
      conv,
      {
        is_direct: true,
        invite: [userId],
        visibility: "private",
        preset: "trusted_private_chat",
        content: {
          guest_access: "can_join",
        },
        type: EventType.RoomGuestAccess,
        state_key: "",
      },
      roomId => {
        this.setDirectRoom(userId, roomId);
      }
    );
    return conv;
  },

  /**
   * Create a new matrix room. Locks room creation handling during the
   * operation. If there are no more pending rooms on completion, we need to
   * make sure we didn't miss a join from another room.
   *
   * @param {Map<string, MatrixRoom>} pendingMap - One of the lock maps.
   * @param {string} key - The key to lock with in the set.
   * @param {MatrixRoom} conversation - Conversation for the room.
   * @param {Object} roomInit - Parameters for room creation.
   * @param {function} [onCreated] - Callback to execute before room creation
   *  is finalized.
   * @returns {Promise}
   */
  async createRoom(pendingMap, key, conversation, roomInit, onCreated) {
    conversation.joining = true;
    pendingMap.set(key, conversation);
    try {
      const res = await this._client.createRoom(roomInit);
      const newRoomId = res.room_id;
      if (typeof onCreated === "function") {
        onCreated(newRoomId);
      }
      this.roomList.set(newRoomId, conversation);
      const room = this._client.getRoom(newRoomId);
      if (room) {
        conversation.initRoom(room);
      }
    } catch (error) {
      this.ERROR(error);
      const wasJoining = conversation.joining;
      conversation.joining = false;
      // Only leave room if it was ever associated with the conversation
      if (wasJoining) {
        conversation.forget();
      } else {
        conversation.close();
      }
    } finally {
      pendingMap.delete(key);
      if (this._pendingDirectChats.size + this._pendingRoomAliases.size === 0) {
        this.handleCaughtUp();
      }
    }
  },

  addBuddy(aTag, aName) {
    if (aName[0] !== this.protocol.usernamePrefix) {
      this.ERROR("Buddy name must start with @");
      return;
    }
    if (!aName.includes(this.protocol.usernameSplits[0].separator)) {
      this.ERROR("Buddy name must include :");
      return;
    }
    if (aName == this.userId) {
      return;
    }
    if (this.buddies.has(aName)) {
      return;
    }
    // Prepare buddy for use with the conversation while preserving the tag.
    const buddy = new MatrixBuddy(this, null, aTag, aName);
    Services.contacts.accountBuddyAdded(buddy);
    this.buddies.set(aName, buddy);

    this.getDirectConversation(aName);
  },
  loadBuddy(aBuddy, aTag) {
    const buddy = new MatrixBuddy(this, aBuddy, aTag);
    this.buddies.set(buddy.userName, buddy);
    return buddy;
  },

  /**
   * Get tooltip info for a user.
   *
   * @param {string} aUserId - MXID to get tooltip data for.
   * @returns {Array<prplITooltipInfo>}
   */
  getBuddyInfo(aUserId) {
    if (!this.connected) {
      return [];
    }
    let user = this._client.getUser(aUserId);
    if (!user) {
      return [];
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
    let status = getStatusFromPresence(user);
    if (status === Ci.imIStatusInfo.STATUS_IDLE) {
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
      // Convert the MXC URL to an HTTP URL.
      let realUrl = getHttpUriForMxc(
        this._client.getHomeserverUrl(),
        user.avatarUrl,
        USER_ICON_SIZE,
        USER_ICON_SIZE,
        "scale",
        false
      );
      // TODO Cache the photo URI for this participant.
      tooltipInfo.push(
        new TooltipInfo(null, realUrl, Ci.prplITooltipInfo.icon)
      );
    }

    return tooltipInfo;
  },

  requestBuddyInfo(aUserId) {
    Services.obs.notifyObservers(
      new nsSimpleEnumerator(this.getBuddyInfo(aUserId)),
      "user-info-received",
      aUserId
    );
  },

  get userId() {
    return this._client.credentials.userId;
  },
  _client: null,
};

function MatrixProtocol() {
  this.commands = ChromeUtils.import(
    "resource:///modules/matrixCommands.jsm"
  ).commands;
  this.registerCommands();
}
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

  usernameEmptyText: _("matrix.usernameHint"),
  usernamePrefix: "@",
  usernameSplits: [
    {
      get label() {
        return _("options.homeserver");
      },
      separator: ":",
    },
  ],

  options: {
    saveToken: {
      get label() {
        return _("options.saveToken");
      },
      default: true,
    },
    deviceDisplayName: {
      get label() {
        return _("options.deviceDisplayName");
      },
      default: "Thunderbird",
    },
  },

  get chatHasTopic() {
    return true;
  },
  //TODO this should depend on the server (i.e. if it offers SSO). Should also have noPassword true if there is no password login flow available.
  get passwordOptional() {
    return true;
  },
};
