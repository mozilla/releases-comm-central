/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_DIALOG_MARGIN,
  PositionedDialog,
} from "./positioned-dialog.mjs";
import { CalendarEventDialogSourceMixin } from "./calendar-event-dialog-source-mixin.mjs";
import {
  clearCalendarEventDraft,
  resetForCreate,
  resetFromSource,
  selectCalendarEventDraftState,
  setSectionValidity,
  updateSection,
} from "./state/calendarEventDraftSlice.mjs";
import {
  clearCalendarEventCreateEditSession,
  selectCalendarEventCreateEditSession,
  startCreateSession,
  startEditSession,
} from "./state/calendarEventCreateEditSessionSlice.mjs";
import {
  selectTitleViewModel,
  selectCanSave,
} from "./state/calendar-event-create-edit-selectors.mjs";
import "./calendar-dialog-navigation-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-toggleable-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-subview.mjs"; // eslint-disable-line import-x/no-unassigned-import

/**
 * The dialog that creates and edits calendar events.
 *
 * The dialog reads its route attributes and loads event data. It makes a
 * draft, an editable copy, in Redux, the app state store. It watches its
 * session and keeps copies for public getters. Other components add position,
 * size, header controls, field rows, and Save.
 *
 * Template ID: #calendarEventCreateEditDialogTemplate
 *
 * @tagname calendar-event-create-edit-dialog
 */
export class CalendarEventCreateEditDialog extends CalendarEventDialogSourceMixin(
  PositionedDialog
) {
  /**
   * The element that switches between the main view and the shared subview.
   *
   * @type {HTMLElement}
   */
  #subviewManager;

  /**
   * The latest "create" or "edit" mode and work state for this dialog.
   *
   * @type {?CalendarEventCreateEditSession}
   */
  #createEditSession = null;

  /**
   * The latest source session for this dialog, or null when there is none.
   *
   * @type {?CalendarEventSourceSession}
   */
  #sourceSession = null;

  /**
   * A copy of the current editable values, or null before a draft exists.
   *
   * @type {?CalendarEventDraft}
   */
  #draft = null;

  /**
   * The latest draft values, starting values, changed sections, and validation
   * results for each section.
   *
   * @type {?CalendarEventDraftState}
   */
  #draftState = null;

  /**
   * Names of field sections whose values differ from their starting values.
   *
   * @type {string[]}
   */
  #dirtySections = [];

  /**
   * True when at least one field section differs from its starting values.
   *
   * @type {boolean}
   */
  #isDirty = false;

  /**
   * True when a draft exists, no work is in progress, and all known sections
   * are valid. This does not check permissions or save an event.
   *
   * @type {boolean}
   */
  #canSave = false;

  /**
   * The mode of the current session, or null when no session exists.
   *
   * @type {"create"|"edit"|null}
   */
  #mode = null;

  /**
   * The margin maintained between this dialog and the visible calendar view.
   *
   * @type {number}
   */
  margin = DEFAULT_DIALOG_MARGIN;

  /**
   * Calendar targets that are meaningful placement anchors. Controls such as
   * menu and toolbar buttons deliberately do not match, so their create
   * routes center in the calendar view instead.
   *
   * @type {string}
   */
  triggerSelector =
    "calendar-event-box,calendar-month-day-box-item,.multiday-event-listitem,calendar-month-day-box,calendar-event-column,.multiday-hour-box,[data-calendar-range-target]";

  /**
   * Keep the dialog's top edge slightly above an anchored calendar target.
   *
   * @type {number}
   */
  triggerTopOffset = DEFAULT_DIALOG_MARGIN;

  /**
   * Add this dialog's Redux data to the shared source observer. The shared
   * constructor sets this element's fixed session key before these functions
   * use it.
   *
   * @param {...*} args
   */
  constructor(...args) {
    super(
      {
        createEditSession: state =>
          selectCalendarEventCreateEditSession(
            state,
            this.calendarEventSessionKey
          ),
        draftState: state =>
          selectCalendarEventDraftState(state, this.calendarEventSessionKey),
        saveButtonState: state =>
          selectCanSave(state, this.calendarEventSessionKey),
        titleViewModel: state =>
          selectTitleViewModel(state, this.calendarEventSessionKey),
      },
      ...args
    );
  }

  /**
   * Start a "create" session with an empty draft. Field code adds defaults.
   */
  #initializeDraft() {
    this.dispatch(
      startCreateSession({ sessionKey: this.calendarEventSessionKey })
    );
    this.resetCreateDraft({});
  }

  /**
   * Create the dialog content and start route observation.
   */
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;

      const template = document.getElementById(
        "calendarEventCreateEditDialogTemplate"
      );
      this.append(template.content.cloneNode(true));

      this.setAttribute("is", "calendar-event-create-edit-dialog");

      this.#subviewManager = this.querySelector(
        "calendar-dialog-subview-manager"
      );

      this.addEventListener("input", this);
      this.addEventListener("focusout", this);
      this.addEventListener("mouseover", this);
      this.addEventListener("mouseout", this);
      this.addEventListener("command", this);
      this.#menu.addEventListener("popupshown", this);
      this.#menu.addEventListener("popuphidden", this);
      this.querySelector("#save").disabled = !this.#canSave;

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
      document.l10n.setAttributes(this, "calendar-event-create-edit-dialog");
    }
    this.addEventListener("calendar-dialog-open-subview", this);
    this.addEventListener("calendar-dialog-close-subview", this);
    this.addEventListener("click", this);
    this.initializeCalendarEventRoute();
  }

  /**
   * Maps selectors for click events to their handler functions.
   *
   * @type {Record<string, function(MouseEvent): void>}
   */
  #clickHandlers = {
    ".close-button": () => this.close(),
    "#calendarEventCreateEditDialogMenuButton": () => this.#openMenu(),
    "#save": () => this.#save(),
  };

  handleEvent(event) {
    switch (event.type) {
      case "click":
        for (const [selector, handler] of Object.entries(this.#clickHandlers)) {
          if (event.target.closest(selector)) {
            handler(event);
            break;
          }
        }
        break;
      case "command":
        for (const [selector, handler] of Object.entries(
          this.#commandHandlers
        )) {
          if (event.target.closest(selector)) {
            handler(event);
            break;
          }
        }
        break;
      case "popupshown":
        this.#menuButton.setAttribute("aria-expanded", "true");
        this.#menu.dispatchEvent(
          new KeyboardEvent("keydown", { keyCode: KeyboardEvent.DOM_VK_DOWN })
        );
        break;
      case "popuphidden":
        this.#menuButton.setAttribute("aria-expanded", "false");
        this.#menuButton.focus();
        break;
      case "input":
        if (event.target.matches(".event-title-input")) {
          this.#updateTitleTooltip(event.target);
          this.updateDraftSection("title", { title: event.target.value });
          this.#setTitleValidity(event.target);
        }
        break;
      case "focusout":
        if (event.target.matches(".event-title-input")) {
          this.#setTitleValidity(event.target);
        }
        break;
      case "mouseover":
      case "mouseout":
        if (event.target.matches(".event-title-input")) {
          this.#updateTitleTooltip(event.target);
        }
        break;
      case "calendar-dialog-open-subview":
        this.#openSubview(event.target);
        break;
      case "calendar-dialog-close-subview":
        this.#closeSubview(event.target);
        break;
    }
  }

  /**
   * Updates title validity for empty text, or when the user has edited a
   * 'too long' title and it's still too long. `input.validity.tooLong` remains
   * false when `input.value` is loaded. This correctly keeps an unchanged
   * loaded title over 180 characters valid.
   *
   * @param {HTMLInputElement} input - The title input.
   */
  #setTitleValidity(input) {
    let validity;

    if (!input.value.trim()) {
      validity = {
        valid: false,
        messageId: "calendar-event-title-required",
      };
    } else if (input.validity.tooLong) {
      validity = {
        valid: false,
        messageId: "calendar-event-title-too-long",
      };
    } else {
      validity = { valid: true };
    }

    this.dispatch(
      setSectionValidity({
        section: "title",
        sessionKey: this.calendarEventSessionKey,
        validity,
      })
    );
  }

  /**
   * Set the title tooltip when the input text is clipped; otherwise clear it.
   *
   * @param {HTMLInputElement} input - The title input.
   */
  #updateTitleTooltip(input) {
    input.title = input.scrollWidth > input.clientWidth ? input.value : "";
  }

  /**
   * Shows the subview requested by `row`. Focuses the shown subview.
   *
   * @param {HTMLElement} row - The navigation row that requested the subview.
   */
  #openSubview(row) {
    const subviewId = row.getAttribute("subview-id");
    this.#subviewManager.showSubview(subviewId);
    this.#subviewManager.querySelector(`[id="${subviewId}"]`).focus();
  }

  /**
   * Shows the main subview. Focuses the navigation row corresponding to the
   * subview that was just closed.
   *
   * @param {HTMLElement} subview - The subview that requested to close.
   */
  #closeSubview(subview) {
    const correspondingNavigationRow = this.querySelector(
      `calendar-dialog-navigation-row[subview-id="${subview.id}"]`
    );

    this.#subviewManager.showDefaultSubview();
    correspondingNavigationRow?.focusRowAction();
  }

  /**
   * The current "create" or "edit" mode, or null when no session exists.
   *
   * @returns {"create"|"edit"|null}
   */
  get mode() {
    return this.#mode;
  }

  /**
   * The current copied draft, or null while "edit" data loads.
   *
   * @returns {?CalendarEventDraft}
   */
  get draft() {
    return this.#draft ? structuredClone(this.#draft) : null;
  }

  /**
   * Whether any field section differs from its starting values.
   *
   * @returns {boolean}
   */
  get isDirty() {
    return this.#isDirty;
  }

  /**
   * The field sections that differ from their starting values.
   *
   * @returns {string[]}
   */
  get dirtySections() {
    return [...this.#dirtySections];
  }

  /**
   * Whether the current draft has no known invalid sections and could be saved
   * by future save code.
   *
   * @returns {boolean}
   */
  get canSave() {
    return this.#canSave;
  }

  /**
   * Allow an empty route to open this dialog in "create" mode.
   *
   * @returns {boolean}
   */
  get allowsEmptyCalendarEventRoute() {
    return true;
  }

  /**
   * Update a field section with values from its field code. The caller must
   * supply every draft property for the section, including unchanged values.
   * The reducer compares only the supplied properties with their baseline.
   * An omitted changed property can cause a section to be marked clean.
   *
   * @param {string} section
   * @param {CalendarEventDraft} patch - All draft properties for the section.
   */
  updateDraftSection(section, patch) {
    this.dispatch(
      updateSection({
        patch,
        section,
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }

  /**
   * Reset a "create" draft with values from field defaults. This model does not
   * choose a calendar or date/time default.
   *
   * @param {CalendarEventDraft} initialDraft
   */
  resetCreateDraft(initialDraft) {
    this.dispatch(
      resetForCreate({
        initialDraft,
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }

  /**
   * Read changes from the shared source session and this dialog's draft and
   * session. Update public values only when Redux reports a change. These
   * saved values never call helper functions or `store.getState()`.
   *
   * @param {string} fieldName
   * @param {*} oldValue
   * @param {*} newValue
   */
  handleStateChange(fieldName, oldValue, newValue) {
    super.handleStateChange(fieldName, oldValue, newValue);

    if (fieldName == "createEditSession") {
      this.#createEditSession = newValue;
      this.#updateDraftViewModel();
    } else if (fieldName == "draftState") {
      this.#draftState = newValue;
      this.#updateDraftViewModel();
    } else if (fieldName == "sourceSession") {
      this.#sourceSession = newValue;
    } else if (fieldName == "saveButtonState") {
      this.#canSave = newValue;
      const saveButton = this.querySelector("#save");

      if (saveButton) {
        saveButton.disabled = !this.#canSave;
      }
    } else if (fieldName == "titleViewModel") {
      this.#renderTitle(newValue);
    }
  }

  /**
   * Updates the event title input, adding required message when applicable.
   *
   * @param {CalendarEventTitleViewModel} titleViewModel - The title data.
   */
  #renderTitle({ value, validity }) {
    const input = this.querySelector(".event-title-input");
    if (!input) {
      return;
    }

    if (input.value != value) {
      input.value = value;
    }
    this.#updateTitleTooltip(input);

    document.l10n.setAttributes(
      input,
      this.#mode == "edit"
        ? "calendar-event-title-input-untitled"
        : "calendar-event-title-input-new"
    );

    input.ariaInvalid = validity?.valid === false ? "true" : null;

    const required = this.querySelector(".event-title-required");
    required.hidden = !validity?.messageId;

    if (validity?.messageId) {
      document.l10n.setAttributes(required, validity.messageId);
      input.setAttribute("aria-errormessage", required.id);
    } else {
      input.removeAttribute("aria-errormessage");
    }
  }

  /**
   * Update public getter values from the latest observed state.
   * Copy draft data so callers cannot change Redux state through a getter.
   */
  #updateDraftViewModel() {
    const draft = this.#draftState?.value ?? null;
    this.#draft = draft ? structuredClone(draft) : null;
    this.#dirtySections = [...(this.#draftState?.dirtySections ?? [])];
    this.#isDirty = !!this.#dirtySections.length;
    this.#mode = this.#createEditSession?.mode ?? null;
    if (this.#menuButton) {
      this.#menuButton.hidden = !(
        this.#mode === "edit" && this.#draft !== null
      );
      if (this.#menuButton.hidden) {
        this.#menu.hidePopup();
        this.#menuButton.setAttribute("aria-expanded", "false");
      }
    }
  }

  get #menuButton() {
    return this.querySelector("#calendarEventCreateEditDialogMenuButton");
  }

  get #menu() {
    return this.querySelector("#calendarEventCreateEditDialogMenu");
  }

  #commandHandlers = {
    "#calendarEventCreateEditDialogDeleteEvent": () =>
      this.#requestDeleteEvent(),
  };

  #openMenu() {
    this.#menu.openPopup(this.#menuButton, "after_end");
  }

  /**
   * Request deletion of the event currently being edited.
   */
  #requestDeleteEvent() {
    if (this.#menuButton.hidden) {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("deleteevent", {
        bubbles: true,
        detail: this.#sourceSession?.identity ?? null,
      })
    );
  }

  /**
   * Select the visible calendar view before the readiness gate opens this
   * dialog. A caller can pass a calendar cell or selected-range event target;
   * menu, toolbar, and keyboard callers pass no matching target and therefore
   * receive the centered fallback.
   *
   * @param {?Event} event
   * @returns {Promise<boolean>} Whether the dialog was shown.
   */
  async show(event) {
    const calendarDisplayBox = document.getElementById("calendarDisplayBox");
    const calendarDisplayBoxRect = calendarDisplayBox?.getBoundingClientRect();
    const hasCalendarDisplayBox =
      calendarDisplayBoxRect?.width > 0 && calendarDisplayBoxRect.height > 0;
    const fallbackContainer =
      document.getElementById("tabpanelcontainer") ?? document.documentElement;

    this.container = hasCalendarDisplayBox
      ? calendarDisplayBox
      : fallbackContainer;

    this.#subviewManager.showDefaultSubview();
    return super.show(event);
  }

  /**
   * Start a clean "create" session for an empty route.
   *
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onEmptyCalendarEventRoute(_route) {
    this.#initializeDraft();
  }

  /**
   * Start an "edit" session before source loading completes.
   *
   * @param {CalendarEventSourceIdentity} _identity
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onCalendarEventSourceLoadStart(_identity, _route) {
    this.dispatch(
      startEditSession({ sessionKey: this.calendarEventSessionKey })
    );
  }

  /**
   * Start the draft with data copied from the loaded source.
   *
   * @param {CalendarEventDialogSource} source
   */
  async onCalendarEventSourceLoaded({ snapshot }) {
    this.dispatch(
      resetFromSource({
        sessionKey: this.calendarEventSessionKey,
        snapshot,
      })
    );
  }

  /**
   * Clear the draft and create/edit session when the route is replaced or
   * closed.
   */
  onCalendarEventRouteCleared() {
    this.dispatch(
      clearCalendarEventDraft({ sessionKey: this.calendarEventSessionKey })
    );
    this.dispatch(
      clearCalendarEventCreateEditSession({
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }

  /**
   * Save the current draft of the create/edit dialog.
   */
  #save() {
    // TODO: Implement save functionality.
  }
}

customElements.define(
  "calendar-event-create-edit-dialog",
  CalendarEventCreateEditDialog,
  { extends: "dialog" }
);
