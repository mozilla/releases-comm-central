/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Tests for bug 534822 - non-built-in address books specified in preferences
 * don't appear in address book lists.
 */

function run_test() {
  // Read in the prefs that will be default.
  let specialPrefs = do_get_file("data/bug534822prefs.js");

  var profileDir = do_get_profile();
  specialPrefs.copyTo(profileDir, "");

  specialPrefs = profileDir;
  specialPrefs.append("bug534822prefs.js");

  Services.prefs.readUserPrefsFromFile(specialPrefs);

  // Now load the ABs and check we've got all of them.
  const results = [
    { name: "extension", result: false },
    { name: kPABData.dirName, result: false },
    { name: kCABData.dirName, result: false },
  ];

  for (const dir of MailServices.ab.directories) {
    for (let i = 0; i < results.length; ++i) {
      if (results[i].name == dir.dirName) {
        Assert.ok(!results[i].result);
        results[i].result = true;
      }
    }
  }

  results.forEach(function (result) {
    Assert.ok(result.result);
  });
}
