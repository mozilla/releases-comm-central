/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

/**
 * @type {EwsServer}
 */
var ewsServer;
/**
 * @type {nsIMsgIncomingServer}
 */
var incomingEwsServer;
/**
 * @type {GraphServer}
 */
var graphServer;
/**
 * @type {nsIMsgIncomingServer}
 */
var incomingGraphServer;
/**
 * @type {IExchangeClient}
 */
var ewsClient;
/**
 * @type {IExchangeClient}
 */
var graphClient;

add_setup(async () => {
  [ewsServer, incomingEwsServer] = setupBasicEwsTestServer({});
  [graphServer, incomingGraphServer] = setupBasicGraphTestServer();

  await syncFolder(incomingEwsServer, incomingEwsServer.rootFolder);
  await syncFolder(incomingGraphServer, incomingGraphServer.rootFolder);

  ewsClient = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
    Ci.IExchangeClient
  );
  ewsClient.initialize(
    incomingEwsServer.getStringValue("ews_url"),
    incomingEwsServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );

  graphClient = Cc["@mozilla.org/messenger/graph-client;1"].createInstance(
    Ci.IExchangeClient
  );
  graphClient.initialize(
    incomingGraphServer.getStringValue("ews_url"),
    incomingGraphServer,
    false,
    "",
    "",
    "",
    "",
    ""
  );
});

add_task(async function test_getEwsMessage() {
  await getMessageTest(ewsServer, ewsClient, incomingEwsServer);
});

add_task(async function test_getGraphMessage() {
  await getMessageTest(graphServer, graphClient, incomingGraphServer);
});

async function getMessageTest(mockServer, client, incomingServer) {
  const generator = new MessageGenerator();
  const messages = generator.makeMessages({ count: 2 });
  mockServer.addMessages("inbox", messages);

  const inboxFolder = incomingServer.rootFolder.getChildNamed("Inbox");

  await syncFolder(incomingServer, inboxFolder);

  Assert.equal(
    inboxFolder.getTotalMessages(false),
    2,
    "Inbox should have two messages."
  );

  for (let i = 0; i < 2; i++) {
    const first = [...inboxFolder.messages][i];
    const listener = new MessageFetchListener();
    client.getMessage(listener, first.getStringProperty("ewsId"));
    const data = await listener.promise;
    Assert.equal(data, messages[i].toMessageString());
  }
}

class MessageFetchListener {
  QueryInterface = ChromeUtils.generateQI(["IExchangeMessageFetchListener"]);

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this.scriptableStream = Cc[
      "@mozilla.org/scriptableinputstream;1"
    ].createInstance(Ci.nsIScriptableInputStream);
  }

  onFetchStart() {}

  onFetchedDataAvailable(inputStream) {
    const count = inputStream.available();
    this.scriptableStream.init(inputStream);
    this._data = this.scriptableStream.read(count);
  }

  onFetchStop(status) {
    if (status == Cr.NS_OK) {
      this._resolve(this._data);
    } else {
      this._reject(status);
    }
  }
}
