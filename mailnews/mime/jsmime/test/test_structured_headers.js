"use strict";
define(function (require) {

var assert = require('assert');
var headerparser = require('jsmime').headerparser;

function smartDeepEqual(actual, expected) {
  assert.deepEqual(actual, expected);
  if (actual instanceof Map && expected instanceof Map) {
    assert.deepEqual([x for (x of actual.entries())],
      [y for (y of expected.entries())]);
  }
}

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(data[0], fn);
}

function testHeader(header, tests) {
  suite(header, function () {
    tests.forEach(function (data) {
      arrayTest(data, function () {
        smartDeepEqual(headerparser.parseStructuredHeader(header,
          data[0]), data[1]);
      });
    });
  });
}

function makeCT(media, sub, params) {
  var object = new Map();
  object.mediatype = media;
  object.subtype = sub;
  object.type = media + "/" + sub;
  for (let k in params)
    object.set(k, params[k]);
  return object;
}
suite('Structured headers', function () {
  // Ad-hoc header tests
  testHeader('Content-Type', [
    ['text/plain', makeCT("text", "plain", {})],
    ['text/html', makeCT("text", "html", {})],
    ['text/plain; charset="UTF-8"',
      makeCT("text", "plain", {charset: "UTF-8"})],
    ['text/', makeCT("text", "", {})],
    ['text', makeCT("text", "plain", {})],
    ['image/', makeCT("image", "", {})],
    ['image', makeCT("text", "plain", {})],
    ['hacker/x-mailnews', makeCT("hacker", "x-mailnews", {})],
    ['hacker/x-mailnews;', makeCT("hacker", "x-mailnews", {})],
    ['HACKER/X-MAILNEWS', makeCT("hacker", "x-mailnews", {})],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      makeCT("application",
      "vnd.openxmlformats-officedocument.spreadsheetml.sheet", {})],
    ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;\r' +
      '\n name="Presentation.pptx"',
      makeCT("application",
      "vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      {name: "Presentation.pptx"})],
    ['', makeCT("text", "plain", {})],
    ['                                        ', makeCT("text", "plain", {})],
    ['text/plain; c', makeCT("text", "plain", {})],
    ['text/plain; charset=', makeCT("text", "plain", {charset: ""})],
    ['text/plain; charset="', makeCT("text", "plain", {charset: ""})],
    ['text\\/enriched', makeCT("text\\", "enriched", {})],
    ['multipart/mixed ";" wtf=stupid', makeCT("multipart", "mixed", {})],
    ['multipart/mixed; wtf=stupid',
      makeCT("multipart", "mixed", {wtf: "stupid"})],
    ['text/plain; CHARSET=Big5', makeCT("text", "plain", {charset: "Big5"})],
    ['text/html; CHARSET="Big5"', makeCT("text", "html", {charset: "Big5"})],
    ['text/html; CHARSET="Big5', makeCT("text", "html", {charset: "Big5"})],
    [['text/html', 'multipart/mixed'], makeCT("text", "html", {})],
  ]);
  testHeader('Content-Transfer-Encoding', [
    ['', ''],
    ['8bit', '8bit'],
    ['8BIT', '8bit'],
    ['QuOtEd-PrInTaBlE', 'quoted-printable'],
    ['Base64', 'base64'],
    ['7bit', '7bit'],
    [['7bit', '8bit'], '7bit'],
    ['x-uuencode', 'x-uuencode']
  ]);

  // Non-ad-hoc header tests
  let addressing_headers = ['From', 'To', 'Cc', 'Bcc', 'Sender', 'Reply-To',
    'Resent-Bcc', 'Resent-To', 'Resent-From', 'Resent-Cc', 'Resent-Sender',
    'Approved', 'Disposition-Notification-To', 'Delivered-To',
    'Return-Receipt-To', 'Resent-Reply-To', 'Mail-Reply-To', 'Mail-Followup-To'
  ];
  let address_tests = [
    ["", []],
    ["a@example.invalid", [{name: "", email: "a@example.invalid"}]],
    ["John Doe <a@example.invalid>",
      [{name: "John Doe", email: "a@example.invalid"}]],
    ["John Doe <A@EXAMPLE.INVALID>",
      [{name: "John Doe", email: "A@EXAMPLE.INVALID"}]],
    ["=?UTF-8?B?5bGx55Sw5aSq6YOO?= <a@example.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@example.invalid"}]],
    ["undisclosed-recipients:;", [{name: "undisclosed-recipients", group: []}]],
    ["world: a@example.invalid, b@example.invalid;",
      [{name: "world", group: [
        {name: "", email: "a@example.invalid"},
        {name: "", email: "b@example.invalid"}
      ]}]],
    // TODO when we support IDN:
    // This should be \u4f8b.invalid instead (Japanese kanji for "example")
    ["\u5c71\u7530\u592a\u90ce <a@xn--fsq.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@xn--fsq.invalid"}]],
    ["\u5c71\u7530\u592a\u90ce <a@\u4f8b.invalid>",
      [{name: "\u5c71\u7530\u592a\u90ce", email: "a@\u4f8b.invalid"}]],
    ["\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb@\u4f8b.invalid",
      [{name: "", email:
         "\u30b1\u30c4\u30a1\u30eb\u30b3\u30a2\u30c8\u30eb@\u4f8b.invalid"}]],
    [["a@example.invalid", "b@example.invalid"],
      [{name: "", email: "a@example.invalid"},
       {name: "", email: "b@example.invalid"}]],
  ];
  addressing_headers.forEach(function (header) {
    testHeader(header, address_tests);
  });

  let date_headers = ['Date', 'Expires', 'Injection-Date', 'NNTP-Posting-Date',
    'Resent-Date'];
  let date_tests = [
    ["Thu, 06 Sep 2012 08:08:21 -0700", new Date("2012-09-06T08:08:21-0700")],
    ["This is so not a date", new Date(NaN)],
  ];
  date_headers.forEach(function (header) {
    testHeader(header, date_tests);
  });

  let multiple_unstructured_headers = ['In-Reply-To', 'References'];
  let multiple_unstructured_tests = [
    ["<asdasdasd@asdasdasd.com>", "<asdasdasd@asdasdasd.com>"],
    ["<asd@asd.com> <asdf@asdf.com>", "<asd@asd.com> <asdf@asdf.com>"],

    // This test is needed for clients sending non-compliant headers, see bug 1154521
    ["<asd@asd.com>,<asdf@asdf.com>,<asdfg@asdfg.com>", "<asd@asd.com> <asdf@asdf.com> <asdfg@asdfg.com>"],
    // Test for bug 1197686
    ["<asd@asd.com><asdf@asdf.com><asdfg@asdfg.com>", "<asd@asd.com> <asdf@asdf.com> <asdfg@asdfg.com>"],
  ];
  multiple_unstructured_headers.forEach(function (header) {
    testHeader(header, multiple_unstructured_tests);
  });

  let unstructured_headers = ['Comments', 'Content-Description', 'Keywords',
    'Subject'];
  let unstructured_tests = [
    ["", ""],
    ["This is a subject", "This is a subject"],
    [["Subject 1", "Subject 2"], "Subject 1"],
    ["=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?=",
      "\u79c1\u306f\u4ef6\u540d\u5348\u524d"],
  ];
  unstructured_headers.forEach(function (header) {
    testHeader(header, unstructured_tests);
  });
});

});
