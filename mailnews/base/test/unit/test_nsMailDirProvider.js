/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMailDirProvider to check we get the right directories and
 * files.
 */

function run_test() {
  const items = [
    { key: "MailD", value: "Mail" },
    { key: "IMapMD", value: "ImapMail" },
    { key: "NewsD", value: "News" },
    { key: "MLFCaF", value: "panacea.dat" }, // Legacy folder cache.
    { key: "MFCaF", value: "folderCache.json" },
  ];

  items.forEach(function (item) {
    var dir = Services.dirsvc.get(item.key, Ci.nsIFile);
    dump(do_get_profile().path + " " + dir.path + "\n");
    Assert.ok(do_get_profile().equals(dir.parent));

    Assert.equal(dir.leafName, item.value);
  });
}
