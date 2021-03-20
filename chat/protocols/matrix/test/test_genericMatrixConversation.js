/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
var matrix = {};
Services.scriptloader.loadSubScript("resource:///modules/matrix.jsm", matrix);
Services.conversations.initConversations();

add_task(async function test_sharedInit() {
  const roomStub = {};
  matrix.GenericMatrixConversation.sharedInit.call(roomStub);
  equal(typeof roomStub._setInitialized, "function");
  ok(roomStub._initialized);
  roomStub._setInitialized();
  await roomStub._initialized;
});

add_task(function test_replaceRoom() {
  const roomStub = {
    _setInitialized() {
      this.initialized = true;
    },
  };
  const newRoom = "foo";
  matrix.GenericMatrixConversation.replaceRoom.call(roomStub, newRoom);
  equal(roomStub._replacedBy, newRoom);
  ok(roomStub.initialized);
});

add_task(async function test_waitForRoom() {
  const roomStub = {
    _initialized: Promise.resolve(),
  };
  const awaitedRoom = await matrix.GenericMatrixConversation.waitForRoom.call(
    roomStub
  );
  strictEqual(awaitedRoom, roomStub);
});

add_task(async function test_waitForRoomReplaced() {
  const roomStub = {};
  matrix.GenericMatrixConversation.sharedInit.call(roomStub);
  const newRoom = {
    waitForRoom() {
      return Promise.resolve("success");
    },
  };
  matrix.GenericMatrixConversation.replaceRoom.call(roomStub, newRoom);
  const awaitedRoom = await matrix.GenericMatrixConversation.waitForRoom.call(
    roomStub
  );
  equal(awaitedRoom, "success");
});

add_task(function test_conversationInheritance() {
  testInheritance(matrix.MatrixConversation);
  testInheritance(matrix.MatrixDirectConversation);
});

function testInheritance(targetConstructor) {
  for (const [key, value] of Object.entries(matrix.GenericMatrixConversation)) {
    ok(targetConstructor.prototype.hasOwnProperty(key));
    strictEqual(targetConstructor.prototype[key], value);
  }
}
