/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that migrating old feed options doesn't pollute shared prototypes.
 */
add_task(function test_newOptions_prototype() {
  const options = FeedUtils.newOptions(
    JSON.parse(
      '{"version":1,"__proto__":{"isPrototypeOf":"MARKER","toString":null},' +
        '"constructor":{"prototype":{"valueOf":null}},' +
        '"updates":{"updateMinutes":42,"__proto__":{"hasOwnProperty":null}}}'
    )
  );
  Assert.equal(
    typeof Object.prototype.isPrototypeOf,
    "function",
    "Object.prototype.isPrototypeOf should not be replaced"
  );
  Assert.equal(
    typeof Object.prototype.toString,
    "function",
    "Object.prototype.toString should not be replaced"
  );
  Assert.equal(
    typeof Object.prototype.valueOf,
    "function",
    "Object.prototype.valueOf should not be replaced"
  );
  Assert.equal(
    typeof Object.prototype.hasOwnProperty,
    "function",
    "Object.prototype.hasOwnProperty should not be replaced"
  );
  Assert.equal(
    Object.getPrototypeOf(options),
    Object.getPrototypeOf(FeedUtils.newOptions(null)),
    "migrated options should have the default prototype"
  );
  Assert.equal(
    options.version,
    FeedUtils._optionsDefault.version,
    "migrated options should have the current version"
  );
  Assert.equal(
    options.updates.updateMinutes,
    42,
    "user set updateMinutes should be preserved"
  );
  Assert.ok(
    !Object.hasOwn(options, "constructor"),
    "constructor should not be copied"
  );
});

/**
 * Tests that null values in the template or the old options are handled.
 */
add_task(function test_newOptions_nulls() {
  const options = FeedUtils.newOptions({
    version: 1,
    updates: { lastUpdateTime: { bogus: 1 }, updateBase: 5 },
    category: null,
  });
  Assert.deepEqual(
    options.updates.lastUpdateTime,
    { bogus: 1 },
    "lastUpdateTime should be taken from the old options"
  );
  Assert.equal(
    options.updates.updateBase,
    5,
    "updateBase should be taken from the old options"
  );
  Assert.deepEqual(
    options.category,
    FeedUtils._optionsDefault.category,
    "category should keep the template values"
  );
});
