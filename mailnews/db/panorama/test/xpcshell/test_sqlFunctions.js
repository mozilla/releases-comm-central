/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  do_get_profile();
  await loadExistingDB();
});

add_task(function testTagsInclude() {
  const stmt = database.connection.createStatement(
    "SELECT TAGS_INCLUDE('foo bar baz', :tag) AS result"
  );

  function check(input, expectedOutput) {
    stmt.params.tag = input;
    stmt.executeStep();
    Assert.equal(
      stmt.row.result,
      expectedOutput,
      `tags_include('foo bar baz', '${input}') should return ${expectedOutput}`
    );
    stmt.reset();
  }

  check("foo", 1);
  check("bar", 1);
  check("baz", 1);
  check("quux", 0);
  check("oo", 0);
  check("oo ba", 0);

  stmt.finalize();
});

add_task(function testTagsExclude() {
  const stmt = database.connection.createStatement(
    "SELECT TAGS_EXCLUDE('foo bar baz', :tag) AS result"
  );

  function check(input, expectedOutput) {
    stmt.params.tag = input;
    stmt.executeStep();
    Assert.equal(
      stmt.row.result,
      expectedOutput,
      `tags_exclude('foo bar baz', '${input}') should return ${expectedOutput}`
    );
    stmt.reset();
  }

  check("foo", 0);
  check("bar", 0);
  check("baz", 0);
  check("quux", 1);

  stmt.finalize();
});
