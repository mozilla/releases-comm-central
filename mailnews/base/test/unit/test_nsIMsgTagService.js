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

function clearTags() {
  for (const tag of MailServices.tags.getAllTags()) {
    MailServices.tags.deleteKey(tag.key);
  }
}

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

  clearTags();

  MailServices.tags.addTag("Short Tag", null, null);
  Assert.equal(MailServices.tags.getKeyForTag("Short Tag"), "short=20tag");

  MailServices.tags.addTag("Auto Tag", null, null);
  Assert.equal(MailServices.tags.getKeyForTag("Auto Tag"), "auto=20tag");
  MailServices.tags.setTagForKey("auto=20tag", "Renamed Auto Tag");
  MailServices.tags.addTag("Auto Tag", null, null);
  Assert.equal(MailServices.tags.getKeyForTag("Auto Tag"), "auto=20tag_1");

  clearTags();

  for (const length of [49, 50, 51]) {
    const tag = "a".repeat(length);
    MailServices.tags.addTag(tag, null, null);
    const key = MailServices.tags.getKeyForTag(tag);
    if (length <= 50) {
      Assert.equal(
        key,
        tag,
        "Readable keys up to 50 characters should remain unchanged"
      );
    } else {
      Assert.ok(
        /^&x-moz-[0-9a-f]{32}$/.test(key),
        "Longer keys should use a 128-bit hash"
      );
    }
    Assert.lessOrEqual(key.length, 50);
  }

  const suffixFitsTag = "D".repeat(48);
  const suffixFitsBase = "d".repeat(48);
  MailServices.tags.addTagForKey(suffixFitsBase, "occupier", null, null);
  MailServices.tags.addTag(suffixFitsTag, null, null);
  Assert.equal(
    MailServices.tags.getKeyForTag(suffixFitsTag),
    `${suffixFitsBase}_1`
  );

  const suffixOverflowsTag = `${" ".repeat(16)}x`;
  const suffixOverflowsBase = `${"=20".repeat(16)}x`;
  MailServices.tags.addTagForKey(
    suffixOverflowsBase,
    "another occupier",
    null,
    null
  );
  MailServices.tags.addTag(suffixOverflowsTag, null, null);
  Assert.ok(
    /^&x-moz-[0-9a-f]{32}$/.test(
      MailServices.tags.getKeyForTag(suffixOverflowsTag)
    ),
    "An overflowing readable suffix should fall back to a hash"
  );

  const caseVariants = [
    ["A".repeat(51), "&x-moz-1d31616e307323bd80775ae7483fce65"],
    ["a".repeat(51), "&x-moz-bfc5fe0e360152ca98c50fab4ed7e307"],
  ];
  for (const variants of [caseVariants, [...caseVariants].reverse()]) {
    clearTags();
    for (const [tag] of variants) {
      MailServices.tags.addTag(tag, null, null);
    }
    for (const [tag, expectedKey] of caseVariants) {
      Assert.equal(
        MailServices.tags.getKeyForTag(tag),
        expectedKey,
        "Long ASCII case variants should have distinct hashes regardless of creation order"
      );
    }
  }

  clearTags();

  // Independently calculated SHA-256 vectors of the exact UTF-8 tag bytes.
  const longTag =
    "This is a sufficiently long tag whose encoded key exceeds fifty characters.";
  const expectedHashKey = "&x-moz-79f650b223d8665b0bd06b965c7ce9e0";
  for (const [tag, expectedKey] of [
    [longTag, expectedHashKey],
    ["ああああああ", "&x-moz-69955d16ec9b7ca468fb4b17a7bb6353"],
    ["ПриветПривет", "&x-moz-07f0a316b0335e9a82afc8c75c565dd1"],
    ["tütütütütütütütüt", "&x-moz-b7b208eb278fdab9683804dfce4354bd"],
    ["é".repeat(9), "&x-moz-322feef3144cd0e5187e89584c64eb82"],
    ["e\u0301".repeat(9), "&x-moz-7b280c26142fad0006977c3a60dff33b"],
  ]) {
    MailServices.tags.addTag(tag, null, null);
    Assert.equal(MailServices.tags.getKeyForTag(tag), expectedKey);
  }

  MailServices.tags.addTag("Привет", null, null);
  Assert.equal(
    MailServices.tags.getKeyForTag("Привет"),
    "=d0=9f=d1=80=d0=b8=d0=b2=d0=b5=d1=82",
    "Short non-ASCII tags should retain readable keys"
  );
  MailServices.tags.addTag("&x-moz- literal", null, null);
  Assert.equal(
    MailServices.tags.getKeyForTag("&x-moz- literal"),
    "=26x-moz-=20literal"
  );

  MailServices.tags.deleteKey(expectedHashKey);
  MailServices.tags.addTag("unrelated tag", null, null);
  MailServices.tags.addTag(longTag, null, null);
  Assert.equal(
    MailServices.tags.getKeyForTag(longTag),
    expectedHashKey,
    "Recreation should use the same hash when the key is available"
  );

  clearTags();

  MailServices.tags.addTag(longTag, "#123456", "original-ordinal");
  const renamedTag = "Renamed tag";
  MailServices.tags.setTagForKey(expectedHashKey, renamedTag);
  MailServices.tags.addTag(longTag, "#654321", "new-ordinal");
  const recreatedKey = `${expectedHashKey}_1`;
  Assert.equal(MailServices.tags.getKeyForTag(renamedTag), expectedHashKey);
  Assert.equal(MailServices.tags.getTagForKey(expectedHashKey), renamedTag);
  Assert.equal(MailServices.tags.getColorForKey(expectedHashKey), "#123456");
  Assert.equal(
    MailServices.tags.getOrdinalForKey(expectedHashKey),
    "original-ordinal"
  );
  Assert.equal(MailServices.tags.getKeyForTag(longTag), recreatedKey);
  Assert.equal(MailServices.tags.getTagForKey(recreatedKey), longTag);
  Assert.equal(MailServices.tags.getColorForKey(recreatedKey), "#654321");
  Assert.equal(MailServices.tags.getOrdinalForKey(recreatedKey), "new-ordinal");
  Assert.equal(
    MailServices.tags.getAllTags().length,
    2,
    "Both mappings should survive"
  );

  MailServices.tags.addTag(longTag, "#abcdef", "updated-ordinal");
  Assert.equal(MailServices.tags.getKeyForTag(longTag), recreatedKey);
  Assert.equal(MailServices.tags.getColorForKey(recreatedKey), "#abcdef");
  Assert.equal(
    MailServices.tags.getAllTags().length,
    2,
    "Re-adding should reuse the mapping"
  );

  MailServices.tags.setTagForKey(recreatedKey, "Another renamed tag");
  MailServices.tags.addTag(longTag, null, null);
  const secondRecreatedKey = MailServices.tags.getKeyForTag(longTag);
  Assert.equal(secondRecreatedKey, `${expectedHashKey}_2`);
  Assert.lessOrEqual(secondRecreatedKey.length, 50);
  Assert.equal(MailServices.tags.getTagForKey(expectedHashKey), renamedTag);
  Assert.equal(
    MailServices.tags.getTagForKey(recreatedKey),
    "Another renamed tag"
  );
  Assert.equal(MailServices.tags.getAllTags().length, 3);

  clearTags();

  const legacyTag = "legacy tag with an intentionally over-limit key";
  const legacyKey = `legacy-${"x".repeat(55)}`;
  MailServices.tags.addTagForKey(legacyKey, legacyTag, null, null);
  MailServices.tags.addTag(legacyTag, "#654321", "legacy-ordinal");
  Assert.equal(MailServices.tags.getKeyForTag(legacyTag), legacyKey);
  Assert.equal(
    MailServices.tags.getAllTags().length,
    1,
    "The legacy mapping should be reused"
  );
  Assert.equal(MailServices.tags.getColorForKey(legacyKey), "#654321");
  Assert.equal(MailServices.tags.getOrdinalForKey(legacyKey), "legacy-ordinal");
}

/*
function printTags() {
  for (let tag of MailServices.tags.getAllTags()) {
    print(`# key [${tag.key}] tag [${tag.tag}] ordinal [${tag.ordinal}]`);
  }
}
*/
