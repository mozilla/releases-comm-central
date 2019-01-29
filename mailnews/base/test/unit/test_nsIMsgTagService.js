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

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

function run_test()
{
  // These are both tags and keys. Note keys are forced to be lower case
  const tag1 = "istag";
  const tag2 = "notistag";
  const tag3 = "istagnot";
  const tag4 = "istagtoo";

  // add a tag
  MailServices.tags.addTagForKey(tag1, tag1, null, null);

  // delete any existing tags
  let tagArray = MailServices.tags.getAllTags({});
  for (var i = 0; i < tagArray.length; i++)
    MailServices.tags.deleteKey(tagArray[i].key);

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
  for (i = 0; i < 100; i++)
    MailServices.tags.addTagForKey(i, "lotsatags" + i, null, null);
  Assert.ok(!MailServices.tags.isValidKey(tag1));
  Assert.ok(!MailServices.tags.isValidKey(tag2));
  Assert.ok(!MailServices.tags.isValidKey(tag3));
  Assert.ok(MailServices.tags.isValidKey(tag4));

  for (i = 0; i < 100; i++)
  {
    Assert.ok(MailServices.tags.isValidKey(i));
    // make sure it knows the difference betweens tags and keys
    Assert.ok(!MailServices.tags.isValidKey("lotsatags" + i));
    // are we confused by key at start of tag?
    Assert.ok(!MailServices.tags.isValidKey(i + "lotsatags"));
  }
}

/*
  function printTags()
  {
    let tags = MailServices.tags.getAllTags({});
    for (var i = 0; i < tags.length; i++)
      print("# " + i + " key [" + tags[i].key + "] tag [" + tags[i].tag + "]");
  }
 */

