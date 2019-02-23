/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* global MozElements, MozXULElement, activityManager */

/**
 * The MozActivityGroup widget displays information about the activities of
 * the group: e.g. name of the group, list of the activities with their name,
 * progress and icon. It is shown in Activity manager window. It gets removed
 * when there is no activities from the group.
 * @extends {MozElements.MozRichlistitem}
 */
class MozActivityGroup extends MozElements.MozRichlistitem {
  static get inheritedAttributes() {
    return {
      ".contextDisplayText": "value=contextDisplayText,tooltiptext=contextDisplayText",
    };
  }
  constructor() {
    super();

    this.appendChild(MozXULElement.parseXULToFragment(`
        <vbox flex="1">
          <hbox>
            <vbox pack="start">
              <label crop="left" class="contextDisplayText"></label>
            </vbox>
          </hbox>
          <vbox pack="center">
            <richlistbox class="activitygroupbox activityview" seltype="multiple" flex="1"></richlistbox>
          </vbox>
        </vbox>
    `));

    this.contextType = "";

    this.contextObj = null;
  }

  connectedCallback() {
    this.initializeAttributeInheritance();
  }

  get isGroup() {
    return true;
  }

  get processes() {
    return this.querySelector(".activitygroupbox");
  }

  retry() {
    let processes = activityManager.getProcessesByContext(this.contextType,
      this.contextObj, {});
    for (let process of processes) {
      if (process.retryHandler) {
        process.retryHandler.retry(process);
      }
    }
  }
}

MozXULElement.implementCustomInterface(
  MozActivityGroup, [Ci.nsIDOMXULSelectControlItemElement]
);

customElements.define("activity-group", MozActivityGroup, { extends: "richlistitem" });
