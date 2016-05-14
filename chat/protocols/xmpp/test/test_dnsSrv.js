/* Any copyright is dedicated to the Public Domain.
* http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");

var dns = {};
Services.scriptloader.loadSubScript("resource:///modules/DNS.jsm", dns);

var xmpp = {};
Services.scriptloader.loadSubScript("resource:///components/xmpp.js", xmpp);

var xmppSession = {};
Services.scriptloader.loadSubScript("resource:///modules/xmpp-session.jsm",
                                    xmppSession);

function FakeXMPPSession() {}
FakeXMPPSession.prototype = {
  __proto__: xmppSession.XMPPSession.prototype,
  _account: { __proto__: xmpp.XMPPAccount.prototype },
  _host: null,
  _port: 0,
  connect: function(aHostOrigin, aPortOrigin, aSecurity, aProxy,
                    aHost = aHostOrigin, aPort = aPortOrigin) {},
  _connectNextRecord: function() { this.isConnectNextRecord = true; },

  // Used to indicate that method _connectNextRecord is called or not.
  isConnectNextRecord: false,

  LOG: function(aMsg) {},
  WARN: function(aMsg) {},
};

var TEST_DATA = [
  {
    // Test sorting based on priority and weight.
    input: [
      new dns.SRVRecord(20, 0, "xmpp.instantbird.com", 5222),
      new dns.SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new dns.SRVRecord(10, 0, "xmpp2.instantbird.com", 5222),
      new dns.SRVRecord(0, 0, "xmpp3.instantbird.com", 5222),
      new dns.SRVRecord(15, 0, "xmpp4.instantbird.com", 5222)
    ],
    output: [
      new dns.SRVRecord(0, 0, "xmpp3.instantbird.com", 5222),
      new dns.SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new dns.SRVRecord(10, 0, "xmpp2.instantbird.com", 5222),
      new dns.SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
      new dns.SRVRecord(20, 0, "xmpp.instantbird.com", 5222)
    ],
    isConnectNextRecord: true
  },
  {
    input: [
      new dns.SRVRecord(5, 30, "xmpp5.instantbird.com", 5222),
      new dns.SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new dns.SRVRecord(10, 60, "xmpp2.instantbird.com", 5222),
      new dns.SRVRecord(5, 10, "xmpp3.instantbird.com", 5222),
      new dns.SRVRecord(20, 10, "xmpp.instantbird.com", 5222),
      new dns.SRVRecord(15, 0, "xmpp4.instantbird.com", 5222)
    ],
    output: [
      new dns.SRVRecord(5, 30, "xmpp5.instantbird.com", 5222),
      new dns.SRVRecord(5, 10, "xmpp3.instantbird.com", 5222),
      new dns.SRVRecord(5, 0, "xmpp1.instantbird.com", 5222),
      new dns.SRVRecord(10, 60, "xmpp2.instantbird.com", 5222),
      new dns.SRVRecord(15, 0, "xmpp4.instantbird.com", 5222),
      new dns.SRVRecord(20,10, "xmpp.instantbird.com", 5222)
    ],
    isConnectNextRecord: true
  },

  // Tests no SRV records are found.
  {
    input: [],
    output: [],
    isConnectNextRecord: false
  },

  // Tests XMPP is not supported if the result is one record with target ".".
  {
    input: [
      new dns.SRVRecord(5, 30, ".", 5222)
    ],
    output: xmppSession.XMPPSession.prototype.SRV_ERROR_XMPP_NOT_SUPPORTED,
    isConnectNextRecord: false
  },
  {
    input: [
      new dns.SRVRecord(5, 30, "xmpp.instantbird.com", 5222)
    ],
    output: [
      new dns.SRVRecord(5, 30, "xmpp.instantbird.com", 5222)
    ],
    isConnectNextRecord: true
  },

  // Tests error happened during SRV lookup.
  {
    input: -1,
    output: xmppSession.XMPPSession.prototype.SRV_ERROR_LOOKUP_FAILED,
    isConnectNextRecord: false
  }
];

function run_test() {
  for (let currentQuery of TEST_DATA) {
    let session = new FakeXMPPSession();
    try {
      session._handleSrvQuery(currentQuery.input);
      equal(session._srvRecords.length, currentQuery.output.length);
      for (let index = 0; index < session._srvRecords.length; index++)
        deepEqual(session._srvRecords[index], currentQuery.output[index]);
    } catch (e) {
      equal(e, currentQuery.output);
    }
    equal(session.isConnectNextRecord, currentQuery.isConnectNextRecord);
  }

  run_next_test();
}
