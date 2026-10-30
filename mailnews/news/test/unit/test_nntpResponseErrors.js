/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var incomingServer;
var folder;

add_setup(function () {
  incomingServer = setupLocalServer(NNTP_PORT);
  incomingServer.maximumConnectionsNumber = 1;
  folder = incomingServer.rootFolder.getChildNamed("test.filter");
});

/**
 * Run requests against a fake server and reset the connection and folder.
 *
 * @param {typeof NNTP_RFC2980_handler} handler - The server handler class.
 * @param {function(nsMailServer): Promise<void>} testFn - Run the test requests.
 */
async function withServer(handler, testFn) {
  const server = makeServer(handler, setupNNTPDaemon());
  server.start();
  incomingServer.port = server.port;
  try {
    await testFn(server);
  } finally {
    incomingServer.closeCachedConnections();
    await server.stop();
    resetFolder(folder);
    folder.groupUsername = "";
    folder.groupPassword = "";
  }
}

/**
 * Queue an operation and collect its data and completion status.
 *
 * @param {function(NntpClient): void} action - Start the operation on connection.
 * @returns {Promise<{status: nsresult, data: string}>} The request result.
 */
function request(action) {
  return new Promise(resolve => {
    incomingServer.wrappedJSObject.withClient(client => {
      const url = Services.io
        .newURI(`news://localhost:${incomingServer.port}/test.filter`)
        .QueryInterface(Ci.nsIMsgMailNewsUrl);
      let data = "";
      client.startRunningUrl(null, false, url);
      client.onOpen = () => action(client);
      client.onData = line => (data += line);
      client.onDone = status => resolve({ status, data });
    });
  });
}

add_task(async function test_errorResponsesReleaseConnection() {
  const cases = [
    {
      command: "ARTICLE",
      action: client => client.getArticleByArticleNumber("test.filter", 1),
    },
    {
      command: "LIST",
      action: client => client.getListOfGroups(false),
    },
    {
      command: "NEWGROUPS",
      action: client => client.getListOfGroups(true),
    },
    {
      command: "LISTGROUP",
      action: client => client.listgroup("test.filter"),
    },
    {
      command: "GROUP",
      action: client => client.getArticleByArticleNumber("test.filter", 1),
    },
    {
      command: "HEAD",
      action: client => client.getNewNews("test.filter", false),
    },
    {
      command: "XPAT",
      action: client => client.search("test.filter", ["XPAT subject 1-8 *"]),
    },
    {
      command: "POST",
      action: client => client.post(),
    },
    ...["user", "pass"].map(authStep => ({
      command: "AUTHINFO",
      authStep,
      action: client => {
        client._newsFolder = folder;
        folder.groupUsername = "testnews";
        folder.groupPassword = "newstest";
        client._actionAuthUser();
      },
    })),
  ];
  for (const status of [500, 503]) {
    for (const { command, action, authStep } of cases) {
      info(`Testing ${command} ${authStep ?? ""} with ${status}`);
      let rejected = false;
      class ErrorHandler extends NNTP_RFC2980_handler {
        [command](args) {
          if (!rejected && (!authStep || args.startsWith(authStep))) {
            rejected = true;
            return `${status} Command failed`;
          }
          if (command == "AUTHINFO") {
            return "381 Password required";
          }
          return super[command](args);
        }

        XOVER(args) {
          // Exercise HEAD through the normal unsupported-XOVER fallback.
          return command == "HEAD"
            ? "500 XOVER unsupported"
            : super.XOVER(args);
        }
      }
      await withServer(ErrorHandler, async server => {
        const failed = request(action);
        const next = request(client =>
          client.getArticleByArticleNumber("test.filter", 2)
        );
        const result = await failed;
        Assert.ok(
          rejected,
          "the server should have rejected the target command"
        );
        Assert.equal(
          result.status,
          Cr.NS_ERROR_FAILURE,
          `${command} should fail after ${status}`
        );
        Assert.equal(
          result.data,
          "",
          "the error should produce no response data"
        );
        const second = await next;
        Assert.equal(
          second.status,
          Cr.NS_OK,
          "the queued request should succeed"
        );
        Assert.stringContains(
          second.data,
          "This is the second body post.",
          "the queued request should receive its own article"
        );
        if (command == "GROUP") {
          Assert.deepEqual(
            server.playTransaction().them,
            [
              "MODE READER",
              "GROUP test.filter",
              "GROUP test.filter",
              "ARTICLE 2",
            ],
            "a failed group selection should be retried before the queued article"
          );
        }
        if (command == "HEAD") {
          Assert.equal(
            folder.msgDatabase.dBFolderInfo.knownArtsSet,
            "",
            "a HEAD failure should not mark articles as known"
          );
        }
      });
    }
  }
});

add_task(async function test_unsupportedModeReaderContinues() {
  for (const status of [500, 503]) {
    class UnsupportedModeHandler extends NNTP_RFC2980_handler {
      MODE() {
        return `${status} MODE READER unsupported`;
      }
    }
    await withServer(UnsupportedModeHandler, async server => {
      const first = request(client =>
        client.getArticleByArticleNumber("test.filter", 1)
      );
      const next = request(client =>
        client.getArticleByArticleNumber("test.filter", 2)
      );
      Assert.equal(
        (await first).status,
        Cr.NS_OK,
        "an unsupported MODE READER should allow the article request to continue"
      );
      Assert.equal(
        (await next).status,
        Cr.NS_OK,
        "the queued request should succeed"
      );
      Assert.deepEqual(
        server.playTransaction().them,
        ["MODE READER", "GROUP test.filter", "ARTICLE 1", "ARTICLE 2"],
        "the client should continue and reuse the connection"
      );
    });
  }
});

add_task(async function test_unsupportedHeadersFallBackToHead() {
  const filterList = folder.getFilterList();
  const filter = filterList.createFilter("path");
  const term = filter.createTerm();
  term.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
  term.op = Ci.nsMsgSearchOp.Contains;
  const value = term.value;
  value.attrib = Ci.nsMsgSearchAttrib.OtherHeader;
  value.str = "nonexistent";
  term.value = value;
  term.arbitraryHeader = "Path";
  filter.appendTerm(term);
  filter.enabled = true;
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MarkRead;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);
  try {
    for (const command of ["XOVER", "XHDR"]) {
      for (const status of [500, 503]) {
        class UnsupportedHeadersHandler extends NNTP_RFC2980_handler {
          [command]() {
            return `${status} Header command unsupported`;
          }
        }
        await withServer(UnsupportedHeadersHandler, async server => {
          const headers = request(client =>
            client.getNewNews("test.filter", false)
          );
          const next = request(client =>
            client.getArticleByArticleNumber("test.filter", 2)
          );
          Assert.equal(
            (await headers).status,
            Cr.NS_OK,
            `${command} should fall back to HEAD after ${status}`
          );
          Assert.equal(
            folder.getTotalMessages(false),
            8,
            "the HEAD fallback should fetch all article headers"
          );
          Assert.equal(
            (await next).status,
            Cr.NS_OK,
            "the queued article should succeed after the fallback"
          );
          const commands = server.playTransaction().them;
          Assert.ok(
            commands.some(line => line.startsWith(`${command} `)),
            "the unsupported header command should have been attempted"
          );
          Assert.deepEqual(
            commands.filter(line => line.startsWith("HEAD ")),
            Array.from({ length: 8 }, (_, i) => `HEAD ${i + 1}`),
            "the fallback should request each article with HEAD"
          );
        });
      }
    }
  } finally {
    filterList.removeFilter(filter);
  }
});

add_task(async function test_missingHeadSkipsArticle() {
  class MissingHeadHandler extends NNTP_RFC2980_handler {
    XOVER() {
      return "500 XOVER unsupported";
    }
    HEAD(number) {
      return number == "1" ? "423 No such article" : super.HEAD(number);
    }
  }
  await withServer(MissingHeadHandler, async () => {
    const headers = request(client => client.getNewNews("test.filter", false));
    const next = request(client =>
      client.getArticleByArticleNumber("test.filter", 2)
    );
    Assert.equal(
      (await headers).status,
      Cr.NS_OK,
      "a missing HEAD article should allow header fetching to finish"
    );
    Assert.equal(
      folder.getTotalMessages(false),
      7,
      "the missing article should be skipped"
    );
    Assert.ok(
      !folder.msgDatabase.containsKey(1),
      "the missing article should have no header"
    );
    Assert.equal(
      (await next).status,
      Cr.NS_OK,
      "the queued request should succeed"
    );
  });
});

add_task(async function test_missingGroupWithoutFolderReleasesConnection() {
  for (const command of ["LISTGROUP", "GROUP"]) {
    let rejected = false;
    class MissingGroupHandler extends NNTP_RFC2980_handler {
      [command](args) {
        if (!rejected) {
          rejected = true;
          return "411 No such newsgroup";
        }
        return super[command](args);
      }
    }
    await withServer(MissingGroupHandler, async () => {
      const failed = request(client => {
        if (command == "LISTGROUP") {
          client.listgroup("test.filter");
        } else {
          client.search("test.filter", ["XPAT subject 1-8 *"]);
        }
      });
      const next = request(client =>
        client.getArticleByArticleNumber("test.filter", 2)
      );
      Assert.equal(
        (await failed).status,
        Cr.NS_ERROR_FAILURE,
        "a missing group should fail a request without a folder"
      );
      Assert.equal(
        (await next).status,
        Cr.NS_OK,
        "the queued request should succeed after the missing-group error"
      );
    });
  }
});

add_task(async function test_failedSelectionDoesNotReusePreviousGroup() {
  let rejected = false;
  class GroupHandler extends NNTP_RFC2980_handler {
    GROUP(group) {
      if (group == "test.filter" && !rejected) {
        rejected = true;
        return "501 Group selection failed";
      }
      return super.GROUP(group);
    }
  }
  await withServer(GroupHandler, async server => {
    Assert.equal(
      (
        await request(client =>
          client.getArticleByArticleNumber("test.subscribe.simple", 1)
        )
      ).status,
      Cr.NS_OK,
      "the first group should be selected successfully"
    );
    Assert.equal(
      (
        await request(client =>
          client.getArticleByArticleNumber("test.filter", 1)
        )
      ).status,
      Cr.NS_ERROR_FAILURE,
      "the second group selection should fail"
    );
    const result = await request(client =>
      client.getArticleByArticleNumber("test.filter", 2)
    );
    Assert.equal(result.status, Cr.NS_OK, "the retried request should succeed");
    Assert.stringContains(
      result.data,
      "This is the second body post.",
      "the article should come from the second group"
    );
    Assert.deepEqual(
      server.playTransaction().them,
      [
        "MODE READER",
        "GROUP test.subscribe.simple",
        "ARTICLE 1",
        "GROUP test.filter",
        "GROUP test.filter",
        "ARTICLE 2",
      ],
      "the failed group should be selected again before fetching its article"
    );
  });
});
