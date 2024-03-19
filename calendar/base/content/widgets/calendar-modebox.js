/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * A calendar-modebox directly extends to a xul:box element with extra functionality. Like a
   * xul:hbox it has a horizontal orientation. It is designed to be displayed only:
   * 1) in given application modes (e.g "task" mode, "calendar" mode) and
   * 2) only in relation to the "checked" attribute of a control (e.g. a command or checkbox).
   *
   * - The attribute "mode" denotes a comma-separated list of all modes that the modebox should
   *   not be collapsed in, e.g. `mode="calendar,task"`.
   * - The attribute "current" denotes the current viewing mode.
   * - The attribute "refcontrol" points to a control, either a "command", "checkbox" or other
   *   elements that support a "checked" attribute, that is often used to denote whether a
   *   modebox should be displayed or not. If "refcontrol" is set to the id of a command you
   *   can there set the oncommand attribute like:
   *   `oncommand='document.getElementById('my-mode-pane').togglePane(event)`.
   *   In case it is a checkbox element or derived checkbox element this is done automatically
   *   by listening to the event "CheckboxChange". So if the current application mode is one of
   *   the modes listed in the "mode" attribute it is additionally verified whether the element
   *   denoted by "refcontrol" is checked or not.
   * - The attribute "collapsedinmodes" is a comma-separated list of the modes the modebox
   *   should be collapsed in (e.g. "mail,calendar").  For example, if the user collapses a
   *   modebox when in a given mode, that mode would be added to "collapsedinmodes". This
   *   attribute is made persistent across restarts.
   *
   * @augments {MozXULElement}
   */
  class CalendarModebox extends MozXULElement {
    static get observedAttributes() {
      return ["current"];
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.mRefControl = null;

      if (this.hasAttribute("refcontrol")) {
        this.mRefControl = document.getElementById(this.getAttribute("refcontrol"));
        if (this.mRefControl && this.mRefControl.localName == "checkbox") {
          this.mRefControl.addEventListener("CheckboxStateChange", this, true);
        }
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      if (name == "current" && oldValue != newValue) {
        const display = this.isVisibleInMode(newValue);
        this.setVisible(display, false, true);
      }
    }

    get currentMode() {
      return this.getAttribute("current");
    }

    /**
     * The event handler for various events relevant to CalendarModebox.
     *
     * @param {Event} event - The event.
     */
    handleEvent(event) {
      if (event.type == "CheckboxStateChange") {
        this.onCheckboxStateChange(event);
      }
    }

    /**
     * A "mode attribute" contains comma-separated lists of values, for example:
     * `modewidths="200,200,200"`. Each of these values corresponds to one of the modes in
     * the "mode" attribute: `mode="mail,calendar,task"`. This function sets a new value for
     * a given mode in a given "mode attribute".
     *
     * @param {string} attributeName - A "mode attribute" in which to set a new value.
     * @param {string} value - A new value to set.
     * @param {string} [mode=this.currentMode] - Set the value for this mode.
     */
    setModeAttribute(attributeName, value, mode = this.currentMode) {
      if (!this.hasAttribute(attributeName)) {
        return;
      }
      const attributeValues = this.getAttribute(attributeName).split(",");
      const modes = this.getAttribute("mode").split(",");
      attributeValues[modes.indexOf(mode)] = value;
      this.setAttribute(attributeName, attributeValues.join(","));
    }

    /**
     * A "mode attribute" contains comma-separated lists of values, for example:
     * `modewidths="200,200,200"`. Each of these values corresponds to one of the modes in
     * the "mode" attribute: `mode="mail,calendar,task"`. This function returns the value
     * for a given mode in a given "mode attribute".
     *
     * @param {string} attributeName - A "mode attribute" to get a value from.
     * @param {string} [mode=this.currentMode] - Get the value for this mode.
     * @returns {string} The value found in the mode attribute or an empty string.
     */
    getModeAttribute(attributeName, mode = this.currentMode) {
      if (!this.hasAttribute(attributeName)) {
        return "";
      }
      const attributeValues = this.getAttribute(attributeName).split(",");
      const modes = this.getAttribute("mode").split(",");
      return attributeValues[modes.indexOf(mode)];
    }

    /**
     * Sets the visibility (collapsed state) of this modebox and (optionally) updates the
     * `collapsedinmode` attribute and (optionally) notifies the `refcontrol`.
     *
     * @param {boolean} visible - Whether the modebox should become visible or not.
     * @param {boolean} [toPushModeCollapsedAttribute=true] - Whether to push the current mode
     *                                                       to `collapsedinmodes` attribute.
     * @param {boolean} [toNotifyRefControl=true] - Whether to notify the `refcontrol`.
     */
    setVisible(visible, toPushModeCollapsedAttribute = true, toNotifyRefControl = true) {
      const pushModeCollapsedAttribute = toPushModeCollapsedAttribute === true;
      const notifyRefControl = toNotifyRefControl === true;

      let collapsedModes = [];
      let modeIndex = -1;
      let collapsedInMode = false;

      if (this.hasAttribute("collapsedinmodes")) {
        collapsedModes = this.getAttribute("collapsedinmodes").split(",");
        modeIndex = collapsedModes.indexOf(this.currentMode);
        collapsedInMode = modeIndex > -1;
      }

      let display = visible;
      if (display && !pushModeCollapsedAttribute) {
        display = !collapsedInMode;
      }

      this.collapsed = !display || !this.isVisibleInMode();

      if (pushModeCollapsedAttribute) {
        if (!display) {
          if (modeIndex == -1) {
            collapsedModes.push(this.currentMode);
            if (this.getAttribute("collapsedinmodes") == ",") {
              collapsedModes.splice(0, 2);
            }
          }
        } else if (modeIndex > -1) {
          collapsedModes.splice(modeIndex, 1);
          if (collapsedModes.join(",") == "") {
            collapsedModes[0] = ",";
          }
        }
        this.setAttribute("collapsedinmodes", collapsedModes.join(","));

        Services.xulStore.persist(this, "collapsedinmodes");
      }

      if (notifyRefControl && this.hasAttribute("refcontrol")) {
        const command = document.getElementById(this.getAttribute("refcontrol"));
        if (command) {
          command.setAttribute("checked", display);
          command.disabled = !this.isVisibleInMode();
        }
      }
    }

    /**
     * Return whether this modebox is visible for a given mode, according to both its
     * `mode` and `collapsedinmodes` attributes.
     *
     * @param {string} [mode=this.currentMode] - Is the modebox visible for this mode?
     * @returns {boolean} Whether this modebox is visible for the given mode.
     */
    isVisible(mode = this.currentMode) {
      if (!this.isVisibleInMode(mode)) {
        return false;
      }
      const collapsedModes = this.getAttribute("collapsedinmodes")?.split(",");
      return !collapsedModes?.includes(mode);
    }

    /**
     * Returns whether this modebox is visible for a given mode, according to its
     * `mode` attribute.
     *
     * @param {string} [mode=this.currentMode] - Is the modebox visible for this mode?
     * @returns {boolean} Whether this modebox is visible for the given mode.
     */
    isVisibleInMode(mode = this.currentMode) {
      return this.hasAttribute("mode") ? this.getAttribute("mode").split(",").includes(mode) : true;
    }

    /**
     * Used to toggle the checked state of a command connected to this modebox, and set the
     * visibility of this modebox accordingly.
     *
     * @param {Event} event - An event with a command (with a checked attribute) as its target.
     */
    togglePane(event) {
      const command = event.target;
      const newValue = command.getAttribute("checked") == "true" ? "false" : "true";
      command.setAttribute("checked", newValue);
      this.setVisible(newValue == "true", true, true);
    }

    /**
     * Handles a change in a checkbox state, by making this modebox visible or not.
     *
     * @param {Event} event - An event with a target that has a `checked` attribute.
     */
    onCheckboxStateChange(event) {
      const newValue = event.target.checked;
      this.setVisible(newValue, true, true);
    }
  }

  customElements.define("calendar-modebox", CalendarModebox);

  /**
   * A `calendar-modebox` but with a vertical orientation like a `vbox`. (Different Custom
   * Elements cannot be defined using the same class, thus we need this subclass.)
   *
   * @augments {CalendarModebox}
   */
  class CalendarModevbox extends CalendarModebox {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      super.connectedCallback();
      this.setAttribute("orient", "vertical");
    }
  }

  customElements.define("calendar-modevbox", CalendarModevbox);
}
