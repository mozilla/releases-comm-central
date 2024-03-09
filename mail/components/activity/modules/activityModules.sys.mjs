/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This module is designed to be a central place to initialise activity related
// modules.

import { sendLaterModule } from "resource:///modules/activity/sendLater.sys.mjs";

sendLaterModule.init();
import { moveCopyModule } from "resource:///modules/activity/moveCopy.sys.mjs";

moveCopyModule.init();
import { glodaIndexerActivity } from "resource:///modules/activity/glodaIndexer.sys.mjs";

glodaIndexerActivity.init();
import { autosyncModule } from "resource:///modules/activity/autosync.sys.mjs";

autosyncModule.init();
import { alertHook } from "resource:///modules/activity/alertHook.sys.mjs";

alertHook.init();
import { pop3DownloadModule } from "resource:///modules/activity/pop3Download.sys.mjs";

pop3DownloadModule.init();
