/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);

add_task(async () => {
  let a = new AddrBookDirectory();
  a.init("jsaddrbook://abook.sqlite");

  let b = new AddrBookDirectory();
  b.init("jsaddrbook://abook.sqlite/?fakeQuery");

  // Different objects, same prototype.
  notEqual(a, b);
  equal(a.__proto__, b.__proto__);

  let inner = a.__proto__;
  equal(inner._fileName, "abook.sqlite");

  // URI should be cached on the outer object.
  ok(a.hasOwnProperty("_uri"));
  ok(b.hasOwnProperty("_uri"));
  ok(!inner.hasOwnProperty("_uri"));
  equal(a._uri, "jsaddrbook://abook.sqlite");
  equal(b._uri, "jsaddrbook://abook.sqlite/?fakeQuery");

  // Query should be cached on the outer object.
  ok(!a.hasOwnProperty("_query"));
  ok(b.hasOwnProperty("_query"));
  ok(!inner.hasOwnProperty("_query"));
  ok(!a.isQuery);
  ok(b.isQuery);
  equal(b._query, "fakeQuery");

  // UID should be cached on the inner object.
  a.UID;
  ok(!a.hasOwnProperty("_uid"));
  ok(!b.hasOwnProperty("_uid"));
  ok(inner.hasOwnProperty("_uid"));
  equal(a.UID, b.UID);

  // Database connection should be created on first access, and shared.
  ok(!a.hasOwnProperty("_dbConnection"));
  ok(!b.hasOwnProperty("_dbConnection"));
  ok(!inner.hasOwnProperty("_dbConnection"));
  ok(inner.__proto__.hasOwnProperty("_dbConnection"));

  a._dbConnection;
  ok(!a.hasOwnProperty("_dbConnection"));
  ok(!b.hasOwnProperty("_dbConnection"));
  ok(inner.hasOwnProperty("_dbConnection"));

  // Calling _getNextCardId should increment a shared value.
  equal(a._getNextCardId(), 1);
  equal(a._getNextCardId(), 2);
  equal(b._getNextCardId(), 3);
  equal(a._getNextCardId(), 4);

  // Calling _getNextListId should increment a shared value.
  equal(b._getNextListId(), 1);
  equal(b._getNextListId(), 2);
  equal(a._getNextListId(), 3);
  equal(b._getNextListId(), 4);
});
