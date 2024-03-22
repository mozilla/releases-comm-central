/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { XMPPAccountPrototype } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-base.sys.mjs"
);
var { XMPPSession } = ChromeUtils.importESModule(
  "resource:///modules/xmpp-session.sys.mjs"
);

function SRVRecord(aPrio, aWeight, aHost, aPort) {
  this.prio = aPrio;
  this.weight = aWeight;
  this.host = aHost;
  this.port = aPort;
}

function FakeXMPPSession() {}
FakeXMPPSession.prototype = {
  __proto__: XMPPSession.prototype,
  _account: { __proto__: XMPPAccountPrototype },
  _host: null,
  _port: 0,
  connect() {},
  _connectNextRecord() {
    this.isConnectNextRecord = true;
  },

  // Used to indicate that method _connectNextRecord is called or not.
  isConnectNextRecord: false,

  LOG() {},
  WARN() {},
};

var TEST_DATA = [
  {
    // Test sorting based on priority and weight.
    input: [
      new SRVRecord(20, 0, "xmpp.instantbird.com", 5222),
      new SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new SRVRecord(10, 0, "xmpp2.instantbird.com", 5222),
      new SRVRecord(0, 0, "xmpp3.instantbird.com", 5222),
      new SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
    ],
    output: [
      new SRVRecord(0, 0, "xmpp3.instantbird.com", 5222),
      new SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new SRVRecord(10, 0, "xmpp2.instantbird.com", 5222),
      new SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
      new SRVRecord(20, 0, "xmpp.instantbird.com", 5222),
    ],
    isConnectNextRecord: true,
  },
  {
    input: [
      new SRVRecord(5, 30, "xmpp5.instantbird.com", 5222),
      new SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new SRVRecord(10, 60, "xmpp2.instantbird.com", 5222),
      new SRVRecord(5, 10, "xmpp3.instantbird.com", 5222),
      new SRVRecord(20, 10, "xmpp.instantbird.com", 5222),
      new SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
    ],
    output: [
      new SRVRecord(5, 30, "xmpp5.instantbird.com", 5222),
      new SRVRecord(5, 10, "xmpp3.instantbird.com", 5222),
      new SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new SRVRecord(10, 60, "xmpp2.instantbird.com", 5222),
      new SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
      new SRVRecord(20, 10, "xmpp.instantbird.com", 5222),
    ],
    isConnectNextRecord: true,
  },

  // Tests no SRV records are found.
  {
    input: [],
    output: [],
    isConnectNextRecord: false,
  },

  // Tests XMPP is not supported if the result is one record with target ".".
  {
    input: [new SRVRecord(5, 30, ".", 5222)],
    output: XMPPSession.prototype.SRV_ERROR_XMPP_NOT_SUPPORTED,
    isConnectNextRecord: false,
  },
  {
    input: [new SRVRecord(5, 30, "xmpp.instantbird.com", 5222)],
    output: [new SRVRecord(5, 30, "xmpp.instantbird.com", 5222)],
    isConnectNextRecord: true,
  },
];

function run_test() {
  for (const currentQuery of TEST_DATA) {
    const session = new FakeXMPPSession();
    try {
      session._handleSrvQuery(currentQuery.input);
      equal(session._srvRecords.length, currentQuery.output.length);
      for (let index = 0; index < session._srvRecords.length; index++) {
        deepEqual(session._srvRecords[index], currentQuery.output[index]);
      }
    } catch (e) {
      equal(e, currentQuery.output);
    }
    equal(session.isConnectNextRecord, currentQuery.isConnectNextRecord);
  }

  run_next_test();
}
