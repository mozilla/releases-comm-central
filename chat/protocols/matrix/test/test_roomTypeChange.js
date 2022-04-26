/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

loadMatrix();

add_task(async function test_toDMConversation() {
  const acc = getAccount({});
  const roomId = "#test:example.com";
  acc.isDirectRoom = rId => roomId === rId;
  const conversation = new MatrixRoom(acc, true, roomId);
  conversation.initRoom(
    getClientRoom(
      roomId,
      {
        guessDMUserId() {
          return "@user:example.com";
        },
        // Avoid running searchForVerificationRequests
        getMyMembership() {
          return "leave";
        },
      },
      acc._client
    )
  );
  await conversation.checkForUpdate();
  ok(!conversation.isChat);
  conversation.forget();
});

add_task(async function test_toGroupConversation() {
  const acc = getAccount({});
  const roomId = "#test:example.com";
  acc.isDirectRoom = rId => roomId !== rId;
  const conversation = new MatrixRoom(acc, false, roomId);
  conversation.initRoom(
    getClientRoom(
      roomId,
      {
        guessDMUserId() {
          return "@user:example.com";
        },
        // Avoid running searchForVerificationRequests
        getMyMembership() {
          return "leave";
        },
      },
      acc._client
    )
  );
  await conversation.checkForUpdate();
  ok(conversation.isChat);
  conversation.forget();
});
