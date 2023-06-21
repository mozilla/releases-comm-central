/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { default: CUSTOMIZABLE_ITEMS } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItemsDetails.mjs"
);

add_task(function test_format() {
  for (const item of CUSTOMIZABLE_ITEMS) {
    Assert.equal(typeof item, "object", "Customizable item is an object");
    Assert.equal(typeof item.id, "string", `id "${item.id}" is a string`);
    Assert.ok(!item.id.includes(","), `id "${item.id}" may not contain commas`);
    Assert.greater(item.id.length, 0, `id "${item.id}" is not empty`);
    Assert.equal(
      typeof item.labelId,
      "string",
      `labelId is a string for ${item.id}`
    );
    Assert.greater(
      item.labelId.length,
      0,
      `labelId is not empty for ${item.id}`
    );
    Assert.ok(
      !item.allowMultiple || item.allowMultiple === true,
      `allowMultiple is falsy or boolean for ${item.id}`
    );
    Assert.ok(
      item.spaces === undefined || Array.isArray(item.spaces),
      `spaces is undefined or an array for ${item.id}`
    );
    if (item.spaces) {
      for (const space of item.spaces) {
        Assert.equal(
          typeof space,
          "string",
          `space "${space}" expected to be string for ${item.id}`
        );
        Assert.greater(
          space.length,
          0,
          `space is not empty in ${item.id} spaces`
        );
      }
    }
    Assert.ok(
      item.templateId === undefined || typeof item.templateId === "string",
      `templateId must be undefined or a string for ${item.id}`
    );
    if (item.templateId !== undefined) {
      Assert.greater(
        item.templateId.length,
        0,
        `templateId is not empty for ${item.id}`
      );
      Assert.ok(
        item.requiredModules === undefined ||
          Array.isArray(item.requiredModules),
        `requiredModules is undefined or an array for ${item.id}`
      );
      if (item.requiredModules) {
        for (const module of item.requiredModules) {
          Assert.equal(
            typeof module,
            "string",
            `module "${module}" expected to be string for ${item.id}`
          );
          Assert.greater(
            module.length,
            0,
            `module is not empty in ${item.id} requiredModules`
          );
        }
      }
    } else {
      Assert.strictEqual(
        item.requiredModules,
        undefined,
        `requiredModules must not be set because there is no template for item ${item.id}`
      );
    }
    Assert.ok(
      item.hasContextMenu === undefined ||
        typeof item.hasContextMenu === "boolean",
      `hasContextMenu must be undefined or a boolean for ${item.id}`
    );
    Assert.ok(
      item.skipFocus === undefined || typeof item.skipFocus === "boolean",
      `skipFocus must be undefined or a boolean for ${item.id}`
    );
  }
});

add_task(function test_idsUnique() {
  const allIds = CUSTOMIZABLE_ITEMS.map(item => item.id);
  const idCounts = allIds.reduce((counts, id) => {
    counts[id] = counts[id] ? counts[id] + 1 : 1;
    return counts;
  }, {});
  const duplicateIds = Object.keys(idCounts).filter(id => idCounts[id] > 1);
  Assert.deepEqual(duplicateIds, [], "All IDs should only be used once");
});
