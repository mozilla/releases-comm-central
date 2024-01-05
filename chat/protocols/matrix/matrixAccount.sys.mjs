/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import {
  nsSimpleEnumerator,
  l10nHelper,
} from "resource:///modules/imXPCOMUtils.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import {
  GenericAccountPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericConversationPrototype,
  GenericConvIMPrototype,
  GenericAccountBuddyPrototype,
  GenericMessagePrototype,
  GenericSessionPrototype,
  TooltipInfo,
} from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/matrix.ftl"], true)
);

ChromeUtils.defineESModuleGetters(lazy, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  InteractiveBrowser: "resource:///modules/InteractiveBrowser.sys.mjs",
  MatrixCrypto: "resource:///modules/matrix-sdk.sys.mjs",
  MatrixMessageContent: "resource:///modules/matrixMessageContent.sys.mjs",
  MatrixPowerLevels: "resource:///modules/matrixPowerLevels.sys.mjs",
  MatrixSDK: "resource:///modules/matrix-sdk.sys.mjs",
  OlmLib: "resource:///modules/matrix-sdk.sys.mjs",
  ReceiptType: "resource:///modules/matrix-sdk.sys.mjs",
  SyncState: "resource:///modules/matrix-sdk.sys.mjs",
});

/**
 * Homeserver information in client .well-known payload.
 *
 * @constant {string}
 */
const HOMESERVER_WELL_KNOWN = "m.homeserver";

// This matches the configuration of the .userIcon class in chat.css, which
// expects square icons.
const USER_ICON_SIZE = 48;
const SERVER_NOTICE_TAG = "m.server_notice";

const MAX_CATCHUP_EVENTS = 300;
// Should always be smaller or equal to MAX_CATCHUP_EVENTS
const CATCHUP_PAGE_SIZE = 25;

/**
 * @param {string} who - Message sender ID.
 * @param {string} text - Message text.
 * @param {object} properties - Message properties, should also have an event
 *   property containing the corresponding MatrixEvent instance.
 * @param {MatrixRoom} conversation - The conversation the Message belongs to.
 */
export function MatrixMessage(who, text, properties, conversation) {
  this._init(who, text, properties, conversation);
}

MatrixMessage.prototype = {
  __proto__: GenericMessagePrototype,

  /**
   * @type {MatrixEvent}
   */
  event: null,

  /**
   * @type {{msg: string, action: boolean, notice: boolean}}
   */
  retryInfo: null,

  get hideReadReceipts() {
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
    if (
      this._displayed ||
      !this.event ||
      (this.event.status &&
        this.event.status !== lazy.MatrixSDK.EventStatus.SENT)
    ) {
      return;
    }
    this._displayed = true;
    this.conversation._account._client
      .sendReadReceipt(
        this.event,
        this.hideReadReceipts
          ? lazy.ReceiptType.ReadPrivate
          : lazy.ReceiptType.Read
      )
      .catch(error => this.conversation.ERROR(error));
  },

  whenRead() {
    // whenRead is also called when the conversation is closed.
    if (
      this._read ||
      !this.event ||
      !this.conversation._account ||
      this.conversation._account.noFullyRead ||
      (this.event.status &&
        this.event.status !== lazy.MatrixSDK.EventStatus.SENT)
    ) {
      return;
    }
    this._read = true;
    this.conversation._account._client
      .setRoomReadMarkers(this.conversation._roomId, this.event.getId())
      .catch(error => {
        if (error.errcode === "M_UNRECOGNIZED") {
          // Server does not support setting the fully read marker.
          this.conversation._account.noFullyRead = true;
        } else {
          this.conversation.ERROR(error);
        }
      });
  },

  getActions() {
    const actions = [];
    if (this.event?.isDecryptionFailure()) {
      actions.push({
        label: lazy._("message.action.requestKey"),
        run: () => {
          if (this.event) {
            this.conversation?._account?._client
              ?.cancelAndResendEventRoomKeyRequest(this.event)
              .catch(error => this.conversation._account.ERROR(error));
          }
        },
      });
    }
    if (
      this.event &&
      this.conversation?.roomState.maySendRedactionForEvent(
        this.event,
        this.conversation._account?.userId
      )
    ) {
      actions.push({
        label: lazy._("message.action.redact"),
        run: () => {
          this.conversation?._account?._client
            ?.redactEvent(
              this.event.getRoomId(),
              this.event.threadRootId,
              this.event.getId()
            )
            .catch(error => this.conversation._account.ERROR(error));
        },
      });
    }
    if (this.incoming && this.event) {
      actions.push({
        label: lazy._("message.action.report"),
        run: () => {
          this.conversation?._account?._client
            ?.reportEvent(this.event.getRoomId(), this.event.getId(), -100, "")
            .catch(error => this.conversation._account.ERROR(error));
        },
      });
    }
    if (this.event?.status === lazy.MatrixSDK.EventStatus.NOT_SENT) {
      actions.push({
        label: lazy._("message.action.retry"),
        run: () => {
          this.conversation?._account?._client?.resendEvent(
            this.event,
            this.conversation.room
          );
        },
      });
    }
    if (
      [
        lazy.MatrixSDK.EventStatus.NOT_SENT,
        lazy.MatrixSDK.EventStatus.QUEUED,
        lazy.MatrixSDK.EventStatus.ENCRYPTING,
      ].includes(this.event?.status)
    ) {
      actions.push({
        label: lazy._("message.action.cancel"),
        run: () => {
          this.conversation?._account?._client?.cancelPendingEvent(this.event);
        },
      });
    }
    return actions;
  },
};

/**
 * Check if a user has unverified devices.
 *
 * @param {string} userId - User to check.
 * @param {MatrixClient} client - Matrix SDK client instance to use.
 * @returns {boolean}
 */
function checkUserHasUnverifiedDevices(userId, client) {
  const devices = client.getStoredDevicesForUser(userId);
  return devices.some(
    ({ deviceId }) => !client.checkDeviceTrust(userId, deviceId).isVerified()
  );
}

/**
 * Shared implementation for canVerifyIdentity between MatrixParticipant and
 * MatrixBuddy.
 *
 * @param {string} userId - Matrix ID of the user.
 * @param {MatrixClient} client - Matrix SDK client instance.
 * @returns {boolean}
 */
function canVerifyUserIdentity(userId, client) {
  client.downloadKeys([userId]);
  return Boolean(client.getStoredDevicesForUser(userId)?.length);
}

/**
 * Checks if we consider the identity of a user as verified.
 *
 * @param {string} userId - Matrix ID of the user to check.
 * @param {MatrixClient} client - Matrix SDK client instance to use.
 * @returns {boolean}
 */
function userIdentityVerified(userId, client) {
  return (
    client.checkUserTrust(userId).isCrossSigningVerified() &&
    !checkUserHasUnverifiedDevices(userId, client)
  );
}

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
    // If the default power level doesn't let you send messages, set voiced if
    // the user can send messages
    const room = this._account?._client?.getRoom(this._roomMember.roomId);
    if (room) {
      const powerLevels = room.currentState
        .getStateEvents(lazy.MatrixSDK.EventType.RoomPowerLevels, "")
        ?.getContent();
      const defaultLevel =
        lazy.MatrixPowerLevels.getUserDefaultLevel(powerLevels);
      const messageLevel = lazy.MatrixPowerLevels.getEventLevel(
        powerLevels,
        this._account._client.isRoomEncrypted(room.roomId)
          ? lazy.MatrixSDK.EventType.RoomMessageEncrypted
          : lazy.MatrixSDK.EventType.RoomMessage
      );
      if (defaultLevel < messageLevel) {
        return room.currentState.maySendMessage(this._id);
      }
    }
    // Else use a synthetic power level for the voiced flag
    return this._roomMember.powerLevelNorm >= lazy.MatrixPowerLevels.voice;
  },
  get moderator() {
    return this._roomMember.powerLevelNorm >= lazy.MatrixPowerLevels.moderator;
  },
  get admin() {
    return this._roomMember.powerLevelNorm >= lazy.MatrixPowerLevels.admin;
  },

  get canVerifyIdentity() {
    return canVerifyUserIdentity(this.name, this._account._client);
  },

  get _identityVerified() {
    return userIdentityVerified(this.name, this._account._client);
  },

  _startVerification() {
    return this._account.startVerificationDM(this.name);
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
        this._account._client.mxcUrlToHttp(this._user.avatarUrl)) ||
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
    // The contacts service might not have had a chance to add an imIBuddy yet,
    // since it also wants the serverAlias to be set if possible.
    if (this.buddy) {
      this.setStatus(getStatusFromPresence(user), user.presenceStatusMsg ?? "");
    }
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

  get canVerifyIdentity() {
    return canVerifyUserIdentity(this.userName, this._account._client);
  },

  get _identityVerified() {
    return userIdentityVerified(this.userName, this._account._client);
  },

  _startVerification() {
    return this._account.startVerificationDM(this.userName);
  },
};

/**
 * Determine if the event will likely have text content composed by a user to
 * display in a conversation based on its type.
 *
 * @param {MatrixEvent} event - Event to check the type of
 * @returns {boolean} True if the event would typically be shown as text content
 *   sent by a user in a conversation.
 */
function isContentEvent(event) {
  return [
    lazy.MatrixSDK.EventType.RoomMessage,
    lazy.MatrixSDK.EventType.RoomMessageEncrypted,
    lazy.MatrixSDK.EventType.Sticker,
  ].includes(event.getType());
}

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
export function MatrixRoom(account, isMUC, name) {
  this._isChat = isMUC;
  this._init(account, name, account.userId);
  this._initialized = new Promise(resolve => {
    this._resolveInitializer = resolve;
  });
  this._eventsWaitingForDecryption = new Set();
  this._joiningLocks = new Set();
  this._addJoiningLock("roomInit");
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
   *
   * @type {string}
   */
  _mostRecentEventId: null,

  /**
   * Event IDs that we showed a decryption error in the conversation for.
   *
   * @type {Set<string>}
   */
  _eventsWaitingForDecryption: null,

  /**
   * A set of operations that are pending that want the room to show as joining.
   *
   * @type {Set<string>}
   */
  _joiningLocks: null,

  /**
   * Add a lock on the joining state during an operation.
   *
   * @param {string} lockName - Name of the operation that wants to lock joining
   *  state.
   */
  _addJoiningLock(lockName) {
    this._joiningLocks.add(lockName);
    if (!this.joining) {
      this.joining = true;
    }
  },

  /**
   * Release a joining state lock by an operation.
   *
   * @param {string} lockName - Name of the operation that completed.
   */
  _releaseJoiningLock(lockName) {
    this._joiningLocks.delete(lockName);
    if (this.joining && this._joiningLocks.size === 0) {
      this.joining = false;
    }
  },

  /**
   * Leave the room if we close the conversation.
   */
  close() {
    // Clean up any outgoing verification request by us.
    if (!this.isChat) {
      this.cleanUpOutgoingVerificationRequests();
    }
    this._account._client.leave(this._roomId);
    this.left = true;
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
    this._account?.roomList.delete(this._roomId);
    this._releaseJoiningLock("roomInit");
    if (this._account) {
      GenericConversationPrototype.close.call(this);
    }
  },

  /**
   * Sends the given message as a text message to the Matrix room. Does not
   * create the local copy, that is handled by the local echo of the SDK.
   *
   * @param {string} msg - Message to send.
   * @param {boolean} [action=false] - If the message is an emote.
   * @param {boolean} [notice=false]
   */
  dispatchMessage(msg, action = false, notice = false) {
    const handleSendError = type => error => {
      this._account.ERROR(
        `Failed to send ${type} to ${this._roomId}: ${error.message}`
      );
    };
    this.sendTyping("");
    if (action) {
      this._account._client
        .sendEmoteMessage(this._roomId, null, msg)
        .catch(handleSendError("emote"));
    } else if (notice) {
      this._account._client
        .sendNotice(this._roomId, null, msg)
        .catch(handleSendError("notice"));
    } else {
      this._account._client
        .sendTextMessage(this._roomId, null, msg)
        .catch(handleSendError("message"));
    }
  },

  /**
   * Shared init function between conversation types
   *
   * @param {Room} room - associated room with the conversation.
   */
  async initRoom(room) {
    if (!room) {
      return;
    }
    if (room.isSpaceRoom()) {
      this.writeMessage(
        this._account.userId,
        lazy._("message.spaceNotSupported"),
        {
          system: true,
          incoming: true,
          error: true,
        }
      );
      this._setInitialized();
      this.left = true;
      return;
    }
    // Store the ID of the room to look up information in the future.
    this._roomId = room.roomId;

    // Update the title to the human readable version.
    if (room.name && this._name != room.name && room.name !== room.roomId) {
      this._name = room.name;
      this.notifyObservers(null, "update-conv-title");
    }

    this.updateConvIcon();

    if (this.isChat) {
      await this.initRoomMuc(room);
    } else {
      this.initRoomDm(room);
      await this.searchForVerificationRequests().catch(error =>
        this._account.WARN(error)
      );
    }

    // Room may have been disposed in the mean time.
    if (this._replacedBy || !this._account) {
      return;
    }

    await this.updateUnverifiedDevices();
    this._setInitialized();
  },

  /**
   * Mark conversation as initialized, meaning it has an associated room in the
   * state of the SDK. Sets the joining state to false and resolves
   * _initialized.
   */
  _setInitialized() {
    this._releaseJoiningLock("roomInit");
    this._resolveInitializer();
  },

  /**
   * Function to mark this room instance superseded by another one.
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
    this._addJoiningLock("catchup");
    await this.waitForRoom();
    if (this.isChat) {
      await this.room.loadMembersIfNeeded();
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

      this._name = this.room.name;
      this.notifyObservers(null, "update-conv-title");
    }

    // Find the newest event id the user has already seen
    let latestOldEvent;
    if (this._mostRecentEventId) {
      latestOldEvent = this._mostRecentEventId;
    } else {
      // Last message the user has read with high certainty.
      const fullyRead = this.room.getAccountData(
        lazy.MatrixSDK.EventType.FullyRead
      );
      if (fullyRead) {
        latestOldEvent = fullyRead.getContent().event_id;
      }
    }
    // Get the timeline for the event, or just the current live timeline of the room
    const timelineWindow = new lazy.MatrixSDK.TimelineWindow(
      this._account._client,
      this.room.getUnfilteredTimelineSet(),
      {
        windowLimit: MAX_CATCHUP_EVENTS,
      }
    );
    const newestEvent = this.room.getLiveTimeline().getEvents().at(-1);
    // Start the window at the newest event.
    await timelineWindow.load(newestEvent.getId(), CATCHUP_PAGE_SIZE);
    // Check if the oldest event we want to see is already in the window
    const checkEvent = event =>
      event.getId() === latestOldEvent ||
      (event.getSender() === this._account.userId && isContentEvent(event));
    let endIndex = -1;
    if (latestOldEvent) {
      const events = timelineWindow.getEvents();
      endIndex = events.slice().reverse().findIndex(checkEvent);
      if (endIndex >= 0) {
        endIndex = events.length - endIndex - 1;
      }
    }
    // Paginate backward until we either find our oldest event or we reach the max backscroll length.
    while (
      endIndex === -1 &&
      timelineWindow.getEvents().length < MAX_CATCHUP_EVENTS &&
      timelineWindow.canPaginate(lazy.MatrixSDK.EventTimeline.BACKWARDS)
    ) {
      const baseSize = timelineWindow.getEvents().length;
      const windowSize = Math.min(
        MAX_CATCHUP_EVENTS - baseSize,
        CATCHUP_PAGE_SIZE
      );
      const didLoadEvents = await timelineWindow.paginate(
        lazy.MatrixSDK.EventTimeline.BACKWARDS,
        windowSize
      );
      // Only search in the newly added events
      const events = timelineWindow.getEvents();
      endIndex = events.slice(0, -baseSize).reverse().findIndex(checkEvent);
      if (endIndex >= 0) {
        endIndex = events.length - baseSize - endIndex - 1;
      }
      if (!didLoadEvents) {
        break;
      }
    }
    // Remove the old event from the window.
    if (endIndex !== -1) {
      timelineWindow.unpaginate(endIndex + 1, true);
    }
    const newEvents = timelineWindow.getEvents();
    for (const event of newEvents) {
      this.addEvent(event, true);
    }
    this._releaseJoiningLock("catchup");
  },

  /**
   * Add a matrix event to the conversation's logs.
   *
   * @param {MatrixEvent} event
   * @param {boolean} [delayed=false] - Event is added while catching up to a live state.
   * @param {boolean} [replace=false] - Event replaces an existing message.
   */
  addEvent(event, delayed = false, replace = false) {
    if (event.isRedaction()) {
      // Handled by the SDK.
      return;
    }
    // If the event we got isn't actually a new event in the conversation,
    // change this to the appropriate value.
    let newestEventId = event.getId();
    // Contents of the message to write/update
    let message = lazy.MatrixMessageContent.getIncomingPlain(
      event,
      this._account._client.getHomeserverUrl(),
      eventId => this.room.findEventById(eventId)
    );
    // Options for the message. Many options derived from event are set in
    // createMessage.
    const opts = {
      event,
      delayed,
    };
    if (
      event.isEncrypted() &&
      (event.shouldAttemptDecryption() ||
        event.isBeingDecrypted() ||
        event.isDecryptionFailure())
    ) {
      // Wait for the decryption event for this message.
      event.once(lazy.MatrixSDK.MatrixEventEvent.Decrypted, event => {
        this.addEvent(event, false, true);
      });
    }
    const eventType = event.getType();
    if (event.isRedacted()) {
      newestEventId = event.getRedactionEvent()?.event_id;
      replace = true;
      opts.system = !isContentEvent(event);
      opts.deleted = true;
    } else if (isContentEvent(event)) {
      const eventContent = event.getContent();
      // Only print server notices when we're in a server notice room.
      if (
        eventContent.msgtype === "m.server_notice" &&
        !this?.room.tags[SERVER_NOTICE_TAG]
      ) {
        return;
      }
      opts.system = [
        "m.server_notice",
        lazy.MatrixSDK.MsgType.KeyVerificationRequest,
      ].includes(eventContent.msgtype);
      opts.error = event.isDecryptionFailure();
      opts.notification =
        eventContent.msgtype === lazy.MatrixSDK.MsgType.Notice;
      opts.action = eventContent.msgtype === lazy.MatrixSDK.MsgType.Emote;
    } else if (eventType === lazy.MatrixSDK.EventType.RoomEncryption) {
      this.notifyObservers(this, "update-conv-encryption");
      opts.system = true;
      this.updateUnverifiedDevices();
    } else if (eventType == lazy.MatrixSDK.EventType.RoomTopic) {
      this.setTopic(event.getContent().topic, event.getSender());
    } else if (eventType == lazy.MatrixSDK.EventType.RoomTombstone) {
      // Room version update
      this.writeMessage(event.getSender(), event.getContent().body, {
        system: true,
        event,
      });
      // Don't write the body using the normal message handling because that
      // will be too late.
      message = "";
      const newConversation = this._account.getGroupConversation(
        event.getContent().replacement_room,
        this.name
      );
      // Make sure the new room gets the correct conversation type.
      newConversation.checkForUpdate();
      this.replaceRoom(newConversation);
      this.forget();
      //TODO link to the old logs based on the |predecessor| field of m.room.create
    } else if (eventType == lazy.MatrixSDK.EventType.RoomAvatar) {
      // Update the icon of this room.
      this.updateConvIcon();
    } else {
      opts.system = true;
      // We don't think we should show a notice for this event.
      if (!message) {
        this.LOG("Unhandled event: " + JSON.stringify(event.toJSON()));
      }
    }
    if (message) {
      if (replace) {
        this.updateMessage(event.getSender(), message, opts);
      } else {
        this.writeMessage(event.getSender(), message, opts);
      }
    }
    this._mostRecentEventId = newestEventId;
  },

  _typingTimer: null,
  _typingDebounce: null,

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

    const isTyping = string.length > 0;

    this._cancelTypingTimer();
    if (isTyping) {
      this._typingTimer = setTimeout(this.finishedComposing.bind(this), 10000);
    }

    this._setTypingState(isTyping);

    return Ci.prplIConversation.NO_TYPING_LIMIT;
  },

  /**
   * Set the typing status to false if typing notifications are sent.
   *
   * @returns {undefined}
   */
  finishedComposing() {
    if (!this.shouldSendTypingNotifications) {
      return;
    }

    this._setTypingState(false);
  },

  /**
   * Send the given typing state if it is not typing or alternatively not been
   * sent in the last second.
   *
   * @param {boolean} isTyping - If the user is currently composing a message.
   * @returns {undefined}
   */
  _setTypingState(isTyping) {
    if (isTyping) {
      if (this._typingDebounce) {
        return;
      }
      this._typingDebounce = setTimeout(() => {
        delete this._typingDebounce;
      }, 1000);
    } else if (this._typingDebounce) {
      clearTimeout(this._typingDebounce);
      delete this._typingDebounce;
    }
    this._account._client
      .sendTyping(this._roomId, isTyping, 10000)
      .catch(error => this._account.ERROR(error));
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

  _cleanUpTimers() {
    this._cancelTypingTimer();
    if (this._typingDebounce) {
      clearTimeout(this._typingDebounce);
      delete this._typingDebounce;
    }
  },

  /**
   * Sets the containsNick flag on the message if appropriate. If an event is
   * provided in properties, many of the message properties are set based on
   * it here.
   *
   * @param {string} who - MXID that composed the message.
   * @param {string} text - Message text.
   * @param {object} properties - Extra attributes for the MatrixMessage.
   */
  createMessage(who, text, properties) {
    if (properties.event) {
      const actions = this._account._client.getPushActionsForEvent(
        properties.event
      );
      const isOutgoing = properties.event.getSender() == this._account.userId;
      properties.incoming = !isOutgoing;
      properties.outgoing = isOutgoing;
      properties._alias = properties.event.sender?.name;
      properties.isEncrypted = properties.event.isEncrypted();
      properties.containsNick =
        !isOutgoing &&
        Boolean((this.isChat && actions?.notify) || actions?.tweaks?.highlight);
      properties.time = Math.floor(properties.event.getDate() / 1000);
      properties._iconURL =
        properties.event.sender?.getAvatarUrl(
          this._account._client.getHomeserverUrl(),
          USER_ICON_SIZE,
          USER_ICON_SIZE,
          "scale",
          false
        ) || "";
      properties.remoteId = properties.event.getId();
    }
    if (this.isChat && !properties.containsNick) {
      properties.containsNick =
        properties.incoming && this._pingRegexp.test(text);
    }
    const message = new MatrixMessage(who, text, properties, this);
    return message;
  },

  /**
   * @param {imIMessage} msg
   */
  prepareForDisplaying(msg) {
    const formattedHTML = lazy.MatrixMessageContent.getIncomingHTML(
      msg.prplMessage.event,
      this._account._client.getHomeserverUrl(),
      eventId => this.room.findEventById(eventId)
    );
    if (formattedHTML) {
      msg.displayMessage = formattedHTML;
    }
    GenericConversationPrototype.prepareForDisplaying.apply(this, arguments);
  },

  /**
   * @type {Room|null}
   */
  get room() {
    return this._account?._client.getRoom(this._roomId);
  },
  get roomState() {
    return this.room
      ?.getLiveTimeline()
      .getState(lazy.MatrixSDK.EventTimeline.FORWARDS);
  },
  /**
   * If we should send typing notifications to the remote server.
   *
   * @type {boolean}
   */
  get shouldSendTypingNotifications() {
    return Services.prefs.getBoolPref("purple.conversations.im.send_typing");
  },
  /**
   * The ID of the room.
   *
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
    this._addJoiningLock("checkForUpdate");
    this._isChat = shouldBeMuc;
    this.notifyObservers(null, "chat-update-type");
    if (shouldBeMuc) {
      await this.makeMuc();
    } else {
      await this.makeDm();
    }
    this.updateConvIcon();
    this._releaseJoiningLock("checkForUpdate");
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
  async makeDm() {
    this._participants.clear();
    this.initRoomDm(this.room);
    await this.updateUnverifiedDevices();
  },

  /**
   * Change the data in this conversation to match what we expect for a MUC.
   * This means removing the associated buddy, initializing the participants
   * list and updating the topic.
   */
  async makeMuc() {
    // Cancel any pending outgoing verification request we sent.
    this.cleanUpOutgoingVerificationRequests();
    this.closeDm();
    await this.initRoomMuc(this.room);
  },

  /**
   * Set the convIconFilename field for the conversation. Only writes to the
   * field when the value changes.
   */
  updateConvIcon() {
    const avatarUrl = this.room?.getAvatarUrl(
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

    const participant = new MatrixParticipant(roomMember, this._account);
    this._participants.set(roomMember.userId, participant);
    this.notifyObservers(
      new nsSimpleEnumerator([participant]),
      "chat-buddy-add"
    );
    this.updateUnverifiedDevices();
  },

  removeParticipant(userId) {
    if (!this._participants.has(userId)) {
      return;
    }
    GenericConvChatPrototype.removeParticipant.call(this, userId);
    this.updateUnverifiedDevices();
  },

  /**
   * Initialize the room after the response from the Matrix client.
   *
   * @param {object} room - associated room with the conversation.
   */
  async initRoomMuc(room) {
    const roomState = this.roomState;
    if (roomState.getStateEvents(lazy.MatrixSDK.EventType.RoomTopic).length) {
      const event = roomState.getStateEvents(
        lazy.MatrixSDK.EventType.RoomTopic
      )[0];
      this.setTopic(event.getContent().topic, event.getSender(), true);
    }

    await room.loadMembersIfNeeded();
    // If there are any participants, create them.
    const participants = [];
    room.getJoinedMembers().forEach(roomMember => {
      if (!this._participants.has(roomMember.userId)) {
        const participant = new MatrixParticipant(roomMember, this._account);
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
        lazy.MatrixSDK.EventType.RoomTopic,
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
      IMServices.tags.defaultTag,
      user.userId
    );
    this.buddy.setUser(user);
    IMServices.contacts.accountBuddyAdded(this.buddy);
    // We can only set the status after the contacts service set the imIBuddy.
    this.buddy.setStatusFromPresence();
    this._account.buddies.set(dmUserId, this.buddy);
  },

  /**
   * Searches for recent verification requests in the room history.
   * Optimally we would instead handle verification requests with natural event
   * backfill for the room. Until then, we search the last three days of events
   * for verification requests.
   */
  async searchForVerificationRequests() {
    // Wait for us to join the room.
    const myMembership = this.room.getMyMembership();
    if (myMembership === "invite") {
      let listener;
      try {
        await new Promise((resolve, reject) => {
          listener = (event, member) => {
            if (member.userId === this._account.userId) {
              if (member.membership === "join") {
                resolve();
              } else if (member.membership === "leave") {
                reject(new Error("Not in room"));
              }
            }
          };
          this._account._client.on("RoomMember.membership", listener);
        });
      } catch (error) {
        return;
      } finally {
        this._account._client.removeListener("RoomMember.membership", listener);
      }
    } else if (myMembership === "leave") {
      return;
    }
    const timelineWindow = new lazy.MatrixSDK.TimelineWindow(
      this._account._client,
      this.room.getUnfilteredTimelineSet()
    );
    // Limit how far back we search. Three days seems like it would catch most
    // relevant verification requests. We might get even older events in the
    // initial load of 25 events.
    const windowChunkSize = 25;
    const threeDaysMs = 1000 * 60 * 60 * 24 * 3;
    const newerThanMs = Date.now() - threeDaysMs;
    await timelineWindow.load(undefined, windowChunkSize);
    while (
      timelineWindow.canPaginate(lazy.MatrixSDK.EventTimeline.BACKWARDS) &&
      timelineWindow.getEvents()[0].getTs() >= newerThanMs
    ) {
      if (
        !(await timelineWindow.paginate(
          lazy.MatrixSDK.EventTimeline.BACKWARDS,
          windowChunkSize
        ))
      ) {
        // Pagination was unable to add any more events
        break;
      }
    }
    const events = timelineWindow.getEvents();
    for (const event of events) {
      // Find verification requests that are still in the requested state that
      // were sent by the other user.
      if (
        event.getType() === lazy.MatrixSDK.EventType.RoomMessage &&
        event.getContent().msgtype ===
          lazy.MatrixSDK.EventType.KeyVerificationRequest &&
        event.getSender() !== this._account.userId &&
        event.verificationRequest?.requested
      ) {
        this._account.handleIncomingVerificationRequest(
          event.verificationRequest
        );
      }
    }
  },

  /**
   * Cancel any pending outgoing verification requests. Used when we leave a
   * DM room, when the other party leaves or when the room can no longer be
   * considered a DM room.
   */
  cleanUpOutgoingVerificationRequests() {
    const request = this._account._pendingOutgoingVerificationRequests.get(
      this.buddy?.userName
    );
    if (request && request.requestEvent.getRoomId() == this._roomId) {
      request.cancel();
      this._account._pendingOutgoingVerificationRequests.delete(
        this.buddy.userName
      );
    }
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
        IMServices.contacts.accountBuddyRemoved(this.buddy);
        this._account.buddies.delete(dmUserId);
        delete this.buddy;
      }
    }
  },

  updateTyping: GenericConvIMPrototype.updateTyping,
  typingState: Ci.prplIConvIM.NOT_TYPING,

  _hasUnverifiedDevices: true,
  /**
   * Update the cached value for device trust and fire an
   * update-conv-encryption if the value changed. We cache the unverified
   * devices state, since the encryption state getter is sync. Does nothing if
   * the room is not encrypted.
   */
  async updateUnverifiedDevices() {
    const account = this._account;
    if (
      !account._client.isCryptoEnabled() ||
      !account._client.isRoomEncrypted(this._roomId)
    ) {
      return;
    }
    const members = await this.room.getEncryptionTargetMembers();
    // Check for participants that we haven't verified via cross signing, or
    // of which we don't trust a device, and if everyone seems fine, check our
    // own device verification state.
    const newValue =
      members.some(({ userId }) => {
        return !userIdentityVerified(userId, account._client);
      }) || checkUserHasUnverifiedDevices(account.userId, account._client);
    if (this._hasUnverifiedDevices !== newValue) {
      this._hasUnverifiedDevices = newValue;
      this.notifyObservers(this, "update-conv-encryption");
    }
  },
  get encryptionState() {
    if (
      !this._account._client.isCryptoEnabled() ||
      (!this._account._client.isRoomEncrypted(this._roomId) &&
        !this.room?.currentState.mayClientSendStateEvent(
          lazy.MatrixSDK.EventType.RoomEncryption,
          this._account._client
        ))
    ) {
      return Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED;
    }
    if (!this._account._client.isRoomEncrypted(this._roomId)) {
      return Ci.prplIConversation.ENCRYPTION_AVAILABLE;
    }
    if (this._hasUnverifiedDevices) {
      return Ci.prplIConversation.ENCRYPTION_ENABLED;
    }
    return Ci.prplIConversation.ENCRYPTION_TRUSTED;
  },
  initializeEncryption() {
    if (this._account._client.isRoomEncrypted(this._roomId)) {
      return;
    }
    this._account._client.sendStateEvent(
      this._roomId,
      lazy.MatrixSDK.EventType.RoomEncryption,
      {
        algorithm: lazy.OlmLib.MEGOLM_ALGORITHM,
      }
    );
  },
};

/**
 * Initialize the verification, choosing the challenge method and calculating
 * the challenge string and description.
 *
 * @param {VerificationRequest} request - Matrix SDK verification request.
 * @returns {Promise<{ challenge: string, challengeDescription: string?, handleResult: (boolean) => {}, cancel: () => {}, cancelPromise: Promise}}
 */
async function startVerification(request) {
  if (!request.verifier) {
    if (!request.initiatedByMe) {
      await request.accept();
      if (request.cancelled) {
        throw new Error("verification aborted");
      }
      // Auto chose method as the only one we both support.
      await request.beginKeyVerification(
        request.methods[0],
        request.targetDevice
      );
    } else {
      await request.waitFor(() => request.started || request.cancelled);
    }
    if (request.cancelled) {
      throw new Error("verification aborted");
    }
  }
  const sasEventPromise = new Promise(resolve =>
    request.verifier.once(lazy.MatrixSDK.Crypto.VerifierEvent.ShowSas, resolve)
  );
  request.verifier.verify();
  const sasEvent = await sasEventPromise;
  if (request.cancelled) {
    throw new Error("verification aborted");
  }
  let challenge = "";
  let challengeDescription;
  if (sasEvent.sas.emoji) {
    challenge = sasEvent.sas.emoji.map(emoji => emoji[0]).join(" ");
    challengeDescription = sasEvent.sas.emoji.map(emoji => emoji[1]).join(" ");
  } else if (sasEvent.sas.decimal) {
    challenge = sasEvent.sas.decimal.join(" ");
  } else {
    sasEvent.cancel();
    throw new Error("unknown verification method");
  }
  return {
    challenge,
    challengeDescription,
    handleResult(challengeMatches) {
      if (!challengeMatches) {
        sasEvent.mismatch();
      } else {
        sasEvent.confirm();
      }
    },
    cancel() {
      if (!request.cancelled) {
        sasEvent.cancel();
      }
    },
    cancelPromise: request.waitFor(() => request.cancelled),
  };
}

/**
 * @param {prplIAccount} account - Matrix account this session is associated with.
 * @param {string} ownerId - Matrix ID that this session is from.
 * @param {DeviceInfo} deviceInfo - Session device info.
 */
function MatrixSession(account, ownerId, deviceInfo) {
  this._deviceInfo = deviceInfo;
  this._ownerId = ownerId;
  let id = deviceInfo.deviceId;
  if (deviceInfo.getDisplayName()) {
    id = lazy._("options.encryption.session", id, deviceInfo.getDisplayName());
  }
  const deviceTrust = account._client.checkDeviceTrust(
    ownerId,
    deviceInfo.deviceId
  );
  const isCurrentDevice = deviceInfo.deviceId === account._client.getDeviceId();

  this._init(
    account,
    id,
    deviceTrust.isCrossSigningVerified(),
    isCurrentDevice
  );
}
MatrixSession.prototype = {
  __proto__: GenericSessionPrototype,
  _deviceInfo: null,
  async _startVerification() {
    let request;
    const requestKey = this.currentSession
      ? this._ownerId
      : this._deviceInfo.deviceId;
    if (this._account._pendingOutgoingVerificationRequests.has(requestKey)) {
      throw new Error(
        "Already have a pending verification request for " + requestKey
      );
    }
    if (this.currentSession) {
      request = await this._account._client.requestVerification(this._ownerId);
    } else {
      request = await this._account._client.requestVerification(this._ownerId, [
        this._deviceInfo.deviceId,
      ]);
    }
    this._account.trackOutgoingVerificationRequest(request, requestKey);
    return startVerification(request);
  },
};

function getStatusString(status) {
  return status
    ? lazy._("options.encryption.statusOk")
    : lazy._("options.encryption.statusNotOk");
}

/**
 * Get the conversation name to display for a room.
 *
 * @param {string} roomId - ID of the room.
 * @param {RoomNameState} state - State of the room name from the SDK.
 * @returns {string?} Name to show for the room. If nothing is returned, the SDK
 *   uses its built in naming logic.
 */
function getRoomName(roomId, state) {
  switch (state.type) {
    case lazy.MatrixSDK.RoomNameType.Actual:
      return state.name;
    case lazy.MatrixSDK.RoomNameType.Generated: {
      if (!state.names) {
        return lazy.l10n.formatValueSync("room-name-empty");
      }
      if (state.names.length === 1 && state.count <= 2) {
        return state.names[0];
      }
      if (state.names.length === 2 && state.count <= 3) {
        return new Intl.ListFormat(undefined, {
          style: "long",
          type: "conjunction",
        }).format(state.names);
      }
      return lazy.l10n.formatValueSync("room-name-others2", {
        participant: state.names[0],
        otherParticipantCount: state.names.length - 1,
      });
    }
    case lazy.MatrixSDK.RoomNameType.EmptyRoom:
      if (state.oldName) {
        return lazy.l10n.formatValueSync("room-name-empty-had-name", {
          oldName: state.oldName,
        });
      }
      return lazy.l10n.formatValueSync("room-name-empty");
  }
  // Else fall through to default SDK room naming logic.
  return null;
}

/*
 * TODO Other random functionality from MatrixClient that will be useful:
 *  getRooms / getUsers / publicRooms
 *  invite
 *  ban / kick
 *  redactEvent
 *  scrollback
 *  setAvatarUrl
 *  setPassword
 */
export function MatrixAccount(aProtocol, aImAccount) {
  this._init(aProtocol, aImAccount);
  this.roomList = new Map();
  this._userToRoom = {};
  this.buddies = new Map();
  this._pendingDirectChats = new Map();
  this._pendingRoomAliases = new Map();
  this._pendingRoomInvites = new Set();
  this._pendingOutgoingVerificationRequests = new Map();
  this._failedEvents = new Set();
  this._verificationRequestTimeouts = new Set();
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
    for (const conv of this.roomList.values()) {
      // We want to remove all the conversations. We are not using conv.close
      // function call because we don't want user to leave all the matrix rooms.
      // User just want to remove the account so we need to remove the listed
      // conversations.
      conv.forget();
      conv._cleanUpTimers();
    }
    delete this.roomList;
    for (const timeout of this._verificationRequestTimeouts) {
      clearTimeout(timeout);
    }
    this._verificationRequestTimeouts.clear();
    // Cancel all pending outgoing verification requests, as we can no longer handle them.
    let pendingClientOperations = Promise.all(
      Array.from(
        this._pendingOutgoingVerificationRequests.values(),
        request => {
          return request.cancel().catch(error => this.ERROR(error));
        }
      )
    ).then(() => {
      this._pendingOutgoingVerificationRequests.clear();
    });
    // We want to clear data stored for syncing in indexedDB so when
    // user logins again, one gets the fresh start.
    if (this._client) {
      if (this._client.isLoggedIn()) {
        pendingClientOperations = pendingClientOperations.then(() =>
          this._client.logout()
        );
      }
      pendingClientOperations.finally(() => {
        this._client.clearStores();
      });
    } else {
      // Without client we can still clear the stores at least.
      pendingClientOperations.finally(async () => {
        // getClientOptions wipes the session storage.
        const opts = await this.getClientOptions();
        opts.store.deleteAllData();
        opts.cryptoStore.deleteAllData();
      });
    }
  },
  unInit() {
    if (this.roomList) {
      for (const conv of this.roomList.values()) {
        conv._cleanUpTimers();
      }
    }
    for (const timeout of this._verificationRequestTimeouts) {
      clearTimeout(timeout);
    }
    // Cancel all pending outgoing verification requests, as we can no longer handle them.
    const pendingClientOperations = Promise.all(
      Array.from(
        this._pendingOutgoingVerificationRequests.values(),
        request => {
          return request.cancel().catch(error => this.ERROR(error));
        }
      )
    );
    if (this._client) {
      pendingClientOperations.finally(() => {
        // Avoid sending connection status changes.
        this._client.removeAllListeners(lazy.MatrixSDK.ClientEvent.Sync);
        this._client.stopClient();
      });
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
      const tempClient = lazy.MatrixSDK.createClient({
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

    // Ensure any existing client will no longer interact with the network and
    // this account instance. A client will already exist whenever the account
    // is reconnected via the chat account connection management, or when we
    // have to create a new client to handle a new indexedDB schema.
    if (this._client) {
      this._client.stopClient();
      this._client.removeAllListeners();
    }

    const opts = await this.getClientOptions();
    this._client = lazy.MatrixSDK.createClient(opts);
    if (this._client.isLoggedIn()) {
      this.startClient();
      return;
    }
    const { flows } = await this._client.loginFlows();
    const usePasswordFlow = Boolean(this.imAccount.password);
    const wantedFlows = [];
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
        lazy._("connection.error.noSupportedFlow")
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
    let domain = "matrix.org";
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
    let discoveredInfo = await lazy.MatrixSDK.AutoDiscovery.findClientConfig(
      domain
    );
    let homeserverResult = discoveredInfo[HOMESERVER_WELL_KNOWN];

    // If the well-known lookup fails, pretend the domain has a well-known for
    // itself.
    if (homeserverResult.state !== lazy.MatrixSDK.AutoDiscovery.SUCCESS) {
      discoveredInfo = await lazy.MatrixSDK.AutoDiscovery.fromDiscoveryConfig({
        [HOMESERVER_WELL_KNOWN]: {
          base_url: `https://${domain}`,
        },
      });
      homeserverResult = discoveredInfo[HOMESERVER_WELL_KNOWN];
    }
    if (homeserverResult.state === lazy.MatrixSDK.AutoDiscovery.PROMPT) {
      throw new Error(lazy._("connection.error.serverNotFound"));
    }
    if (homeserverResult.state !== lazy.MatrixSDK.AutoDiscovery.SUCCESS) {
      //TODO these are English strings generated by the SDK.
      throw new Error(homeserverResult.error);
    }
    return homeserverResult.base_url;
  },

  /**
   * If the |name| property of this account looks like a valid Matrix ID.
   *
   * @type {boolean}
   */
  get nameIsMXID() {
    return (
      this.name[0] === this.protocol.usernamePrefix &&
      this.name.includes(this.protocol.usernameSplits[0].separator)
    );
  },

  /**
   * Error displayed to the user if there is some user-action required for the
   * encryption setup.
   */
  _encryptionError: "",

  /**
   * Builds the options for the |createClient| call to the SDK including all
   * stores.
   *
   * @returns {Promise<object>}
   */
  async getClientOptions() {
    const dbName = "chat:matrix:" + this.imAccount.id;

    const opts = {
      useAuthorizationHeader: true,
      baseUrl: this._baseURL,
      store: new lazy.MatrixSDK.IndexedDBStore({
        indexedDB,
        dbName,
      }),
      cryptoStore: new lazy.MatrixSDK.IndexedDBCryptoStore(
        indexedDB,
        dbName + ":crypto"
      ),
      deviceId: this.prefs.getStringPref("deviceId", "") || undefined,
      accessToken: this.prefs.getStringPref("accessToken", "") || undefined,
      userId: this.prefs.getStringPref("userId", "") || undefined,
      timelineSupport: true,
      cryptoCallbacks: {
        getSecretStorageKey: async ({ keys }) => {
          const backupPassphrase = this.getString("backupPassphrase");
          if (!backupPassphrase) {
            this.WARN("Missing secret storage key");
            this._encryptionError = lazy._(
              "options.encryption.needBackupPassphrase"
            );
            await this.updateEncryptionStatus();
            return null;
          }
          let keyId = await this._client.getDefaultSecretStorageKeyId();
          if (keyId && !keys[keyId]) {
            keyId = undefined;
          }
          if (!keyId) {
            keyId = keys[0][0];
          }
          const backupInfo = await this._client.getKeyBackupVersion();
          const key = await this._client.keyBackupKeyFromPassword(
            backupPassphrase,
            backupInfo
          );
          return [keyId, key];
        },
      },
      verificationMethods: [lazy.MatrixCrypto.verificationMethods.SAS],
      roomNameGenerator: getRoomName,
    };
    await Promise.all([opts.store.startup(), opts.cryptoStore.startup()]);
    return opts;
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
        loginInfo.initial_device_display_name =
          this.getString("deviceDisplayName");
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
      const opts = await this.getClientOptions();
      this._client.stopClient();
      this._client = lazy.MatrixSDK.createClient(opts);
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
    this.reportConnecting(lazy._("connection.requestAuth"));
    const url = this._client.getSsoLoginUrl(
      lazy.InteractiveBrowser.COMPLETION_URL,
      "sso"
    );
    lazy.InteractiveBrowser.waitForRedirect(
      url,
      `${this.name} - ${this._baseURL}`
    )
      .then(resultUrl => {
        const parsedUrl = new URL(resultUrl);
        const rawUrlData = parsedUrl.searchParams;
        const urlData = new URLSearchParams(rawUrlData);
        if (!urlData.has("loginToken")) {
          throw new Error("No token in redirect");
        }

        this.reportConnecting(lazy._("connection.requestAccess"));
        this.loginWithToken(urlData.get("loginToken"));
      })
      .catch(() => {
        this.reportDisconnecting(
          Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
          lazy._("connection.error.authCancelled")
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
    return this._client?.getSyncState() !== lazy.SyncState.Syncing;
  },

  /**
   * Set of event IDs for events that have failed to send. Used to avoid
   * showing an error after resending a message fails again.
   *
   * @type {Set<string>}
   */
  _failedEvents: null,

  /*
   * Hook up the Matrix Client to callbacks to handle various events.
   *
   * The possible events are documented starting at:
   * https://matrix-org.github.io/matrix-js-sdk/2.4.1/module-client.html#~event:MatrixClient%22accountData%22
   */
  startClient() {
    this._client.on(
      lazy.MatrixSDK.ClientEvent.Sync,
      (state, prevState, data) => {
        switch (state) {
          case lazy.SyncState.Prepared:
            if (prevState !== state) {
              this.setPresence(this.imAccount.statusInfo);
            }
            this.reportConnected();
            break;
          case lazy.SyncState.Stopped:
            this.reportDisconnected();
            break;
          case lazy.SyncState.Syncing:
            if (prevState !== state) {
              this.reportConnected();
              this.handleCaughtUp();
            }
            break;
          case lazy.SyncState.Reconnecting:
            this.reportConnecting();
            break;
          case lazy.SyncState.Error:
            if (
              data.error.reason ==
              lazy.MatrixSDK.InvalidStoreError.TOGGLED_LAZY_LOADING
            ) {
              this._client.store.deleteAllData().then(() => this.connect());
              break;
            }
            this.reportDisconnecting(
              Ci.prplIAccount.ERROR_OTHER_ERROR,
              data.error.message
            );
            this.reportDisconnected();
            break;
          case lazy.SyncState.Catchup:
            this.reportConnecting();
            break;
        }
      }
    );
    this._client.on(
      lazy.MatrixSDK.RoomMemberEvent.Membership,
      (event, member, oldMembership) => {
        if (this._catchingUp) {
          return;
        }
        if (this.roomList.has(member.roomId)) {
          const conv = this.roomList.get(member.roomId);
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
      }
    );

    /*
     * Get the map of direct messaging rooms.
     */
    this._client.on(lazy.MatrixSDK.ClientEvent.AccountData, event => {
      if (event.getType() == lazy.MatrixSDK.EventType.Direct) {
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
      lazy.MatrixSDK.RoomEvent.Timeline,
      (event, room, toStartOfTimeline, removed, data) => {
        if (this._catchingUp || room.isSpaceRoom() || !data?.liveEvent) {
          return;
        }
        let conv = this.roomList.get(room.roomId);
        if (!conv) {
          // If our membership changed to join without us knowing about the
          // room, another client probably accepted an invite.
          if (
            event.getType() == lazy.MatrixSDK.EventType.RoomMember &&
            event.target.userId == this.userId &&
            event.getContent().membership == "join" &&
            event.getPrevContent()?.membership == "invite"
          ) {
            if (event.getPrevContent()?.is_direct) {
              const userId = room.getDMInviter();
              if (this._pendingRoomInvites.has(room.roomId)) {
                this.cancelBuddyRequest(userId);
                this._pendingRoomInvites.delete(room.roomId);
              }
              conv = this.getDirectConversation(userId, room.roomId, room.name);
            } else {
              if (this._pendingRoomInvites.has(room.roomId)) {
                const alias = room.getCanonicalAlias() ?? room.roomId;
                this.cancelChatRequest(alias);
                this._pendingRoomInvites.delete(room.roomId);
              }
              conv = this.getGroupConversation(room.roomId, room.name);
            }
          } else {
            return;
          }
        }
        conv.addEvent(event);
      }
    );
    // Queued, sending and failed events
    this._client.on(
      lazy.MatrixSDK.RoomEvent.LocalEchoUpdated,
      (event, room, oldEventId, oldStatus) => {
        if (
          this._catchingUp ||
          room.isSpaceRoom() ||
          event.getType() !== lazy.MatrixSDK.EventType.RoomMessage
        ) {
          return;
        }
        const conv = this.roomList.get(room.roomId);
        if (!conv) {
          return;
        }
        if (event.status === lazy.MatrixSDK.EventStatus.NOT_SENT) {
          if (this._failedEvents.has(event.getId())) {
            return;
          }
          this._failedEvents.add(event.getId());
          conv.writeMessage(
            this._roomId,
            lazy._("error.sendMessageFailed", event.getContent().body),
            {
              error: true,
              system: true,
              event,
            }
          );
        } else if (
          (event.status === lazy.MatrixSDK.EventStatus.SENT ||
            event.status === null) &&
          oldEventId
        ) {
          this._failedEvents.delete(oldEventId);
          conv.removeMessage(oldEventId);
        } else if (event.status === lazy.MatrixSDK.EventStatus.CANCELLED) {
          this._failedEvents.delete(event.getId());
          conv.removeMessage(event.getId());
        }
      }
    );
    // An event that was already in the room timeline was redacted
    this._client.on(lazy.MatrixSDK.RoomEvent.Redaction, (event, room) => {
      const conv = this.roomList.get(room.roomId);
      if (conv) {
        const redactedEvent = conv.room?.findEventById(event.getAssociatedId());
        if (redactedEvent) {
          conv.addEvent(redactedEvent);
        }
      }
    });
    // Update the chat participant information.
    this._client.on(
      lazy.MatrixSDK.RoomMemberEvent.Name,
      this.updateRoomMember.bind(this)
    );
    this._client.on(
      lazy.MatrixSDK.RoomMemberEvent.PowerLevel,
      this.updateRoomMember.bind(this)
    );

    this._client.on(lazy.MatrixSDK.RoomEvent.Name, room => {
      if (room.isSpaceRoom()) {
        return;
      }
      // Update the title to the human readable version.
      const conv = this.roomList.get(room.roomId);
      if (!this._catchingUp && conv && room?.name && conv._name != room.name) {
        conv._name = room.name;
        conv.notifyObservers(null, "update-conv-title");
      }
    });

    /*
     * We show invitation notifications for rooms where the membership is
     * invite. This will also be fired for all the rooms we have joined
     * earlier when SDK gets connected. We will use that part to to make
     * conversations, direct or group.
     */
    this._client.on(lazy.MatrixSDK.ClientEvent.Room, room => {
      if (this._catchingUp || room.isSpaceRoom()) {
        return;
      }
      const me = room.getMember(this.userId);
      if (me?.membership == "invite") {
        if (me.events.member.getContent().is_direct) {
          this.invitedToDM(room);
        } else {
          this.invitedToChat(room);
        }
      } else if (me?.membership == "join") {
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
          for (const roomMember of room.getJoinedMembers()) {
            if (roomMember.userId != this.userId) {
              interlocutorId = roomMember.userId;
              break;
            }
          }
          this.getDirectConversation(interlocutorId, room.roomId, room.name);
        } else {
          this.getGroupConversation(room.roomId, room.name);
        }
      }
    });

    this._client.on(lazy.MatrixSDK.RoomMemberEvent.Typing, (event, member) => {
      if (member.userId != this.userId) {
        const conv = this.roomList.get(member.roomId);
        if (!conv) {
          return;
        }
        if (!conv.isChat) {
          let typingState = Ci.prplIConvIM.NOT_TYPING;
          if (member.typing) {
            typingState = Ci.prplIConvIM.TYPING;
          }
          conv.updateTyping(typingState, member.name);
        }
      }
    });

    this._client.on(
      lazy.MatrixSDK.RoomStateEvent.Members,
      (event, state, member) => {
        if (this.roomList.has(state.roomId)) {
          const conversation = this.roomList.get(state.roomId);
          if (conversation.isChat) {
            const participant = conversation._participants.get(member.userId);
            if (participant) {
              conversation.notifyObservers(participant, "chat-buddy-update");
            }
          }
        }
      }
    );

    this._client.on(lazy.MatrixSDK.HttpApiEvent.SessionLoggedOut, error => {
      this.prefs.clearUserPref("accessToken");
      // https://spec.matrix.org/unstable/client-server-api/#soft-logout
      if (!error.data.soft_logout) {
        this.prefs.clearUserPref("deviceId");
        this.prefs.clearUserPref("userId");
      }
      // TODO handle soft logout with an auto reconnect
      this.reportDisconnecting(
        Ci.prplIAccount.ERROR_OTHER_ERROR,
        lazy._("connection.error.sessionEnded")
      );
      this.reportDisconnected();
    });

    this._client.on(
      lazy.MatrixSDK.UserEvent.AvatarUrl,
      this.updateBuddy.bind(this)
    );
    this._client.on(
      lazy.MatrixSDK.UserEvent.DisplayName,
      this.updateBuddy.bind(this)
    );
    this._client.on(
      lazy.MatrixSDK.UserEvent.Presence,
      this.updateBuddy.bind(this)
    );
    this._client.on(
      lazy.MatrixSDK.UserEvent.CurrentlyActive,
      this.updateBuddy.bind(this)
    );

    this._client.on(
      lazy.MatrixSDK.CryptoEvent.UserTrustStatusChanged,
      (userId, trustLevel) => {
        this.updateConvDeviceTrust(
          conv =>
            (conv.isChat && conv.getParticipant(userId)) ||
            (!conv.isChat && conv.buddy?.userName == userId)
        );
      }
    );

    this._client.on(lazy.MatrixSDK.CryptoEvent.DevicesUpdated, users => {
      if (users.includes(this.userId)) {
        this.reportSessionsChanged();
        this.updateEncryptionStatus();
        this.updateConvDeviceTrust();
      } else {
        this.updateConvDeviceTrust(conv =>
          users.some(
            userId =>
              (conv.isChat && conv.getParticipant(userId)) ||
              (!conv.isChat && conv.buddy?.userName == userId)
          )
        );
      }
    });

    // From the SDK documentation: Fires when the user's cross-signing keys
    // have changed or cross-signing has been enabled/disabled
    this._client.on(lazy.MatrixSDK.CryptoEvent.KeysChanged, () => {
      this.reportSessionsChanged();
      this.updateEncryptionStatus();
      this.updateConvDeviceTrust();
    });
    this._client.on(lazy.MatrixSDK.CryptoEvent.KeyBackupStatus, () => {
      this.bootstrapSSSS();
      this.updateEncryptionStatus();
    });

    this._client.on(lazy.MatrixSDK.CryptoEvent.VerificationRequest, request => {
      this.handleIncomingVerificationRequest(request);
    });

    // TODO Other events to handle:
    //  Room.localEchoUpdated
    //  Room.tags
    //  crypto.suggestKeyRestore
    //  crypto.warning

    this._client
      .initCrypto()
      .then(() =>
        Promise.all([
          this._client.startClient({
            pendingEventOrdering: lazy.MatrixSDK.PendingEventOrdering.Detached,
            lazyLoadMembers: true,
          }),
          this.updateEncryptionStatus(),
          this.bootstrapSSSS(),
          this.reportSessionsChanged(),
        ])
      )
      .finally(() => {
        // We can disable the unknown devices error thanks to cross signing.
        this._client.setGlobalErrorOnUnknownDevices(false);
      })
      .catch(error => this.ERROR(error));
  },

  /**
   * Update UI state to reflect the current state of the SDK after a full sync.
   * This includes adding and removing rooms and catching up their contents.
   */
  async handleCaughtUp() {
    const allRooms = this._client
      .getVisibleRooms()
      .filter(room => !room.isSpaceRoom());
    const joinedRooms = allRooms
      .filter(room => room.getMyMembership() === "join")
      .map(room => room.roomId);
    // Ensure existing conversations are up to date
    for (const [roomId, conv] of this.roomList.entries()) {
      if (!joinedRooms.includes(roomId)) {
        conv.forget();
      } else {
        try {
          await conv.checkForUpdate();
          await conv.catchup();
        } catch (error) {
          this.ERROR(error);
        }
      }
    }
    // Create new conversations
    for (const roomId of joinedRooms) {
      if (!this.roomList.has(roomId)) {
        let conv;
        if (this.isDirectRoom(roomId)) {
          const room = this._client.getRoom(roomId);
          if (this._pendingRoomInvites.has(roomId)) {
            const userId = room.getDMInviter();
            this.cancelBuddyRequest(userId);
            this._pendingRoomInvites.delete(roomId);
          }
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
          conv = this.getDirectConversation(interlocutorId, roomId, room.name);
        } else {
          if (this._pendingRoomInvites.has(roomId)) {
            const room = this._client.getRoom(roomId);
            const alias = room.getCanonicalAlias() ?? roomId;
            this.cancelChatRequest(alias);
            this._pendingRoomInvites.delete(roomId);
          }
          conv = this.getGroupConversation(roomId);
        }
        try {
          await conv.catchup();
        } catch (error) {
          this.ERROR(error);
        }
      }
    }
    // Add pending invites
    const invites = allRooms.filter(
      room => room.getMyMembership() === "invite"
    );
    for (const room of invites) {
      const me = room.getMember(this.userId);
      if (me.events.member.getContent().is_direct) {
        this.invitedToDM(room);
      } else {
        this.invitedToChat(room);
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
   * Update the encryption status message based on the current state.
   */
  async updateEncryptionStatus() {
    const secretStorageReady = await this._client.isSecretStorageReady();
    const crossSigningReady = await this._client.isCrossSigningReady();
    const keyBackupReady = this._client.getKeyBackupEnabled();
    const statuses = [
      lazy._(
        "options.encryption.enabled",
        getStatusString(this._client.isCryptoEnabled())
      ),
      lazy._(
        "options.encryption.secretStorage",
        getStatusString(secretStorageReady)
      ),
      lazy._("options.encryption.keyBackup", getStatusString(keyBackupReady)),
      lazy._(
        "options.encryption.crossSigning",
        getStatusString(crossSigningReady)
      ),
    ];
    if (this._encryptionError) {
      statuses.push(this._encryptionError);
    } else if (!secretStorageReady) {
      statuses.push(lazy._("options.encryption.setUpSecretStorage"));
    } else if (!keyBackupReady && !crossSigningReady) {
      statuses.push(lazy._("options.encryption.setUpBackupAndCrossSigning"));
    }
    this.encryptionStatus = statuses;
  },

  /**
   * Ensures secret storage and cross signing are ready for use. Does not
   * support initial setup of secret storage. If the backup passphrase is not
   * set, this is a no-op, else it is cleared once the operation is complete.
   *
   * @returns {Promise<void>}
   */
  async bootstrapSSSS() {
    if (!this._client) {
      // client startup will do bootstrapping
      return;
    }
    const password = this.getString("backupPassphrase");
    if (!password) {
      // We do not support setting up secret storage, so we need a passphrase
      // to bootstrap.
      return;
    }
    const backupInfo = await this._client.getKeyBackupVersion();
    await this._client.bootstrapSecretStorage({
      setupNewKeyBackup: false,
      async getKeyBackupPassphrase() {
        const key = await this._client.keyBackupKeyFromPassword(
          password,
          backupInfo
        );
        return key;
      },
    });
    await this._client.bootstrapCrossSigning({
      authUploadDeviceSigningKeys(makeRequest) {
        makeRequest();
        return Promise.resolve();
      },
    });
    await this._client.checkOwnCrossSigningTrust();
    if (backupInfo) {
      await this._client.restoreKeyBackupWithSecretStorage(backupInfo);
    }
    // Clear passphrase once bootstrap was successful
    this.imAccount.setString("backupPassphrase", "");
    this.imAccount.save();
    this._encryptionError = "";
    await this.updateEncryptionStatus();
  },

  setString(name, value) {
    if (!this._client) {
      return;
    }
    if (name === "backupPassphrase" && value) {
      this.bootstrapSSSS().catch(this.WARN);
    } else if (name === "deviceDisplayName") {
      this._client
        .setDeviceDetails(this._client.getDeviceId(), {
          display_name: value,
        })
        .catch(this.WARN);
    }
  },

  /**
   * Update the untrusted/unverified devices state for all encrypted
   * conversations. Can limit the conversations by supplying a callback that
   * only returns true if the conversation should update the state.
   *
   * @param {(prplIConversation) => boolean} [shouldUpdateConv] - Condition to
   *   evaluate if a conversation should have the device trust recalculated.
   */
  updateConvDeviceTrust(shouldUpdateConv) {
    for (const conv of this.roomList.values()) {
      const encryptionStatus = conv.encryptionStatus;
      if (
        encryptionStatus !== Ci.prplIConversation.ENCRYPTION_AVAILABLE &&
        encryptionStatus !== Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED &&
        (!shouldUpdateConv || shouldUpdateConv(conv))
      ) {
        conv.updateUnverifiedDevices();
      }
    }
  },

  /**
   * Handle an incoming verification request.
   *
   * @param {VerificationRequest} request - Verification request from another
   *   user that is still pending and not handled by another session.
   */
  handleIncomingVerificationRequest(request) {
    const abort = new AbortController();
    request
      .waitFor(
        () => request.cancelled || (!request.requested && request.observeOnly)
      )
      .then(() => abort.abort());
    let displayName = request.otherUserId;
    if (request.isSelfVerification) {
      const deviceInfo = this._client.getStoredDevice(
        this.userId,
        request.targetDevice.deviceId
      );
      if (deviceInfo?.getDisplayName()) {
        displayName = lazy._(
          "options.encryption.session",
          request.targetDevice.deviceId,
          deviceInfo.getDisplayName()
        );
      } else {
        displayName = request.targetDevice.deviceId;
      }
    }
    let _handleResult;
    let _cancel;
    const uiRequest = this.addVerificationRequest(
      displayName,
      async () => {
        const { challenge, challengeDescription, handleResult, cancel } =
          await startVerification(request);
        _handleResult = handleResult;
        _cancel = cancel;
        return { challenge, challengeDescription };
      },
      abort.signal
    );
    uiRequest.then(
      result => {
        if (!_handleResult) {
          this.ERROR(
            "Can not handle the result for verification request with " +
              request.otherUserId +
              " because the verification was never started."
          );
          request.cancel();
        }
        _handleResult(result);
      },
      () => {
        if (_cancel) {
          _cancel();
        } else {
          request.cancel();
        }
      }
    );
  },

  /**
   * Set of currently pending timeouts for verification DM starts.
   *
   * @type {Set<TimeoutHandle>}
   */
  _verificationRequestTimeouts: null,

  /**
   * Shared implementation to initiate a verification with a MatrixParticipant or
   * MatrixBuddy.
   *
   * @param {string} userId - Matrix ID of the user to verify.
   * @returns {Promise} Same payload as startVerification.
   */
  async startVerificationDM(userId) {
    let request;
    if (this._pendingOutgoingVerificationRequests.has(userId)) {
      throw new Error("Already have a pending request for user " + userId);
    }
    if (userId == this.userId) {
      request = await this._client.requestVerification(userId);
    } else {
      let conv = this.getDirectConversation(userId);
      conv = await conv.waitForRoom();
      // Wait for the user to become part of the room (so being invited) for two
      // seconds before sending verification request.
      if (conv.isChat || !conv.room.getMember(userId)) {
        let waitForMember;
        let timeout;
        try {
          await new Promise(resolve => {
            waitForMember = (event, state, member) => {
              if (member.roomId == conv._roomId && member.userId == userId) {
                resolve();
              }
            };
            this._client.on(
              lazy.MatrixSDK.RoomStateEvent.NewMember,
              waitForMember
            );
            timeout = setTimeout(resolve, 2000);
            this._verificationRequestTimeouts.add(timeout);
          });
        } finally {
          this._verificationRequestTimeouts.delete(timeout);
          clearTimeout(timeout);
          this._client.removeListener(
            lazy.MatrixSDK.RoomStateEvent.NewMember,
            waitForMember
          );
        }
      }
      request = await this._client.requestVerificationDM(userId, conv._roomId);
    }
    this.trackOutgoingVerificationRequest(request, userId);
    return startVerification(request);
  },

  /**
   * Tracks a verification throughout its lifecycle, adding and removing it
   * from the |_pendingOutgoingVerificationRequests| map.
   *
   * @param {VerificationRequest} request - Outgoing verification request.
   * @param {string} requestKey - Key to identify this request.
   */
  async trackOutgoingVerificationRequest(request, requestKey) {
    if (request.cancelled || request.done) {
      return;
    }
    this._pendingOutgoingVerificationRequests.set(requestKey, request);
    request
      .waitFor(() => request.done || request.cancelled)
      .then(() => {
        this._pendingOutgoingVerificationRequests.delete(requestKey);
      });
  },

  /**
   * Set of room IDs that have pending invites that are being displayed to the
   * user this session.
   *
   * @type {Set<string>}
   */
  _pendingRoomInvites: null,
  /**
   * A user invited this user to a DM room.
   *
   * @param {Room} room - Room we're invited to.
   */
  invitedToDM(room) {
    if (this._pendingRoomInvites.has(room.roomId)) {
      return;
    }
    const userId = room.getDMInviter();
    this.addBuddyRequest(
      userId,
      () => {
        this._pendingRoomInvites.delete(room.roomId);
        this.setDirectRoom(userId, room.roomId);
        // For the invited rooms, we will not get the summary info from
        // the room object created after the joining. So we need to use
        // the name from the room object here.
        const conversation = this.getDirectConversation(
          userId,
          room.roomId,
          room.name
        );
        if (room.getInvitedAndJoinedMemberCount() !== 2) {
          conversation.checkForUpdate();
        }
      },
      () => {
        this._pendingRoomInvites.delete(room.roomId);
        this._client.leave(room.roomId);
      }
    );
    this._pendingRoomInvites.add(room.roomId);
  },

  /**
   * The account has been invited to a group chat.
   *
   * @param {Room} room - Room we're invited to.
   */
  invitedToChat(room) {
    if (this._pendingRoomInvites.has(room.roomId)) {
      return;
    }
    const alias = room.getCanonicalAlias() ?? room.roomId;
    this.addChatRequest(
      alias,
      () => {
        this._pendingRoomInvites.delete(room.roomId);
        const conversation = this.getGroupConversation(room.roomId, room.name);
        if (room.getInvitedAndJoinedMemberCount() === 2) {
          conversation.checkForUpdate();
        }
      },
      // Server notice room invites can not be rejected.
      !room.tags[SERVER_NOTICE_TAG] &&
        (() => {
          this._pendingRoomInvites.delete(room.roomId);
          this._client.leave(room.roomId).catch(error => {
            this.ERROR(error.message);
          });
        })
    );
    this._pendingRoomInvites.add(room.roomId);
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
    if (event.getType() === lazy.MatrixSDK.UserEvent.AvatarUrl) {
      buddy._notifyObservers("icon-changed");
    } else if (
      event.getType() === lazy.MatrixSDK.UserEvent.Presence ||
      event.getType() === lazy.MatrixSDK.UserEvent.CurrentlyActive
    ) {
      buddy.setStatusFromPresence();
    } else if (event.getType() === lazy.MatrixSDK.UserEvent.DisplayName) {
      buddy.serverAlias = user.displayName;
    }
  },

  /**
   * Checks if the room is the direct messaging room or not. We also check
   * if number of joined users are two including us.
   *
   * @param {string} checkRoomId - ID of the room to check if it is direct
   *                               messaging room or not.
   * @returns {boolean} - If room is direct direct messaging room or not.
   */
  isDirectRoom(checkRoomId) {
    for (const user of Object.keys(this._userToRoom)) {
      for (const roomId of this._userToRoom[user]) {
        if (roomId == checkRoomId) {
          const room = this._client.getRoom(roomId);
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
   *
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
   * @returns {MatrixRoom?} - The resulted conversation.
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
              visibility: lazy.MatrixSDK.Visibility.Private,
              preset: lazy.MatrixSDK.Preset.PrivateChat,
            });
          }
          conv.close();
          throw error;
        }
      )
      .catch(error => {
        this.ERROR(error);
        if (!conv.room) {
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
   * @returns {string} - ID of the room.
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
      const userMembership = room.getMember(userId)?.membership ?? "invite";
      // If either party left the room we shouldn't try to rejoin.
      return userMembership !== "leave" && accountMembership !== "leave";
    });
  },

  /**
   * Sets the room ID for for corresponding user ID for direct messaging
   * by setting the "m.direct" event of account data of the SDK client.
   *
   * @param {string} roomId - ID of the user.
   *
   * @param {string} - ID of the room.
   */
  setDirectRoom(userId, roomId) {
    const dmRoomMap = this._userToRoom;
    const roomList = dmRoomMap[userId] || [];
    if (!roomList.includes(roomId)) {
      roomList.push(roomId);
      dmRoomMap[userId] = roomList;
      this._client.setAccountData(lazy.MatrixSDK.EventType.Direct, dmRoomMap);
    }
  },

  updateRoomMember(event, member) {
    if (this.roomList && this.roomList.has(member.roomId)) {
      const conv = this.roomList.get(member.roomId);
      if (conv.isChat) {
        const participant = conv._participants.get(member.userId);
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
        return lazy._("chatRoomField.room");
      },
      required: true,
    },
  },
  parseDefaultChatName(aDefaultName) {
    const chatFields = {
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
      const conv = this.getGroupConversation(roomIdOrAlias);
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
   *
   * @type {Map<string, MatrixRoom>}
   */
  _pendingDirectChats: null,

  /**
   * Returns the direct conversation according to the room-id or user-id.
   * If the room ID is specified, it is the preferred way of identifying the
   * conversation to return.
   *
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
   * @returns {MatrixRoom} - The resulted conversation.
   */
  getDirectConversation(userId, roomID, roomName) {
    let DMRoomId = this.getDMRoomIdForUserId(userId);
    if (roomID && DMRoomId !== roomID) {
      this.setDirectRoom(userId, roomID);
      DMRoomId = roomID;
    }
    if (!DMRoomId && roomID) {
      DMRoomId = roomID;
    }
    if (DMRoomId && this.roomList.has(DMRoomId)) {
      return this.roomList.get(DMRoomId);
    }

    // If user is invited to the room then DMRoomId will be null. In such
    // cases, we will pass roomID so that user will be joined to the room
    // and we will create corresponding conversation.
    if (DMRoomId) {
      const conv = new MatrixRoom(this, false, roomName || DMRoomId);
      this.roomList.set(DMRoomId, conv);
      this._client
        .joinRoom(DMRoomId)
        .catch(error => {
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
          this.ERROR("Error creating conversation " + DMRoomId + ": " + error);
          if (!conv.room) {
            conv.forget();
          }
        });

      return conv;
    }

    // Check if we're already creating a DM room with userId
    if (this._pendingDirectChats.has(userId)) {
      return this._pendingDirectChats.get(userId);
    }

    // Create new DM room with userId
    const conv = new MatrixRoom(this, false, userId);
    this.createRoom(
      this._pendingDirectChats,
      userId,
      conv,
      {
        is_direct: true,
        invite: [userId],
        visibility: lazy.MatrixSDK.Visibility.Private,
        preset: lazy.MatrixSDK.Preset.TrustedPrivateChat,
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
   * @param {object} roomInit - Parameters for room creation.
   * @param {Function} [onCreated] - Callback to execute before room creation
   *  is finalized.
   * @returns {Promise} The returned promise should never reject.
   */
  async createRoom(pendingMap, key, conversation, roomInit, onCreated) {
    pendingMap.set(key, conversation);
    if (roomInit.is_direct && roomInit.invite) {
      try {
        const userDeviceMap = await this._client.downloadKeys(roomInit.invite);
        // Encrypt if there are devices and each user has at least 1 device
        // capable of encryption.
        const shouldEncrypt =
          userDeviceMap.size > 0 &&
          [...userDeviceMap.values()].every(deviceMap => deviceMap.size > 0);
        if (shouldEncrypt) {
          if (!roomInit.initial_state) {
            roomInit.initial_state = [];
          }
          roomInit.initial_state.push({
            type: lazy.MatrixSDK.EventType.RoomEncryption,
            state_key: "",
            content: {
              algorithm: lazy.OlmLib.MEGOLM_ALGORITHM,
            },
          });
        }
      } catch (error) {
        const users = roomInit.invite.join(", ");
        this.WARN(
          `Error while checking encryption devices for ${users}: ${error}`
        );
      }
    }
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
      // Only leave room if it was ever associated with the conversation
      if (!conversation.room) {
        conversation.forget();
      } else {
        conversation.close();
      }
    } finally {
      pendingMap.delete(key);
      if (this._pendingDirectChats.size + this._pendingRoomAliases.size === 0) {
        await this.handleCaughtUp();
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
    IMServices.contacts.accountBuddyAdded(buddy);
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
    const user = this._client.getUser(aUserId);
    if (!user) {
      return [];
    }

    // Convert timespan in milli-seconds into a human-readable form.
    const getNormalizedTime = function (aTime) {
      const valuesAndUnits = lazy.DownloadUtils.convertTimeUnits(aTime / 1000);
      // If the time is exact to the first set of units, trim off
      // the subsequent zeroes.
      if (!valuesAndUnits[2]) {
        valuesAndUnits.splice(2, 2);
      }
      return lazy._("tooltip.timespan", valuesAndUnits.join(" "));
    };

    const tooltipInfo = [];

    if (user.displayName) {
      tooltipInfo.push(
        new TooltipInfo(lazy._("tooltip.displayName"), user.displayName)
      );
    }

    // Add the user's current status.
    const status = getStatusFromPresence(user);
    if (status === Ci.imIStatusInfo.STATUS_IDLE) {
      tooltipInfo.push(
        new TooltipInfo(
          lazy._("tooltip.lastActive"),
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
      const realUrl = this._client.mxcUrlToHttp(
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

  getSessions() {
    if (!this._client || !this._client.isCryptoEnabled()) {
      return [];
    }
    return this._client
      .getStoredDevicesForUser(this.userId)
      .map(deviceInfo => new MatrixSession(this, this.userId, deviceInfo));
  },

  get userId() {
    return this._client.credentials.userId;
  },
  _client: null,
};
