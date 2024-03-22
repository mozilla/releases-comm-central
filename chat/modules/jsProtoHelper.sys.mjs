/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import {
  initLogModule,
  nsSimpleEnumerator,
  l10nHelper,
  ClassInfo,
} from "resource:///modules/imXPCOMUtils.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/conversations.properties")
);

ChromeUtils.defineLazyGetter(lazy, "TXTToHTML", function () {
  const cs = Cc["@mozilla.org/txttohtmlconv;1"].getService(
    Ci.mozITXTToHTMLConv
  );
  return aTXT => cs.scanTXT(aTXT, cs.kEntities);
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "SHOULD_SEND_TYPING",
  "purple.conversations.im.send_typing",
  true
);

function OutgoingMessage(aMsg, aConversation) {
  this.message = aMsg;
  this.conversation = aConversation;
}
OutgoingMessage.prototype = {
  __proto__: ClassInfo("imIOutgoingMessage", "Outgoing Message"),
  cancelled: false,
  action: false,
  notification: false,
};

export var GenericAccountPrototype = {
  __proto__: ClassInfo("prplIAccount", "generic account object"),
  get wrappedJSObject() {
    return this;
  },
  _init(aProtocol, aImAccount) {
    this.protocol = aProtocol;
    this.imAccount = aImAccount;
    initLogModule(aProtocol.id, this);
  },
  observe() {},
  remove() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  unInit() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  connect() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  disconnect() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  createConversation() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  joinChat() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  setBool() {},
  setInt() {},
  setString() {},

  get name() {
    return this.imAccount.name;
  },
  get connected() {
    return this.imAccount.connected;
  },
  get connecting() {
    return this.imAccount.connecting;
  },
  get disconnected() {
    return this.imAccount.disconnected;
  },
  get disconnecting() {
    return this.imAccount.disconnecting;
  },
  _connectionErrorReason: Ci.prplIAccount.NO_ERROR,
  get connectionErrorReason() {
    return this._connectionErrorReason;
  },

  /**
   * Convert a socket's nsITransportSecurityInfo into a prplIAccount connection error. Store
   * the nsITransportSecurityInfo and the connection location on the account so the
   * certificate exception dialog can access the information.
   *
   * @param {Socket} aSocket - Socket where the connection error occurred.
   * @returns {number} The prplIAccount error constant describing the problem.
   */
  handleConnectionSecurityError(aSocket) {
    // Stash away the connectionTarget and securityInfo.
    this._connectionTarget = aSocket.host + ":" + aSocket.port;
    const securityInfo = (this._securityInfo = aSocket.securityInfo);

    if (!securityInfo) {
      return Ci.prplIAccount.ERROR_CERT_NOT_PROVIDED;
    }

    if (securityInfo.isUntrusted) {
      if (securityInfo.serverCert && securityInfo.serverCert.isSelfSigned) {
        return Ci.prplIAccount.ERROR_CERT_SELF_SIGNED;
      }
      return Ci.prplIAccount.ERROR_CERT_UNTRUSTED;
    }

    if (securityInfo.isNotValidAtThisTime) {
      if (
        securityInfo.serverCert &&
        securityInfo.serverCert.validity.notBefore < Date.now() * 1000
      ) {
        return Ci.prplIAccount.ERROR_CERT_NOT_ACTIVATED;
      }
      return Ci.prplIAccount.ERROR_CERT_EXPIRED;
    }

    if (securityInfo.isDomainMismatch) {
      return Ci.prplIAccount.ERROR_CERT_HOSTNAME_MISMATCH;
    }

    // XXX ERROR_CERT_FINGERPRINT_MISMATCH

    return Ci.prplIAccount.ERROR_CERT_OTHER_ERROR;
  },
  _connectionTarget: "",
  get connectionTarget() {
    return this._connectionTarget;
  },
  _securityInfo: null,
  get securityInfo() {
    return this._securityInfo;
  },

  reportConnected() {
    this.imAccount.observe(this, "account-connected", null);
  },
  reportConnecting(aConnectionStateMsg) {
    // Delete any leftover errors from the previous connection.
    delete this._connectionTarget;
    delete this._securityInfo;

    if (!this.connecting) {
      this.imAccount.observe(this, "account-connecting", null);
    }
    if (aConnectionStateMsg) {
      this.imAccount.observe(
        this,
        "account-connect-progress",
        aConnectionStateMsg
      );
    }
  },
  reportDisconnected() {
    this.imAccount.observe(this, "account-disconnected", null);
  },
  reportDisconnecting(aConnectionErrorReason, aConnectionErrorMessage) {
    this._connectionErrorReason = aConnectionErrorReason;
    this.imAccount.observe(
      this,
      "account-disconnecting",
      aConnectionErrorMessage
    );
    this.cancelPendingBuddyRequests();
    this.cancelPendingChatRequests();
    this.cancelPendingVerificationRequests();
  },

  // Called when the user adds a new buddy from the UI.
  addBuddy(aTag, aName) {
    IMServices.contacts.accountBuddyAdded(
      new AccountBuddy(this, null, aTag, aName)
    );
  },
  // Called during startup for each of the buddies in the local buddy list.
  loadBuddy(aBuddy, aTag) {
    try {
      return new AccountBuddy(this, aBuddy, aTag);
    } catch (x) {
      dump(x + "\n");
      return null;
    }
  },

  _pendingBuddyRequests: null,
  addBuddyRequest(aUserName, aGrantCallback, aDenyCallback) {
    if (!this._pendingBuddyRequests) {
      this._pendingBuddyRequests = [];
    }
    const buddyRequest = {
      get account() {
        return this._account.imAccount;
      },
      get userName() {
        return aUserName;
      },
      _account: this,
      // Grant and deny callbacks both receive the auth request object as an
      // argument for further use.
      grant() {
        aGrantCallback(this);
        this._remove();
      },
      deny() {
        aDenyCallback(this);
        this._remove();
      },
      cancel() {
        Services.obs.notifyObservers(
          this,
          "buddy-authorization-request-canceled"
        );
        this._remove();
      },
      _remove() {
        this._account.removeBuddyRequest(this);
      },
      QueryInterface: ChromeUtils.generateQI(["prplIBuddyRequest"]),
    };
    this._pendingBuddyRequests.push(buddyRequest);
    Services.obs.notifyObservers(buddyRequest, "buddy-authorization-request");
  },
  removeBuddyRequest(aRequest) {
    if (!this._pendingBuddyRequests) {
      return;
    }

    this._pendingBuddyRequests = this._pendingBuddyRequests.filter(
      r => r !== aRequest
    );
  },
  /**
   * Cancel a pending buddy request.
   *
   * @param {string} aUserName - The username the request is for.
   */
  cancelBuddyRequest(aUserName) {
    if (!this._pendingBuddyRequests) {
      return;
    }

    for (const request of this._pendingBuddyRequests) {
      if (request.userName == aUserName) {
        request.cancel();
        break;
      }
    }
  },
  cancelPendingBuddyRequests() {
    if (!this._pendingBuddyRequests) {
      return;
    }

    for (const request of this._pendingBuddyRequests) {
      request.cancel();
    }
    delete this._pendingBuddyRequests;
  },

  _pendingChatRequests: null,
  /**
   * Inform the user about a new conversation invitation.
   *
   * @param {string} conversationName - Name of the conversation the user is
   *   invited to.
   * @param {(prplIChatRequest) => void} grantCallback - Function to be called
   *   when the invite is accepted.
   * @param {(prplIChatRequest?, boolean) => void} [denyCallback] - Function to
   *   be called when the invite is rejected. If omitted, |canDeny| will be
   *   |false|. Callback is passed a boolean indicating whether the rejection should be
   *   sent to the other party. It being false is equivalent to ignoring the invite, in
   *   which case the callback should try to apply the ignore on the protocol level.
   */
  addChatRequest(conversationName, grantCallback, denyCallback) {
    if (!this._pendingChatRequests) {
      this._pendingChatRequests = new Set();
    }
    const inviteHandling = Services.prefs.getIntPref(
      "messenger.conversations.autoAcceptChatInvitations"
    );
    // Only auto-reject invites that can be denied.
    if (inviteHandling <= 0 && denyCallback) {
      const shouldReject = inviteHandling == -1;
      denyCallback(null, shouldReject);
      return;
    }
    let resolvePromise;
    let rejectPromise;
    const completePromise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    /** @implements {prplIChatRequest} */
    const chatRequest = {
      get account() {
        return this._account.imAccount;
      },
      get conversationName() {
        return conversationName;
      },
      get canDeny() {
        return Boolean(denyCallback);
      },
      _account: this,
      // Grant and deny callbacks both receive the auth request object as an
      // argument for further use.
      grant() {
        resolvePromise(true);
        grantCallback(this);
        this._remove();
      },
      deny() {
        if (!denyCallback) {
          throw new Error("Can not deny this invitation.");
        }
        resolvePromise(false);
        denyCallback(this, true);
        this._remove();
      },
      cancel() {
        rejectPromise(new Error("Cancelled"));
        this._remove();
      },
      completePromise,
      _remove() {
        this._account.removeChatRequest(this);
      },
      QueryInterface: ChromeUtils.generateQI(["prplIChatRequest"]),
    };
    this._pendingChatRequests.add(chatRequest);
    Services.obs.notifyObservers(chatRequest, "conv-authorization-request");
  },
  removeChatRequest(aRequest) {
    if (!this._pendingChatRequests) {
      return;
    }

    this._pendingChatRequests.delete(aRequest);
  },
  /**
   * Cancel a pending chat request.
   *
   * @param {string} conversationName - The conversation the request is for.
   */
  cancelChatRequest(conversationName) {
    if (!this._pendingChatRequests) {
      return;
    }

    for (const request of this._pendingChatRequests) {
      if (request.conversationName == conversationName) {
        request.cancel();
        break;
      }
    }
  },
  cancelPendingChatRequests() {
    if (!this._pendingChatRequests) {
      return;
    }

    for (const request of this._pendingChatRequests) {
      request.cancel();
    }
    this._pendingChatRequests = null;
  },

  requestBuddyInfo() {},

  get canJoinChat() {
    return false;
  },
  getChatRoomFields() {
    if (!this.chatRoomFields) {
      return [];
    }
    const fieldNames = Object.keys(this.chatRoomFields);
    return fieldNames.map(
      fieldName => new ChatRoomField(fieldName, this.chatRoomFields[fieldName])
    );
  },
  getChatRoomDefaultFieldValues(aDefaultChatName) {
    if (!this.chatRoomFields) {
      return new ChatRoomFieldValues({});
    }

    const defaultFieldValues = {};
    for (const fieldName in this.chatRoomFields) {
      defaultFieldValues[fieldName] = this.chatRoomFields[fieldName].default;
    }

    if (aDefaultChatName && "parseDefaultChatName" in this) {
      const parsedDefaultChatName = this.parseDefaultChatName(aDefaultChatName);
      for (const field in parsedDefaultChatName) {
        defaultFieldValues[field] = parsedDefaultChatName[field];
      }
    }

    return new ChatRoomFieldValues(defaultFieldValues);
  },
  requestRoomInfo() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  getRoomInfo() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  get isRoomInfoStale() {
    return false;
  },

  getPref(aName, aType) {
    return this.prefs.prefHasUserValue(aName)
      ? this.prefs["get" + aType + "Pref"](aName)
      : this.protocol._getOptionDefault(aName);
  },
  getInt(aName) {
    return this.getPref(aName, "Int");
  },
  getBool(aName) {
    return this.getPref(aName, "Bool");
  },
  getString(aName) {
    return this.prefs.prefHasUserValue(aName)
      ? this.prefs.getStringPref(aName)
      : this.protocol._getOptionDefault(aName);
  },

  get prefs() {
    return (
      this._prefs ||
      (this._prefs = Services.prefs.getBranch(
        "messenger.account." + this.imAccount.id + ".options."
      ))
    );
  },

  get normalizedName() {
    return this.normalize(this.name);
  },
  normalize(aName) {
    return aName.toLowerCase();
  },

  getSessions() {
    return [];
  },
  reportSessionsChanged() {
    Services.obs.notifyObservers(this.imAccount, "account-sessions-changed");
  },

  _pendingVerificationRequests: null,
  /**
   *
   * @param {string} aDisplayName - Display name the request is from.
   * @param {() => Promise<{challenge: string, challengeDescription: string?}>} aGetChallenge - Accept request and generate
   *   the challenge.
   * @param {AbortSignal} [aAbortSignal] - Abort signal to indicate the request
   *   was cancelled.
   * @returns {Promise<boolean>} Completion promise for the verification.
   *   Boolean indicates the result of the verification, rejection is a cancel.
   */
  addVerificationRequest(aDisplayName, aGetChallenge, aAbortSignal) {
    if (!this._pendingVerificationRequests) {
      this._pendingVerificationRequests = [];
    }
    const verificationRequest = {
      _account: this,
      get account() {
        return this._account.imAccount;
      },
      get subject() {
        return aDisplayName;
      },
      get challengeType() {
        return Ci.imISessionVerification.CHALLENGE_TEXT;
      },
      get challenge() {
        return this._challenge;
      },
      get challengeDescription() {
        return this._challengeDescription;
      },
      _challenge: "",
      _challengeDescription: "",
      _canceled: false,
      completePromise: null,
      async verify() {
        const { challenge, challengeDescription = "" } = await aGetChallenge();
        this._challenge = challenge;
        this._challengeDescription = challengeDescription;
      },
      submitResponse(challengeMatches) {
        this._accept(challengeMatches);
        this._remove();
      },
      cancel() {
        if (this._canceled) {
          return;
        }
        this._canceled = true;
        Services.obs.notifyObservers(
          this,
          "buddy-verification-request-canceled"
        );
        this._deny();
        this._remove();
      },
      _remove() {
        this._account.removeVerificationRequest(this);
      },
      QueryInterface: ChromeUtils.generateQI([
        "imIIncomingSessionVerification",
      ]),
    };
    verificationRequest.completePromise = new Promise((resolve, reject) => {
      verificationRequest._accept = resolve;
      verificationRequest._deny = reject;
    });
    this._pendingVerificationRequests.push(verificationRequest);
    Services.obs.notifyObservers(
      verificationRequest,
      "buddy-verification-request"
    );
    if (aAbortSignal) {
      aAbortSignal.addEventListener(
        "abort",
        () => {
          verificationRequest.cancel();
        },
        { once: true }
      );
      if (aAbortSignal.aborted) {
        verificationRequest.cancel();
      }
    }
    return verificationRequest.completePromise;
  },
  /**
   * Remove a verification request for this account.
   *
   * @param {imIIncomingSessionVerification} aRequest
   */
  removeVerificationRequest(aRequest) {
    if (!this._pendingVerificationRequests) {
      return;
    }
    this._pendingVerificationRequests =
      this._pendingVerificationRequests.filter(r => r !== aRequest);
  },
  cancelPendingVerificationRequests() {
    if (!this._pendingVerificationRequests) {
      return;
    }
    for (const request of this._pendingVerificationRequests) {
      request.cancel();
    }
    this._pendingVerificationRequests = null;
  },

  _encryptionStatus: [],
  get encryptionStatus() {
    return this._encryptionStatus;
  },
  set encryptionStatus(newStatus) {
    this._encryptionStatus = newStatus;
    Services.obs.notifyObservers(
      this.imAccount,
      "account-encryption-status-changed",
      newStatus
    );
  },
};

export var GenericAccountBuddyPrototype = {
  __proto__: ClassInfo("prplIAccountBuddy", "generic account buddy object"),
  get DEBUG() {
    return this._account.DEBUG;
  },
  get LOG() {
    return this._account.LOG;
  },
  get WARN() {
    return this._account.WARN;
  },
  get ERROR() {
    return this._account.ERROR;
  },

  _init(aAccount, aBuddy, aTag, aUserName) {
    if (!aBuddy && !aUserName) {
      throw new Error("aUserName is required when aBuddy is null");
    }

    this._tag = aTag;
    this._account = aAccount;
    this._buddy = aBuddy;
    if (aBuddy) {
      const displayName = aBuddy.displayName;
      if (displayName != aUserName) {
        this._serverAlias = displayName;
      }
    }
    this._userName = aUserName;
  },
  unInit() {
    delete this._tag;
    delete this._account;
    delete this._buddy;
  },

  get account() {
    return this._account.imAccount;
  },
  set buddy(aBuddy) {
    if (this._buddy) {
      throw Components.Exception("", Cr.NS_ERROR_ALREADY_INITIALIZED);
    }
    this._buddy = aBuddy;
  },
  get buddy() {
    return this._buddy;
  },
  get tag() {
    return this._tag;
  },
  set tag(aNewTag) {
    const oldTag = this._tag;
    this._tag = aNewTag;
    IMServices.contacts.accountBuddyMoved(this, oldTag, aNewTag);
  },

  _notifyObservers(aTopic, aData) {
    try {
      this._buddy.observe(this, "account-buddy-" + aTopic, aData);
    } catch (e) {
      this.ERROR(e);
    }
  },

  _userName: "",
  get userName() {
    return this._userName || this._buddy.userName;
  },
  get normalizedName() {
    return this._account.normalize(this.userName);
  },
  _serverAlias: "",
  get serverAlias() {
    return this._serverAlias;
  },
  set serverAlias(aNewAlias) {
    const old = this.displayName;
    this._serverAlias = aNewAlias;
    if (old != this.displayName) {
      this._notifyObservers("display-name-changed", old);
    }
  },

  /**
   * Method called to start verification of the buddy. Same signature as
   * _startVerification of GenericSessionPrototype. If the property is not a
   * function, |canVerifyIdentity| is false.
   *
   * @type {() => {challenge: string, challengeDescription: string?, handleResult: (boolean) => void, cancel: () => void, cancelPromise: Promise}?}
   */
  _startVerification: null,
  get canVerifyIdentity() {
    return typeof this._startVerification === "function";
  },
  _identityVerified: false,
  get identityVerified() {
    return this.canVerifyIdentity && this._identityVerified;
  },
  verifyIdentity() {
    if (!this.canVerifyIdentity) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
    if (this.identityVerified) {
      return Promise.resolve();
    }
    return this._startVerification().then(
      ({
        challenge,
        challengeDescription,
        handleResult,
        cancel,
        cancelPromise,
      }) => {
        const verifier = new SessionVerification(
          challenge,
          this.userName,
          challengeDescription
        );
        verifier.completePromise.then(
          result => handleResult(result),
          () => cancel()
        );
        cancelPromise.then(() => verifier.cancel());
        return verifier;
      }
    );
  },

  remove() {
    IMServices.contacts.accountBuddyRemoved(this);
  },

  // imIStatusInfo implementation
  get displayName() {
    return this.serverAlias || this.userName;
  },
  _buddyIconFilename: "",
  get buddyIconFilename() {
    return this._buddyIconFilename;
  },
  set buddyIconFilename(aNewFileName) {
    this._buddyIconFilename = aNewFileName;
    this._notifyObservers("icon-changed");
  },
  _statusType: 0,
  get statusType() {
    return this._statusType;
  },
  get online() {
    return this._statusType > Ci.imIStatusInfo.STATUS_OFFLINE;
  },
  get available() {
    return this._statusType == Ci.imIStatusInfo.STATUS_AVAILABLE;
  },
  get idle() {
    return this._statusType == Ci.imIStatusInfo.STATUS_IDLE;
  },
  get mobile() {
    return this._statusType == Ci.imIStatusInfo.STATUS_MOBILE;
  },
  _statusText: "",
  get statusText() {
    return this._statusText;
  },

  // This is for use by the protocol plugin, it's not exposed in the
  // imIStatusInfo interface.
  // All parameters are optional and will be ignored if they are null
  // or undefined.
  setStatus(aStatusType, aStatusText, aAvailabilityDetails) {
    // Ignore omitted parameters.
    if (aStatusType === undefined || aStatusType === null) {
      aStatusType = this._statusType;
    }
    if (aStatusText === undefined || aStatusText === null) {
      aStatusText = this._statusText;
    }
    if (aAvailabilityDetails === undefined || aAvailabilityDetails === null) {
      aAvailabilityDetails = this._availabilityDetails;
    }

    // Decide which notifications should be fired.
    const notifications = [];
    if (
      this._statusType != aStatusType ||
      this._availabilityDetails != aAvailabilityDetails
    ) {
      notifications.push("availability-changed");
    }
    if (this._statusType != aStatusType || this._statusText != aStatusText) {
      notifications.push("status-changed");
      if (this.online && aStatusType <= Ci.imIStatusInfo.STATUS_OFFLINE) {
        notifications.push("signed-off");
      }
      if (!this.online && aStatusType > Ci.imIStatusInfo.STATUS_OFFLINE) {
        notifications.push("signed-on");
      }
    }

    // Actually change the stored status.
    [this._statusType, this._statusText, this._availabilityDetails] = [
      aStatusType,
      aStatusText,
      aAvailabilityDetails,
    ];

    // Fire the notifications.
    notifications.forEach(function (aTopic) {
      this._notifyObservers(aTopic);
    }, this);
  },

  _availabilityDetails: 0,
  get availabilityDetails() {
    return this._availabilityDetails;
  },

  get canSendMessage() {
    return this.online;
  },

  getTooltipInfo: () => [],
  createConversation() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
};

// aUserName is required only if aBuddy is null, i.e., we are adding a buddy.
function AccountBuddy(aAccount, aBuddy, aTag, aUserName) {
  this._init(aAccount, aBuddy, aTag, aUserName);
}
AccountBuddy.prototype = GenericAccountBuddyPrototype;

export var GenericMessagePrototype = {
  __proto__: ClassInfo("prplIMessage", "generic message object"),

  _lastId: 0,
  _init(aWho, aMessage, aObject, aConversation) {
    this.id = ++GenericMessagePrototype._lastId;
    this.time = Math.floor(new Date() / 1000);
    this.who = aWho;
    this.message = aMessage;
    this.originalMessage = aMessage;
    this.conversation = aConversation;

    if (aObject) {
      for (const i in aObject) {
        this[i] = aObject[i];
      }
    }
  },
  _alias: "",
  get alias() {
    return this._alias || this.who;
  },
  _iconURL: "",
  get iconURL() {
    // If the protocol plugin has explicitly set an icon for the message, use it.
    if (this._iconURL) {
      return this._iconURL;
    }

    // Otherwise, attempt to find a buddy for incoming messages, and forward the call.
    if (this.incoming && this.conversation && !this.conversation.isChat) {
      const buddy = this.conversation.buddy;
      if (buddy) {
        return buddy.buddyIconFilename;
      }
    }
    return "";
  },
  conversation: null,
  remoteId: "",

  outgoing: false,
  incoming: false,
  system: false,
  autoResponse: false,
  containsNick: false,
  noLog: false,
  error: false,
  delayed: false,
  noFormat: false,
  containsImages: false,
  notification: false,
  noLinkification: false,
  noCollapse: false,
  isEncrypted: false,
  action: false,
  deleted: false,

  getActions() {
    return [];
  },

  whenDisplayed() {},
  whenRead() {},
};

export function Message(aWho, aMessage, aObject, aConversation) {
  this._init(aWho, aMessage, aObject, aConversation);
}

Message.prototype = GenericMessagePrototype;

export var GenericConversationPrototype = {
  __proto__: ClassInfo("prplIConversation", "generic conversation object"),
  get wrappedJSObject() {
    return this;
  },

  get DEBUG() {
    return this._account.DEBUG;
  },
  get LOG() {
    return this._account.LOG;
  },
  get WARN() {
    return this._account.WARN;
  },
  get ERROR() {
    return this._account.ERROR;
  },

  _init(aAccount, aName) {
    this._account = aAccount;
    this._name = aName;
    this._observers = [];
    this._date = new Date() * 1000;
    IMServices.conversations.addConversation(this);
  },

  _id: 0,
  get id() {
    return this._id;
  },
  set id(aId) {
    if (this._id) {
      throw Components.Exception("", Cr.NS_ERROR_ALREADY_INITIALIZED);
    }
    this._id = aId;
  },

  addObserver(aObserver) {
    if (!this._observers.includes(aObserver)) {
      this._observers.push(aObserver);
    }
  },
  removeObserver(aObserver) {
    this._observers = this._observers.filter(o => o !== aObserver);
  },
  notifyObservers(aSubject, aTopic, aData) {
    for (const observer of this._observers) {
      try {
        observer.observe(aSubject, aTopic, aData);
      } catch (e) {
        this.ERROR(e);
      }
    }
  },

  prepareForSending: aOutgoingMessage => [aOutgoingMessage.message],
  prepareForDisplaying(aImMessage) {
    if (aImMessage.displayMessage !== aImMessage.message) {
      this.DEBUG(
        "Preparing:\n" +
          aImMessage.message +
          "\nDisplaying:\n" +
          aImMessage.displayMessage
      );
    }
  },
  sendMsg(aMsg, aAction = false, aNotification = false) {
    // Clear any pending typing timers.
    this._cancelTypingTimer();

    // Add-ons (eg. pastebin) have an opportunity to cancel the message at this
    // point, or change the text content of the message.
    // If an add-on wants to split a message, it should truncate the first
    // message, and insert new messages using the conversation's sendMsg method.
    let om = new OutgoingMessage(aMsg, this);
    om.action = aAction;
    om.notification = aNotification;
    this.notifyObservers(om, "preparing-message");
    if (om.cancelled) {
      return;
    }

    // Protocols have an opportunity here to preprocess messages before they are
    // sent (eg. split long messages). If a message is split here, the split
    // will be visible in the UI.
    const messages = this.prepareForSending(om);
    const isAction = om.action;
    const isNotification = om.notification;

    for (const msg of messages) {
      // Add-ons (eg. OTR) have an opportunity to tweak or cancel the message
      // at this point.
      om = new OutgoingMessage(msg, this);
      om.action = isAction;
      om.notification = isNotification;
      this.notifyObservers(om, "sending-message");
      if (om.cancelled) {
        continue;
      }
      this.dispatchMessage(om.message, om.action, om.notification);
    }
  },
  /**
   * Send a message over the wire.
   *
   * Note that this does not clear typing notifications, but does clear any pending
   * timers. Protocols may wish to internally call sendTyping(Ci.prplIConvIM.NOT_TYPING)
   * if additional wire messages are needed to cancel typing.
   *
   * @param {string} _message - The message typed by the user.
   * @param {boolean} _action - True if the message is an emote (i.e. /me).
   * @param {boolean} _notification - True if the message is a notification (i.e. /notice).
   */
  dispatchMessage(_message, _action, _notification) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  /**
   * A timer for when to consider the user having stopped typing.
   */
  _typingTimer: null,
  /**
   * True if the conversation supports typing notifications. False otherwise.
   */
  supportTypingNotifications: false,

  /**
   * If we should send typing notifications to the remote server.
   *
   * @type {boolean}
   */
  get _shouldSendTypingNotifications() {
    return this.supportTypingNotifications && lazy.SHOULD_SEND_TYPING;
  },

  /**
   * Called when the user is typing a message.
   *
   * @param {string} string - The currently typed message.
   * @returns {number} The number of characters that can still be typed
   *    or NO_TYPING_LIMIT if there is no protocol defined limit.
   */
  sendTyping(string) {
    // If the protocol does not support typing notifications or if the user has
    // disabled them, there's nothing to do.
    if (!this._shouldSendTypingNotifications) {
      return this.getRemainingCharacters(string);
    }

    // If the message is empty then it was either sent or the input box was
    // cleared. The user is no longer typing.
    const isTyping =
      string.length > 0 ? Ci.prplIConvIM.TYPING : Ci.prplIConvIM.NOT_TYPING;

    this._cancelTypingTimer();
    if (isTyping) {
      this._typingTimer = setTimeout(this.finishedComposing.bind(this), 10000);
    }

    this.setTypingState(isTyping);

    return this.getRemainingCharacters(string);
  },

  /**
   * Called to send the protocol over thewire.
   *
   * @param {number} _newState - The user's typing state, matching the constants
   *    defined in Ci.prplIConvIM.
   */
  setTypingState: _newState => {},

  /**
   * Called when the user is typing a message.
   *
   * @param {string} _string - The currently typed message.
   * @returns {number} The number of characters that can still be typed
   *    or NO_TYPING_LIMIT if there is no protocol defined limit.
   */
  getRemainingCharacters: _string => Ci.prplIConversation.NO_TYPING_LIMIT,

  /**
   * Called when the user has finished typing a message.
   */
  finishedComposing() {
    if (!this._shouldSendTypingNotifications) {
      return;
    }

    this.setTypingState(Ci.prplIConvIM.TYPED);
  },

  _cancelTypingTimer() {
    if (this._typingTimer) {
      clearTimeout(this._typingTimer);
      delete this._typingTimer;
    }
  },

  close() {
    Services.obs.notifyObservers(this, "closing-conversation");
    IMServices.conversations.removeConversation(this);
  },
  unInit() {
    this._cancelTypingTimer();
    delete this._account;
    delete this._observers;
  },

  /**
   * Create a prplIMessage instance from params.
   *
   * @param {string} who - Nick of the participant who sent the message.
   * @param {string} text - Raw message contents.
   * @param {object} properties - Additional properties of the message.
   * @returns {prplIMessage}
   */
  createMessage(who, text, properties) {
    return new Message(who, text, properties, this);
  },

  writeMessage(aWho, aText, aProperties) {
    const message = this.createMessage(aWho, aText, aProperties);
    this.notifyObservers(message, "new-text");
  },

  /**
   * Update the contents of a message.
   *
   * @param {string} who - Nick of the participant who sent the message.
   * @param {string} text - Raw contents of the message.
   * @param {object} properties - Additional properties of the message. Should
   *   specify a |remoteId| to find the previous version of this message.
   */
  updateMessage(who, text, properties) {
    const message = this.createMessage(who, text, properties);
    this.notifyObservers(message, "update-text");
  },

  /**
   * Remove a message from the conversation. Does not affect logs, use
   * updateMessage with a deleted property to remove from logs.
   *
   * @param {string} remoteId - Remote ID of the event to remove.
   */
  removeMessage(remoteId) {
    this.notifyObservers(null, "remove-text", remoteId);
  },

  get account() {
    return this._account.imAccount;
  },
  get name() {
    return this._name;
  },
  get normalizedName() {
    return this._account.normalize(this.name);
  },
  get title() {
    return this.name;
  },
  get startDate() {
    return this._date;
  },
  _convIconFilename: "",
  get convIconFilename() {
    return this._convIconFilename;
  },
  set convIconFilename(aNewFilename) {
    this._convIconFilename = aNewFilename;
    this.notifyObservers(this, "update-conv-icon");
  },

  get encryptionState() {
    return Ci.prplIConversation.ENCRYPTION_NOT_SUPPORTED;
  },
  initializeEncryption() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
};

export var GenericConvIMPrototype = {
  __proto__: GenericConversationPrototype,
  _interfaces: [Ci.prplIConversation, Ci.prplIConvIM],
  classDescription: "generic ConvIM object",

  updateTyping(aState, aName) {
    if (aState == this.typingState) {
      return;
    }

    if (aState == Ci.prplIConvIM.NOT_TYPING) {
      delete this.typingState;
    } else {
      this.typingState = aState;
    }
    this.notifyObservers(null, "update-typing", aName);
  },

  get isChat() {
    return false;
  },
  buddy: null,
  // The typing state of the remote buddy.
  typingState: Ci.prplIConvIM.NOT_TYPING,
  get convIconFilename() {
    // By default, pass through information from the buddy for IM conversations
    // that don't have their own icon.
    const convIconFilename = this._convIconFilename;
    if (convIconFilename) {
      return convIconFilename;
    }
    return this.buddy?.buddyIconFilename;
  },
};

export var GenericConvChatPrototype = {
  __proto__: GenericConversationPrototype,
  _interfaces: [Ci.prplIConversation, Ci.prplIConvChat],
  classDescription: "generic ConvChat object",

  _init(aAccount, aName, aNick) {
    // _participants holds prplIConvChatBuddy objects.
    this._participants = new Map();
    this.nick = aNick;
    GenericConversationPrototype._init.call(this, aAccount, aName);
  },

  get isChat() {
    return true;
  },

  // Stores the prplIChatRoomFieldValues required to join this channel
  // to enable later reconnections. If null, the MUC will not be reconnected
  // automatically after disconnections.
  chatRoomFields: null,

  _topic: "",
  _topicSetter: null,
  get topic() {
    return this._topic;
  },
  get topicSettable() {
    return false;
  },
  get topicSetter() {
    return this._topicSetter;
  },
  /**
   * Set the topic of a conversation.
   *
   * @param {string} aTopic - The new topic. If an update message is sent to
   *   the conversation, this will be HTML escaped before being sent.
   * @param {string} aTopicSetter - The user who last modified the topic.
   * @param {string} aQuiet - If false, a message notifying about the topic
   *   change will be sent to the conversation.
   */
  setTopic(aTopic, aTopicSetter, aQuiet) {
    // Only change the topic if the topic and/or topic setter has changed.
    if (
      this._topic == aTopic &&
      (!this._topicSetter || this._topicSetter == aTopicSetter)
    ) {
      return;
    }

    this._topic = aTopic;
    this._topicSetter = aTopicSetter;

    this.notifyObservers(null, "chat-update-topic");

    if (aQuiet) {
      return;
    }

    // Send the topic as a message.
    let message;
    if (aTopicSetter) {
      if (aTopic) {
        message = lazy._("topicChanged", aTopicSetter, lazy.TXTToHTML(aTopic));
      } else {
        message = lazy._("topicCleared", aTopicSetter);
      }
    } else {
      aTopicSetter = null;
      if (aTopic) {
        message = lazy._("topicSet", this.name, lazy.TXTToHTML(aTopic));
      } else {
        message = lazy._("topicNotSet", this.name);
      }
    }
    this.writeMessage(aTopicSetter, message, { system: true });
  },

  get nick() {
    return this._nick;
  },
  set nick(aNick) {
    this._nick = aNick;
    const escapedNick = this._nick.replace(/[[\]{}()*+?.\\^$|]/g, "\\$&");
    this._pingRegexp = new RegExp("(?:^|\\W)" + escapedNick + "(?:\\W|$)", "i");
  },

  _left: false,
  get left() {
    return this._left;
  },
  set left(aLeft) {
    if (aLeft == this._left) {
      return;
    }
    this._left = aLeft;
    this.notifyObservers(null, "update-conv-chatleft");
  },

  _joining: false,
  get joining() {
    return this._joining;
  },
  set joining(aJoining) {
    if (aJoining == this._joining) {
      return;
    }
    this._joining = aJoining;
    this.notifyObservers(null, "update-conv-chatjoining");
  },

  getParticipant(aName) {
    return this._participants.has(aName) ? this._participants.get(aName) : null;
  },
  getParticipants() {
    // Convert the values of the Map into an array.
    return Array.from(this._participants.values());
  },
  getNormalizedChatBuddyName: aChatBuddyName => aChatBuddyName,

  // Updates the nick of a participant in conversation to a new one.
  updateNick(aOldNick, aNewNick, isOwnNick) {
    let message;
    const isParticipant = this._participants.has(aOldNick);
    if (isOwnNick) {
      // If this is the user's nick, change it.
      this.nick = aNewNick;
      message = lazy._("nickSet.you", aNewNick);

      // If the account was disconnected, it's OK the user is not a participant.
      if (!isParticipant) {
        return;
      }
    } else if (!isParticipant) {
      this.ERROR(
        "Trying to rename nick that doesn't exist! " +
          aOldNick +
          " to " +
          aNewNick
      );
      return;
    } else {
      message = lazy._("nickSet", aOldNick, aNewNick);
    }

    // Get the original participant and then remove it.
    const participant = this._participants.get(aOldNick);
    this._participants.delete(aOldNick);

    // Update the nickname and add it under the new nick.
    participant.name = aNewNick;
    this._participants.set(aNewNick, participant);

    this.notifyObservers(participant, "chat-buddy-update", aOldNick);
    this.writeMessage(aOldNick, message, { system: true });
  },

  // Removes a participant from conversation.
  removeParticipant(aNick) {
    if (!this._participants.has(aNick)) {
      return;
    }

    const stringNickname = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    stringNickname.data = aNick;
    this.notifyObservers(
      new nsSimpleEnumerator([stringNickname]),
      "chat-buddy-remove"
    );
    this._participants.delete(aNick);
  },

  // Removes all participant in conversation.
  removeAllParticipants() {
    const stringNicknames = [];
    this._participants.forEach(function (aParticipant) {
      const stringNickname = Cc[
        "@mozilla.org/supports-string;1"
      ].createInstance(Ci.nsISupportsString);
      stringNickname.data = aParticipant.name;
      stringNicknames.push(stringNickname);
    });
    this.notifyObservers(
      new nsSimpleEnumerator(stringNicknames),
      "chat-buddy-remove"
    );
    this._participants.clear();
  },

  createMessage(who, text, properties) {
    properties.containsNick =
      "incoming" in properties && this._pingRegexp.test(text);
    return GenericConversationPrototype.createMessage.apply(this, arguments);
  },
};

export var GenericConvChatBuddyPrototype = {
  __proto__: ClassInfo("prplIConvChatBuddy", "generic ConvChatBuddy object"),

  _name: "",
  get name() {
    return this._name;
  },
  set name(aName) {
    this._name = aName;
  },
  alias: "",
  buddy: false,
  buddyIconFilename: "",

  voiced: false,
  moderator: false,
  admin: false,
  founder: false,
  typing: false,

  /**
   * Method called to start verification of the buddy. Same signature as
   * _startVerification of GenericSessionPrototype. If the property is not a
   * function, |canVerifyIdentity| is false.
   *
   * @type {() => {challenge: string, challengeDescription: string?, handleResult: (boolean) => void, cancel: () => void, cancelPromise: Promise}?}
   */
  _startVerification: null,
  get canVerifyIdentity() {
    return typeof this._startVerification === "function";
  },
  _identityVerified: false,
  get identityVerified() {
    return this.canVerifyIdentity && this._identityVerified;
  },
  verifyIdentity() {
    if (!this.canVerifyIdentity) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }
    if (this.identityVerified) {
      return Promise.resolve();
    }
    return this._startVerification().then(
      ({
        challenge,
        challengeDescription,
        handleResult,
        cancel,
        cancelPromise,
      }) => {
        const verifier = new SessionVerification(
          challenge,
          this.name,
          challengeDescription
        );
        verifier.completePromise.then(
          result => handleResult(result),
          () => cancel()
        );
        cancelPromise.then(() => verifier.cancel());
        return verifier;
      }
    );
  },
};

export function TooltipInfo(aLabel, aValue, aType = Ci.prplITooltipInfo.pair) {
  this.type = aType;
  if (aType == Ci.prplITooltipInfo.status) {
    this.label = aLabel.toString();
    this.value = aValue || "";
  } else if (aType == Ci.prplITooltipInfo.icon) {
    this.value = aValue;
  } else if (
    aLabel === undefined ||
    aType == Ci.prplITooltipInfo.sectionBreak
  ) {
    this.type = Ci.prplITooltipInfo.sectionBreak;
  } else {
    this.label = aLabel;
    if (aValue === undefined) {
      this.type = Ci.prplITooltipInfo.sectionHeader;
    } else {
      this.value = aValue;
    }
  }
}

TooltipInfo.prototype = ClassInfo("prplITooltipInfo", "generic tooltip info");

/* aOption is an object containing:
 *  - label: localized text to display (recommended: use a getter with _)
 *  - default: the default value for this option. The type of the
 *      option will be determined based on the type of the default value.
 *      If the default value is a string, the option will be of type
 *      list if listValues has been provided. In that case the default
 *      value should be one of the listed values.
 *  - [optional] listValues: only if this option can only take a list of
 *      predefined values. This is an object of the form:
 *        {value1: localizedLabel, value2: ...}.
 *  - [optional] masked: boolean, if true the UI shouldn't display the value.
 *      This could typically be used for password field.
 *      Warning: The UI currently doesn't support this.
 */
function purplePref(aName, aOption) {
  this.name = aName; // Preference name
  this.label = aOption.label; // Text to display

  if (aOption.default === undefined || aOption.default === null) {
    throw new Error(
      "A default value for the option is required to determine its type."
    );
  }
  this._defaultValue = aOption.default;

  const kTypes = { boolean: "Bool", string: "String", number: "Int" };
  let type = kTypes[typeof aOption.default];
  if (!type) {
    throw new Error("Invalid option type");
  }

  if (type == "String" && "listValues" in aOption) {
    type = "List";
    this._listValues = aOption.listValues;
  }
  this.type = Ci.prplIPref["type" + type];

  if ("masked" in aOption && aOption.masked) {
    this.masked = true;
  }
}
purplePref.prototype = {
  __proto__: ClassInfo("prplIPref", "generic account option preference"),

  masked: false,

  // Default value
  getBool() {
    return this._defaultValue;
  },
  getInt() {
    return this._defaultValue;
  },
  getString() {
    return this._defaultValue;
  },
  getList() {
    // Convert a JavaScript object map {"value 1": "label 1", ...}
    const keys = Object.keys(this._listValues);
    return keys.map(key => new purpleKeyValuePair(this._listValues[key], key));
  },
  getListDefault() {
    return this._defaultValue;
  },
};

function purpleKeyValuePair(aName, aValue) {
  this.name = aName;
  this.value = aValue;
}
purpleKeyValuePair.prototype = ClassInfo(
  "prplIKeyValuePair",
  "generic Key Value Pair"
);

function UsernameSplit(aValues) {
  this._values = aValues;
}
UsernameSplit.prototype = {
  __proto__: ClassInfo("prplIUsernameSplit", "username split object"),

  get label() {
    return this._values.label;
  },
  get separator() {
    return this._values.separator;
  },
  get defaultValue() {
    return this._values.defaultValue;
  },
};

function ChatRoomField(aIdentifier, aField) {
  this.identifier = aIdentifier;
  this.label = aField.label;
  this.required = !!aField.required;

  let type = "TEXT";
  if (typeof aField.default == "number") {
    type = "INT";
    this.min = aField.min;
    this.max = aField.max;
  } else if (aField.isPassword) {
    type = "PASSWORD";
  }
  this.type = Ci.prplIChatRoomField["TYPE_" + type];
}
ChatRoomField.prototype = ClassInfo(
  "prplIChatRoomField",
  "ChatRoomField object"
);

function ChatRoomFieldValues(aMap) {
  this.values = aMap;
}
ChatRoomFieldValues.prototype = {
  __proto__: ClassInfo("prplIChatRoomFieldValues", "ChatRoomFieldValues"),

  getValue(aIdentifier) {
    return this.values.hasOwnProperty(aIdentifier)
      ? this.values[aIdentifier]
      : null;
  },
  setValue(aIdentifier, aValue) {
    this.values[aIdentifier] = aValue;
  },
};

// the name getter and the getAccount method need to be implemented by
// protocol plugins.
export var GenericProtocolPrototype = {
  __proto__: ClassInfo("prplIProtocol", "Generic protocol object"),

  init(aId) {
    if (aId != this.id) {
      throw new Error(
        "Creating an instance of " +
          aId +
          " but this object implements " +
          this.id
      );
    }
  },
  get id() {
    return "prpl-" + this.normalizedName;
  },
  get iconBaseURI() {
    return "chrome://chat/skin/prpl-generic/";
  },

  getAccount() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  _getOptionDefault(aName) {
    if (this.options && this.options.hasOwnProperty(aName)) {
      return this.options[aName].default;
    }
    throw new Error(aName + " has no default value in " + this.id + ".");
  },
  getOptions() {
    if (!this.options) {
      return [];
    }

    const purplePrefs = [];
    for (const [name, option] of Object.entries(this.options)) {
      purplePrefs.push(new purplePref(name, option));
    }
    return purplePrefs;
  },
  usernamePrefix: "",
  getUsernameSplit() {
    if (!this.usernameSplits || !this.usernameSplits.length) {
      return [];
    }
    return this.usernameSplits.map(split => new UsernameSplit(split));
  },

  /**
   * Protocol agnostic implementation that splits the username by the pattern
   * defined with |usernamePrefix| and |usernameSplits| on the protocol.
   * Prefers the first occurrence of a separator.
   *
   * @param {string} aName - Username to split.
   * @returns {string[]} Parts of the username or empty array if the username
   *   doesn't match the splitting format.
   */
  splitUsername(aName) {
    let remainingName = aName;
    if (this.usernamePrefix) {
      if (!remainingName.startsWith(this.usernamePrefix)) {
        return [];
      }
      remainingName = remainingName.slice(this.usernamePrefix.length);
    }
    if (!this.usernameSplits || !this.usernameSplits.length) {
      return [remainingName];
    }
    const parts = [];
    for (const split of this.usernameSplits) {
      if (!remainingName.includes(split.separator)) {
        return [];
      }
      const separatorIndex = remainingName.indexOf(split.separator);
      parts.push(remainingName.slice(0, separatorIndex));
      remainingName = remainingName.slice(
        separatorIndex + split.separator.length
      );
    }
    parts.push(remainingName);
    return parts;
  },

  registerCommands() {
    if (!this.commands) {
      return;
    }

    this.commands.forEach(function (command) {
      if (!command.hasOwnProperty("name") || !command.hasOwnProperty("run")) {
        throw new Error("Every command must have a name and a run function.");
      }
      if (!command.hasOwnProperty("usageContext")) {
        command.usageContext = IMServices.cmd.COMMAND_CONTEXT.ALL;
      }
      if (!command.hasOwnProperty("priority")) {
        command.priority = IMServices.cmd.COMMAND_PRIORITY.PRPL;
      }
      IMServices.cmd.registerCommand(command, this.id);
    }, this);
  },

  // NS_ERROR_XPC_JSOBJECT_HAS_NO_FUNCTION_NAMED errors are too noisy
  get usernameEmptyText() {
    return "";
  },
  accountExists: () => false, // FIXME

  get chatHasTopic() {
    return false;
  },
  get noPassword() {
    return false;
  },
  get passwordOptional() {
    return false;
  },
  get slashCommandsNative() {
    return false;
  },
  get canEncrypt() {
    return false;
  },

  get classDescription() {
    return this.name + " Protocol";
  },
  get contractID() {
    return "@mozilla.org/chat/" + this.normalizedName + ";1";
  },
};

/**
 * Text challenge session verification flow. Starts the UI flow.
 *
 * @param {string} challenge - String the challenge should display.
 * @param {string} subject - Human readable identifier of the other side of the
 *  challenge.
 * @param {string} [challengeDescription] - Description of the challenge
 *  contents.
 */
function SessionVerification(challenge, subject, challengeDescription) {
  this._challenge = challenge;
  this._subject = subject;
  if (challengeDescription) {
    this._description = challengeDescription;
  }
  this._responsePromise = new Promise((resolve, reject) => {
    this._submit = resolve;
    this._cancel = reject;
  });
}
SessionVerification.prototype = {
  __proto__: ClassInfo(
    "imISessionVerification",
    "generic session verification object"
  ),
  _challengeType: Ci.imISessionVerification.CHALLENGE_TEXT,
  _challenge: "",
  _description: "",
  _responsePromise: null,
  _submit: null,
  _cancel: null,
  _cancelled: false,
  get challengeType() {
    return this._challengeType;
  },
  get challenge() {
    return this._challenge;
  },
  get challengeDescription() {
    return this._description;
  },
  get subject() {
    return this._subject;
  },
  get completePromise() {
    return this._responsePromise;
  },
  submitResponse(challengeMatches) {
    this._submit(challengeMatches);
  },
  cancel() {
    if (this._cancelled) {
      return;
    }
    this._cancelled = true;
    this._cancel();
  },
};

export var GenericSessionPrototype = {
  __proto__: ClassInfo("prplISession", "generic session object"),
  /**
   * Initialize the session.
   *
   * @param {prplIAccount} account - Account the session is related to.
   * @param {string} id - ID of the session.
   * @param {boolean} [trusted=false] - If the session is trusted.
   * @param {boolean} [currentSession=false] - If the session represents the.
   *  session we're connected as.
   */
  _init(account, id, trusted = false, currentSession = false) {
    this._account = account;
    this._id = id;
    this._trusted = trusted;
    this._currentSession = currentSession;
  },
  _account: null,
  _id: "",
  _trusted: false,
  _currentSession: false,
  get id() {
    return this._id;
  },
  get trusted() {
    return this._trusted;
  },
  set trusted(newTrust) {
    this._trusted = newTrust;
    this._account.reportSessionsChanged();
  },
  get currentSession() {
    return this._currentSession;
  },
  /**
   * Handle the start of the session verification process. The protocol is
   * expected to update the trusted property on the session if it becomes
   * trusted after verification.
   *
   * @returns {Promise<{challenge: string, challengeDescription: string?, handleResult: (boolean) => void, cancel: () => void, cancelPromise: Promise<void>}>}
   *  Promise resolves to an object holding the challenge string, as well as a
   *  callback that handles the result of the verification flow. The cancel
   *  callback is called when the verification is cancelled and the cancelPromise
   *  is used for the protocol to report when the other side cancels.
   *  The cancel callback will be called when the cancel promise resolves.
   */
  _startVerification() {
    return Promise.reject(
      Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED)
    );
  },
  verify() {
    if (this.trusted) {
      return Promise.resolve();
    }
    return this._startVerification().then(
      ({
        challenge,
        challengeDescription,
        handleResult,
        cancel,
        cancelPromise,
      }) => {
        const verifier = new SessionVerification(
          challenge,
          this.id,
          challengeDescription
        );
        verifier.completePromise.then(
          result => handleResult(result),
          () => cancel()
        );
        cancelPromise.then(() => verifier.cancel());
        return verifier;
      }
    );
  },
};
