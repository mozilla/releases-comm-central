/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { TestView } from "./tree-element-test-common.mjs";

const tree = document.getElementById("testTree");
tree.headerHidden = true;
tree.table.setBodyID("testBody");
tree.setAttribute("rows", "test-row");
tree.table.setColumns([
  {
    id: "testCol",
    name: `This is the header. You shouldn't see it.`,
  },
]);
tree.addEventListener("select", () => {
  console.log("select event, selected indices:", tree.selectedIndices);
});
tree.view = new TestView(0, 150);
