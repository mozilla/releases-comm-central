/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var matrix = {};
Services.scriptloader.loadSubScript("resource:///modules/matrix.jsm", matrix);
Services.conversations.initConversations();

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
    };
  },

  get userId() {
    return "@test:example.com";
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
    };
  },
};

add_task(async function test_toDMConversation() {
  const acc = new FakeAccount();
  const roomId = "#test:example.com";
  acc.prepareClientRoom(roomId);
  const groupConv = new matrix.MatrixConversation(acc, roomId, acc.userId);
  groupConv.initRoom(acc._room);
  acc.convertToDM(groupConv);
  ok(!groupConv.joined);
  const newRoom = await groupConv.waitForRoom();
  try {
    notStrictEqual(newRoom, groupConv);
    equal(newRoom._roomId, groupConv._roomId);
    const roomListInstance = acc.roomList.get(roomId);
    strictEqual(roomListInstance, newRoom);
  } finally {
    newRoom.close();
  }
});

add_task(async function test_toGroupConversation() {
  const acc = new FakeAccount();
  const roomId = "#test:example.com";
  acc.prepareClientRoom(roomId);
  const directConv = new matrix.MatrixDirectConversation(acc, roomId);
  directConv.initRoom(acc._room);
  acc.convertToGroup(directConv);
  ok(!directConv.joined);
  const newRoom = await directConv.waitForRoom();
  try {
    notStrictEqual(newRoom, directConv);
    equal(newRoom._roomId, directConv._roomId);
    const roomListInstance = acc.roomList.get(roomId);
    strictEqual(roomListInstance, newRoom);
  } finally {
    newRoom.close();
  }
});
