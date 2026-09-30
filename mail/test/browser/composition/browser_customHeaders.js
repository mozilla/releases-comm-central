/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test mail.compose.other.header is rendered and handled correctly.
 */
var {
  close_compose_window,
  get_msg_source,
  open_compose_new_mail,
  save_compose_message,
  open_compose_from_draft,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { be_in_folder, select_click_row, get_special_folder } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );

add_task(async function test_headerLabelWidths() {
  const header = "X-A-Very-Long-Custom-Header-That-Exceeds-The-Label-Limit";
  await SpecialPowers.pushPrefEnv({
    set: [["mail.compose.other.header", header]],
  });
  let cwc;
  let headers;
  try {
    cwc = await open_compose_new_mail();
    const doc = cwc.document;
    headers = doc.getElementById("MsgHeadersToolbar");
    const customRow = doc.getElementById(`addressRow${header}`);
    const toLabel = doc.getElementById("toAddrLabel").parentElement;
    const labelWidth = () => toLabel.getBoundingClientRect().width;
    const maximumWidth =
      parseFloat(cwc.getComputedStyle(doc.documentElement).fontSize) * 11.5;

    function checkAlignment() {
      const reference = toLabel.getBoundingClientRect();
      const labels = doc.querySelectorAll(
        "#identityLabel-box, #subjectLabel-box, .address-row:not(.hidden) > .address-label-container"
      );
      for (const label of labels) {
        const rect = label.getBoundingClientRect();
        Assert.equal(rect.x, reference.x, "Header labels should be aligned");
        Assert.equal(
          rect.width,
          reference.width,
          "Header label widths should match"
        );
      }

      const fromRow = doc
        .getElementById("top-gradient-box")
        .getBoundingClientRect();
      const identity = doc
        .getElementById("msgIdentity")
        .getBoundingClientRect();
      for (const button of doc.querySelectorAll(
        "#extraAddressRowsArea > button:not([hidden])"
      )) {
        const rect = button.getBoundingClientRect();
        Assert.greaterOrEqual(
          rect.top,
          fromRow.top,
          "Recipient buttons should not extend above the From line"
        );
        Assert.lessOrEqual(
          rect.bottom,
          fromRow.bottom,
          "Recipient buttons should not extend below the From line"
        );
        if (cwc.getComputedStyle(button).direction == "rtl") {
          Assert.lessOrEqual(
            rect.right,
            identity.left,
            "Recipient buttons should follow the From field in RTL"
          );
        } else {
          Assert.greaterOrEqual(
            rect.left,
            identity.right,
            "Recipient buttons should follow the From field in LTR"
          );
        }
      }
    }

    for (const direction of ["ltr", "rtl"]) {
      headers.style.direction = direction;
      const initialWidth = labelWidth();
      Assert.less(
        initialWidth,
        maximumWidth,
        "Short labels should use less than 11.5rem"
      );
      checkAlignment();

      cwc.addressRowSetVisibility(customRow, true);
      Assert.greater(
        labelWidth(),
        initialWidth,
        "A longer visible header should widen the labels"
      );
      Assert.less(
        Math.abs(labelWidth() - maximumWidth),
        1,
        "Long labels should be capped at 11.5rem"
      );
      checkAlignment();

      const recipients = doc.getElementById("recipientsContainer");
      recipients.style.maxBlockSize = "40px";
      Assert.greater(
        recipients.scrollHeight,
        recipients.clientHeight,
        "Recipient rows should still overflow into a scrollable area"
      );
      recipients.scrollTop = recipients.scrollHeight;
      Assert.greater(
        recipients.scrollTop,
        0,
        "Recipient rows should remain scrollable"
      );
      checkAlignment();
      recipients.style.maxBlockSize = "";

      cwc.addressRowSetVisibility(customRow, false);
      Assert.equal(
        labelWidth(),
        initialWidth,
        "Hidden headers should not take up label space"
      );
      checkAlignment();
    }
  } finally {
    try {
      if (cwc && !cwc.closed) {
        headers?.style.removeProperty("direction");
        await close_compose_window(cwc);
      }
    } finally {
      await SpecialPowers.popPrefEnv();
    }
  }
});

/**
 * Test custom headers are set and encoded correctly.
 */
add_task(async function test_customHeaders() {
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true
  );

  // Set other.header so that they will be rendered in compose window.
  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "mail.compose.other.header",
        "X-Header1, X-Header2, Approved ,Supersedes, References, In-Reply-To",
      ],
    ],
  });

  // Set values to custom headers.
  let cwc = await open_compose_new_mail();
  const customHeaderRow = cwc.document.getElementById("addressRowX-Header1");
  cwc.addressRowSetVisibility(customHeaderRow, true);
  const customHeaderRect = customHeaderRow
    .querySelector(".address-container")
    .getBoundingClientRect();
  const toHeaderRect = cwc.document
    .getElementById("toAddrContainer")
    .getBoundingClientRect();
  Assert.equal(
    customHeaderRect.x,
    toHeaderRect.x,
    "custom and built-in header inputs should be aligned"
  );
  Assert.equal(
    customHeaderRect.width,
    toHeaderRect.width,
    "custom and built-in header inputs should have the same width"
  );

  const inputs = cwc.document.querySelectorAll(".address-row-raw input");
  inputs[0].value = "Test äöü";
  inputs[1].value = "Test 😃";
  inputs[2].value = "moderator@tinderbox.com";
  inputs[3].value = "<message-id-1234@tinderbox.com>";
  inputs[4].value =
    "<4682279b-0f22-482e-9de2-b3ea45fa8c57@test> <d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>";
  inputs[5].value = "<d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>";

  await save_compose_message(cwc);
  await close_compose_window(cwc);
  await TestUtils.waitForCondition(
    () => draftsFolder.getTotalMessages(false) == 1,
    "message saved to drafts folder"
  );

  await be_in_folder(draftsFolder);
  const draftMsg = await select_click_row(0);
  const draftMsgLines = (await get_msg_source(draftMsg)).split("\n");

  // Check header values are set and encoded correctly.
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "X-Header1: =?UTF-8?B?VGVzdCDDpMO2w7w=?="
    ),
    "Correct X-Header1 found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "X-Header2: =?UTF-8?B?VGVzdCDwn5iD?="
    ),
    "Correct X-Header2 found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "Approved: moderator@tinderbox.com"
    ),
    "Correct Approved found"
  );
  Assert.ok(
    draftMsgLines.some(
      line => line.trim() == "Supersedes: <message-id-1234@tinderbox.com>"
    ),
    "Correct Supersedes found"
  );
  Assert.ok(
    draftMsgLines
      .join("\n")
      .includes(
        "References: <4682279b-0f22-482e-9de2-b3ea45fa8c57@test>\r\n <d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>"
      ),
    "Correct References found"
  );
  Assert.ok(
    draftMsgLines.some(
      line =>
        line.trim() ==
        "In-Reply-To: <d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>"
    ),
    "Correct In-Reply-To found"
  );

  cwc = await open_compose_from_draft();
  const inputs2 = cwc.document.querySelectorAll(".address-row-raw input");

  Assert.equal(inputs2[0].value, "Test äöü", "should find correct X-Header1");
  Assert.equal(inputs2[1].value, "Test 😃", "should find correct X-Header2");
  Assert.equal(
    inputs2[2].value,
    "moderator@tinderbox.com",
    "should find correct Approved"
  );
  Assert.equal(
    inputs2[3].value,
    "<message-id-1234@tinderbox.com>",
    "should find correct Supersedes"
  );
  Assert.equal(
    inputs2[4].value,
    "<4682279b-0f22-482e-9de2-b3ea45fa8c57@test> <d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>",
    "should find correct References"
  );
  Assert.equal(
    inputs2[5].value,
    "<d13ea217-0672-4c24-b9a9-4ab3771e25e7@test>",
    "should find correct In-Reply-To"
  );

  await close_compose_window(cwc);
});
