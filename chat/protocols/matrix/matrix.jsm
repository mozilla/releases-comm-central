/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["MatrixProtocol"];

var {
  XPCOMUtils,
  EmptyEnumerator,
  nsSimpleEnumerator,
  l10nHelper,
  setTimeout,
  clearTimeout,
} = ChromeUtils.import("resource:///modules/imXPCOMUtils.jsm");
var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var {
  GenericAccountPrototype,
  GenericConvChatPrototype,
  GenericConvChatBuddyPrototype,
  GenericProtocolPrototype,
  GenericConversationPrototype,
  GenericConvIMPrototype,
  GenericAccountBuddyPrototype,
  TooltipInfo,
} = ChromeUtils.import("resource:///modules/jsProtoHelper.jsm");
var { getMatrixTextForEvent } = ChromeUtils.import(
  "resource:///modules/matrixTextForEvent.jsm"
);

Cu.importGlobalProperties(["indexedDB"]);

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
  "EventTimeline",
  "resource:///modules/matrix-sdk.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "DownloadUtils",
  "resource://gre/modules/DownloadUtils.jsm"
);

ChromeUtils.defineModuleGetter(
  this,
  "MatrixPowerLevels",
  "resource:///modules/matrixPowerLevels.jsm"
);

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
    return this._roomMember.getAvatarUrl(this._account._baseURL) || "";
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
 * @param {imIBuddy?} buddy
 * @param {imITag?} tag
 * @param {User} [user]
 */
function MatrixBuddy(account, buddy, tag, user) {
  this._init(account, buddy, tag, user?.userId);
  if (user) {
    this.setUser(user);
  }
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

  /**
   * Initialize the buddy with a user.
   *
   * @param {User} user - Matrix user.
   */
  setUser(user) {
    this._user = user;
    this._serverAlias = user.displayName;
    this._statusType = getStatusFromPresence(user);
    this._statusText = user.presenceStatusMsg ?? "";
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
        const room = this._account.roomList.get(roomId);
        // Prevent the room from doing buddy cleanup
        delete room.buddy;
        room.close();
      }
    }
    this._account.buddies.delete(this.userName);
    GenericAccountBuddyPrototype.remove.call(this);
  },
};

/**
 * var so it can be tested using script loader.
 * @interface
 */
var GenericMatrixConversation = {
  /**
   * ID of the most recent event written to the conversation.
   */
  _mostRecentEventId: null,

  /**
   * Leave the room if we close the conversation.
   */
  close() {
    this._close?.();
    this._account._client.leave(this._roomId);
    this._account.roomList.delete(this._roomId);
    GenericConversationPrototype.close.call(this);
  },

  sendMsg(msg) {
    let content = {
      body: msg,
      msgtype: "m.text",
    };
    this._account._client
      .sendEvent(this._roomId, "m.room.message", content, "")
      .catch(error => {
        this._account.ERROR("Failed to send message to: " + this._roomId);
      });
  },

  /*
   * Shared init function between MatrixDirectConversation and MatrixConversation.
   *
   * @param {Object} room - associated room with the conversation.
   */
  sharedInitRoom(room) {
    if (!room) {
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
  },

  /**
   * Shared initialization in constructor of MatrixDirectConversation and
   * MatrixConversation.
   */
  sharedInit() {
    this._initialized = new Promise(resolve => {
      this._setInitialized = resolve;
    });
  },

  /**
   * Function to mark this room instance superceded by another one.
   * Useful when converting between DM and MUC or possibly room version
   * upgrades.
   *
   * @param {GenericMatrixConversation} newRoom - Room that replaces this room.
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
   * @returns {GenericMatrixConversation} The most recent instance of this room
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
      const fullyRead = this.room.getAccountData("m.fully_read");
      if (fullyRead) {
        latestOldEvent = fullyRead.getContent().event_id;
      }
    }
    // Get the timeline for the event, or just the current live timeline of the room
    let timeline;
    if (latestOldEvent) {
      timeline = this.room.getTimelineForEvent(latestOldEvent);
      // The event wasn't in our local cache yet, let's start a timeline containing the event
      if (!timeline) {
        await this._account._client.getEventTimeline(
          this.room.getUnfilteredTimelineSet(),
          latestOldEvent
        );
        timeline = this.room.getTimelineForEvent(latestOldEvent);
      }
    } else {
      timeline = this.room.getLiveTimeline();
    }
    if (timeline) {
      // Make sure the timeline cotains all events up to the present
      let timelineCatchingUp = true;
      while (timelineCatchingUp) {
        timelineCatchingUp = await this._account._client.paginateEventTimeline(
          timeline
        );
      }
      // Write all new events to the conversation
      const events = timeline.getEvents();
      let pastLatestOldEvent = !latestOldEvent;
      for (const event of events) {
        if (pastLatestOldEvent) {
          this.addEvent(event, true);
        }
        if (!pastLatestOldEvent && event.getId() === latestOldEvent) {
          pastLatestOldEvent = true;
        }
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
    if (event.getType() === "m.room.message") {
      const isOutgoing = event.getSender() == this._account.userId;
      const eventContent = event.getContent();
      //TODO We should prefer the formatted body (when it's html)
      let message = eventContent.body;
      if (eventContent.msgtype === "m.emote") {
        message = "/me " + message;
      }
      //TODO handle media messages better (currently just show file name)
      this.writeMessage(event.getSender(), message, {
        outgoing: isOutgoing,
        incoming: !isOutgoing,
        system: eventContent.msgtype === "m.notice",
        time: Math.floor(event.getDate() / 1000),
        _alias: event.sender.name,
        delayed,
      });
    } else if (event.getType() == "m.room.topic") {
      this.setTopic(event.getContent().topic, event.getSender());
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
      });
    }
    this._mostRecentEventId = event.getId();
  },
};

/**
 * TODO Other functionality from MatrixClient to implement:
 *  sendNotice
 *  sendReadReceipt
 *  sendTyping
 *
 * @class
 * @implements {GenericMatrixConversation}
 */
function MatrixConversation(account, name, nick) {
  this._init(account, name, nick);
  this.sharedInit();
}
MatrixConversation.prototype = {
  __proto__: GenericConvChatPrototype,

  get room() {
    return this._account._client.getRoom(this._roomId);
  },
  get roomState() {
    return this.room.getLiveTimeline().getState(EventTimeline.FORWARDS);
  },
  get normalizedName() {
    return this._roomId;
  },
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

  /*
   * Initialize the room after the response from the Matrix client.
   *
   * @param {Object} room - associated room with the conversation.
   */
  initRoom(room) {
    this.sharedInitRoom(room);

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
    if (roomState.getStateEvents("m.room.topic").length) {
      let event = roomState.getStateEvents("m.room.topic")[0];
      this.setTopic(event.getContent().topic, event.getSender().name, true);
    }
    this._setInitialized();
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
      return this.roomState.maySendEvent("m.room.topic", this._account.userId);
    }
    return false;
  },
};
Object.assign(MatrixConversation.prototype, GenericMatrixConversation);

/**
 * @class
 * @implements {GenericMatrixConversation}
 */
function MatrixDirectConversation(account, name) {
  this._init(account, name);
  this.sharedInit();
}
MatrixDirectConversation.prototype = {
  __proto__: GenericConvIMPrototype,

  /**
   * Initialize the room after the response from the Matrix client.
   *
   * @param {Room} room - associated room with the conversation.
   */
  initRoom(room) {
    this.sharedInitRoom(room);

    const dmUserId = room.guessDMUserId();
    if (dmUserId === this._account.userId) {
      // We are the only member of the room.
      this._setInitialized();
      return;
    }
    if (!this.buddy) {
      if (this._account.buddies.has(dmUserId)) {
        this.buddy = this._account.buddies.get(dmUserId);
        if (!this.buddy._user) {
          const user = this._account._client.getUser(dmUserId);
          this.buddy.setUser(user);
        }
        this._setInitialized();
        return;
      }
      const user = this._account._client.getUser(dmUserId);
      this.buddy = new MatrixBuddy(
        this._account,
        null,
        Services.tags.defaultTag,
        user
      );
      Services.contacts.accountBuddyAdded(this.buddy);
      this._account.buddies.set(dmUserId, this.buddy);
    }

    this._setInitialized();
  },

  get room() {
    return this._account._client.getRoom(this._roomId);
  },

  get normalizedName() {
    return this._roomId;
  },

  _typingTimer: null,
  _typingState: false,
  get shouldSendTypingNotifications() {
    return Services.prefs.getBoolPref("purple.conversations.im.send_typing");
  },

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

  finishedComposing() {
    if (!this.shouldSendTypingNotifications) {
      return;
    }

    this._setTypingState(false);
  },

  _close() {
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

  _setTypingState(isTyping) {
    if (this._typingState == isTyping) {
      return;
    }

    this._account._client.sendTyping(this._roomId, isTyping);
    this._typingState = isTyping;
  },
  _cancelTypingTimer() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      delete this._typingTimer;
    }
  },
};
Object.assign(MatrixDirectConversation.prototype, GenericMatrixConversation);

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
      // conversations. GenericConversationPrototype.close is used at various
      // places in the file. It's because of the same reason, we want to remove
      // the conversation only, don't want user to leave the room. conv.close
      // function call will make user leave the room and close the conversation.
      GenericConversationPrototype.close.call(conv);
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
    let dbName = "chat:matrix:" + this.imAccount.id;
    this._baseURL = this.getString("server") + ":" + this.getInt("port");

    const opts = {
      useAuthorizationHeader: true,
      baseUrl: this._baseURL,
      store: new MatrixSDK.IndexedDBStore({
        indexedDB,
        dbName,
      }),
      deviceId: this.prefs.getStringPref("deviceId", "") || undefined,
      accessToken: this.prefs.getStringPref("accessToken", "") || undefined,
      userId: this.prefs.getStringPref("userId", "") || undefined,
      timelineSupport: true,
    };

    opts.store.startup().then(() => {
      this._client = MatrixSDK.createClient(opts);
      if (this._client.isLoggedIn()) {
        this.startClient();
        return;
      }
      this._client
        .loginFlows()
        .then(({ flows }) => {
          const usePasswordFlow = Boolean(this.imAccount.password);
          let wantedFlows = [];
          if (usePasswordFlow) {
            wantedFlows.push("m.login.password");
          } else {
            wantedFlows.push("m.login.sso", "m.login.token");
          }
          if (
            wantedFlows.every(flowType =>
              flows.some(flow => flow.type === flowType)
            )
          ) {
            if (usePasswordFlow) {
              this._client
                .loginWithPassword(this.name, this.imAccount.password)
                .then(data => {
                  // TODO: Check data.errcode to pass more accurate value as the first
                  // parameter of reportDisconnecting.
                  if (data.error) {
                    throw new Error(data.error);
                  }
                  this.storeSessionInformation(data);
                  this.startClient();
                })
                .catch(error => {
                  this.reportDisconnecting(
                    Ci.prplIAccount.ERROR_OTHER_ERROR,
                    error.message
                  );
                  this.reportDisconnected();
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
        })
        .catch(error => {
          this.reportDisconnecting(
            Ci.prplIAccount.ERROR_OTHER_ERROR,
            error.message
          );
          this.reportDisconnected();
        });
    });
  },

  /**
   * Login to the homeserver using m.login.token.
   *
   * @param {string} token - The auth token received from the SSO flow.
   */
  loginWithToken(token) {
    this._client
      .loginWithToken(token)
      .then(data => {
        if (data.error) {
          throw new Error(data.error);
        }
        this.storeSessionInformation(data);
        this.startClient();
      })
      .catch(error => {
        let errorType = Ci.prplIAccount.ERROR_OTHER_ERROR;
        if (error.errcode === "M_FORBIDDEN") {
          errorType = Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED;
        }
        this.reportDisconnecting(errorType, error.message);
        this.reportDisconnected();
        if (errorType !== Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED) {
          this.requestAuthorization();
        }
      });
  },

  /**
   * Show SSO prompt and handle response token.
   */
  requestAuthorization() {
    this.reportConnecting(_("connection.requestAuth"));
    let completionURL = "http://localhost";
    let url = this._client.getSsoLoginUrl(completionURL, "sso");
    let cookies = new Set();
    this._browserRequest = {
      get promptText() {
        return _("authPrompt");
      },
      account: this,
      url,
      _active: true,
      cancelled() {
        if (!this._active) {
          return;
        }

        this.account.reportDisconnecting(
          Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED,
          _("connection.error.authCancelled")
        );
        this.account.reportDisconnected();
      },
      loaded(window, webProgress) {
        if (!this._active) {
          return;
        }

        this._listener = {
          QueryInterface: ChromeUtils.generateQI([
            Ci.nsIWebProgressListener,
            Ci.nsISupportsWeakReference,
          ]),
          _cleanUp() {
            this.webProgress.removeProgressListener(this);
            this.window.close();
            delete this.window;
          },
          _checkForRedirect(currentUrl) {
            if (!currentUrl.startsWith(completionURL)) {
              return;
            }

            let parsedUrl = new URL(currentUrl);
            let rawUrlData = parsedUrl.searchParams;
            let urlData = new URLSearchParams(rawUrlData);
            if (!urlData.has("loginToken")) {
              return;
            }

            this._parent.finishAuthorizationRequest(cookies);
            this._parent.reportConnecting(_("connection.requestAccess"));
            this._parent.loginWithToken(urlData.get("loginToken"));
          },
          onStateChange(aWebProgress, request, stateFlags, aStatus) {
            const wpl = Ci.nsIWebProgressListener;
            if (stateFlags & (wpl.STATE_START | wpl.STATE_IS_NETWORK)) {
              this._checkForRedirect(request.name);
            }
          },
          onLocationChange(webProgress, request, location) {
            if (!cookies.has(location.displayHost)) {
              cookies.add(location.displayHost);
            }
            this._checkForRedirect(location.spec);
          },
          onProgressChange() {},
          onStatusChange() {},
          onSecurityChange() {},

          window,
          webProgress,
          _parent: this.account,
        };

        webProgress.addProgressListener(
          this._listener,
          Ci.nsIWebProgress.NOTIFY_ALL
        );
      },
      QueryInterface: ChromeUtils.generateQI([Ci.prplIRequestBrowser]),
    };
    Services.obs.notifyObservers(this._browserRequest, "browser-request");
  },

  /**
   * Removes any cookies created during the SSO flow and cleans up the SSO window.
   *
   * @param {Set<string>} cookies - List of origins that potentially created cookies during the auth flow.
   */
  finishAuthorizationRequest(cookies) {
    //TODO instead of deleting all the cookies, use a per-account cookie jar?
    for (let url of cookies) {
      Services.cookies.removeCookiesWithOriginAttributes("{}", url);
    }
    if (!("_browserRequest" in this)) {
      return;
    }
    this._browserRequest._active = false;
    if ("_listener" in this._browserRequest) {
      this._browserRequest._listener._cleanUp();
    }
    delete this._browserRequest;
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
    this.prefs.setStringPref("deviceId", data.access_token);
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
          this.roomList.delete(member.roomId);
          conv._close?.();
          GenericConversationPrototype.close.call(conv);
        } else if (
          member.membership === "join" ||
          member.membership === "leave"
        ) {
          this.checkRoomForUpdate(conv);
        }
      }
    });

    /*
     * Get the map of direct messaging rooms.
     */
    this._client.on("accountData", event => {
      if (event.getType() == "m.direct") {
        this._userToRoom = event.getContent();
      }
    });

    this._client.on(
      "Room.timeline",
      (event, room, toStartOfTimeline, removed, data) => {
        if (toStartOfTimeline || this._catchingUp) {
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
      // Update the title to the human readable version.
      let conv = this.roomList.get(room.roomId);
      if (
        !this._catchingUp &&
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
      if (this._catchingUp) {
        return;
      }
      let me = room.getMember(this.userId);
      // For now just auto accept the invites by joining the room.
      if (me && me.membership == "invite") {
        if (me.events.member.getContent().is_direct) {
          let roomMembers = room.getJoinedMembers();
          // If there is just single user in the room, then set the
          // room as a DM Room by adding it to dmMap in our user's accountData.
          if (roomMembers.length == 1) {
            let interlocutorId = roomMembers[0].userId;
            this.setDirectRoom(interlocutorId, room.roomId);
            // For the invited rooms, we will not get the summary info from
            // the room object created after the joining. So we need to use
            // the name from the room object here.
            this.getDirectConversation(
              interlocutorId,
              room.roomId,
              room.summary.info.title
            );
          } else {
            this.getGroupConversation(room.roomId, room.summary.info.title);
          }
        } else {
          this.getGroupConversation(room.roomId, room.summary.info.title);
        }
      } else if (me && me.membership == "join") {
        // To avoid the race condition. Whenever we will create the room,
        // this will also be fired. So we want to avoid making of multiple
        // conversations with the same room.
        if (!this.createRoomReturned || this.roomList.has(room.roomId)) {
          return;
        }
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

    this._client.startClient();
  },

  /**
   * Update UI state to reflect the current state of the SDK after a full sync.
   * This includes adding and removing rooms and catching up their contents.
   */
  handleCaughtUp() {
    const joinedRooms = this._client
      .getRooms()
      .filter(room => room.getMyMembership() === "join")
      .map(room => room.roomId);
    // Ensure existing conversations are up to date
    for (const [roomId, conv] of this.roomList.entries()) {
      if (!joinedRooms.includes(roomId)) {
        this.roomList.delete(roomId);
        conv._close?.();
        GenericConversationPrototype.close.call(conv);
      } else {
        const updatedConv = this.checkRoomForUpdate(conv);
        updatedConv.catchup().catch(error => updatedConv.ERROR(error));
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
        conv.catchup().catch(error => conv.ERROR(error));
      }
    }
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
   * Converts the group conversation into the direct conversation.
   *
   * @param {MatrixConversation} groupConv - the group conversation which needs to be
   *                             converted.
   * @returns {MatrixDirectConversation}
   */
  convertToDM(groupConv) {
    GenericConversationPrototype.close.call(groupConv);
    let conv = new MatrixDirectConversation(this, groupConv._roomId);
    groupConv.replaceRoom(conv);
    this.roomList.set(groupConv._roomId, conv);
    let directRoom = this._client.getRoom(groupConv._roomId);
    conv.initRoom(directRoom);
    //TODO re-select conv if it was already selected
    return conv;
  },

  /**
   * Converts the direct conversation into the group conversation.
   *
   * @param {MatrixDirectConversation} directConv - the direct conversation which needs to be
   *                              converted.
   * @return {MatrixConversation}
   */
  convertToGroup(directConv) {
    directConv._close();
    GenericConversationPrototype.close.call(directConv);
    let conv = new MatrixConversation(this, directConv._roomId, this.userId);
    directConv.replaceRoom(conv);
    this.roomList.set(directConv._roomId, conv);
    let groupRoom = this._client.getRoom(directConv._roomId);
    conv.initRoom(groupRoom);
    //TODO re-select conv if it was already selected
    return conv;
  },

  /**
   * Checks if the conversation needs to be changed from the group conversation
   * to the direct conversation or vice versa.
   *
   * @param {GenericMatrixConversation} conv - the conversation which needs to be checked.
   * @returns {GenericMatrixConversation} potentially new conversation
   */
  checkRoomForUpdate(conv) {
    if (conv.room && conv.isChat && this.isDirectRoom(conv._roomId)) {
      return this.convertToDM(conv);
    } else if (conv.room && !conv.isChat && !this.isDirectRoom(conv._roomId)) {
      return this.convertToGroup(conv);
    }
    return conv;
  },

  /**
   * Returns the group conversation according to the room-id.
   * 1) If we have a group conversation already, we will return that.
   * 2) If the room exists on the server, we will join it. It will not do
   *    anything if we are already joined, it will just create the
   *    conversation. This is used mainly when a new room gets added.
   * 3) Create a new room if the conversation does not exist.
   *
   * @param {string} roomId - ID of the room.
   * @param {string} roomName (optional) - Name of the room.
   *
   * @return {MatrixConversation} - The resulted conversation.
   */
  getGroupConversation(roomId, roomName) {
    // If there is a conversation return it.
    if (this.roomList.has(roomId)) {
      return this.roomList.get(roomId);
    }

    if (roomId && this._client.getRoom(roomId)) {
      let conv = new MatrixConversation(this, roomName || roomId, this.userId);
      this.roomList.set(roomId, conv);
      conv.joining = true;
      this._client
        .joinRoom(roomId)
        .then(room => {
          conv.initRoom(room);
          conv.joining = false;
        })
        .catch(error => {
          this.ERROR(error);
          conv.joining = false;
          // TODO we should probably only close (send a leave) when the actual
          // join failed, not when initRoom errors, at least for rooms we get
          // during initial sync.
          conv.close();
        });

      return conv;
    }

    if (
      this.createRoomReturned &&
      roomId.endsWith(":" + this._client.getDomain())
    ) {
      this.createRoomReturned = false;
      let conv = new MatrixConversation(this, roomId, this.userId);
      conv.joining = true;
      let name = roomId.split(":", 1)[0];
      this._client
        .createRoom({
          room_alias_name: name,
          name,
          visibility: "private",
          preset: "private_chat",
          content: {
            guest_access: "can_join",
          },
          type: "m.room.guest_access",
          state_key: "",
        })
        .then(res => {
          this.createRoomReturned = true;
          let newRoomId = res.room_id;
          let room = this._client.getRoom(newRoomId);
          conv.initRoom(room);
          this.roomList.set(newRoomId, conv);
          conv.joining = false;
        })
        .catch(error => {
          this.createRoomReturned = true;
          this.ERROR(error);
          conv.joining = false;
          conv.close();
        });
      return conv;
    }
    return null;
  },

  /*
   * Flag to avoid the race condition when we create any conversation.
   */
  createRoomReturned: true,

  /**
   * Returns the room ID for user ID if exists for direct messaging.
   *
   * @param {string} roomId - ID of the user.
   *
   * @return {string} - ID of the room.
   */
  getDMRoomIdForUserId(userId) {
    // Select the mostRecentRoom base on the timestamp of the
    // most recent event in the room's timeline.
    let mostRecentRoom = null;
    let mostRecentTimeStamp = 0;

    // Check in the 'other' user's roomList and add to our list.
    if (this._userToRoom[userId]) {
      for (let roomId of this._userToRoom[userId]) {
        let room = this._client.getRoom(roomId);
        if (room) {
          let user = room.getMember(userId);
          if (user) {
            let latestEvent = room.timeline[room.timeline.length - 1];
            // Timeline is null if our user's membership is invite.
            if (latestEvent) {
              let eventTimestamp = latestEvent.getTs();
              if (eventTimestamp > mostRecentTimeStamp) {
                mostRecentTimeStamp = eventTimestamp;
                mostRecentRoom = room;
              }
            }
          }
        }
      }
    }

    if (mostRecentRoom) {
      return mostRecentRoom.roomId;
    }
    return null;
  },

  /*
   * Sets the room ID for for corresponding user ID for direct messaging
   * by setting the "m.direct" event of accont data of the SDK client.
   *
   * @param {String} roomId - ID of the user.
   *
   * @param {String} - ID of the room.
   */
  setDirectRoom(userId, roomId) {
    let dmRoomMap = this._userToRoom;
    let roomList = dmRoomMap[userId] || [];
    if (!roomList.includes(roomId)) {
      roomList.push(roomId);
      dmRoomMap[userId] = roomList;
      this._client.setAccountData("m.direct", dmRoomMap);
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
      let room = this._client.getRoom(roomIdOrAlias);
      if (!room) {
        return null;
      }
      let conv = new MatrixConversation(this, room.name, this.userId);
      conv.init(room);
      this.roomList.set(roomIdOrAlias, conv);
      // It can be any type of room so update it according to direct conversation
      // or group conversation.
      this.checkRoomForUpdate(conv);
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

  /*
   * Returns the direct conversation according to the room-id or user-id.
   * 1) If we have a direct conversation already, we will return that.
   * 2) If the room exists on the server, we will join it. It will not do
   *    anything if we are already joined, it will just create the
   *    conversation. This is used mainly when a new room gets added.
   * 3) Create a new room if the conversation does not exist.
   *
   * @param {String} userId - ID of the user for which we want to get the
   *                          direct conversation.
   * @param {String} roomId (optional) - ID of the room.
   * @param {String} roomName (optional) - Name of the room.
   *
   * @return {Object} - The resulted conversation.
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
      let conv = new MatrixDirectConversation(
        this,
        roomName || DMRoomId || roomID
      );
      this.roomList.set(DMRoomId || roomID, conv);
      conv.joining = true;
      this._client
        .joinRoom(DMRoomId || roomID)
        .then(room => {
          conv.initRoom(room);
          conv.joining = false;
        })
        .catch(error => {
          this.ERROR(
            "Error creating conversation " + (DMRoomId || roomID) + ": " + error
          );
          conv.joining = false;
          conv.close();
        });

      return conv;
    }

    if (this.createRoomReturned) {
      this.createRoomReturned = false;
      let conv = new MatrixDirectConversation(this, userId);
      conv.joining = true;
      this._client
        .createRoom({
          is_direct: true,
          invite: [userId],
          visibility: "private",
          preset: "trusted_private_chat",
          content: {
            guest_access: "can_join",
          },
          type: "m.room.guest_access",
          state_key: "",
        })
        .then(res => {
          this.createRoomReturned = true;
          let newRoomId = res.room_id;
          let room = this._client.getRoom(newRoomId);
          conv.initRoom(room);
          this.setDirectRoom(userId, newRoomId);
          this.roomList.set(newRoomId, conv);
          conv.joining = false;
          this.checkRoomForUpdate(conv);
        })
        .catch(error => {
          this.createRoomReturned = true;
          this.ERROR(error);
          conv.joining = false;
          conv.close();
        });

      return conv;
    }
    return null;
  },

  addBuddy(aTag, aName) {
    throw new Error("Adding buddies is not yet supported");
  },
  loadBuddy(aBuddy, aTag) {
    const buddy = new MatrixBuddy(this, aBuddy, aTag);
    this.buddies.set(buddy.userName, buddy);
    return buddy;
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
    saveToken: {
      get label() {
        return _("options.saveToken");
      },
      default: true,
    },
  },

  get chatHasTopic() {
    return true;
  },
  get passwordOptional() {
    return true;
  },
};
