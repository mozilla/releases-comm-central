/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
const { MatrixProtocol } = ChromeUtils.importESModule(
  "resource:///modules/matrix.sys.mjs"
);
const { MatrixRoom, MatrixAccount, MatrixMessage } = ChromeUtils.importESModule(
  "resource:///modules/matrixAccount.sys.mjs"
);
var { MatrixSDK } = ChromeUtils.importESModule(
  "resource:///modules/matrix-sdk.sys.mjs"
);
function loadMatrix() {
  IMServices.conversations.initConversations();
}

/**
 * Get a MatrixRoom instance with a mocked client.
 *
 * @param {boolean} isMUC
 * @param {string} [name="#test:example.com"]
 * @param {(any, string) => any?|object} [clientHandler]
 * @returns {MatrixRoom}
 */
function getRoom(
  isMUC,
  name = "#test:example.com",
  clientHandler = () => undefined,
  account
) {
  if (!account) {
    account = getAccount(clientHandler);
  }
  const room = getClientRoom(name, clientHandler, account._client);
  const conversation = new MatrixRoom(account, isMUC, name);
  conversation.initRoom(room);
  return conversation;
}

/**
 *
 * @param {string} roomId
 * @param {(any, string) => any?|object} clientHandler
 * @param {MatrixClient} client
 * @returns {Room}
 */
function getClientRoom(roomId, clientHandler, client) {
  const room = new Proxy(
    {
      roomId,
      name: roomId,
      tags: {},
      getJoinedMembers() {
        return [];
      },
      getAvatarUrl() {
        return "";
      },
      getLiveTimeline() {
        return {
          getState() {
            return {
              getStateEvents() {
                return [];
              },
            };
          },
        };
      },
      isSpaceRoom() {
        return false;
      },
      getLastActiveTimestamp() {
        return Date.now();
      },
      getMyMembership() {
        return "join";
      },
      getAccountData() {
        return null;
      },
      getUnfilteredTimelineSet() {
        return {
          getLiveTimeline() {
            return {
              getEvents() {
                return [];
              },
              getBaseIndex() {
                return 0;
              },
              getNeighbouringTimeline() {
                return null;
              },
              getPaginationToken() {
                return "";
              },
            };
          },
        };
      },
      guessDMUserId() {
        return "@other:example.com";
      },
      loadMembersIfNeeded() {
        return Promise.resolve();
      },
      getEncryptionTargetMembers() {
        return Promise.resolve([]);
      },
    },
    makeProxyHandler(clientHandler)
  );
  client._rooms.set(roomId, room);
  return room;
}

/**
 *
 * @param {(any, string) => any?|object} clientHandler
 * @returns {MatrixAccount}
 */
function getAccount(clientHandler) {
  const account = new MatrixAccount(Object.create(MatrixProtocol.prototype), {
    logDebugMessage(message) {
      account._errors.push(message.message);
    },
  });
  account._errors = [];
  account._client = new Proxy(
    {
      _rooms: new Map(),
      credentials: {
        userId: "@user:example.com",
      },
      getHomeserverUrl() {
        return "https://example.com";
      },
      getRoom(roomId) {
        return this._rooms.get(roomId);
      },
      async joinRoom(roomId) {
        if (!this._rooms.has(roomId)) {
          getClientRoom(roomId, clientHandler, this);
        }
        return this._rooms.get(roomId);
      },
      setAccountData() {},
      async createRoom(spec) {
        const roomId =
          "!" + spec.name + ":example.com" || "!newroom:example.com";
        if (!this._rooms.has(roomId)) {
          getClientRoom(roomId, clientHandler, this);
        }
        return {
          room_id: roomId,
        };
      },
      getRooms() {
        return Array.from(this._rooms.values());
      },
      getVisibleRooms() {
        return Array.from(this._rooms.values());
      },
      isCryptoEnabled() {
        return false;
      },
      getPushActionsForEvent() {
        return {};
      },
      leave(roomId) {
        this._rooms.delete(roomId);
      },
      downloadKeys() {
        return Promise.resolve({});
      },
      getUser(userId) {
        return {
          displayName: userId,
          userId,
        };
      },
      getStoredDevicesForUser() {
        return [];
      },
      isRoomEncrypted() {
        return false;
      },
    },
    makeProxyHandler(clientHandler)
  );
  return account;
}

/**
 * @param {(any, string) => any?|object} [clientHandler]
 * @returns {object}
 */
function makeProxyHandler(clientHandler) {
  return {
    get(target, key) {
      if (typeof clientHandler === "function") {
        const value = clientHandler(target, key);
        if (value) {
          return value;
        }
      } else if (clientHandler.hasOwnProperty(key)) {
        return clientHandler[key];
      }
      return target[key];
    },
  };
}

/**
 * Build a MatrixEvent like object from a plain object.
 *
 * @param {{ type: MatrixSDK.EventType, content: object, sender: string, id: number, redacted: boolean, time: Date }} eventSpec - Data the event holds.
 * @returns {MatrixEvent}
 */
function makeEvent(eventSpec = {}) {
  const time = eventSpec.time || new Date();
  return {
    isRedacted() {
      return eventSpec.redacted || false;
    },
    getType() {
      return eventSpec.type;
    },
    getContent() {
      return eventSpec.content || {};
    },
    getPrevContent() {
      return eventSpec.prevContent || {};
    },
    getWireContent() {
      return eventSpec.content;
    },
    getSender() {
      return eventSpec.sender;
    },
    getDate() {
      return time;
    },
    sender: {
      name: "foo bar",
      getAvatarUrl() {
        return "https://example.com/avatar";
      },
    },
    getId() {
      return eventSpec.id || 0;
    },
    isEncrypted() {
      return (
        eventSpec.type == MatrixSDK.EventType.RoomMessageEncrypted ||
        eventSpec.isEncrypted
      );
    },
    shouldAttemptDecryption() {
      return Boolean(eventSpec.shouldDecrypt);
    },
    isBeingDecrypted() {
      return Boolean(eventSpec.decrypting);
    },
    isDecryptionFailure() {
      return eventSpec.content?.msgtype == "m.bad.encrypted";
    },
    isRedaction() {
      return eventSpec.type == MatrixSDK.EventType.RoomRedaction;
    },
    getRedactionEvent() {
      return eventSpec.redaction;
    },
    target: eventSpec.target,
    replyEventId:
      eventSpec.content?.["m.relates_to"]?.["m.in_reply_to"]?.event_id,
    threadRootId: eventSpec.threadRootId || null,
    getRoomId() {
      return eventSpec.roomId || "!test:example.com";
    },
    status: eventSpec.status || null,
    _listeners: {},
    once(event, listener) {
      this._listeners[event] = listener;
    },
  };
}
