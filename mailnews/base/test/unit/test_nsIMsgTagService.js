/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests of nsIMsgTagService.
 *
 * Specifically tests changes implemented in bug 217034
 * Does not do comprehensive testing.
 *
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  // These are both tags and keys. Note keys are forced to be lower case
  const tag1 = "istag";
  const tag2 = "notistag";
  const tag3 = "istagnot";
  const tag4 = "istagtoo";

  // add a tag
  MailServices.tags.addTagForKey(tag1, tag1, null, null);

  // delete any existing tags
  const tagArray = MailServices.tags.getAllTags();
  for (var i = 0; i < tagArray.length; i++) {
    MailServices.tags.deleteKey(tagArray[i].key);
  }

  // make sure added tag is now gone
  Assert.ok(!MailServices.tags.isValidKey(tag1));

  // add single tag, and check again
  MailServices.tags.addTagForKey(tag1, tag1, null, null);
  Assert.ok(MailServices.tags.isValidKey(tag1));
  Assert.ok(!MailServices.tags.isValidKey(tag4));

  // add second tag and check
  MailServices.tags.addTagForKey(tag4, tag4, null, null);
  Assert.ok(MailServices.tags.isValidKey(tag1));
  Assert.ok(!MailServices.tags.isValidKey(tag2));
  Assert.ok(!MailServices.tags.isValidKey(tag3));
  Assert.ok(MailServices.tags.isValidKey(tag4));

  // delete a tag and check
  MailServices.tags.deleteKey(tag1);
  Assert.ok(!MailServices.tags.isValidKey(tag1));
  Assert.ok(!MailServices.tags.isValidKey(tag2));
  Assert.ok(!MailServices.tags.isValidKey(tag3));
  Assert.ok(MailServices.tags.isValidKey(tag4));

  // add many tags and check again
  for (i = 0; i < 100; i++) {
    MailServices.tags.addTagForKey(i, "lotsatags" + i, null, null);
  }
  Assert.ok(!MailServices.tags.isValidKey(tag1));
  Assert.ok(!MailServices.tags.isValidKey(tag2));
  Assert.ok(!MailServices.tags.isValidKey(tag3));
  Assert.ok(MailServices.tags.isValidKey(tag4));

  for (i = 0; i < 100; i++) {
    Assert.ok(MailServices.tags.isValidKey(i));
    // make sure it knows the difference betweens tags and keys
    Assert.ok(!MailServices.tags.isValidKey("lotsatags" + i));
    // are we confused by key at start of tag?
    Assert.ok(!MailServices.tags.isValidKey(i + "lotsatags"));
  }

  // Test sort ordering for getAllTags() without ordinal.
  for (const tag of MailServices.tags.getAllTags()) {
    MailServices.tags.deleteKey(tag.key);
  }
  MailServices.tags.addTag("grapefruit", null, null);
  MailServices.tags.addTag("orange", null, null);
  MailServices.tags.addTag("lime", null, null);
  MailServices.tags.addTag("lemon", null, null);

  // Should be sorted by tag name.
  let tagNames = MailServices.tags.getAllTags().map(t => t.tag);
  Assert.deepEqual(
    tagNames,
    ["grapefruit", "lemon", "lime", "orange"],
    "Sort without ordinals"
  );

  // Test sort ordering for getAllTags() with (some) ordinals.
  for (const tag of MailServices.tags.getAllTags()) {
    MailServices.tags.deleteKey(tag.key);
  }
  MailServices.tags.addTag("grapefruit", null, "3");
  MailServices.tags.addTag("orange", null, "1");
  MailServices.tags.addTag("lime", null, null);
  MailServices.tags.addTag("lemon", null, "2");

  // Should be sorted by ordinal, then tag name.
  tagNames = MailServices.tags.getAllTags().map(t => t.tag);
  Assert.deepEqual(
    tagNames,
    ["orange", "lemon", "grapefruit", "lime"],
    "Sort with ordinals"
  );
}

/*
function printTags() {
  for (let tag of MailServices.tags.getAllTags()) {
    print(`# key [${tag.key}] tag [${tag.tag}] ordinal [${tag.ordinal}]`);
  }
}
*/
