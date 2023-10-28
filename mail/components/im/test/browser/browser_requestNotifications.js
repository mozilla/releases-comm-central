/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function testGrantingBuddyRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const notificationTopic = TestUtils.topicObserved(
    "buddy-authorization-request"
  );
  const requestPromise = new Promise((resolve, reject) => {
    prplAccount.addBuddyRequest("test-user", resolve, reject);
  });
  const [request] = await notificationTopic;
  is(request.userName, "test-user");
  is(request.account.id, account.id);
  await TestUtils.waitForTick();

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value = "buddy-auth-request-" + request.account.id + request.userName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  ok(
    BrowserTestUtils.is_hidden(notification.closeButton),
    "Can't dismiss without interacting"
  );
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
    {}
  );
  await requestPromise;

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testCancellingBuddyRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const notificationTopic = TestUtils.topicObserved(
    "buddy-authorization-request"
  );
  prplAccount.addBuddyRequest(
    "test-user",
    () => {
      ok(false, "request was granted");
    },
    () => {
      ok(false, "request was denied");
    }
  );
  const [request] = await notificationTopic;
  is(request.userName, "test-user");
  is(request.account.id, account.id);

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value = "buddy-auth-request-" + request.account.id + request.userName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  const cancelTopic = TestUtils.topicObserved(
    "buddy-authorization-request-canceled"
  );
  prplAccount.cancelBuddyRequest("test-user");
  const [canceledRequest] = await cancelTopic;
  is(canceledRequest.userName, request.userName);
  is(canceledRequest.account.id, request.account.id);

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testDenyingBuddyRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const notificationTopic = TestUtils.topicObserved(
    "buddy-authorization-request"
  );
  const requestPromise = new Promise((resolve, reject) => {
    prplAccount.addBuddyRequest("test-user", reject, resolve);
  });
  const [request] = await notificationTopic;
  is(request.userName, "test-user");
  is(request.account.id, account.id);

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value = "buddy-auth-request-" + request.account.id + request.userName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.lastElementChild,
    {}
  );
  await requestPromise;

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testGrantingChatRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const requestTopic = TestUtils.topicObserved("conv-authorization-request");
  const requestPromise = new Promise((resolve, reject) => {
    prplAccount.addChatRequest("test-chat", resolve, reject);
  });
  const [request] = await requestTopic;
  is(request.conversationName, "test-chat");
  is(request.account.id, account.id);

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value =
    "conv-auth-request-" + request.account.id + request.conversationName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  ok(
    BrowserTestUtils.is_hidden(notification.closeButton),
    "Can't dismiss without interacting"
  );
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
    {}
  );
  await requestPromise;
  const result = await request.completePromise;
  ok(result);

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testCancellingChatRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(
    BrowserTestUtils.is_visible(document.getElementById("chatPanel")),
    "chat tab visible"
  );

  const requestTopic = TestUtils.topicObserved("conv-authorization-request");
  prplAccount.addChatRequest(
    "test-chat",
    () => {
      ok(false, "chat request was granted");
    },
    () => {
      ok(false, "chat request was denied");
    }
  );
  const [request] = await requestTopic;
  is(request.conversationName, "test-chat", "conversation name matches");
  is(request.account.id, account.id, "account id matches");

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value =
    "conv-auth-request-" + request.account.id + request.conversationName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  prplAccount.cancelChatRequest("test-chat");
  await Assert.rejects(
    request.completePromise,
    /Cancelled/,
    "completePromise is rejected to indicate cancellation"
  );

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testDenyingChatRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const requestTopic = TestUtils.topicObserved("conv-authorization-request");
  const requestPromise = new Promise((resolve, reject) => {
    prplAccount.addChatRequest("test-chat", reject, resolve);
  });
  const [request] = await requestTopic;
  is(request.conversationName, "test-chat");
  is(request.account.id, account.id);
  ok(request.canDeny);

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value =
    "conv-auth-request-" + request.account.id + request.conversationName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.lastElementChild,
    {}
  );
  await requestPromise;
  const result = await request.completePromise;
  ok(!result);

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});

add_task(async function testUndenyableChatRequest() {
  const account = IMServices.accounts.createAccount(
    "testuser",
    "prpl-mochitest"
  );
  const prplAccount = account.prplAccount.wrappedJSObject;
  const passwordPromise = TestUtils.topicObserved("account-updated");
  account.password = "this is a test";
  await passwordPromise;
  account.connect();

  await openChatTab();
  ok(BrowserTestUtils.is_visible(document.getElementById("chatPanel")));

  const requestTopic = TestUtils.topicObserved("conv-authorization-request");
  const requestPromise = new Promise(resolve => {
    prplAccount.addChatRequest("test-chat", resolve);
  });
  const [request] = await requestTopic;
  is(request.conversationName, "test-chat");
  is(request.account.id, account.id);
  ok(!request.canDeny);

  const notificationBox = window.chatHandler.msgNotificationBar;
  const value =
    "conv-auth-request-" + request.account.id + request.conversationName;
  const notification = notificationBox.getNotificationWithValue(value);
  ok(notification, "notification shown");
  const closePromise = new Promise(resolve => {
    notification.eventCallback = event => {
      resolve();
    };
  });
  is(notification.buttonContainer.children.length, 1);

  EventUtils.synthesizeMouseAtCenter(
    notification.buttonContainer.firstElementChild,
    {}
  );
  await requestPromise;
  const result = await request.completePromise;
  ok(result);

  await closePromise;
  ok(!notificationBox.getNotificationWithValue(value), "notification closed");

  account.disconnect();
  IMServices.accounts.deleteAccount(account.id);
});
