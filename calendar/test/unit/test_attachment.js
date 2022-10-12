/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAttachment: "resource:///modules/CalAttachment.jsm",
  CalEvent: "resource:///modules/CalEvent.jsm",
});

function run_test() {
  test_serialize();
  test_hashes();
  test_uriattach();
  test_binaryattach();
}

function test_hashes() {
  let attach = new CalAttachment();

  attach.rawData = "hello";
  let hash1 = attach.hashId;

  attach.rawData = "world";
  notEqual(hash1, attach.hashId);

  attach.rawData = "hello";
  equal(hash1, attach.hashId);

  // Setting raw data should give us a BINARY attachment
  equal(attach.getParameter("VALUE"), "BINARY");

  attach.uri = Services.io.newURI("http://hello");

  // Setting an uri should delete the value parameter
  equal(attach.getParameter("VALUE"), null);
}

function test_uriattach() {
  let attach = new CalAttachment();

  // Attempt to set a property and check its values
  let e = new CalEvent();
  // eslint-disable-next-line no-useless-concat
  e.icalString = "BEGIN:VEVENT\r\n" + "ATTACH;FMTTYPE=x-moz/test:http://hello\r\n" + "END:VEVENT";
  let prop = e.icalComponent.getFirstProperty("ATTACH");
  attach.icalProperty = prop;

  notEqual(attach.getParameter("VALUE"), "BINARY");
  equal(attach.formatType, "x-moz/test");
  equal(attach.getParameter("FMTTYPE"), "x-moz/test");
  equal(attach.uri.spec, Services.io.newURI("http://hello").spec);
  equal(attach.rawData, "http://hello");
}

function test_binaryattach() {
  let attach = new CalAttachment();
  let e = new CalEvent();

  let attachString =
    "ATTACH;ENCODING=BASE64;FMTTYPE=x-moz/test2;VALUE=BINARY:aHR0cDovL2hlbGxvMg==\r\n";
  let icalString = "BEGIN:VEVENT\r\n" + attachString + "END:VEVENT";
  e.icalString = icalString;
  let prop = e.icalComponent.getFirstProperty("ATTACH");
  attach.icalProperty = prop;

  equal(attach.formatType, "x-moz/test2");
  equal(attach.getParameter("FMTTYPE"), "x-moz/test2");
  equal(attach.encoding, "BASE64");
  equal(attach.getParameter("ENCODING"), "BASE64");
  equal(attach.uri, null);
  equal(attach.rawData, "aHR0cDovL2hlbGxvMg==");
  equal(attach.getParameter("VALUE"), "BINARY");

  let propIcalString = attach.icalProperty.icalString;
  ok(!!propIcalString.match(/ENCODING=BASE64/));
  ok(!!propIcalString.match(/FMTTYPE=x-moz\/test2/));
  ok(!!propIcalString.match(/VALUE=BINARY/));
  ok(!!propIcalString.replace("\r\n ", "").match(/:aHR0cDovL2hlbGxvMg==/));

  propIcalString = attach.clone().icalProperty.icalString;

  ok(!!propIcalString.match(/ENCODING=BASE64/));
  ok(!!propIcalString.match(/FMTTYPE=x-moz\/test2/));
  ok(!!propIcalString.match(/VALUE=BINARY/));
  ok(!!propIcalString.replace("\r\n ", "").match(/:aHR0cDovL2hlbGxvMg==/));
}

function test_serialize() {
  let attach = new CalAttachment();
  attach.formatType = "x-moz/test2";
  attach.uri = Services.io.newURI("data:text/plain,");
  equal(attach.icalString, "ATTACH;FMTTYPE=x-moz/test2:data:text/plain,\r\n");

  attach = new CalAttachment();
  attach.encoding = "BASE64";
  attach.uri = Services.io.newURI("data:text/plain,");
  equal(attach.icalString, "ATTACH;ENCODING=BASE64:data:text/plain,\r\n");

  throws(() => {
    attach.icalString = "X-STICKER:smiley";
  }, /Illegal value/);

  attach = new CalAttachment();
  attach.uri = Services.io.newURI("data:text/plain,");
  attach.setParameter("X-PROP", "VAL");
  equal(attach.icalString, "ATTACH;X-PROP=VAL:data:text/plain,\r\n");
  attach.setParameter("X-PROP", null);
  equal(attach.icalString, "ATTACH:data:text/plain,\r\n");
}
