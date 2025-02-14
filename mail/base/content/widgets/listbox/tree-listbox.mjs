/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { TreeListboxMixin } from "chrome://messenger/content/tree-listbox-mixin.mjs";

/**
 * An unordered list with the functionality of TreeListboxMixin.
 *
 * @tagname tree-listbox
 * @augments {HTMLUListElement}
 * @mixes {TreeListboxMixin}
 */
class TreeListbox extends TreeListboxMixin(HTMLUListElement) {}
customElements.define("tree-listbox", TreeListbox, { extends: "ul" });
