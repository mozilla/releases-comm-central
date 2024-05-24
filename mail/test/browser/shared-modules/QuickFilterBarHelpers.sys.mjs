/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  get_about_3pane,
  mc,
  wait_for_all_messages_to_load,
} from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import {
  getState,
  storeState,
} from "resource:///modules/CustomizationState.mjs";
import { getDefaultItemIdsForSpace } from "resource:///modules/CustomizableItems.sys.mjs";

const about3Pane = get_about_3pane();
about3Pane.quickFilterBar.deferredUpdateSearch =
  about3Pane.quickFilterBar.updateSearch;

/**
 * Maps names to bar DOM ids to simplify checking.
 */
var nameToBarDomId = {
  sticky: "qfb-sticky",
  unread: "qfb-unread",
  starred: "qfb-starred",
  addrbook: "qfb-inaddrbook",
  tags: "qfb-tags",
  attachments: "qfb-attachment",
};

async function ensure_qfb_unified_toolbar_button() {
  const document = mc.document;

  const state = getState();
  if (state.mail?.includes("quick-filter-bar")) {
    return;
  }
  if (!state.mail) {
    state.mail = getDefaultItemIdsForSpace("mail");
    if (state.mail.includes("quick-filter-bar")) {
      return;
    }
  }
  state.mail.push("quick-filter-bar");
  storeState(state);
  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      subtree: true,
      childList: true,
    },
    () =>
      document.querySelector("#unifiedToolbarContent .quick-filter-bar button")
  );
}

export async function cleanup_qfb_button() {
  const document = mc.document;
  const state = getState();
  if (!state.mail?.includes("quick-filter-bar")) {
    return;
  }
  state.mail = getDefaultItemIdsForSpace("mail");
  storeState(state);
  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      subtree: true,
      childList: true,
    },
    () => !document.querySelector("#unifiedToolbarContent .quick-filter-bar")
  );
}

export async function assert_quick_filter_button_enabled(aEnabled) {
  await ensure_qfb_unified_toolbar_button();
  if (
    mc.document.querySelector("#unifiedToolbarContent .quick-filter-bar button")
      .disabled == aEnabled
  ) {
    throw new Error(
      "Quick filter bar button should be " + (aEnabled ? "enabled" : "disabled")
    );
  }
}

export function assert_quick_filter_bar_visible(aVisible) {
  const bar = about3Pane.document.getElementById("quick-filter-bar");
  if (aVisible) {
    Assert.ok(
      BrowserTestUtils.isVisible(bar),
      "Quick filter bar should be visible"
    );
  } else {
    Assert.ok(
      BrowserTestUtils.isHidden(bar),
      "Quick filter bar should be hidden"
    );
  }
}

/**
 * Toggle the state of the message filter bar as if by a mouse click.
 */
export async function toggle_quick_filter_bar() {
  await ensure_qfb_unified_toolbar_button();
  EventUtils.synthesizeMouseAtCenter(
    mc.document.querySelector("#unifiedToolbarContent .quick-filter-bar"),
    { clickCount: 1 },
    mc
  );
  await wait_for_all_messages_to_load();
}

/**
 * Assert that the state of the constraints visually expressed by the bar is
 * consistent with the passed-in constraints.  This method does not verify
 * that the search constraints are in effect.  Check that elsewhere.
 */
export function assert_constraints_expressed(aConstraints) {
  for (const name in nameToBarDomId) {
    const domId = nameToBarDomId[name];
    const expectedValue = name in aConstraints ? aConstraints[name] : false;
    const domNode = about3Pane.document.getElementById(domId);
    Assert.equal(
      domNode.pressed,
      expectedValue,
      name + "'s pressed state should be " + expectedValue
    );
  }
}

/**
 * Toggle the given filter buttons by name (from nameToBarDomId); variable
 * argument magic enabled.
 */
export async function toggle_boolean_constraints(...aArgs) {
  aArgs.forEach(arg =>
    EventUtils.synthesizeMouseAtCenter(
      about3Pane.document.getElementById(nameToBarDomId[arg]),
      { clickCount: 1 },
      about3Pane
    )
  );
  await wait_for_all_messages_to_load(mc);
}

/**
 * Toggle the tag faceting buttons by tag key.  Wait for messages after.
 */
export async function toggle_tag_constraints(...aArgs) {
  aArgs.forEach(function (arg) {
    const tagId = "qfb-tag-" + arg;
    const button = about3Pane.document.getElementById(tagId);
    button.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, about3Pane);
  });
  await wait_for_all_messages_to_load(mc);
}

/**
 * Set the tag filtering mode. Wait for messages after.
 */
export async function toggle_tag_mode() {
  const qbm = about3Pane.document.getElementById("qfb-boolean-mode");
  if (qbm.value === "AND") {
    qbm.selectedIndex--; // = move to "OR";
    Assert.equal(qbm.value, "OR", "qfb-boolean-mode has wrong state");
  } else if (qbm.value === "OR") {
    qbm.selectedIndex++; // = move to "AND";
    Assert.equal(qbm.value, "AND", "qfb-boolean-mode has wrong state");
  } else {
    throw new Error("qfb-boolean-mode value=" + qbm.value);
  }
  await wait_for_all_messages_to_load(mc);
}

/**
 * Verify that tag buttons exist for exactly the given set of tag keys in the
 *  provided variable argument list.  Ordering is significant.
 */
export function assert_tag_constraints_visible(...aArgs) {
  // the stupid bar should be visible if any arguments are specified
  const tagBar = get_about_3pane().document.getElementById(
    "quickFilterBarTagsContainer"
  );
  if (aArgs.length > 0) {
    Assert.ok(
      BrowserTestUtils.isVisible(tagBar),
      "The tag bar should not be collapsed!"
    );
  }

  const kids = tagBar.children;
  const tagLength = kids.length - 1; // -1 for the qfb-boolean-mode widget
  // this is bad error reporting in here for now.
  if (tagLength != aArgs.length) {
    throw new Error(
      "Mismatch in expected tag count and actual. " +
        "Expected " +
        aArgs.length +
        " actual " +
        tagLength
    );
  }
  for (let iArg = 0; iArg < aArgs.length; iArg++) {
    const nodeId = "qfb-tag-" + aArgs[iArg];
    if (nodeId != kids[iArg + 1].id) {
      throw new Error(
        "Mismatch at tag " +
          iArg +
          " expected " +
          nodeId +
          " but got " +
          kids[iArg + 1].id
      );
    }
  }
}

/**
 * Verify that only the buttons corresponding to the provided tag keys are
 * checked.
 */
export function assert_tag_constraints_checked(...aArgs) {
  const expected = {};
  for (const arg of aArgs) {
    const nodeId = "qfb-tag-" + arg;
    expected[nodeId] = true;
  }

  const kids = mc.document.getElementById(
    "quickFilterBarTagsContainer"
  ).children;
  for (let iNode = 0; iNode < kids.length; iNode++) {
    const node = kids[iNode];
    if (node.pressed != node.id in expected) {
      throw new Error(
        "node " +
          node.id +
          " should " +
          (node.id in expected ? "be " : "not be ") +
          "checked."
      );
    }
  }
}

var nameToTextDomId = {
  sender: "qfb-qs-sender",
  recipients: "qfb-qs-recipients",
  subject: "qfb-qs-subject",
  body: "qfb-qs-body",
};

export async function toggle_text_constraints(...aArgs) {
  aArgs.forEach(arg =>
    EventUtils.synthesizeMouseAtCenter(
      about3Pane.document.getElementById(nameToTextDomId[arg]),
      { clickCount: 1 },
      about3Pane
    )
  );
  await wait_for_all_messages_to_load(mc);
}

/**
 * Assert that the text constraint buttons are checked.  Variable-argument
 *  support where the arguments are one of sender/recipients/subject/body.
 */
export function assert_text_constraints_checked(...aArgs) {
  const expected = {};
  for (const arg of aArgs) {
    const nodeId = nameToTextDomId[arg];
    expected[nodeId] = true;
  }

  const kids = about3Pane.document.querySelectorAll(
    "#quick-filter-bar-filter-text-bar button"
  );
  for (let iNode = 0; iNode < kids.length; iNode++) {
    const node = kids[iNode];
    if (node.tagName == "label") {
      continue;
    }
    if (node.pressed != node.id in expected) {
      throw new Error(
        "node " +
          node.id +
          " should " +
          (node.id in expected ? "be " : "not be ") +
          "checked."
      );
    }
  }
}

/**
 * Set the text in the text filter box, trigger it like enter was pressed, then
 *  wait for all messages to load.
 */
export async function set_filter_text(aText) {
  const searchBar = about3Pane.document.getElementById("qfb-qs-textbox");
  const eventPromise = BrowserTestUtils.waitForEvent(searchBar, "autocomplete");

  const textbox = searchBar.shadowRoot.querySelector("input");
  textbox.value = aText;
  textbox.dispatchEvent(new Event("input"));

  await eventPromise;
  await wait_for_all_messages_to_load(mc);
}

export function assert_filter_text(aText) {
  const textbox = get_about_3pane()
    .document.getElementById("qfb-qs-textbox")
    .shadowRoot.querySelector("input");
  if (textbox.value != aText) {
    throw new Error(
      "Expected text filter value of '" +
        aText +
        "' but got '" +
        textbox.value +
        "'"
    );
  }
}

/**
 * Assert that the results label is telling us there are aCount messages
 *  using the appropriate string.
 */
export function assert_results_label_count(aCount) {
  const resultsLabel = about3Pane.document.getElementById("qfb-results-label");
  const attributes = about3Pane.document.l10n.getAttributes(resultsLabel);
  if (aCount == 0) {
    Assert.deepEqual(
      attributes,
      { id: "quick-filter-bar-no-results", args: null },
      "results label should be displaying the no messages case"
    );
  } else {
    Assert.deepEqual(
      attributes,
      { id: "quick-filter-bar-results", args: { count: aCount } },
      `result count should show ${aCount}`
    );
  }
}

/**
 * Clear active constraints via any means necessary; state cleanup for testing,
 *  not to be used as part of a test.  Unlike normal clearing, this will kill
 *  the sticky bit.
 *
 * This is automatically called by the test teardown helper.
 */
export function clear_constraints() {
  about3Pane.quickFilterBar._testHelperResetFilterState();
}
