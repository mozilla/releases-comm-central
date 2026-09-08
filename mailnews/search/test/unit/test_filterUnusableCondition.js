/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A filter whose condition can't be turned into search terms must not match
 * anything. Matching everything would silently misfile all incoming mail.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Each entry is the raw text of one condition= line, plus whether the filter
 * is expected to survive loading as an enabled, usable filter.
 */
const CONDITIONS = [
  { condition: "AND (subject,contains,needle)", usable: true },
  { condition: "ALL", usable: true },
  { condition: "", usable: false },
  { condition: "AND subject,contains,needle", usable: false },
  { condition: "AND (subject,contains,needle", usable: false },
  { condition: "garbage", usable: false },
];

function buildRules() {
  let rules = 'version="9"\nlogging="no"\n';
  CONDITIONS.forEach(({ condition }, index) => {
    rules +=
      `name="filter${index}"\n` +
      'enabled="yes"\n' +
      'type="17"\n' +
      'action="Move to folder"\n' +
      `actionValue="mailbox://nobody@Local%20Folders/target${index}"\n` +
      `condition="${condition.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"\n`;
  });
  return rules;
}

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
  localAccountUtils.inboxFolder.addMessage(
    "From: sender@test.invalid\r\n" +
      "To: recipient@test.invalid\r\n" +
      "Subject: nothing of interest here\r\n" +
      "Message-ID: <1@test.invalid>\r\n" +
      "\r\n" +
      "body\r\n"
  );
});

add_task(async function testUnusableConditionsDontMatch() {
  const file = do_get_profile().clone();
  file.append("msgFilterRules.dat");
  await IOUtils.writeUTF8(file.path, buildRules());

  const filterList = MailServices.filters.OpenFilterList(
    file,
    localAccountUtils.incomingServer.rootFolder,
    null
  );
  Assert.equal(
    filterList.filterCount,
    CONDITIONS.length,
    "all filters should still be loaded, even the unparseable ones"
  );

  const inbox = localAccountUtils.inboxFolder;
  const msgHdr = [...inbox.messages][0];

  for (const [index, { condition, usable }] of CONDITIONS.entries()) {
    const filter = filterList.getFilterAt(index);
    Assert.equal(
      filter.enabled,
      usable,
      `filter with condition "${condition}" should be ${
        usable ? "enabled" : "disabled"
      }`
    );
    if (!usable) {
      Assert.equal(
        filter.searchTerms.length,
        0,
        `filter with condition "${condition}" should have no search terms`
      );
    }
  }

  // "ALL" is the only filter here that is meant to match this message.
  const matching = [];
  for (let index = 0; index < filterList.filterCount; index++) {
    const filter = filterList.getFilterAt(index);
    if (filter.MatchHdr(msgHdr, inbox, inbox.msgDatabase, "")) {
      matching.push(filter.filterName);
    }
  }
  Assert.deepEqual(
    matching,
    ["filter1"],
    "only the match-all filter should match an unrelated message"
  );
});

/**
 * A filter built in memory with no search terms at all (not via the file
 * parser) must not match either.
 */
add_task(function testFilterWithNoTermsDoesntMatch() {
  const filterList = MailServices.filters.getTempFilterList(
    localAccountUtils.inboxFolder
  );
  const filter = filterList.createFilter("no terms");
  const inbox = localAccountUtils.inboxFolder;
  const msgHdr = [...inbox.messages][0];

  Assert.ok(
    !filter.MatchHdr(msgHdr, inbox, inbox.msgDatabase, ""),
    "a filter without search terms should not match"
  );
});
