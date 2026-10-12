/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that errors while processing multi-line responses neither fail the
 * whole request because of one bad line, nor leave the connection busy.
 */

var { NntpNewsGroup } = ChromeUtils.importESModule(
  "resource:///modules/NntpNewsGroup.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var daemon = setupNNTPDaemon();
var localserver;
var folder;

add_setup(function () {
  localserver = setupLocalServer(NNTP_PORT);
  // With a single connection, a connection left busy blocks the next request.
  localserver.maximumConnectionsNumber = 1;
  folder = localserver.rootFolder.getChildNamed("test.filter");
});

/**
 * Start a server, run the test function and clean up.
 *
 * @param {Function} handler - The NNTP server handler class.
 * @param {Function} testFn - The test, called with the server.
 */
async function withServer(handler, testFn) {
  const server = makeServer(handler, daemon);
  server.start();
  localserver.port = server.port;
  try {
    await testFn(server);
  } finally {
    localserver.closeCachedConnections();
    server.stop();
    resetFolder(folder);
  }
}

/**
 * Replace a NntpNewsGroup method for the duration of a function.
 *
 * @param {string} method - The method name.
 * @param {Function} replacement - Called with the original method and the
 *   arguments.
 * @param {Function} fn - The function to run.
 */
async function withReplacedMethod(method, replacement, fn) {
  const original = NntpNewsGroup.prototype[method];
  NntpNewsGroup.prototype[method] = function (...args) {
    return replacement.call(this, original, ...args);
  };
  try {
    await fn();
  } finally {
    NntpNewsGroup.prototype[method] = original;
  }
}

async function getNewMessages() {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(null, listener);
  await listener.promise;
}

/**
 * Test that an XHDR line for an article that wasn't in the XOVER response is
 * skipped.
 */
add_task(async function test_skipXHdrLineForUnknownArticle() {
  // A filter on a header not in the XOVER response makes us fetch it by XHDR.
  const filterList = folder.getFilterList(null);
  const filter = filterList.createFilter("path");
  const searchTerm = filter.createTerm();
  searchTerm.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
  searchTerm.op = Ci.nsMsgSearchOp.Contains;
  const value = searchTerm.value;
  value.attrib = Ci.nsMsgSearchAttrib.OtherHeader;
  value.str = "nonexistent";
  searchTerm.value = value;
  searchTerm.arbitraryHeader = "Path";
  filter.appendTerm(searchTerm);
  filter.enabled = true;
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MarkRead;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  await withServer(NNTP_RFC2980_handler, async server => {
    // Skip article 3 like a malformed XOVER line.
    await withReplacedMethod(
      "processXOverLine",
      function (original, line) {
        if (!line.startsWith("3\t")) {
          original.call(this, line);
        }
      },
      getNewMessages
    );
    Assert.ok(
      server.playTransaction().them.some(command => command.startsWith("XHDR")),
      "XHDR should have been used"
    );
    Assert.equal(
      folder.getTotalMessages(false),
      7,
      "all articles but the skipped one should have been added"
    );
  });

  filterList.removeFilter(filter);
});

/**
 * Test that an unexpected error while processing the XOVER response fails the
 * request without marking the articles as known, so that they're fetched next
 * time.
 */
add_task(async function test_xoverError() {
  await withServer(NNTP_RFC2980_handler, async () => {
    const knownArtsSet = folder.msgDatabase.dBFolderInfo.knownArtsSet;
    await withReplacedMethod(
      "processXOverLine",
      function (original, line) {
        if (line.startsWith("3\t")) {
          throw new Error("processXOverLine failed");
        }
        original.call(this, line);
      },
      async () => {
        await Assert.rejects(
          getNewMessages(),
          new RegExp(Cr.NS_ERROR_FAILURE),
          "the request should fail"
        );
      }
    );
    Assert.equal(
      folder.msgDatabase.dBFolderInfo.knownArtsSet,
      knownArtsSet,
      "the articles should not be marked as known"
    );

    await getNewMessages();
    Assert.equal(
      folder.getTotalMessages(false),
      8,
      "the next request should get all articles"
    );
  });
});

/**
 * Send LISTGROUP for test.filter.
 *
 * @param {Function} onData - Called with each line of the response.
 * @returns {Promise<integer>} The status the request finished with.
 */
function listgroup(onData) {
  return new Promise(resolve => {
    localserver.wrappedJSObject.withClient(client => {
      client.startRunningUrl(
        null,
        null,
        Services.io
          .newURI(`news://localhost:${localserver.port}/test.filter`)
          .QueryInterface(Ci.nsIMsgMailNewsUrl)
      );
      client.onOpen = () => client.listgroup("test.filter");
      client.onData = onData;
      client.onDone = resolve;
    });
  });
}

/**
 * Test that the rest of a response is discarded if processing a line fails,
 * so that it doesn't end up in the next response on the same connection.
 */
add_task(async function test_listgroupErrorDiscardsResponse() {
  await withServer(NNTP_RFC2980_handler, async () => {
    Assert.equal(
      await listgroup(() => {
        throw new Error("onData failed");
      }),
      Cr.NS_ERROR_FAILURE,
      "the request should fail"
    );

    const lines = [];
    Assert.equal(
      await listgroup(line => lines.push(line.trim())),
      Cr.NS_OK,
      "the next request should succeed"
    );
    Assert.deepEqual(
      lines,
      ["1", "2", "3", "4", "5", "6", "7", "8"],
      "the next request should only get its own response"
    );
  });
});

/**
 * Test that an error after processing the lines fails the request, and that
 * the connection is released for the next request.
 */
add_task(async function test_failedAfterLines() {
  await withServer(NNTP_RFC2980_handler, async () => {
    await withReplacedMethod(
      "finishProcessingXOver",
      () => {
        throw new Error("finishProcessingXOver failed");
      },
      async () => {
        await Assert.rejects(
          getNewMessages(),
          new RegExp(Cr.NS_ERROR_FAILURE),
          "the request should fail"
        );
      }
    );

    await getNewMessages();
    Assert.equal(
      folder.getTotalMessages(false),
      8,
      "the next request should get the articles over the released connection"
    );
  });
});
