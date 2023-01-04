/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

//TODO keyboard handling, keyboard + commands

/**
 * Toolbar button implementation for the unified toolbar.
 * Template ID: unifiedToolbarButtonTemplate
 * Attributes:
 * - command: ID string of the command to execute when the button is pressed.
 * - observes: ID of command to observe for disabled state. Defaults to value of
 *   command attribute.
 * - popup: ID of the popup to open when the button is pressed. The popup is
 *   anchored to the button. Overrides any other click handling.
 * - disabled: When set the button is disabled.
 * - title: Tooltip to show on the button.
 * - label: Label text of the button. Observed for changes.
 * - label-id: A fluent ID for the label instead of the label attribute.
 *   Observed for changes.
 * - badge-text
 * - badge-color
 * - aria-pressed: set to "false" to make the button behave like a toggle.
 */
export class UnifiedToolbarButton extends HTMLButtonElement {
  static get observedAttributes() {
    return ["label", "label-id"];
  }

  /**
   * Container for the button label.
   *
   * @type {?HTMLSpanElement}
   */
  label = null;

  /**
   * Name of the command this button follows the disabled (and if it is a toggle
   * button the checked) state of.
   *
   * @type {string?}
   */
  observedCommand;

  /**
   * The mutation observer observing the command this button follows the state
   * of.
   *
   * @type {MutationObserver?}
   */
  #observer = null;

  connectedCallback() {
    // We remove the mutation overserver when the element is disconnected, thus
    // we have to add it every time the element is connected.
    this.observedCommand =
      this.getAttribute("observes") || this.getAttribute("command");
    if (this.observedCommand) {
      const command = document.getElementById(this.observedCommand);
      if (command) {
        if (!this.#observer) {
          this.#observer = new MutationObserver(this.#handleCommandMutation);
        }
        const observedAttributes = ["disabled"];
        if (this.hasAttribute("aria-pressed")) {
          observedAttributes.push("checked");

          // Update the pressed state from the command
          this.setAttribute(
            "aria-pressed",
            command.getAttribute("checked") ?? "false"
          );
        }
        this.#observer.observe(command, {
          attributes: true,
          attributeFilter: observedAttributes,
        });
      }
      // Update the disabled state to match the current state of the command.
      const controller = document.commandDispatcher.getControllerForCommand(
        this.observedCommand
      );
      this.disabled = !(
        controller?.isCommandEnabled(this.observedCommand) ?? false
      );
    }
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;
    this.classList.add("unified-toolbar-button");

    const template = document
      .getElementById("unifiedToolbarButtonTemplate")
      .content.cloneNode(true);
    this.label = template.querySelector("span");
    this.#updateLabel();
    this.appendChild(template);
    this.addEventListener("click", this.handleClick);
  }

  disconnectedCallback() {
    if (this.#observer) {
      this.#observer.disconnect();
    }
  }

  attributeChangedCallback(attribute) {
    if (attribute === "label" || attribute === "label-id") {
      this.#updateLabel();
    }
  }

  /**
   * Default handling for clicks on the button. Shows the associated popup,
   * executes the given command and toggles the button state.
   *
   * @param {MouseEvent} event - Click event.
   */
  handleClick = event => {
    if (this.hasAttribute("popup")) {
      event.preventDefault();
      event.stopPropagation();
      const popup = document.getElementById(this.getAttribute("popup"));
      popup.openPopup(this, "after_start");
      this.setAttribute("aria-pressed", "true");
      popup.addEventListener(
        "popuphiding",
        () => {
          this.removeAttribute("aria-pressed");
        },
        { once: true }
      );
      return;
    }
    if (this.hasAttribute("aria-pressed")) {
      const isPressed = this.getAttribute("aria-pressed") === "true";
      this.setAttribute("aria-pressed", (!isPressed).toString());
    }
    if (this.hasAttribute("command")) {
      const command = this.getAttribute("command");
      const controller = document.commandDispatcher.getControllerForCommand(
        command
      );
      if (controller) {
        event.preventDefault();
        event.stopPropagation();
        if (controller.isCommandEnabled(command)) {
          controller.doCommand(command);
        }
      }
    }
  };

  /**
   * Callback for the mutation observer on the command this button follows.
   *
   * @param {Mutation[]} mutationList - List of mutations the observer saw.
   */
  #handleCommandMutation = mutationList => {
    for (const mutation of mutationList) {
      if (mutation.type !== "attributes") {
        continue;
      }
      if (mutation.attributeName === "disabled") {
        this.disabled = mutation.target.getAttribute("disabled") === "true";
      } else if (mutation.attributeName === "checked") {
        this.setAttribute(
          "aria-pressed",
          mutation.target.getAttribute("checked")
        );
      }
    }
  };

  /**
   * Update the contents of the label from the attributes of this element.
   */
  #updateLabel() {
    if (!this.label) {
      return;
    }
    if (this.hasAttribute("label")) {
      this.label.textContent = this.getAttribute("label");
      return;
    }
    if (this.hasAttribute("label-id")) {
      document.l10n.setAttributes(this.label, this.getAttribute("label-id"));
    }
  }
}
customElements.define("unified-toolbar-button", UnifiedToolbarButton, {
  extends: "button",
});
