/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

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
    _conversation: mockConv,
  });

  message.whenDisplayed();

  equal(mockConv.readEvent, "baz");
  equal(mockConv.readOpts.hidden, message.hideReadReceipts);

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
    _conversation: mockConv,
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
    _conversation: mockConv,
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
    _conversation: mockConv,
  });

  message.whenRead();
  const error = await errorPromise;
  equal(error, readReceiptRejection);
});
