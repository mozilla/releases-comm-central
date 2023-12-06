/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { UnifiedToolbarButton } from "chrome://messenger/content/unifiedtoolbar/unified-toolbar-button.mjs";

/**
 * Unified toolbar button that opens the add-ons manager.
 */
class AddonsButton extends UnifiedToolbarButton {
  handleClick = event => {
    window.openAddonsMgr();
    event.preventDefault();
    event.stopPropagation();
  };
}
customElements.define("addons-button", AddonsButton, {
  extends: "button",
});
