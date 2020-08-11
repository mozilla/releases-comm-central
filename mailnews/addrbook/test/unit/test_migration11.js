const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");

function checkFilterList(actual, ...expected) {
  info(actual.listId);
  Assert.equal(actual.filterCount, expected.length);

  for (let i = 0; i < expected.length; i++) {
    let filter = actual.getFilterAt(i);
    Assert.equal(filter.searchTerms.length, expected[i].length);

    for (let j = 0; j < expected[i].length; j++) {
      let term = filter.searchTerms.queryElementAt(j, Ci.nsIMsgSearchTerm);
      Assert.equal(term.op, expected[i][j].op);
      Assert.equal(term.value.str, expected[i][j].value);
    }
  }
}

add_task(async () => {
  let account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );

  let folder = account.incomingServer.rootFolder;
  let datFile = folder.filePath.clone();

  let source = do_get_file("data/msgFilterRules.dat");
  info(`source is at ${source.path}`);
  source.copyTo(datFile, "");

  info(`datFile is at ${datFile.path}`);
  datFile.append("msgFilterRules.dat");
  Assert.ok(datFile.exists());

  checkFilterList(
    folder.getFilterList(null),
    [
      {
        op: Ci.nsMsgSearchOp.IsInAB,
        value: "moz-abmdbdirectory://abook-7.mab",
      },
      { op: Ci.nsMsgSearchOp.Contains, value: "nothing" },
    ],
    [
      {
        op: Ci.nsMsgSearchOp.IsntInAB,
        value: "moz-abmdbdirectory://abook-8.na2.mab",
      },
    ],
    [{ op: Ci.nsMsgSearchOp.Contains, value: "unrelated" }]
  );

  Assert.ok(!Services.prefs.getBoolPref("mailnews.filters.migration78", false));
  MailMigrator._migrateMailFilters78();
  Assert.ok(Services.prefs.getBoolPref("mailnews.filters.migration78", false));

  checkFilterList(
    folder.getFilterList(null),
    [
      {
        op: Ci.nsMsgSearchOp.IsInAB,
        value: "jsaddrbook://abook-7.sqlite",
      },
      { op: Ci.nsMsgSearchOp.Contains, value: "nothing" },
    ],
    [
      {
        op: Ci.nsMsgSearchOp.IsntInAB,
        value: "jsaddrbook://abook-8.sqlite",
      },
    ],
    [{ op: Ci.nsMsgSearchOp.Contains, value: "unrelated" }]
  );

  let datFileContents = await OS.File.read(datFile.path);
  datFileContents = new TextDecoder().decode(datFileContents);
  info(datFileContents);

  Assert.ok(
    datFileContents.includes(
      `condition="AND (from,is in ab,jsaddrbook://abook-7.sqlite) AND (subject,contains,nothing)"`
    )
  );
});
