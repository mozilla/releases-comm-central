/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

let instance = null;

// If the helper service isn't present, we weren't compiled with the needed
// support.
if (
  AppConstants.platform == "win" &&
  "@mozilla.org/mail/windows-search-helper;1" in Cc
) {
  const { SearchIntegration } = ChromeUtils.importESModule(
    "resource:///modules/WinSearchIntegration.sys.mjs"
  );
  instance = new SearchIntegration();
} else if (AppConstants.platform == "macosx") {
  const { SearchIntegration } = ChromeUtils.importESModule(
    "resource:///modules/SpotlightIntegration.sys.mjs"
  );
  instance = new SearchIntegration();
}

export { instance as SearchIntegration };
