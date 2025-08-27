/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { SeamonkeyProfileImporter } = ChromeUtils.importESModule(
  "resource:///modules/SeamonkeyProfileImporter.sys.mjs"
);

add_task(async function testSeamonkeyProfileImporter() {
  let seamonkeyRoot;
  const tempDir = PathUtils.tempDir;

  if (AppConstants.platform == "win") {
    Services.dirsvc.set("AppData", await IOUtils.getFile(tempDir));
    seamonkeyRoot = PathUtils.join(tempDir, "Mozilla", "SeaMonkey");
  } else if (AppConstants.platform == "macosx") {
    Services.dirsvc.set("ULibDir", await IOUtils.getFile(tempDir));
    seamonkeyRoot = PathUtils.join(tempDir, "Application Support", "SeaMonkey");
  } else {
    Services.dirsvc.set("Home", await IOUtils.getFile(tempDir));
    seamonkeyRoot = PathUtils.join(tempDir, ".mozilla", "seamonkey");
  }

  const profile7Dir = PathUtils.join(tempDir, "abr83c60.absolute");
  const profile6Dir = PathUtils.join(seamonkeyRoot, "46p0rsey.relative");
  await IOUtils.makeDirectory(profile7Dir);
  await IOUtils.makeDirectory(profile6Dir);
  await IOUtils.writeUTF8(
    PathUtils.join(seamonkeyRoot, "profiles.ini"),
    [
      // A profile with an absolute path.
      "[Profile7]",
      "Name=absolute",
      `Path=${profile7Dir}`,
      "",
      // A profile with a relative path.
      "[Profile6]",
      "Name=relative",
      "IsRelative=1",
      "Path=46p0rsey.relative",
      "",
      // A profile that no longer exists.
      "[Profile0]",
      "Name=gone",
      "IsRelative=1",
      "Path=nu9nvq20.gone",
      "",
    ].join("\n")
  );

  const importer = new SeamonkeyProfileImporter();
  const profiles = await importer.getSourceProfiles();
  Assert.equal(profiles.length, 2, "2 profiles should be found");
  Assert.equal(profiles[0].name, "absolute", "profile name should match");
  Assert.equal(
    profiles[0].dir.path,
    profile7Dir,
    "absolute profile path should match"
  );
  Assert.equal(profiles[1].name, "relative", "profile name should match");
  Assert.equal(
    profiles[1].dir.path,
    profile6Dir,
    "relative profile path should match"
  );
});
