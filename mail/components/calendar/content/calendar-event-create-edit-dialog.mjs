/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_DIALOG_MARGIN,
  PositionedDialog,
} from "./positioned-dialog.mjs";
import { CalendarEventDialogSourceMixin } from "./calendar-event-dialog-source-mixin.mjs";
import { store } from "moz-src:///comm/mail/base/content/state/store.mjs";
import { saveCalendarEventEdit } from "./calendar-event-edit-save.mjs";
import {
  loadCalendarOptions,
  observeCalendarOptions,
  snapshotCalendar,
} from "./calendar-event-calendar-options.mjs";
import {
  clearCalendarEventDraft,
  initializeFields,
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
  changeCalendar,
  clearCalendarOptions,
  clearCalendarSelection,
  selectCalendarChoices,
  setCalendarOptions,
  setCalendarSelection,
} from "./state/calendarEventCalendarSlice.mjs";
import {
  selectCalendarColorId,
  createCalendarControlSelector,
  selectCalendarAvailability,
  selectTitleViewModel,
  selectCanSave,
} from "./state/calendar-event-create-edit-selectors.mjs";
import "./calendar-dialog-navigation-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-toggleable-row.mjs"; // eslint-disable-line import-x/no-unassigned-import
import "./calendar-dialog-subview.mjs"; // eslint-disable-line import-x/no-unassigned-import

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * Displays editable event values and a calendar selector in a dialog.
 *
 * A draft contains the user's unsaved values. Redux keeps these values in the
 * document's store, an object that holds application state. A session key
 * identifies this dialog's entries in the store and stays fixed for its life.
 * A route is the set of IDs that selects the saved event and optional
 * occurrence. An empty route selects create mode. Each route change gets a
 * new generation number so a result from an old route cannot replace new data.
 *
 * `CalendarEventDialogSourceMixin` adds route observation and event loading.
 * This dialog supplies the hooks that turn loaded data into a draft and
 * calendar choices. An action describes a requested state change. Dispatching
 * an action sends it to the store. Selectors read the state for the controls.
 * The store observer calls `handleStateChange` when a selected value changes.
 *
 * The dialog keeps copies of draft data for public getters.
 * Save commits an event copy through
 * the host window's transaction functions, which also support Undo and meeting
 * messages. Other components add size and field rows.
 *
 * Template ID: #calendarEventCreateEditDialogTemplate
 *
 * @tagname calendar-event-create-edit-dialog
 * @attribute {string} calendar-id - The source calendar ID. Observed by the
 *   source mixin. Set with `event-id` to edit an event.
 * @attribute {string} event-id - The saved event ID. Observed by the source mixin.
 * @attribute {string} recurrence-id - The optional occurrence start time in
 *   microseconds, as a string. Observed by the source mixin.
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
   * True when a draft exists, no work is in progress, and all known active
   * sections are valid. This does not check permissions or save an event.
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
   * The dropdown used to choose the event's calendar.
   *
   * @type {?HTMLSelectElement}
   */
  #calendarSelect = null;

  /**
   * True while the dialog holds focus during event loading.
   *
   * @type {boolean}
   */
  #restoreCalendarFocus = false;

  /**
   * Stops calendar-choice observation when this dialog disconnects.
   *
   * @type {?function(): void}
   */
  #stopObservingCalendarOptions = null;

  /**
   * The current edit route has finished initializing.
   *
   * @type {boolean}
   */
  #editReady = false;

  #routeAttributes = ["calendar-id", "event-id", "recurrence-id"];

  /**
   * Ignore attribute callbacks while clearing saved IDs.
   *
   * @type {boolean}
   */
  #clearingSavedIds = false;

  /**
   * Restore a route attribute while Save is pending.
   *
   * @type {boolean}
   */
  #restoringRoute = false;

  /**
   * Converts optional field sections from draft data to Calendar properties.
   * Each section supplies `keys`, `apply`, and `remove`. Base title and date
   * fields use `applyCalendarEventDraft` instead.
   *
   * @type {Record<string, CalendarEventSaveField>}
   */
  saveFields = {};

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
   * Adds this dialog's selectors to the shared store observer.
   * Each selector reads the entries for this dialog's fixed session key.
   * The source mixin sets that key before the observer calls the selectors.
   *
   * @param {...*} args - Arguments for the dialog base classes.
   */
  constructor(...args) {
    const selectCalendarControl = createCalendarControlSelector();

    super(
      {
        canSave: state => selectCanSave(state, this.calendarEventSessionKey),
        createEditSession: state =>
          selectCalendarEventCreateEditSession(
            state,
            this.calendarEventSessionKey
          ),
        draftState: state =>
          selectCalendarEventDraftState(state, this.calendarEventSessionKey),
        titleViewModel: state =>
          selectTitleViewModel(state, this.calendarEventSessionKey),
        calendarControl: state =>
          selectCalendarControl(state, this.calendarEventSessionKey),
        calendarChoices: state =>
          selectCalendarChoices(state, this.calendarEventSessionKey),
        calendarColor: state =>
          selectCalendarColorId(state, this.calendarEventSessionKey),
        calendarAvailability: state =>
          selectCalendarAvailability(state, this.calendarEventSessionKey),
      },
      ...args
    );
  }

  /**
   * Starts create mode with an empty draft for field code to add defaults.
   */
  #initializeDraft() {
    this.dispatch(
      startCreateSession({ sessionKey: this.calendarEventSessionKey })
    );
    this.resetCreateDraft({});
  }

  /**
   * Creates the dialog content and starts route observation.
   */
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;

      const template = document.getElementById(
        "calendarEventCreateEditDialogTemplate"
      );
      this.append(template.content.cloneNode(true));
      this.#calendarSelect = this.querySelector(".calendar-selector");
      this.addEventListener("cancel", this);
      this.setAttribute("closedby", "closerequest");

      this.setAttribute("is", "calendar-event-create-edit-dialog");

      this.#subviewManager = this.querySelector(
        "calendar-dialog-subview-manager"
      );

      this.addEventListener("change", this);
      this.addEventListener("input", this);
      this.addEventListener("focusout", this);
      this.addEventListener("mouseover", this);
      this.addEventListener("mouseout", this);
      this.addEventListener("command", this);
      this.#menu.addEventListener("popupshown", this);
      this.#menu.addEventListener("popuphidden", this);
      this.#renderSave();

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
      document.l10n.setAttributes(this, "calendar-event-create-edit-dialog");
    }

    this.addEventListener("calendar-dialog-open-subview", this);
    this.addEventListener("calendar-dialog-close-subview", this);
    this.addEventListener("click", this);

    if (!this.#stopObservingCalendarOptions) {
      const updateChoices = calendars => {
        const snapshot = this.selectValue("sourceSession")?.snapshot ?? null;

        this.dispatch(
          setCalendarOptions({
            sessionKey: this.calendarEventSessionKey,
            calendars,
            calendarId: this.#draft?.calendarId,
            // Check the original source even after the draft changes calendars.
            canChange: this.#canChangeCalendar(snapshot),
          })
        );
      };

      this.#stopObservingCalendarOptions = observeCalendarOptions(
        updateChoices,
        window
      );
      updateChoices(loadCalendarOptions().calendars);
    }

    this.initializeCalendarEventRoute();
  }

  /**
   * Stops choice updates and removes the disconnected dialog's cached choices.
   */
  disconnectedCallback() {
    this.#stopObservingCalendarOptions?.();
    this.#stopObservingCalendarOptions = null;
    super.disconnectedCallback();

    this.dispatch(
      clearCalendarOptions({ sessionKey: this.calendarEventSessionKey })
    );
  }

  /**
   * Maps selectors for click events to their handler functions.
   *
   * @type {Record<string, function(MouseEvent): void>}
   */
  #clickHandlers = {
    ".close-button": () => this.close(),
    "#calendarEventCreateEditDialogMenuButton": () => this.#openMenu(),
    ".calendar-event-save": () => {
      this.save();
    },
  };

  handleEvent(event) {
    switch (event.type) {
      case "change":
        this.#onCalendarChange(event);
        break;
      case "cancel":
        this.close();
        break;
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
   * Applies calendar changes from the current, enabled dropdown.
   *
   * @param {Event} event - The change event received by this dialog.
   */
  #onCalendarChange(event) {
    const select = this.#calendarSelect;

    // Other dropdowns in the dialog must not change the calendar.
    if (!select || event.target !== select || select.disabled) {
      return;
    }

    this.dispatch(
      changeCalendar({
        sessionKey: this.calendarEventSessionKey,
        calendarId: select.value,
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
   * Returns the current "create" or "edit" mode, or null if absent.
   *
   * @returns {"create"|"edit"|null}
   */
  get mode() {
    return this.#mode;
  }

  /**
   * Returns a copy of the unsaved event values, or null while edit data loads.
   *
   * @returns {?CalendarEventDraft}
   */
  get draft() {
    return this.#draft ? structuredClone(this.#draft) : null;
  }

  /**
   * Returns whether any field section differs from its starting values.
   *
   * @returns {boolean}
   */
  get isDirty() {
    return this.#isDirty;
  }

  /**
   * Returns the names of field sections that differ from their starting values.
   *
   * @returns {string[]}
   */
  get dirtySections() {
    return [...this.#dirtySections];
  }

  /**
   * Returns whether a draft exists, no work is pending, and all known active
   * sections are valid. This does not check permissions or edit readiness.
   *
   * @returns {boolean}
   */
  get canSave() {
    return this.#canSave;
  }

  /**
   * Returns true so an empty route can open this dialog in create mode.
   *
   * @returns {boolean}
   */
  get allowsEmptyCalendarEventRoute() {
    return true;
  }

  /**
   * Checks current source permission, or permits selection for create mode.
   *
   * @param {?CalendarEventSourceSnapshot} snapshot - The loaded source, or null
   *   for create mode or before source loading finishes.
   * @returns {boolean} Whether the source permits a calendar change.
   */
  #canChangeCalendar(snapshot) {
    if (!snapshot) {
      return true;
    }

    const calendar = cal.manager.getCalendarById(snapshot.calendar.id);

    return (
      snapshot.canChangeCalendar &&
      !!calendar &&
      cal.acl.isCalendarWritable(calendar) &&
      cal.acl.userCanDeleteItemsFromCalendar(calendar)
    );
  }

  /**
   * Updates a group of related fields, such as the start and end times.
   * The caller must supply every draft property for the section, including
   * unchanged values. The reducer compares only the supplied properties with
   * their starting values. If a changed property is omitted, the section can
   * lose its changed status.
   *
   * @param {string} section - The name used to track changes to this field group.
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
   * Resets the starting and current values for a create draft.
   * The caller supplies the defaults. Route code chooses the calendar default.
   *
   * @param {CalendarEventDraft} initialDraft - Field defaults for the new draft.
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
   * Updates controls and public values when observed Redux values change.
   * The store observer calls this method after a selector returns a new value.
   * The getters read saved copies so reading a getter does not query the store.
   *
   * @param {string} fieldName - The selector name supplied to the observer.
   * @param {*} oldValue - The previously observed value.
   * @param {*} newValue - The value returned by the selector after the change.
   */
  handleStateChange(fieldName, oldValue, newValue) {
    super.handleStateChange(fieldName, oldValue, newValue);

    if (fieldName == "canSave") {
      this.#canSave = newValue;
      this.#renderSave();
    } else if (fieldName == "createEditSession") {
      this.#createEditSession = newValue;
      this.#updateDraftViewModel();
      this.#renderSave();

      if (
        newValue?.operation.kind == "save" &&
        newValue.operation.status == "success"
      ) {
        // The observer runs inside a store dispatch. Closing sends more actions
        // to clear this session. Defer closing until that dispatch has finished.
        queueMicrotask(() => {
          // A later request can replace this success before the callback runs.
          if (
            this.#createEditSession?.operation.requestId !==
            newValue.operation.requestId
          ) {
            return;
          }

          this.close();

          // Closing already cleared the session. Remove the saved route IDs
          // without starting a new route load from each attribute callback.
          this.#clearingSavedIds = true;
          for (const attribute of this.#routeAttributes) {
            this.removeAttribute(attribute);
          }
          this.#clearingSavedIds = false;
        });
      }
    } else if (fieldName == "draftState") {
      this.#draftState = newValue;
      this.#updateDraftViewModel();
      this.#renderSave();
    } else if (fieldName == "sourceSession") {
      this.#sourceSession = newValue;
    } else if (fieldName == "calendarControl") {
      this.#renderCalendarControl(oldValue, newValue);
    } else if (fieldName == "calendarColor") {
      this.#renderCalendarColor(newValue);
    } else if (fieldName == "calendarAvailability") {
      this.#renderCalendarAvailability(newValue);
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
   * Rejects event switches until Save finishes.
   *
   * @param {CalendarEventDialogRouteAttributes} [route] - The requested event.
   */
  setCalendarEventRoute(route) {
    if (this.#createEditSession?.operation.status != "pending") {
      super.setCalendarEventRoute(route);
    }
  }

  /**
   * Restores route attributes while Save is pending. Ignores saved-ID cleanup.
   *
   * @param {string} attribute - The changed attribute.
   * @param {?string} oldValue - Its previous value.
   * @param {?string} newValue - Its requested value.
   */
  attributeChangedCallback(attribute, oldValue, newValue) {
    // Attribute restoration and saved-ID cleanup invoke this callback again.
    // Those internal changes must not reach the route loader.
    if (this.#clearingSavedIds || this.#restoringRoute) {
      return;
    }

    if (
      this.#createEditSession?.operation.status == "pending" &&
      this.#routeAttributes.includes(attribute)
    ) {
      // Keep the current route stable until the provider operation finishes.
      this.#restoringRoute = true;
      if (oldValue === null) {
        this.removeAttribute(attribute);
      } else {
        this.setAttribute(attribute, oldValue);
      }
      this.#restoringRoute = false;

      return;
    }

    super.attributeChangedCallback(attribute, oldValue, newValue);
  }

  /** Discards the draft and closes the dialog unless Save is pending. */
  close() {
    if (this.#createEditSession?.operation.status != "pending") {
      super.close();
    }
  }

  /**
   * Requests native dismissal unless Save is pending.
   *
   * @param {string} [returnValue=this.returnValue] - The value to store in the
   *   native dialog's `returnValue` property when it closes. This is not the
   *   Save status returned by `save()`.
   */
  requestClose(returnValue = this.returnValue) {
    if (this.#createEditSession?.operation.status != "pending") {
      // The cancel handler runs the shared close cleanup before native closing.
      this.returnValue = returnValue;
      super.requestClose(returnValue);
    }
  }

  /**
   * Saves the current edit session.
   *
   * Returns `unavailable` if the dialog is closed, the edit session is not ready,
   * or `canSave` is false. `selectCanSave` reads the field validation results
   * stored in the draft state. This method does not create new events.
   *
   * @returns {Promise<
   *   {status: "success", identity: CalendarEventSourceIdentity} |
   *   {status: "unavailable"|"stale"|"cancelled"|"error"}
   * >}
   *   The Save result, with the saved IDs in `identity` on success. Success means
   *   the transaction finished. `handleStateChange` schedules closing separately.
   */
  async save() {
    if (!this.open || !this.#editReady || !this.#canSave) {
      return { status: "unavailable" };
    }

    // Use the host's occurrence prompt and transaction path so Save retains
    // the existing Undo and scheduling behavior.
    const host = window.top;
    return saveCalendarEventEdit({
      store,
      sessionKey: this.calendarEventSessionKey,
      fields: this.saveFields,
      chooseOccurrence: event =>
        host.promptOccurrenceModification(event, true, "edit")[0],
      transact: (event, original) =>
        host.doTransaction("modify", event, event.calendar, original, null, {
          responseMode:
            event.getProperty("X-MOZ-SEND-INVITATIONS") == "FALSE"
              ? Ci.calIItipItem.NONE
              : Ci.calIItipItem.AUTO,
        }),
    });
  }

  /** Displays observed Save progress and failures for keyboard and speech users. */
  #renderSave() {
    const body = this.querySelector(".calendar-event-create-edit-dialog-body");

    // Store updates can arrive before connectedCallback creates the content.
    if (!body) {
      return;
    }

    const operation = this.#createEditSession?.operation;
    const saving = operation?.status == "pending";

    // Native dismissal includes Escape. Block dismissal while storage changes
    // the event, because closing would discard the draft needed after failure.
    this.setAttribute("closedby", saving ? "none" : "closerequest");
    body.setAttribute("aria-busy", saving ? "true" : "false");

    const button = this.querySelector(".calendar-event-save");
    if (button) {
      button.disabled =
        !this.#editReady ||
        !this.#canSave ||
        saving ||
        operation?.status == "success";

      // Move focus from the newly disabled button to the dialog so keyboard
      // users retain a focus target while Save is pending.
      if (saving && document.activeElement === button) {
        this.focus();
      }
    }

    // aria-busy tells assistive software that body updates are incomplete.
    // Keep the status outside that body so a screen reader can announce Save
    // progress without waiting for the body to stop being busy.
    const statusMessage = this.querySelector(".calendar-event-save-status");
    if (statusMessage) {
      if (saving || operation?.error?.code == "event-save-failed") {
        document.l10n.setAttributes(
          statusMessage,
          saving ? "calendar-event-saving" : "calendar-event-save-failed"
        );
      } else {
        document.l10n.setAttributes(statusMessage, "calendar-event-save-idle");
      }
    }
  }

  /**
   * Applies calendar options and the selected value.
   *
   * @param {CalendarEventCalendarControlViewModel|undefined} oldValue - The
   *   previously observed control values, or undefined before the first update.
   * @param {CalendarEventCalendarControlViewModel} viewModel - The new values.
   */
  #renderCalendarControl(oldValue, viewModel) {
    if (!this.#calendarSelect) {
      return;
    }

    if (oldValue?.options !== viewModel.options) {
      this.#renderCalendarOptions(viewModel.options);
    }

    this.#calendarSelect.value = viewModel.value;
  }

  /**
   * Replaces the option nodes with the values returned by the options selector.
   *
   * @param {CalendarEventCalendarOption[]} options - The displayed choices.
   */
  #renderCalendarOptions(options) {
    this.#calendarSelect.replaceChildren(
      ...options.map(({ value, label, disabled }) => {
        const option = document.createElement("option");

        option.value = value;
        option.textContent = label;
        option.disabled = disabled;

        return option;
      })
    );
  }

  /**
   * Sets the calendar control's disabled state and focus.
   *
   * @param {CalendarEventCalendarAvailabilityViewModel} availability - The
   *   disabled state and request number.
   */
  #renderCalendarAvailability({ disabled, generation }) {
    if (!this.#calendarSelect) {
      return;
    }

    const restoreFocus =
      this.open &&
      (document.activeElement === this.#calendarSelect ||
        (this.#restoreCalendarFocus && document.activeElement === this));

    this.#calendarSelect.disabled = disabled;
    this.#restoreCalendarFocus = restoreFocus && generation === null;

    if (!restoreFocus) {
      return;
    }

    const focusTarget = disabled ? this : this.#calendarSelect;

    focusTarget.focus();
  }

  /**
   * Displays the calendar color, or hides the swatch when no calendar is selected.
   *
   * @param {?string} calendarId - The selected calendar ID, or null.
   */
  #renderCalendarColor(calendarId) {
    if (!this.#calendarSelect) {
      return;
    }

    const swatch = this.querySelector(".calendar-color");

    swatch.hidden = calendarId === null;
    swatch.style.backgroundColor =
      calendarId === null
        ? ""
        : `var(--calendar-${cal.view.formatStringForCSSRule(calendarId)}-backcolor)`;
  }

  /**
   * Updates public getter values from the latest observed state.
   * Copies draft data so callers cannot change Redux state through a getter.
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
   * Requests deletion of the event currently being edited.
   * Dispatches `deleteevent` with the source identity in `detail`.
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
   * Opens the dialog after the current route finishes loading.
   * A calendar cell or selected-range event places the dialog beside that
   * target. Other callers get a dialog centered in the visible calendar view,
   * or the tab panel when the calendar view is unavailable.
   * On first opening, focuses the calendar control if enabled, or the dialog.
   * For an already open dialog, does not set focus after loading.
   *
   * @param {?Event} [event] - The event that supplies a placement target, if any.
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

    const wasOpen = this.open;
    const shown = await super.show(event);

    // Do not reset focus here if the dialog was already open before loading.
    if (shown && !wasOpen && this.open) {
      const focusTarget =
        this.#calendarSelect?.disabled === false ? this.#calendarSelect : this;
      focusTarget.focus();
    }

    return shown;
  }

  /**
   * Starts create mode and adds the calendar default to its draft.
   *
   * @param {CalendarEventDialogRouteRequest} route - The route number and a
   *   check that this request still belongs to the dialog.
   * @returns {Promise<void>} Resolves after setting the source data and default,
   *   or after an old route stops without applying its remaining results.
   */
  async onEmptyCalendarEventRoute(route) {
    // Reject an old request before it resets the draft.
    if (!route.isCurrent()) {
      return;
    }

    this.#initializeDraft();
    this.#renderSave();

    // Apply the queued choice refresh before choosing this route's default.
    await Promise.resolve();

    if (!route.isCurrent()) {
      return;
    }

    const calendars = this.selectValue("calendarChoices");
    const windowDefault = cal.view.getCompositeCalendar(window).defaultCalendar;
    const defaultCalendar =
      windowDefault && cal.manager.getCalendarById(windowDefault.id)
        ? snapshotCalendar(windowDefault)
        : null;

    // Prefer the window's default calendar if allowed, then the first allowed
    // calendar. If neither exists, keep the unavailable default for display.
    const calendar =
      calendars.find(candidate => candidate.id == defaultCalendar?.id) ??
      calendars[0] ??
      defaultCalendar;

    this.dispatch(
      setCalendarSelection({
        sessionKey: this.calendarEventSessionKey,
        generation: route.generation,
        calendar,
        canChange: true,
      })
    );

    // Store observers run during dispatch and can replace the route. Check
    // again before adding defaults to the draft that now belongs to the dialog.
    if (!calendar || !route.isCurrent()) {
      return;
    }

    this.dispatch(
      initializeFields({
        sessionKey: this.calendarEventSessionKey,
        defaults: { calendarId: calendar.id },
      })
    );
  }

  /**
   * Starts edit mode before event loading.
   *
   * @param {CalendarEventSourceIdentity} _identity - The source to load. The
   *   shared source mixin uses this identity.
   * @returns {Promise<void>} Resolves after starting the edit session.
   */
  async onCalendarEventSourceLoadStart(_identity) {
    this.dispatch(
      startEditSession({ sessionKey: this.calendarEventSessionKey })
    );
  }

  /**
   * Sets source permission and starts a draft from the loaded event snapshot.
   *
   * @param {CalendarEventDialogSource} source - The loaded source data and a
   *   check that the source still belongs to the current route.
   * @returns {Promise<void>} Resolves after setting source and draft values,
   *   or after an old route stops without applying its remaining results.
   */
  async onCalendarEventSourceLoaded({ snapshot, isCurrent, generation }) {
    if (!isCurrent()) {
      return;
    }

    this.dispatch(
      setCalendarSelection({
        sessionKey: this.calendarEventSessionKey,
        generation,
        calendar: snapshot.calendar,
        canChange: this.#canChangeCalendar(snapshot),
      })
    );

    // An observer can replace the route during the preceding dispatch.
    if (!isCurrent()) {
      return;
    }

    this.dispatch(
      resetFromSource({
        sessionKey: this.calendarEventSessionKey,
        snapshot,
      })
    );

    // Localize the dialog before enabling Save.
    await document.l10n.translateFragment(this);

    // Only enable Save if this route is still current after localization.
    if (isCurrent()) {
      this.#editReady = true;
      this.#renderSave();
    }
  }

  /**
   * Removes source data, draft values, and mode for this dialog.
   * Calendar choices remain cached until the dialog disconnects.
   * The source mixin calls this hook when the route changes or closes. The
   * session key stays fixed so the next route uses the same dialog entries.
   */
  onCalendarEventRouteCleared() {
    this.#editReady = false;
    this.dispatch(
      clearCalendarSelection({ sessionKey: this.calendarEventSessionKey })
    );
    this.dispatch(
      clearCalendarEventDraft({ sessionKey: this.calendarEventSessionKey })
    );
    this.dispatch(
      clearCalendarEventCreateEditSession({
        sessionKey: this.calendarEventSessionKey,
      })
    );
  }
}

customElements.define(
  "calendar-event-create-edit-dialog",
  CalendarEventCreateEditDialog,
  { extends: "dialog" }
);
