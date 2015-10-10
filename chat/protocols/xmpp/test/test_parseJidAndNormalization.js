/* Any copyright is dedicated to the Public Domain.
* http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource://gre/modules/Services.jsm");

var xmpp = {};
Services.scriptloader.loadSubScript("resource:///components/xmpp.js", xmpp);

var TEST_DATA = {
  "abdelrhman@instantbird": {
    node: "abdelrhman",
    domain: "instantbird",
    jid: "abdelrhman@instantbird",
    normalized: "abdelrhman@instantbird"
  },
  " room@instantbird/abdelrhman ": {
    node: "room",
    domain: "instantbird",
    resource: "abdelrhman",
    jid: "room@instantbird/abdelrhman",
    normalized: "room@instantbird"
  },
  "room@instantbird/@bdelrhman": {
    node: "room",
    domain: "instantbird",
    resource: "@bdelrhman",
    jid: "room@instantbird/@bdelrhman",
    normalized: "room@instantbird"
  },
  "room@instantbird/abdelrhm\u0061\u0308n": {
    node: "room",
    domain: "instantbird",
    resource: "abdelrhm\u0061\u0308n",
    jid: "room@instantbird/abdelrhm\u0061\u0308n",
    normalized: "room@instantbird"
  },
  "Room@Instantbird/Abdelrhman": {
    node: "room",
    domain: "instantbird",
    resource: "Abdelrhman",
    jid: "room@instantbird/Abdelrhman",
    normalized: "room@instantbird"
  },
  "Abdelrhman@instantbird/Instant bird": {
    node: "abdelrhman",
    domain: "instantbird",
    resource: "Instant bird",
    jid: "abdelrhman@instantbird/Instant bird",
    normalized: "abdelrhman@instantbird"
  },
  "abdelrhman@host/instant/Bird": {
    node: "abdelrhman",
    domain: "host",
    resource: "instant/Bird",
    jid: "abdelrhman@host/instant/Bird",
    normalized: "abdelrhman@host"
  },
  "instantbird": {
    domain: "instantbird",
    jid: "instantbird",
    normalized: "instantbird"
  }
};

function testParseJID() {
  for (let currentJID in TEST_DATA) {
    let jid = xmpp.XMPPAccount.prototype._parseJID(currentJID);
    equal(jid.node, TEST_DATA[currentJID].node);
    equal(jid.domain, TEST_DATA[currentJID].domain);
    equal(jid.resource, TEST_DATA[currentJID].resource);
    equal(jid.jid, TEST_DATA[currentJID].jid);
  }

  run_next_test();
}

function testNormalize() {
  for (let currentJID in TEST_DATA)
    equal(xmpp.XMPPAccount.prototype.normalize(currentJID), TEST_DATA[currentJID].normalized);

  run_next_test();
}

function testNormalizeFullJid() {
  for (let currentJID in TEST_DATA)
    equal(xmpp.XMPPAccount.prototype.normalizeFullJid(currentJID), TEST_DATA[currentJID].jid);

  run_next_test();
}

function run_test() {
  add_test(testParseJID);
  add_test(testNormalize);
  add_test(testNormalizeFullJid);

  run_next_test();
}
