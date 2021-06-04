/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

loadMatrix();

function FakeAccount() {
  this.roomList = new Map();
  this._usersToRoom = {};
}
FakeAccount.prototype = {
  __proto__: matrix.MatrixAccount.prototype,

  get _client() {
    return {
      getRoom: () => {
        return this._room;
      },
      leave() {},
      getHomeserverUrl() {
        return "https://example.com";
      },
    };
  },

  get userId() {
    return "@test:example.com";
  },

  directRoomId: "",
  isDirectRoom(roomId) {
    return this.directRoomId === roomId;
  },

  prepareClientRoom(roomId) {
    this._room = {
      roomId,
      getJoinedMembers() {
        return [];
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
      guessDMUserId() {
        return "@test:example.com";
      },
      getAvatarUrl() {
        return "";
      },
      isSpaceRoom() {
        return false;
      },
    };
  },
};

add_task(async function test_toDMConversation() {
  const acc = new FakeAccount();
  const roomId = "#test:example.com";
  acc.prepareClientRoom(roomId);
  acc.directRoomId = roomId;
  const conversation = new matrix.MatrixRoom(acc, true, roomId);
  conversation.initRoom(acc._room);
  await conversation.checkForUpdate();
  ok(!conversation.isChat);
  conversation.forget();
});

add_task(async function test_toGroupConversation() {
  const acc = new FakeAccount();
  const roomId = "#test:example.com";
  acc.prepareClientRoom(roomId);
  const conversation = new matrix.MatrixRoom(acc, false, roomId);
  conversation.initRoom(acc._room);
  await conversation.checkForUpdate();
  ok(conversation.isChat);
  conversation.forget();
});
