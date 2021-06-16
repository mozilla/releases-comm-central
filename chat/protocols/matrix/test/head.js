/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
const { MatrixProtocol } = ChromeUtils.import("resource:///modules/matrix.jsm");
var matrix = {};
function loadMatrix() {
  Services.scriptloader.loadSubScript("resource:///modules/matrix.jsm", matrix);
  Services.conversations.initConversations();
}

/**
 * Get a MatrixRoom instance with a mocked client.
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
  const conversation = new matrix.MatrixRoom(account, isMUC, name);
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
      summary: {
        info: {
          title: roomId,
        },
      },
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
      getAccountData(key) {
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
  const account = new matrix.MatrixAccount(
    Object.create(MatrixProtocol.prototype),
    {
      logDebugMessage(message) {
        account._errors.push(message.message);
      },
    }
  );
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
      setAccountData(field, data) {},
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
    get(target, key, receiver) {
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
