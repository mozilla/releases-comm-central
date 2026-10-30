/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const path = require("path");
const fs = require("fs");
const process = require("process");

// In normal setups, the Firefox checkout (from which we get our JSDocs plugins)
// lives in the parent directory. However, ReadTheDocs comes with a few
// limitations, including around changing the current working directory, which
// means we need to place the Firefox checkout in a separate location.
const FIREFOX_CHECKOUT_LOC =
  process.env.FIREFOX_CHECKOUT_LOC ?? path.join("..", "..");

function readFile(path) {
  return fs
    .readFileSync(path, { encoding: "utf-8" })
    .split("\n")
    .filter(p => p && !p.startsWith("#"))
    .map(p => p.replace(/^comm\//, "../"));
}

const ignorePatterns = [
  ...readFile(
    path.join(__dirname, "..", "tools", "lint", "ThirdPartyPaths.txt")
  ),
  ...readFile(path.join(__dirname, "..", "tools", "lint", "Generated.txt")),
];

module.exports = {
  plugins: [
    "skip-anonymous-locals",
    "skip-private-members",
    "skip-type-casts",
    "convert-descriptions-to-rst",
  ].map(plugin =>
    path.join(
      __dirname,
      FIREFOX_CHECKOUT_LOC,
      "docs",
      "jsdoc-plugins",
      `${plugin}.mjs`
    )
  ),
  recurseDepth: 10,
  source: {
    exclude: [
      "../calendar/base/calendar.js",
      "../calendar/base/content/calendar-task-tree-view.js",
      "../calendar/base/content/dialogs/calendar-event-dialog-attendees.js",
      "../calendar/base/content/dialogs/calendar-event-dialog-recurrence.js",
      "../calendar/base/content/widgets/calendar-filter.js",
      "../calendar/base/content/widgets/calendar-invitation-panel.js",
      "../calendar/base/content/widgets/calendar-notifications-setting.js",
      "../calendar/base/content/widgets/datetimepickers.js",
      "../calendar/providers/storage/CalStorageStatements.sys.mjs",

      "../chat/chat-prefs.js",
      "../chat/components/src/logger.sys.mjs",
      "../chat/modules/imContentSink.sys.mjs",
      "../chat/modules/jsProtoHelper.sys.mjs",

      "../mail/app/profile/all-thunderbird.js",
      "../mail/base/content/about3Pane.js",
      "../mail/base/content/widgets/customizable-toolbar.js",
      "../mail/branding/tb_beta/pref/thunderbird-branding.js",
      "../mail/branding/thunderbird/pref/thunderbird-branding.js",
      "../mail/components/accountcreation/modules/GuessConfig.sys.mjs",
      "../mail/components/activity/content/activity-widgets.js",
      "../mail/components/addrbook/content/vcard-edit/edit.mjs",
      "../mail/components/compose/composer.js",
      "../mail/components/storybook/node_modules",
      "../mail/components/unifiedtoolbar/content/items/mail-go-button.mjs",
      "../mail/components/unifiedtoolbar/modules/ToolbarMigration.sys.mjs",
      "../mail/extensions/am-e2e/prefs/e2e-prefs.js",
      "../mail/locales/en-US/all-l10n.js",
      "../mail/modules/DBViewWrapper.sys.mjs",
      "../mail/modules/SearchSpec.sys.mjs",
      "../mail/modules/UIFontSize.sys.mjs",

      "../mailnews/base/src/MailChannel.sys.mjs",
      "../mailnews/compose/src/MessageSend.sys.mjs",
      "../mailnews/compose/src/MimePart.sys.mjs",
      "../mailnews/db/gloda/modules/Collection.sys.mjs",
      "../mailnews/db/gloda/modules/GlodaDataModel.sys.mjs",
      "../mailnews/db/gloda/modules/GlodaExplicitAttr.sys.mjs",
      "../mailnews/db/gloda/modules/GlodaFundAttr.sys.mjs",
      "../mailnews/db/gloda/modules/GlodaIndexer.sys.mjs",
      "../mailnews/db/gloda/modules/GlodaUtils.sys.mjs",
      "../mailnews/db/gloda/modules/MimeMessage.sys.mjs",
      "../mailnews/db/gloda/modules/NounFreetag.sys.mjs",
      "../mailnews/db/gloda/modules/NounTag.sys.mjs",
      "../mailnews/extensions/mdn/mdn.js",
      "../mailnews/import/content/csv-field-map.js",
      "../mailnews/import/modules/BaseProfileImporter.sys.mjs",
      "../mailnews/mailnews.js",
      "../mailnews/news/src/NntpClient.sys.mjs",
      "../mailnews/news/src/NntpNewsGroup.sys.mjs",
      "../mailnews/test/resources/MessageGenerator.sys.mjs",

      "../suite",

      "../node_modules",

      ...ignorePatterns,
    ],
    includePattern: ".+\\.m?js(doc)?$",
    excludePattern: "(^|\\/|\\\\|browser|test)_",
  },
  opts: {
    recurse: true,
  },
};
