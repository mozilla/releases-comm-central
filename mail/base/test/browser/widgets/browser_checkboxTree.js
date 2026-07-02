/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the tri-state checkbox behavior of CheckboxTreeTableRow.
 */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

/**
 * Open the test page in a new tab and run the given test function inside a
 * sandbox in that tab.
 *
 * @param {Function} testFn - The test function to run in the sandbox.
 */
async function runTestInSandbox(testFn) {
  window.resizeTo(
    Math.max(window.outerWidth, 800),
    Math.max(window.outerHeight, 600)
  );

  const tab = tabmail.openTab("contentTab", {
    url: `${getRootDirectory(gTestPath)}files/checkbox-tree-test.xhtml`,
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  await SimpleTest.promiseFocus(tab.browser);

  // Wait for the virtual tree to finish initial rendering.  On slow CI
  // machines the row buffer may not be populated and fillRow() may not
  // have run yet when browserLoaded resolves.
  await SpecialPowers.spawn(tab.browser, [], async () => {
    const tree = content.document.getElementById("testTree");

    // Wait for the row buffer to be populated.  If the tree already has
    // rows the event was dispatched before we could listen, so check
    // first and dispatch manually if needed.
    const eventName = "_checkboxTreeReady";
    const event = new content.CustomEvent(eventName);
    const readyPromise = new Promise(resolve => {
      tree.addEventListener(eventName, resolve, { once: true });
    });
    tree._rowBufferReadyEvent = event;

    if (tree.getRowAtIndex(0)) {
      tree.dispatchEvent(event);
    }

    await readyPromise;

    // Give fillRow() (scheduled via requestAnimationFrame by the index
    // setter) time to run and update checkbox state.
    await new Promise(resolve => content.requestAnimationFrame(resolve));
    await new Promise(resolve => content.requestAnimationFrame(resolve));
  });

  await SpecialPowers.spawn(tab.browser, [], testFn);

  tabmail.closeTab(tab);
}

add_task(async function test_initialTriStateDisplay() {
  await runTestInSandbox(() => {
    const tree = content.document.getElementById("testTree");

    /**
     * Returns the checkbox <input> element for the row at `index`.
     */
    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    // Row 0: Folder A — collapsed, 1 of 2 children checked → indeterminate.
    let cb = getCheckbox(0);
    Assert.ok(!cb.checked, "Folder A should not be checked");
    Assert.ok(cb.indeterminate, "Folder A should be indeterminate");

    // Row 1: Folder B — collapsed, all children checked → checked.
    cb = getCheckbox(1);
    Assert.ok(cb.checked, "Folder B should be checked");
    Assert.ok(!cb.indeterminate, "Folder B should not be indeterminate");

    // Row 2: Folder C — expanded, own state is unchecked.
    cb = getCheckbox(2);
    Assert.ok(!cb.checked, "Folder C should not be checked");
    Assert.ok(!cb.indeterminate, "Folder C should not be indeterminate");

    // Row 3: Item C1 — leaf, checked.
    cb = getCheckbox(3);
    Assert.ok(cb.checked, "Item C1 should be checked");

    // Row 4: Item C2 — leaf, unchecked.
    cb = getCheckbox(4);
    Assert.ok(!cb.checked, "Item C2 should not be checked");

    // Row 5: Item D — leaf, checked.
    cb = getCheckbox(5);
    Assert.ok(cb.checked, "Item D should be checked");

    // Row 6: Item E — leaf, unchecked.
    cb = getCheckbox(6);
    Assert.ok(!cb.checked, "Item E should not be checked");

    // Row 7: Uncheckable — checkbox hidden.
    cb = getCheckbox(7);
    Assert.ok(cb.hidden, "Uncheckable row's checkbox should be hidden");

    // Row 8: Folder G — collapsed, self unchecked, 0 children checked → empty.
    cb = getCheckbox(8);
    Assert.ok(!cb.checked, "Folder G should not be checked");
    Assert.ok(!cb.indeterminate, "Folder G should not be indeterminate");

    // Row 9: Folder H — collapsed, self unchecked, 1 child checked → indeterminate.
    cb = getCheckbox(9);
    Assert.ok(!cb.checked, "Folder H should not be checked");
    Assert.ok(cb.indeterminate, "Folder H should be indeterminate");

    // Row 10: Folder I — collapsed, 3-level deep, all checked → checked.
    cb = getCheckbox(10);
    Assert.ok(cb.checked, "Folder I should be checked");
    Assert.ok(!cb.indeterminate, "Folder I should not be indeterminate");
  });
});

add_task(async function test_collapsedParentCascadesDown() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 1 (Folder B) is collapsed and fully checked.
    // Toggling it off should uncheck all descendants.
    await clickCheckbox(1);

    let cb = getCheckbox(1);
    Assert.ok(!cb.checked, "Folder B should now be unchecked");
    Assert.ok(!cb.indeterminate, "Folder B should not be indeterminate");

    // Verify data row properties after toggle off.
    let viewRow = tree.view.rowAt(1);
    Assert.ok(
      !viewRow.hasProperty("checked"),
      "Folder B data row should not be checked"
    );
    Assert.ok(
      viewRow.hasProperty("descendants-none-checked"),
      "Folder B should have descendants-none-checked"
    );
    Assert.ok(
      !viewRow.children[0].hasProperty("checked"),
      "Item B1 data row should not be checked"
    );
    Assert.ok(
      !viewRow.children[1].hasProperty("checked"),
      "Item B2 data row should not be checked"
    );

    // Verify sibling Folder A is unchanged by the toggle of Folder B.
    cb = getCheckbox(0);
    Assert.ok(!cb.checked, "Folder A should still not be checked");
    Assert.ok(cb.indeterminate, "Folder A should still be indeterminate");

    // Toggle it back on — should cascade "checked" to all descendants.
    await clickCheckbox(1);

    cb = getCheckbox(1);
    Assert.ok(cb.checked, "Folder B should be checked again");
    Assert.ok(!cb.indeterminate, "Folder B should not be indeterminate");

    // Verify data row properties after toggle on.
    viewRow = tree.view.rowAt(1);
    Assert.ok(
      viewRow.hasProperty("checked"),
      "Folder B data row should be checked"
    );
    Assert.ok(
      viewRow.hasProperty("descendants-all-checked"),
      "Folder B should have descendants-all-checked"
    );
    Assert.ok(
      viewRow.children[0].hasProperty("checked"),
      "Item B1 data row should be checked"
    );
    Assert.ok(
      viewRow.children[1].hasProperty("checked"),
      "Item B2 data row should be checked"
    );

    // Verify sibling Folder A is unchanged by the toggle of Folder B.
    cb = getCheckbox(0);
    Assert.ok(!cb.checked, "Folder A should still not be checked");
    Assert.ok(cb.indeterminate, "Folder A should still be indeterminate");
  });
});

add_task(async function test_leafToggleRipplesUp() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    async function clickTwisty(index) {
      const twisty = tree.getRowAtIndex(index).querySelector("button.twisty");
      EventUtils.synthesizeMouseAtCenter(twisty, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 0 (Folder A) starts collapsed and indeterminate: self checked,
    // A1 checked, A2 unchecked.
    let cb = getCheckbox(0);
    Assert.ok(!cb.checked, "Folder A initially not checked");
    Assert.ok(cb.indeterminate, "Folder A initially indeterminate");

    // Expand Folder A, toggle A2 to checked, then collapse.
    // Now both children AND self are checked → Folder A should be checked.
    await clickTwisty(0);

    // After expanding: Item A1 should be checked, Item A2 unchecked.
    cb = getCheckbox(1);
    Assert.ok(cb.checked, "Item A1 should be checked after expanding");
    cb = getCheckbox(2);
    Assert.ok(!cb.checked, "Item A2 should be unchecked after expanding");

    // Row 2 is now Item A2 (unchecked). Toggle it to checked.
    await clickCheckbox(2);

    // After toggling A2: both children should be checked.
    cb = getCheckbox(1);
    Assert.ok(cb.checked, "Item A1 should still be checked");
    cb = getCheckbox(2);
    Assert.ok(cb.checked, "Item A2 should now be checked");

    await clickTwisty(0);

    cb = getCheckbox(0);
    Assert.ok(
      cb.checked,
      "Folder A should be checked after all children checked"
    );
    Assert.ok(!cb.indeterminate, "Folder A should not be indeterminate");

    // Expand again, toggle A1 to unchecked, then collapse.
    // Self checked but not all children → indeterminate.
    await clickTwisty(0);

    // After re-expanding: both children should still be checked.
    cb = getCheckbox(1);
    Assert.ok(cb.checked, "Item A1 should still be checked after re-expanding");
    cb = getCheckbox(2);
    Assert.ok(cb.checked, "Item A2 should still be checked after re-expanding");

    // Row 1 is now Item A1 (checked). Toggle it to unchecked.
    await clickCheckbox(1);

    // After toggling A1: A1 unchecked, A2 still checked.
    cb = getCheckbox(1);
    Assert.ok(!cb.checked, "Item A1 should now be unchecked");
    cb = getCheckbox(2);
    Assert.ok(cb.checked, "Item A2 should still be checked");

    await clickTwisty(0);

    cb = getCheckbox(0);
    Assert.ok(!cb.checked, "Folder A should not be checked after A1 unchecked");
    Assert.ok(cb.indeterminate, "Folder A should be indeterminate again");
  });
});

add_task(async function test_expandedParentNoCascade() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 2 is Folder C (expanded, unchecked). Its children are C1 (checked)
    // and C2 (unchecked). Toggling the expanded parent should NOT cascade.
    await clickCheckbox(2);

    let cb = getCheckbox(2);
    Assert.ok(cb.checked, "Folder C should be checked");

    // Children should retain their original states.
    cb = getCheckbox(3);
    Assert.ok(cb.checked, "Item C1 should still be checked");

    cb = getCheckbox(4);
    Assert.ok(!cb.checked, "Item C2 should still be unchecked");
  });
});

add_task(async function test_uncheckedEmptyParentCascadesDown() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 8 (Folder G) is collapsed, unchecked, no children checked → empty.
    // Toggling it on should cascade "checked" to all children.
    await clickCheckbox(8);

    let cb = getCheckbox(8);
    Assert.ok(cb.checked, "Folder G should now be checked");
    Assert.ok(!cb.indeterminate, "Folder G should not be indeterminate");

    const folderG = tree.view.rowAt(8);
    Assert.ok(folderG.hasProperty("checked"), "Folder G data row checked");
    Assert.ok(
      folderG.hasProperty("descendants-all-checked"),
      "Folder G should have descendants-all-checked"
    );
    Assert.ok(
      folderG.children[0].hasProperty("checked"),
      "Item G1 data row should be checked"
    );
    Assert.ok(
      folderG.children[1].hasProperty("checked"),
      "Item G2 data row should be checked"
    );

    // Toggle it back off — should cascade "unchecked" to all children.
    await clickCheckbox(8);

    cb = getCheckbox(8);
    Assert.ok(!cb.checked, "Folder G should now be unchecked");
    Assert.ok(!cb.indeterminate, "Folder G should not be indeterminate");

    Assert.ok(!folderG.hasProperty("checked"), "Folder G data row not checked");
    Assert.ok(
      folderG.hasProperty("descendants-none-checked"),
      "Folder G should have descendants-none-checked"
    );
    Assert.ok(
      !folderG.children[0].hasProperty("checked"),
      "Item G1 data row should not be checked"
    );
    Assert.ok(
      !folderG.children[1].hasProperty("checked"),
      "Item G2 data row should not be checked"
    );
  });
});

add_task(async function test_indeterminateParentCascadesDown() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 9 (Folder H) is collapsed, unchecked, 1 of 2 children checked
    // → indeterminate. Toggling it on should cascade "checked" to all
    // children, overriding the mixed state.
    await clickCheckbox(9);

    let cb = getCheckbox(9);
    Assert.ok(cb.checked, "Folder H should now be checked");
    Assert.ok(!cb.indeterminate, "Folder H should not be indeterminate");

    const folderH = tree.view.rowAt(9);
    Assert.ok(folderH.hasProperty("checked"), "Folder H data row checked");
    Assert.ok(
      folderH.hasProperty("descendants-all-checked"),
      "Folder H should have descendants-all-checked"
    );
    Assert.ok(
      folderH.children[0].hasProperty("checked"),
      "Item H1 data row should be checked"
    );
    Assert.ok(
      folderH.children[1].hasProperty("checked"),
      "Item H2 data row should be checked"
    );

    // Toggle it back off — should cascade "unchecked" to all children.
    await clickCheckbox(9);

    cb = getCheckbox(9);
    Assert.ok(!cb.checked, "Folder H should now be unchecked");
    Assert.ok(!cb.indeterminate, "Folder H should not be indeterminate");

    Assert.ok(!folderH.hasProperty("checked"), "Folder H data row not checked");
    Assert.ok(
      folderH.hasProperty("descendants-none-checked"),
      "Folder H should have descendants-none-checked"
    );
    Assert.ok(
      !folderH.children[0].hasProperty("checked"),
      "Item H1 data row should not be checked"
    );
    Assert.ok(
      !folderH.children[1].hasProperty("checked"),
      "Item H2 data row should not be checked"
    );
  });
});

add_task(async function test_deepTreeCascadeDown() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Row 10 (Folder I) is a collapsed 3-level tree, all checked.
    // Toggling it off should cascade down through all levels.
    await clickCheckbox(10);

    // Check DOM state.
    let cb = getCheckbox(10);
    Assert.ok(!cb.checked, "Folder I should now be unchecked");
    Assert.ok(!cb.indeterminate, "Folder I should not be indeterminate");

    // Verify data row properties at every level after toggle off.
    const folderI = tree.view.rowAt(10);
    Assert.ok(
      !folderI.hasProperty("checked"),
      "Folder I data row should not be checked"
    );
    Assert.ok(
      folderI.hasProperty("descendants-none-checked"),
      "Folder I should have descendants-none-checked"
    );

    const subfolderI1 = folderI.children[0];
    Assert.ok(
      !subfolderI1.hasProperty("checked"),
      "Subfolder I1 data row should not be checked"
    );
    Assert.ok(
      subfolderI1.hasProperty("descendants-none-checked"),
      "Subfolder I1 should have descendants-none-checked"
    );

    Assert.ok(
      !subfolderI1.children[0].hasProperty("checked"),
      "Item I1a data row should not be checked"
    );
    Assert.ok(
      !subfolderI1.children[1].hasProperty("checked"),
      "Item I1b data row should not be checked"
    );
    Assert.ok(
      !folderI.children[1].hasProperty("checked"),
      "Item I2 data row should not be checked"
    );

    // Toggle it back on — should cascade "checked" to all descendants.
    await clickCheckbox(10);

    cb = getCheckbox(10);
    Assert.ok(cb.checked, "Folder I should be checked again");
    Assert.ok(!cb.indeterminate, "Folder I should not be indeterminate");

    // Verify data row properties at every level after toggle on.
    Assert.ok(
      folderI.hasProperty("checked"),
      "Folder I data row should be checked"
    );
    Assert.ok(
      folderI.hasProperty("descendants-all-checked"),
      "Folder I should have descendants-all-checked"
    );

    Assert.ok(
      subfolderI1.hasProperty("checked"),
      "Subfolder I1 data row should be checked"
    );
    Assert.ok(
      subfolderI1.hasProperty("descendants-all-checked"),
      "Subfolder I1 should have descendants-all-checked"
    );

    Assert.ok(
      subfolderI1.children[0].hasProperty("checked"),
      "Item I1a data row should be checked"
    );
    Assert.ok(
      subfolderI1.children[1].hasProperty("checked"),
      "Item I1b data row should be checked"
    );
    Assert.ok(
      folderI.children[1].hasProperty("checked"),
      "Item I2 data row should be checked"
    );
  });
});

add_task(async function test_deepTreeRippleUp() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    async function clickCheckbox(index) {
      const cb = getCheckbox(index);
      EventUtils.synthesizeMouseAtCenter(cb, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    async function clickTwisty(index) {
      const twisty = tree.getRowAtIndex(index).querySelector("button.twisty");
      EventUtils.synthesizeMouseAtCenter(twisty, {}, content);
      await new Promise(resolve => content.requestAnimationFrame(resolve));
    }

    // Expand the 3-level tree: Folder I → Subfolder I1.
    await clickTwisty(10);
    await clickTwisty(11);

    // Now visible: I (10), I1 (11), I1a (12), I1b (13), I2 (14).
    // All are checked. Toggle the level-3 leaf I1a off.
    await clickCheckbox(12);

    // Item I1a should now be unchecked.
    let cb = getCheckbox(12);
    Assert.ok(!cb.checked, "Item I1a should now be unchecked");

    // The ripple should reach Subfolder I1 (expanded).
    // Its own checkbox shows its literal state (checked), but its
    // descendant cache should reflect the mixed children.
    cb = getCheckbox(11);
    Assert.ok(
      cb.checked,
      "Expanded Subfolder I1 should show own checked state"
    );

    // Verify Subfolder I1 data properties.
    const subfolderI1 = tree.view.rowAt(11);
    Assert.ok(
      subfolderI1.hasProperty("checked"),
      "Subfolder I1 data row should be checked"
    );
    Assert.ok(
      subfolderI1.hasProperty("descendants-some-checked"),
      "Subfolder I1 should have descendants-some-checked"
    );

    // The ripple should also have reached Folder I (expanded).
    // Its descendant cache should reflect the change.
    cb = getCheckbox(10);
    Assert.ok(cb.checked, "Expanded Folder I should show own checked state");

    const folderI = tree.view.rowAt(10);
    Assert.ok(
      folderI.hasProperty("descendants-some-checked"),
      "Folder I should have descendants-some-checked after ripple"
    );

    // Collapse Subfolder I1 and verify its tri-state display.
    await clickTwisty(11);

    cb = getCheckbox(11);
    Assert.ok(!cb.checked, "Collapsed Subfolder I1 should not be checked");
    Assert.ok(
      cb.indeterminate,
      "Collapsed Subfolder I1 should be indeterminate"
    );

    // Collapse Folder I and verify its tri-state display reflects the
    // level-3 change.
    await clickTwisty(10);

    cb = getCheckbox(10);
    Assert.ok(
      !cb.checked,
      "Collapsed Folder I should not be checked after ripple"
    );
    Assert.ok(
      cb.indeterminate,
      "Collapsed Folder I should be indeterminate after ripple"
    );

    // Verify Folder I data properties after collapse.
    Assert.ok(
      folderI.hasProperty("checked"),
      "Folder I data row should still be checked"
    );
    Assert.ok(
      folderI.hasProperty("descendants-some-checked"),
      "Folder I should have descendants-some-checked"
    );
  });
});

add_task(async function test_keyboardToggle() {
  await runTestInSandbox(async () => {
    const tree = content.document.getElementById("testTree");

    function getCheckbox(index) {
      const row = tree.getRowAtIndex(index);
      return row?.querySelector('input[type="checkbox"]');
    }

    // Row 1 (Folder B) is collapsed and fully checked.
    // Focus the checkbox and toggle it off via Space key.
    const cb = getCheckbox(1);
    cb.focus();
    EventUtils.synthesizeKey(" ", {}, content);
    await new Promise(resolve => content.requestAnimationFrame(resolve));

    Assert.ok(!cb.checked, "Folder B should now be unchecked via keyboard");
    Assert.ok(
      !cb.indeterminate,
      "Folder B should not be indeterminate via keyboard"
    );

    // Data properties should reflect cascade to children.
    const viewRow = tree.view.rowAt(1);
    Assert.ok(
      !viewRow.hasProperty("checked"),
      "Folder B data not checked after keyboard toggle off"
    );
    Assert.ok(
      viewRow.hasProperty("descendants-none-checked"),
      "Folder B has descendants-none-checked after keyboard toggle off"
    );
    Assert.ok(
      !viewRow.children[0].hasProperty("checked"),
      "Item B1 data not checked"
    );
    Assert.ok(
      !viewRow.children[1].hasProperty("checked"),
      "Item B2 data not checked"
    );

    // Toggle it back on via Space key.
    cb.focus();
    EventUtils.synthesizeKey(" ", {}, content);
    await new Promise(resolve => content.requestAnimationFrame(resolve));

    Assert.ok(cb.checked, "Folder B should be checked again via keyboard");
    Assert.ok(
      !cb.indeterminate,
      "Folder B should not be indeterminate via keyboard"
    );

    Assert.ok(viewRow.hasProperty("checked"), "Folder B data checked");
    Assert.ok(
      viewRow.hasProperty("descendants-all-checked"),
      "Folder B has descendants-all-checked"
    );
    Assert.ok(
      viewRow.children[0].hasProperty("checked"),
      "Item B1 data checked"
    );
    Assert.ok(
      viewRow.children[1].hasProperty("checked"),
      "Item B2 data checked"
    );
  });
});
