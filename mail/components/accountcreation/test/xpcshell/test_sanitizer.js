/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
);

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

/**
 * Array of test value for each of the sanitizers. The value key hold the input
 * to the sanitizer. The key with the name of the sanitizer function holds the
 * expected result. If the result value is an object with a "throws" key, the
 * sanitizer is instead expected to throw a MalformedException with the given
 * string from the stringbundle as message.
 *
 * Generally this covers all the sanitizer methods taking a single argument,
 * the others have custom tests to account for the extra arguments explicitly.
 *
 * @type {object[]}
 */
const CASES = [
  {
    value: 0,
    integer: 0,
    boolean: { throws: "boolean-error" },
    string: "0",
    nonemptystring: { throws: "string-empty-error" },
    alphanumdash: { throws: "string-empty-error" },
    hostname: { throws: "string-empty-error" },
    emailAddress: { throws: "string-empty-error" },
    url: { throws: "url-scheme-error" },
    label: "0",
  },
  {
    value: 1,
    integer: 1,
    boolean: { throws: "boolean-error" },
    string: "1",
    nonemptystring: "1",
    alphanumdash: "1",
    hostname: "1",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "1",
  },
  {
    value: -1,
    integer: -1,
    boolean: { throws: "boolean-error" },
    string: "-1",
    nonemptystring: "-1",
    alphanumdash: "-1",
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "-1",
  },
  {
    value: "0",
    integer: 0,
    boolean: { throws: "boolean-error" },
    string: "0",
    nonemptystring: "0",
    alphanumdash: "0",
    hostname: "0",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "0",
  },
  {
    value: Number.MAX_SAFE_INTEGER,
    integer: Number.MAX_SAFE_INTEGER,
    boolean: { throws: "boolean-error" },
    string: String(Number.MAX_SAFE_INTEGER),
    nonemptystring: String(Number.MAX_SAFE_INTEGER),
    alphanumdash: String(Number.MAX_SAFE_INTEGER),
    hostname: String(Number.MAX_SAFE_INTEGER),
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String(Number.MAX_SAFE_INTEGER),
  },
  {
    value: Number.POSITIVE_INFINITY,
    integer: Number.POSITIVE_INFINITY,
    boolean: { throws: "boolean-error" },
    string: "Infinity",
    nonemptystring: "Infinity",
    alphanumdash: "Infinity",
    hostname: "infinity",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "Infinity",
  },
  {
    value: Math.PI,
    integer: 3,
    boolean: { throws: "boolean-error" },
    string: String(Math.PI),
    nonemptystring: String(Math.PI),
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: String(Math.PI),
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String(Math.PI),
  },
  {
    value: 1.5,
    integer: 1,
    boolean: { throws: "boolean-error" },
    string: "1.5",
    nonemptystring: "1.5",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "1.5",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "1.5",
  },
  {
    value: 0.99999999999,
    integer: 0,
    boolean: { throws: "boolean-error" },
    string: "0.99999999999",
    nonemptystring: "0.99999999999",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "0.99999999999",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "0.99999999999",
  },
  {
    value: -2.99999999999,
    integer: -2,
    boolean: { throws: "boolean-error" },
    string: "-2.99999999999",
    nonemptystring: "-2.99999999999",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "-2.99999999999",
  },
  {
    value: Number.NaN,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String(Number.NaN),
    nonemptystring: { throws: "string-empty-error" },
    alphanumdash: { throws: "string-empty-error" },
    hostname: { throws: "string-empty-error" },
    emailAddress: { throws: "string-empty-error" },
    url: { throws: "url-scheme-error" },
    label: String(Number.NaN),
  },
  {
    value: "asdf",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "asdf",
    nonemptystring: "asdf",
    alphanumdash: "asdf",
    hostname: "asdf",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "asdf",
  },
  {
    value: "true",
    integer: { throws: "no-number-error" },
    boolean: true,
    string: "true",
    nonemptystring: "true",
    alphanumdash: "true",
    hostname: "true",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "true",
  },
  {
    value: "false",
    integer: { throws: "no-number-error" },
    boolean: false,
    string: "false",
    nonemptystring: "false",
    alphanumdash: "false",
    hostname: "false",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "false",
  },
  {
    value: true,
    integer: { throws: "no-number-error" },
    boolean: true,
    string: "true",
    nonemptystring: "true",
    alphanumdash: "true",
    hostname: "true",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "true",
  },
  {
    value: false,
    integer: { throws: "no-number-error" },
    boolean: false,
    string: "false",
    nonemptystring: { throws: "string-empty-error" },
    alphanumdash: { throws: "string-empty-error" },
    hostname: { throws: "string-empty-error" },
    emailAddress: { throws: "string-empty-error" },
    url: { throws: "url-scheme-error" },
    label: "false",
  },
  {
    value: null,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "null",
    nonemptystring: { throws: "string-empty-error" },
    alphanumdash: { throws: "string-empty-error" },
    hostname: { throws: "string-empty-error" },
    emailAddress: { throws: "string-empty-error" },
    url: { throws: "url-scheme-error" },
    label: "null",
  },
  {
    value: undefined,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "undefined",
    nonemptystring: { throws: "string-empty-error" },
    alphanumdash: { throws: "string-empty-error" },
    hostname: { throws: "string-empty-error" },
    emailAddress: { throws: "string-empty-error" },
    url: { throws: "url-scheme-error" },
    label: "undefined",
  },
  {
    value: {},
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String({}),
    nonemptystring: String({}),
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String({}),
  },
  {
    value: [],
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String([]),
    nonemptystring: String([]),
    alphanumdash: String([]),
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String([]),
  },
  {
    value: Sanitizer,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String(Sanitizer),
    nonemptystring: String(Sanitizer),
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String(Sanitizer),
  },
  {
    value: Sanitizer.integer,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String(Sanitizer.integer),
    nonemptystring: String(Sanitizer.integer),
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String(Sanitizer.integer),
  },
  {
    value: AccountCreationUtils.NotReached,
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: String(AccountCreationUtils.NotReached),
    nonemptystring: String(AccountCreationUtils.NotReached),
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: String(AccountCreationUtils.NotReached),
  },
  {
    value: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    nonemptystring:
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    alphanumdash:
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_",
  },
  {
    value: "Just a sentence, nothing to see here!",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "Just a sentence, nothing to see here!",
    nonemptystring: "Just a sentence, nothing to see here!",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "Just a sentence, nothing to see here!",
  },
  {
    value: "example.com",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "example.com",
    nonemptystring: "example.com",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "example.com",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "example.com",
  },
  {
    value: "sub-domain.example.com",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "sub-domain.example.com",
    nonemptystring: "sub-domain.example.com",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "sub-domain.example.com",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "sub-domain.example.com",
  },
  {
    value: "192.168.1.1",
    integer: 192,
    boolean: { throws: "boolean-error" },
    string: "192.168.1.1",
    nonemptystring: "192.168.1.1",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "192.168.1.1",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "192.168.1.1",
  },
  {
    value: "[::1]",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "[::1]",
    nonemptystring: "[::1]",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "[::1]",
  },
  {
    value: "[2001:db8::]",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "[2001:db8::]",
    nonemptystring: "[2001:db8::]",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "[2001:db8::]",
  },
  {
    value: "[2001:db8:ffff:ffff:ffff:ffff:ffff:ffff]",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "[2001:db8:ffff:ffff:ffff:ffff:ffff:ffff]",
    nonemptystring: "[2001:db8:ffff:ffff:ffff:ffff:ffff:ffff]",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "[2001:db8:ffff:ffff:ffff:ffff:ffff:ffff]",
  },
  {
    value: "::1",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "::1",
    nonemptystring: "::1",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "::1",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "::1",
  },
  {
    value: "2001:db8::",
    integer: 2001,
    boolean: { throws: "boolean-error" },
    string: "2001:db8::",
    nonemptystring: "2001:db8::",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "2001:db8::",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "2001:db8::",
  },
  {
    value: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    integer: 2001,
    boolean: { throws: "boolean-error" },
    string: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    nonemptystring: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
  },
  {
    value: "localhost",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "localhost",
    nonemptystring: "localhost",
    alphanumdash: "localhost",
    hostname: "localhost",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "localhost",
  },
  {
    value: "test.local",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "test.local",
    nonemptystring: "test.local",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "test.local",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "test.local",
  },
  {
    value: "LOUD.LOCAL",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "LOUD.LOCAL",
    nonemptystring: "LOUD.LOCAL",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: "loud.local",
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "LOUD.LOCAL",
  },
  {
    value: "test@example.com",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "test@example.com",
    nonemptystring: "test@example.com",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: "test@example.com",
    url: { throws: "url-scheme-error" },
    label: "test@example.com",
  },
  {
    value: "more.involved-addr355@test.local",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "more.involved-addr355@test.local",
    nonemptystring: "more.involved-addr355@test.local",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: "more.involved-addr355@test.local",
    url: { throws: "url-scheme-error" },
    label: "more.involved-addr355@test.local",
  },
  {
    value: "incompletehost@localhost",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "incompletehost@localhost",
    nonemptystring: "incompletehost@localhost",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "incompletehost@localhost",
  },
  {
    value: "data:text/javascript;alert('gotem');",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:text/javascript;alert('gotem');",
    nonemptystring: "data:text/javascript;alert('gotem');",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "data:text/javascript;alert('gotem');",
  },
  {
    value: "data:application/javascript;alert('xsrf');",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:application/javascript;alert('xsrf');",
    nonemptystring: "data:application/javascript;alert('xsrf');",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "data:application/javascript;alert('xsrf');",
  },
  {
    value: "data:text/html;<!DOCTYPE html>",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:text/html;<!DOCTYPE html>",
    nonemptystring: "data:text/html;<!DOCTYPE html>",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "data:text/html;<!DOCTYPE html>",
  },
  {
    value: "data:image/png;base64Stuff==",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:image/png;base64Stuff==",
    nonemptystring: "data:image/png;base64Stuff==",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "data:image/png;base64Stuff==",
    label: "data:image/png;base64Stuff==",
  },
  {
    value: "data:image/jpeg;base64Stuff==",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:image/jpeg;base64Stuff==",
    nonemptystring: "data:image/jpeg;base64Stuff==",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "data:image/jpeg;base64Stuff==",
    label: "data:image/jpeg;base64Stuff==",
  },
  {
    value: "data:image/svg;<svg></svg>",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "data:image/svg;<svg></svg>",
    nonemptystring: "data:image/svg;<svg></svg>",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "data:image/svg;<svg></svg>",
  },
  {
    value: "imap://notaweburi",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "imap://notaweburi",
    nonemptystring: "imap://notaweburi",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-scheme-error" },
    label: "imap://notaweburi",
  },
  {
    value: "https://example.com",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "https://example.com",
    nonemptystring: "https://example.com",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "https://example.com/",
    label: "https://example.com",
  },
  {
    value: "http://example.com",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "http://example.com",
    nonemptystring: "http://example.com",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "http://example.com/",
    label: "http://example.com",
  },
  {
    value: "https:////example.com/",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "https:////example.com/",
    nonemptystring: "https:////example.com/",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "https://example.com/",
    label: "https:////example.com/",
  },
  {
    value: "https://unparsable::",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "https://unparsable::",
    nonemptystring: "https://unparsable::",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: { throws: "url-parsing-error" },
    label: "https://unparsable::",
  },
  {
    value: "https://example.com:9999/some/path?with=query#andhash",
    integer: { throws: "no-number-error" },
    boolean: { throws: "boolean-error" },
    string: "https://example.com:9999/some/path?with=query#andhash",
    nonemptystring: "https://example.com:9999/some/path?with=query#andhash",
    alphanumdash: { throws: "alphanumdash-error" },
    hostname: { throws: "hostname-syntax-error" },
    emailAddress: { throws: "emailaddress-syntax-error" },
    url: "https://example.com:9999/some/path?with=query#andhash",
    label: "https://example.com:9999/some/path?with=query#andhash",
  },
];

const ERROR_STRINGS = new Localization([
  "messenger/accountcreation/accountCreation.ftl",
]);

/**
 * Assert that a call to a sanitizer method throws a MalformedException.
 *
 * @param {string} sanitizerMethod - The sanitizer method that should throw.
 * @param {any[]} args - The arguments to pass to the sanitizer method for it to throw.
 * @param {string} errorMessage - The string ID for the expected error message.
 */
async function subtestThrowsMalformedException(
  sanitizerMethod,
  args,
  errorMessage
) {
  const message = await ERROR_STRINGS.formatValue(errorMessage);
  Assert.throws(
    () => Sanitizer[sanitizerMethod](...args),
    error => Error.isError(error) && error.message.startsWith(message),
    `Sanitizer.${sanitizerMethod} should throw ${errorMessage} with ${JSON.stringify(args)}`
  );
}

/**
 * Test the values from the cases array against a specific sanitizer method.
 * Also ensures an expected value is provided for the requested method.
 *
 * @param {string} sanitizerMethod - The name of the sanitizer method to test.
 */
async function subtestSanitizer(sanitizerMethod) {
  for (const scenario of CASES) {
    Assert.ok(
      scenario.hasOwnProperty(sanitizerMethod),
      `${scenario.value} should have a result for ${sanitizerMethod}`
    );
    const expected = scenario[sanitizerMethod];
    if (expected?.throws) {
      await subtestThrowsMalformedException(
        sanitizerMethod,
        [scenario.value],
        expected.throws
      );
    } else {
      Assert.strictEqual(
        Sanitizer[sanitizerMethod](scenario.value),
        expected,
        `Sanitizer.${sanitizerMethod} should sanitize the value "${scenario.value}"`
      );
    }
  }
}

add_task(async function test_integer() {
  await subtestSanitizer("integer");
});

add_task(async function test_integerRange() {
  await subtestThrowsMalformedException(
    "integerRange",
    [NaN, 1, 100],
    "no-number-error"
  );
  await subtestThrowsMalformedException(
    "integerRange",
    [Number.MAX_SAFE_INTEGER, 1, 100],
    "number-too-large-error"
  );
  await subtestThrowsMalformedException(
    "integerRange",
    [0, 1, 100],
    "number-too-small-error"
  );
  await subtestThrowsMalformedException(
    "integerRange",
    [100, 0, 1],
    "number-too-large-error"
  );
  await subtestThrowsMalformedException(
    "integerRange",
    [Number.MAX_SAFE_INTEGER, 1, 100],
    "number-too-large-error"
  );
  await subtestThrowsMalformedException(
    "integerRange",
    [Number.POSITIVE_INFINITY, 1, Number.MAX_SAFE_INTEGER],
    "number-too-large-error"
  );

  Assert.strictEqual(
    Sanitizer.integerRange(10, 0, 100),
    10,
    "Should get sanitized value back"
  );
  Assert.strictEqual(
    Sanitizer.integerRange(1.5, 0, 100),
    1,
    "Should get truncated value back"
  );
});

add_task(async function test_boolean() {
  await subtestSanitizer("boolean");
});

add_task(async function test_string() {
  await subtestSanitizer("string");
});

add_task(async function test_nonemptystring() {
  await subtestSanitizer("nonemptystring");
});

add_task(async function test_alphanumdash() {
  await subtestSanitizer("alphanumdash");
});

add_task(async function test_hostname() {
  await subtestSanitizer("hostname");
});

add_task(async function test_emailAddress() {
  await subtestSanitizer("emailAddress");
});

add_task(async function test_url() {
  await subtestSanitizer("url");
});

add_task(async function test_label() {
  await subtestSanitizer("label");
});

add_task(async function test_enum() {
  const values = [0, 1, 2, 42, 67];
  for (const value of values) {
    Assert.strictEqual(
      Sanitizer.enum(value, values),
      value,
      `Should validate ${value} for given enum`
    );
    Assert.strictEqual(
      Sanitizer.enum(value.toString(), values),
      value,
      `Should validate ${value} as string for given enum`
    );
  }
  Assert.strictEqual(
    Sanitizer.enum(-1, values, 0),
    0,
    "Should get default value with unknown value"
  );

  await subtestThrowsMalformedException(
    "enum",
    [-1, values],
    "allowed-value-error"
  );

  await subtestThrowsMalformedException(
    "enum",
    ["foo", values],
    "allowed-value-error"
  );

  await subtestThrowsMalformedException(
    "enum",
    [undefined, values, undefined],
    "allowed-value-error"
  );
});

add_task(async function test_translate() {
  const mapping = {
    0: "none",
    1: "one",
    2: "two",
    foo: "bar",
  };
  for (const [input, output] of Object.entries(mapping)) {
    Assert.strictEqual(
      Sanitizer.translate(input, mapping),
      output,
      `Should validate ${input} for given map`
    );
    Assert.strictEqual(
      Sanitizer.translate(input.toString(), mapping),
      output,
      `Should validate ${input} as string for given map`
    );
  }

  Assert.strictEqual(
    Sanitizer.translate(-1, mapping, "default"),
    "default",
    "Should get default value with unknown value"
  );

  await subtestThrowsMalformedException(
    "translate",
    [-1, mapping],
    "allowed-value-error"
  );

  await subtestThrowsMalformedException(
    "translate",
    ["bar", mapping],
    "allowed-value-error"
  );

  await subtestThrowsMalformedException(
    "translate",
    [undefined, mapping, undefined],
    "allowed-value-error"
  );
});
