/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const kSendReadPref = "purple.conversations.im.send_read";

loadMatrix();

add_task(function test_whenDisplayed() {
  const mockConv = {
    _account: {
      _client: {
        sendReadReceipt(event, options) {
          mockConv.readEvent = event;
          mockConv.readOpts = options;
          return Promise.resolve();
        },
      },
    },
  };
  const message = new matrix.MatrixMessage("foo", "bar", {
    event: "baz",
    conversation: mockConv,
  });

  message.whenDisplayed();

  equal(mockConv.readEvent, "baz");
  strictEqual(mockConv.readOpts.hidden, message.hideReadReceipts);

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
  const message = new matrix.MatrixMessage("foo", "bar", {
    event: "baz",
    conversation: mockConv,
  });

  message.whenDisplayed();
  const error = await errorPromise;
  equal(error, readReceiptRejection);
});

add_task(function test_whenRead() {
  const mockConv = {
    _roomId: "lorem",
    _account: {
      _client: {
        setRoomReadMarkers(roomId, eventId, readEventId, options) {
          mockConv.readRoomId = roomId;
          mockConv.readEventId = eventId;
          mockConv.readOpts = options;
          return Promise.resolve();
        },
      },
    },
  };
  const message = new matrix.MatrixMessage("foo", "bar", {
    event: {
      getId() {
        return "baz";
      },
    },
    conversation: mockConv,
  });

  message.whenRead();

  equal(mockConv.readEventId, "baz");
  equal(mockConv.readRoomId, "lorem");
  equal(mockConv.readOpts.hidden, message.hideReadReceipts);

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
  const message = new matrix.MatrixMessage("foo", "bar", {
    event: {
      getId() {
        return "baz";
      },
    },
    conversation: mockConv,
  });

  message.whenRead();
  const error = await errorPromise;
  equal(error, readReceiptRejection);
});

add_task(async function test_whenDisplayedNoEvent() {
  const message = new matrix.MatrixMessage("foo", "bar", {
    system: true,
  });

  message.whenDisplayed();

  ok(!message._displayed);
});

add_task(async function test_whenReadNoEvent() {
  const message = new matrix.MatrixMessage("foo", "bar", {
    system: true,
  });

  message.whenRead();

  ok(!message._read);
});

add_task(async function test_hideReadReceipts() {
  const message = new matrix.MatrixMessage("foo", "bar", {});
  const initialSendRead = Services.prefs.getBoolPref(kSendReadPref);
  strictEqual(message.hideReadReceipts, !initialSendRead);
  Services.prefs.setBoolPref(kSendReadPref, !initialSendRead);
  const message2 = new matrix.MatrixMessage("lorem", "ipsum", {});
  strictEqual(message2.hideReadReceipts, initialSendRead);
  strictEqual(message.hideReadReceipts, !initialSendRead);
  Services.prefs.setBoolPref(kSendReadPref, initialSendRead);
});
