/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailTabButton } from "chrome://messenger/content/unifiedtoolbar/mail-tab-button.mjs";

/**
 * Unified toolbar button for replying to a mailing list..
 */
class ReplyListButton extends MailTabButton {
  observedAboutMessageEvents = ["load", "MsgLoaded"];
}
customElements.define("reply-list-button", ReplyListButton, {
  extends: "button",
});
