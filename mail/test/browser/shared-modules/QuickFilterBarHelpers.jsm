/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = [
  "assert_quick_filter_button_enabled",
  "assert_quick_filter_bar_visible",
  "toggle_quick_filter_bar",
  "assert_constraints_expressed",
  "toggle_boolean_constraints",
  "toggle_tag_constraints",
  "toggle_tag_mode",
  "assert_tag_constraints_visible",
  "assert_tag_constraints_checked",
  "toggle_text_constraints",
  "assert_text_constraints_checked",
  "set_filter_text",
  "assert_filter_text",
  "assert_results_label_count",
  "clear_constraints",
  "cleanup_qfb_button",
];

var { get_about_3pane, mc, wait_for_all_messages_to_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

var { Assert } = ChromeUtils.importESModule(
  "resource://testing-common/Assert.sys.mjs"
);
var { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);

const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

const { getDefaultItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

let about3Pane = get_about_3pane();
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

async function cleanup_qfb_button() {
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

async function assert_quick_filter_button_enabled(aEnabled) {
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

function assert_quick_filter_bar_visible(aVisible) {
  let bar = about3Pane.document.getElementById("quick-filter-bar");
  if (aVisible) {
    Assert.ok(
      BrowserTestUtils.is_visible(bar),
      "Quick filter bar should be visible"
    );
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(bar),
      "Quick filter bar should be hidden"
    );
  }
}

/**
 * Toggle the state of the message filter bar as if by a mouse click.
 */
async function toggle_quick_filter_bar() {
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
function assert_constraints_expressed(aConstraints) {
  for (let name in nameToBarDomId) {
    let domId = nameToBarDomId[name];
    let expectedValue = name in aConstraints ? aConstraints[name] : false;
    let domNode = about3Pane.document.getElementById(domId);
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
async function toggle_boolean_constraints(...aArgs) {
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
async function toggle_tag_constraints(...aArgs) {
  aArgs.forEach(function (arg) {
    let tagId = "qfb-tag-" + arg;
    let button = about3Pane.document.getElementById(tagId);
    button.scrollIntoView();
    EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, about3Pane);
  });
  await wait_for_all_messages_to_load(mc);
}

/**
 * Set the tag filtering mode. Wait for messages after.
 */
async function toggle_tag_mode() {
  let qbm = about3Pane.document.getElementById("qfb-boolean-mode");
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
function assert_tag_constraints_visible(...aArgs) {
  // the stupid bar should be visible if any arguments are specified
  let tagBar = get_about_3pane().document.getElementById(
    "quickFilterBarTagsContainer"
  );
  if (aArgs.length > 0) {
    Assert.ok(
      BrowserTestUtils.is_visible(tagBar),
      "The tag bar should not be collapsed!"
    );
  }

  let kids = tagBar.children;
  let tagLength = kids.length - 1; // -1 for the qfb-boolean-mode widget
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
    let nodeId = "qfb-tag-" + aArgs[iArg];
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
function assert_tag_constraints_checked(...aArgs) {
  let expected = {};
  for (let arg of aArgs) {
    let nodeId = "qfb-tag-" + arg;
    expected[nodeId] = true;
  }

  let kids = mc.document.getElementById("quickFilterBarTagsContainer").children;
  for (let iNode = 0; iNode < kids.length; iNode++) {
    let node = kids[iNode];
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

async function toggle_text_constraints(...aArgs) {
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
function assert_text_constraints_checked(...aArgs) {
  let expected = {};
  for (let arg of aArgs) {
    let nodeId = nameToTextDomId[arg];
    expected[nodeId] = true;
  }

  let kids = about3Pane.document.querySelectorAll(
    "#quick-filter-bar-filter-text-bar button"
  );
  for (let iNode = 0; iNode < kids.length; iNode++) {
    let node = kids[iNode];
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
async function set_filter_text(aText) {
  // We're not testing the reliability of the textbox widget; just poke our text
  // in and trigger the command logic.
  let textbox = about3Pane.document
    .getElementById("qfb-qs-textbox")
    .shadowRoot.querySelector("input");
  textbox.value = aText;
  textbox.dispatchEvent(new Event("input"));
  await wait_for_all_messages_to_load(mc);
}

function assert_filter_text(aText) {
  let textbox = get_about_3pane()
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
function assert_results_label_count(aCount) {
  let resultsLabel = about3Pane.document.getElementById("qfb-results-label");
  let attributes = about3Pane.document.l10n.getAttributes(resultsLabel);
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
function clear_constraints() {
  about3Pane.quickFilterBar._testHelperResetFilterState();
}
