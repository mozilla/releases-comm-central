/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { ReceiptType } = ChromeUtils.importESModule(
  "resource:///modules/matrix-sdk.sys.mjs"
);

const kSendReadPref = "purple.conversations.im.send_read";

loadMatrix();

add_task(function test_whenDisplayed() {
  const mockConv = {
    _account: {
      _client: {
        sendReadReceipt(event, receiptType) {
          mockConv.readEvent = event;
          mockConv.receiptType = receiptType;
          return Promise.resolve();
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: "baz",
    },
    mockConv
  );

  message.whenDisplayed();

  equal(mockConv.readEvent, "baz");
  equal(
    mockConv.receiptType,
    message.hideReadReceipts ? ReceiptType.ReadPrivate : ReceiptType.Read
  );

  mockConv.readEvent = false;

  message.whenDisplayed();
  ok(!mockConv.readEvent);
});

add_task(async function test_whenDisplayedError() {
  let resolveError;
  const errorPromise = new Promise(resolve => {
    resolveError = resolve;
  });
  const readReceiptRejection = "foo bar";
  const mockConv = {
    ERROR(error) {
      resolveError(error);
    },
    _account: {
      _client: {
        sendReadReceipt() {
          return Promise.reject(readReceiptRejection);
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: "baz",
    },
    mockConv
  );

  message.whenDisplayed();
  const error = await errorPromise;
  equal(error, readReceiptRejection);
});

add_task(function test_whenRead() {
  const mockConv = {
    _roomId: "lorem",
    _account: {
      _client: {
        setRoomReadMarkers(roomId, eventId) {
          mockConv.readRoomId = roomId;
          mockConv.readEventId = eventId;
          return Promise.resolve();
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: {
        getId() {
          return "baz";
        },
      },
    },
    mockConv
  );

  message.whenRead();

  equal(mockConv.readEventId, "baz");
  equal(mockConv.readRoomId, "lorem");

  mockConv.readEventId = false;

  message.whenRead();
  ok(!mockConv.readEventId);
});

add_task(async function test_whenReadError() {
  let resolveError;
  const errorPromise = new Promise(resolve => {
    resolveError = resolve;
  });
  const readReceiptRejection = "foo bar";
  const mockConv = {
    ERROR(error) {
      resolveError(error);
    },
    _account: {
      _client: {
        setRoomReadMarkers() {
          return Promise.reject(readReceiptRejection);
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: {
        getId() {
          return "baz";
        },
      },
    },
    mockConv
  );

  message.whenRead();
  const error = await errorPromise;
  equal(error, readReceiptRejection);
});

add_task(async function test_whenDisplayedNoEvent() {
  const message = new MatrixMessage("foo", "bar", {
    system: true,
  });

  message.whenDisplayed();

  ok(!message._displayed);
});

add_task(async function test_whenReadNoEvent() {
  const message = new MatrixMessage("foo", "bar", {
    system: true,
  });

  message.whenRead();

  ok(!message._read);
});

add_task(async function test_hideReadReceipts() {
  const message = new MatrixMessage("foo", "bar", {});
  const initialSendRead = Services.prefs.getBoolPref(kSendReadPref);
  strictEqual(message.hideReadReceipts, !initialSendRead);
  Services.prefs.setBoolPref(kSendReadPref, !initialSendRead);
  const message2 = new MatrixMessage("lorem", "ipsum", {});
  strictEqual(message2.hideReadReceipts, initialSendRead);
  strictEqual(message.hideReadReceipts, !initialSendRead);
  Services.prefs.setBoolPref(kSendReadPref, initialSendRead);
});

add_task(async function test_getActions() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
  });
  const message = new MatrixMessage(
    "foo",
    "bar",
    { event },
    {
      roomState: {
        maySendRedactionForEvent() {
          return false;
        },
      },
    }
  );
  const actions = message.getActions();
  ok(Array.isArray(actions));
  equal(actions.length, 0);
});

add_task(async function test_getActions_decryptionFailure() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    content: {
      msgtype: "m.bad.encrypted",
    },
  });
  let eventKeysWereRequestedFor;
  const message = new MatrixMessage(
    "foo",
    "bar",
    { event },
    {
      _account: {
        _client: {
          cancelAndResendEventRoomKeyRequest(matrixEvent) {
            eventKeysWereRequestedFor = matrixEvent;
            return Promise.resolve();
          },
        },
      },
      roomState: {
        maySendRedactionForEvent() {
          return false;
        },
      },
    }
  );
  const actions = message.getActions();
  ok(Array.isArray(actions));
  equal(actions.length, 1);
  const [action] = actions;
  ok(action.label);
  action.run();
  strictEqual(eventKeysWereRequestedFor, event);
});

add_task(async function test_getActions_redact() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    content: {
      msgtype: MatrixSDK.MsgType.Text,
      body: "foo bar",
    },
    roomId: "!actions:example.com",
    threadRootId: "$thread:example.com",
    id: "$ev:example.com",
  });
  let eventRedacted = false;
  const message = new MatrixMessage(
    "foo",
    "bar",
    { event },
    {
      _account: {
        userId: 0,
        _client: {
          redactEvent(roomId, threadRootId, eventId) {
            equal(roomId, "!actions:example.com");
            equal(threadRootId, "$thread:example.com");
            equal(eventId, "$ev:example.com");
            eventRedacted = true;
            return Promise.resolve();
          },
        },
      },
      roomState: {
        maySendRedactionForEvent(ev, userId) {
          equal(ev, event);
          equal(userId, 0);
          return true;
        },
      },
    }
  );
  const actions = message.getActions();
  ok(Array.isArray(actions));
  equal(actions.length, 1);
  const [action] = actions;
  ok(action.label);
  action.run();
  ok(eventRedacted);
});

add_task(async function test_getActions_noEvent() {
  const message = new MatrixMessage("system", "test", {
    system: true,
  });
  const actions = message.getActions();
  ok(Array.isArray(actions));
  deepEqual(actions, []);
});

add_task(async function test_getActions_report() {
  const event = makeEvent({
    type: MatrixSDK.EventType.RoomMessage,
    content: {
      msgtype: MatrixSDK.MsgType.Text,
      body: "lorem ipsum",
    },
    roomId: "!actions:example.com",
    id: "$ev:example.com",
  });
  let eventReported = false;
  const message = new MatrixMessage(
    "user",
    "lorem ipsum",
    { event, incoming: true },
    {
      _account: {
        _client: {
          reportEvent(roomId, eventId, score, reason) {
            equal(roomId, "!actions:example.com");
            equal(eventId, "$ev:example.com");
            equal(score, -100);
            equal(reason, "");
            eventReported = true;
            return Promise.resolve();
          },
        },
      },
      roomState: {
        maySendRedactionForEvent() {
          return false;
        },
      },
    }
  );
  const actions = message.getActions();
  ok(Array.isArray(actions));
  const [action] = actions;
  ok(action.label);
  action.run();
  ok(eventReported);
});

add_task(async function test_getActions_notSent() {
  let resendCalled = false;
  let cancelCalled = false;
  const event = makeEvent({
    status: MatrixSDK.EventStatus.NOT_SENT,
    type: MatrixSDK.EventType.RoomMessage,
    content: {
      msgtype: MatrixSDK.MsgType.Text,
      body: "foo bar",
    },
  });
  const message = new MatrixMessage(
    "!test:example.com",
    "Error sending message",
    {
      event,
      error: true,
    },
    {
      _account: {
        _client: {
          resendEvent(ev, room) {
            equal(ev, event);
            ok(room);
            resendCalled = true;
          },
          cancelPendingEvent(ev) {
            equal(ev, event);
            cancelCalled = true;
          },
        },
      },
      roomState: {
        maySendRedactionForEvent() {
          return false;
        },
      },
      room: {},
    }
  );
  const actions = message.getActions();
  ok(Array.isArray(actions));
  equal(actions.length, 2);
  const [retryAction, cancelAction] = actions;
  ok(retryAction.label);
  ok(cancelAction.label);
  retryAction.run();
  ok(resendCalled);
  ok(!cancelCalled);
  cancelAction.run();
  ok(cancelCalled);
});

add_task(function test_whenDisplayedUnsent() {
  const mockConv = {
    _account: {
      _client: {
        sendReadReceipt() {
          ok(false, "Should not send read receipt for unsent event");
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: makeEvent({
        status: MatrixSDK.EventStatus.NOT_SENT,
      }),
    },
    mockConv
  );

  message.whenDisplayed();
  ok(!message._displayed);
});

add_task(function test_whenReadUnsent() {
  const mockConv = {
    _account: {
      _client: {
        setRoomReadMarkers() {
          ok(false, "Should not send read marker for unsent event");
        },
      },
    },
  };
  const message = new MatrixMessage(
    "foo",
    "bar",
    {
      event: makeEvent({
        status: MatrixSDK.EventStatus.NOT_SENT,
      }),
    },
    mockConv
  );

  message.whenRead();
  ok(!message._read);
});
