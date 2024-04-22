/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { Socket } = ChromeUtils.importESModule(
  "resource:///modules/socket.sys.mjs"
);
const { nsMailServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Maild.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

class TestHandler {
  constructor(daemon) {
    this.daemon = daemon;
    this.closing = false;
  }

  onStartup() {
    return "start";
  }

  onError() {
    return "error";
  }

  onServerFault() {
    return "server error";
  }

  onMultiline() {}

  FOO(data) {
    Assert.equal(data, "bar", "Foo should be followed by bar");
    return "baz";
  }

  PING() {
    return "pong";
  }

  postCommand() {}
}

class SocketTestServer {
  constructor() {
    this.open();
    this.daemon = {};
  }

  open() {
    this.server = new nsMailServer(daemon => {
      return new TestHandler(daemon);
    }, this.daemon);
    this.server.start();

    TestUtils.promiseTestFinished?.then(() => {
      this.close();
    });
  }

  close() {
    this.server.stop();
  }

  get port() {
    return this.server.port;
  }

  get data() {
    return this.daemon.data;
  }
}

function TestSocket() {
  this.state = "initial";
  this.connectionResolver = Promise.withResolvers();
}
TestSocket.prototype = {
  __proto__: Socket,

  delimiter: "\r\n",

  async *data() {
    while (!this.disconnected) {
      this.dataResolver = Promise.withResolvers();
      yield await this.dataResolver.promise;
    }
  },
  onConnection() {
    this.state = "connection";
    this.connectionResolver.resolve();
  },
  onConnectionHeard() {
    this.state = "heard";
  },
  onConnectionTimedOut() {
    this.state = "timedOut";
  },
  onConnectionReset() {
    this.state = "reset";
  },
  onConnectionSecurityError() {
    this.state = "securityError";
  },
  onConnectionClosed() {
    this.state = "closed";
  },
  onDataReceived(data) {
    this.dataResolver?.resolve(data);
  },
  LOG(message) {
    this.log = message;
  },
  sendPing() {
    this.sendData("ping\r\n");
  },
};

let server;
add_setup(() => {
  server = new SocketTestServer();
});

add_task(async function test_socket() {
  const socket = new TestSocket();
  socket.connect("localhost", server.port, []);

  await socket.connectionResolver.promise;
  Assert.equal(socket.state, "connection", "Socket should be connected");
  Assert.ok(!socket.disconnected, "Socket should not disconnect");

  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket should be disconnected");
});

add_task(async function test_socket_sendData() {
  const socket = new TestSocket();
  const dataIterator = socket.data();
  socket.connect("localhost", server.port, []);

  await socket.connectionResolver.promise;
  Assert.ok(!socket.disconnected, "Socket should be connected");
  const { value: intialMessage } = await dataIterator.next();
  Assert.equal(intialMessage, "start", "Should have received start message");

  socket.sendData("foo bar\r\n", "lorem ipsum");
  const { value: response } = await dataIterator.next();
  Assert.equal(response, "baz", "Should respond to string");

  Assert.equal(
    socket.log,
    `Sending:
lorem ipsum`,
    "Should log correct contents"
  );

  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket  should be disconnected");
});

add_task(async function test_socket_sendString() {
  const socket = new TestSocket();
  const dataIterator = socket.data();
  socket.connect("localhost", server.port, []);

  await socket.connectionResolver.promise;
  Assert.ok(!socket.disconnected, "Socket should be connected");
  const { value: intialMessage } = await dataIterator.next();
  Assert.equal(intialMessage, "start", "Should have received start message");

  socket.sendString("foo bar\r\n", "UTF-8", "lorem ipsum");
  const { value: response } = await dataIterator.next();
  Assert.equal(response, "baz", "Should respond to string");

  Assert.equal(
    socket.log,
    `Sending:
lorem ipsum`,
    "Should log correct contents"
  );

  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket should be disconnected");
});

add_task(async function test_socket_startTLS() {
  const socket = new TestSocket();
  socket.connect("localhost", server.port, ["starttls"]);

  await socket.connectionResolver.promise;
  Assert.ok(!socket.disconnected, "Socket should be connected");

  await socket.startTLS();
  Assert.ok(!socket.disconnected, "Socket should still be connected");

  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket should be disconnected");
});

add_task(async function test_socket_sendPing() {
  const socket = new TestSocket();
  socket.kTimeBeforePing = 1;
  const dataIterator = socket.data();
  const now = Date.now();
  socket.connect("localhost", server.port, []);

  await socket.connectionResolver.promise;
  Assert.ok(!socket.disconnected, "Socket should be connected");
  await dataIterator.next();
  socket.resetPingTimer();

  const { value: pong } = await dataIterator.next();
  Assert.equal(pong, "pong", "Should have recieved pong");
  Assert.greaterOrEqual(
    Date.now(),
    now + socket.kTimeBeforePing,
    "Ping should come after delay"
  );
  socket.resetPingTimer();
  socket.cancelDisconnectTimer();

  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket should be disconnected");
});

add_task(async function test_socket_pingDisconnect() {
  const socket = new TestSocket();
  socket.kTimeBeforePing = 1;
  socket.kTimeAfterPingBeforeDisconnect = 10;
  const dataIterator = socket.data();
  socket.connect("localhost", server.port, []);

  await socket.connectionResolver.promise;
  Assert.ok(!socket.disconnected, "Socket should be connected");
  await dataIterator.next();
  socket.resetPingTimer();

  const { value: pong } = await dataIterator.next();
  Assert.equal(pong, "pong", "Should have received pong");
  // Not calling reset.

  await TestUtils.waitForCondition(
    () => socket.state === "timedOut",
    "Socket should trigger time out"
  );
  socket.disconnect();
  Assert.ok(socket.disconnected, "Socket should be disconnected");
});
