"use strict";
define(function (require) {

var assert = require('assert');
var headeremitter = require('jsmime').headeremitter;
var MockDate = require('test/mock_date');

function arrayTest(data, fn) {
  fn.toString = function () {
    let text = Function.prototype.toString.call(this);
    text = text.replace(/data\[([0-9]*)\]/g, function (m, p) {
      return JSON.stringify(data[p]);
    });
    return text;
  };
  return test(JSON.stringify(data[0]), fn);
}

function testHeader(header, tests) {
  suite(header, function () {
    tests.forEach(function (data) {
      arrayTest(data, function () {
        assert.deepEqual(headeremitter.emitStructuredHeader(header,
          data[0], {softMargin: 100, useASCII: true}),
          (header + ": " + data[1]).trim() + '\r\n');
      });
    });
  });
}

suite('Structured header emitters', function () {
  // Ad-hoc header tests
  // TODO: add structured encoder tests for Content-Type when it is added.

  testHeader("Content-Transfer-Encoding", [
    ["", ""],
    ["8bit", "8bit"],
    ["invalid", "invalid"]
  ]);

  // Non-ad-hoc header tests
  let addressing_headers = ['From', 'To', 'Cc', 'Bcc', 'Sender', 'Reply-To',
    'Resent-Bcc', 'Resent-To', 'Resent-From', 'Resent-Cc', 'Resent-Sender',
    'Approved', 'Disposition-Notification-To', 'Delivered-To',
    'Return-Receipt-To', 'Resent-Reply-To', 'Mail-Reply-To', 'Mail-Followup-To'
  ];
  let address_tests = [
    [{name: "", email: ""}, ""],
    [{name: "John Doe", email: "john.doe@test.invalid"},
      "John Doe <john.doe@test.invalid>"],
    [[{name: "John Doe", email: "john.doe@test.invalid"}],
      "John Doe <john.doe@test.invalid>"],
    [{name: "undisclosed-recipients", group: []},
      "undisclosed-recipients: ;"],
  ];
  addressing_headers.forEach(function (header) {
    testHeader(header, address_tests);
  });

  let date_headers = ['Date', 'Expires', 'Injection-Date', 'NNTP-Posting-Date',
    'Resent-Date'];
  let date_tests = [
    [new MockDate("2012-09-06T08:08:21-0700"), "Thu, 6 Sep 2012 08:08:21 -0700"],
  ];
  date_headers.forEach(function (header) {
    testHeader(header, date_tests);
  });

  let unstructured_headers = ['Comments', 'Content-Description', 'Keywords',
    'Subject'];
  let unstructured_tests = [
    ["", ""],
    ["This is a subject", "This is a subject"],
    ["\u79c1\u306f\u4ef6\u540d\u5348\u524d",
      "=?UTF-8?B?56eB44Gv5Lu25ZCN5Y2I5YmN?="],
  ];
  unstructured_headers.forEach(function (header) {
    testHeader(header, unstructured_tests);
  });

  test('emitStructuredHeaders', function () {
    let headers = new Map();
    headers.set('From', [{name:'', email: 'bugzilla-daemon@mozilla.org'}]);
    headers.set('subject', ['[Bug 939557] browsercomps.dll failed to build']);
    headers.set('x-capitalization-test', ['should capitalize']);
    let str = headeremitter.emitStructuredHeaders(headers, {});
    assert.equal(str,
      'From: bugzilla-daemon@mozilla.org\r\n' +
      'Subject: [Bug 939557] browsercomps.dll failed to build\r\n'+
      'X-Capitalization-Test: should capitalize\r\n');
  });
});

});
