/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements, MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

  // Leave these first arguments as `undefined`, to use the OS style if
  // intl.regional_prefs.use_os_locales is true or the app language matches the OS language.
  // Otherwise, the app language is used.
  const dateFormatter = new Services.intl.DateTimeFormat(undefined, { dateStyle: "short" });
  const timeFormatter = new Services.intl.DateTimeFormat(undefined, { timeStyle: "short" });

  let probeSucceeded;
  let alphaMonths;
  let yearIndex, monthIndex, dayIndex;
  let ampmIndex, amRegExp, pmRegExp;
  let parseTimeRegExp, parseShortDateRegex;

  class MozTimepickerMinute extends MozXULElement {
    static get observedAttributes() {
      return ["label", "selected"];
    }

    constructor() {
      super();

      this.addEventListener("wheel", event => {
        const pixelThreshold = 50;
        let deltaView = 0;

        if (event.deltaMode == event.DOM_DELTA_PAGE || event.deltaMode == event.DOM_DELTA_LINE) {
          // Line/Page scrolling is usually vertical
          if (event.deltaY) {
            deltaView = event.deltaY < 0 ? -1 : 1;
          }
        } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
          // The natural direction for pixel scrolling is left/right
          this.pixelScrollDelta += event.deltaX;
          if (this.pixelScrollDelta > pixelThreshold) {
            deltaView = 1;
            this.pixelScrollDelta = 0;
          } else if (this.pixelScrollDelta < -pixelThreshold) {
            deltaView = -1;
            this.pixelScrollDelta = 0;
          }
        }

        if (deltaView != 0) {
          this.moveMinutes(deltaView);
        }

        event.stopPropagation();
        event.preventDefault();
      });

      this.clickMinute = (minuteItem, minuteNumber) => {
        this.closest("timepicker-grids").clickMinute(minuteItem, minuteNumber);
      };
      this.moveMinutes = number => {
        this.closest("timepicker-grids").moveMinutes(number);
      };
    }

    connectedCallback() {
      if (this.hasChildNodes()) {
        return;
      }

      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");

      const minutebox = document.createXULElement("vbox");
      minutebox.addEventListener("click", () => {
        this.clickMinute(this, this.getAttribute("value"));
      });

      const box = document.createXULElement("box");

      this.label = document.createXULElement("label");
      this.label.classList.add("time-picker-minute-label");

      box.appendChild(this.label);
      minutebox.appendChild(box);

      this.appendChild(spacer.cloneNode());
      this.appendChild(minutebox);
      this.appendChild(spacer);

      this.pixelScrollDelta = 0;

      this._updateAttributes();
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    _updateAttributes() {
      if (!this.label) {
        return;
      }

      if (this.hasAttribute("label")) {
        this.label.setAttribute("value", this.getAttribute("label"));
      } else {
        this.label.removeAttribute("value");
      }

      if (this.hasAttribute("selected")) {
        this.label.setAttribute("selected", this.getAttribute("selected"));
      } else {
        this.label.removeAttribute("selected");
      }
    }
  }

  class MozTimepickerHour extends MozXULElement {
    static get observedAttributes() {
      return ["label", "selected"];
    }

    constructor() {
      super();

      this.addEventListener("wheel", event => {
        const pixelThreshold = 50;
        let deltaView = 0;

        if (event.deltaMode == event.DOM_DELTA_PAGE || event.deltaMode == event.DOM_DELTA_LINE) {
          // Line/Page scrolling is usually vertical
          if (event.deltaY) {
            deltaView = event.deltaY < 0 ? -1 : 1;
          }
        } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
          // The natural direction for pixel scrolling is left/right
          this.pixelScrollDelta += event.deltaX;
          if (this.pixelScrollDelta > pixelThreshold) {
            deltaView = 1;
            this.pixelScrollDelta = 0;
          } else if (this.pixelScrollDelta < -pixelThreshold) {
            deltaView = -1;
            this.pixelScrollDelta = 0;
          }
        }

        if (deltaView != 0) {
          this.moveHours(deltaView);
        }

        event.stopPropagation();
        event.preventDefault();
      });

      this.clickHour = (hourItem, hourNumber) => {
        this.closest("timepicker-grids").clickHour(hourItem, hourNumber);
      };
      this.moveHours = number => {
        this.closest("timepicker-grids").moveHours(number);
      };
      this.doubleClickHour = (hourItem, hourNumber) => {
        this.closest("timepicker-grids").doubleClickHour(hourItem, hourNumber);
      };
    }

    connectedCallback() {
      if (this.hasChildNodes()) {
        return;
      }

      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");

      const hourbox = document.createXULElement("vbox");
      hourbox.addEventListener("click", () => {
        this.clickHour(this, this.getAttribute("value"));
      });
      hourbox.addEventListener("dblclick", () => {
        this.doubleClickHour(this, this.getAttribute("value"));
      });

      const box = document.createXULElement("box");

      this.label = document.createXULElement("label");
      this.label.classList.add("time-picker-hour-label");

      box.appendChild(this.label);
      hourbox.appendChild(box);
      hourbox.appendChild(spacer.cloneNode());

      this.appendChild(spacer.cloneNode());
      this.appendChild(hourbox);
      this.appendChild(spacer);

      this._updateAttributes();
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    _updateAttributes() {
      if (!this.label) {
        return;
      }

      if (this.hasAttribute("label")) {
        this.label.setAttribute("value", this.getAttribute("label"));
      } else {
        this.label.removeAttribute("value");
      }

      if (this.hasAttribute("selected")) {
        this.label.setAttribute("selected", this.getAttribute("selected"));
      } else {
        this.label.removeAttribute("selected");
      }
    }
  }

  /**
   * The MozTimepickerGrids widget displays the grid of times to select, e.g. for an event.
   * Typically it represents the popup content that let's the user select a time, in a
   * <timepicker> widget.
   *
   * @augments MozXULElement
   */
  class MozTimepickerGrids extends MozXULElement {
    constructor() {
      super();

      this.content = MozXULElement.parseXULToFragment(`
        <vbox class="time-picker-grids">
          <vbox class="time-picker-hour-grid" format12hours="false">
            <hbox flex="1" class="timepicker-topRow-hour-class">
              <timepicker-hour class="time-picker-hour-box-class" value="0" label="0"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="1" label="1"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="2" label="2"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="3" label="3"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="4" label="4"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="5" label="5"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="6" label="6"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="7" label="7"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="8" label="8"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="9" label="9"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="10" label="10"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="11" label="11"></timepicker-hour>
              <hbox class="timepicker-amLabelBox-class amLabelBox" hidden="true">
                <label></label>
              </hbox>
            </hbox>
            <hbox flex="1" class="timepicker-bottomRow-hour-class">
              <timepicker-hour class="time-picker-hour-box-class" value="12" label="12"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="13" label="13"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="14" label="14"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="15" label="15"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="16" label="16"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="17" label="17"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="18" label="18"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="19" label="19"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="20" label="20"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="21" label="21"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="22" label="22"></timepicker-hour>
              <timepicker-hour class="time-picker-hour-box-class" value="23" label="23"></timepicker-hour>
              <hbox class="pmLabelBox timepicker-pmLabelBox-class" hidden="true">
                <label></label>
              </hbox>
            </hbox>
          </vbox>
          <vbox class="time-picker-five-minute-grid-box">
            <vbox class="time-picker-five-minute-grid">
              <hbox flex="1">
                <timepicker-minute class="time-picker-five-minute-class" value="0" label=":00" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="5" label=":05" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="10" label=":10" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="15" label=":15" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="20" label=":20" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="25" label=":25" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-five-minute-class" value="30" label=":30" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="35" label=":35" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="40" label=":40" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="45" label=":45" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="50" label=":50" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-five-minute-class" value="55" label=":55" flex="1"></timepicker-minute>
              </hbox>
            </vbox>
            <hbox class="time-picker-minutes-bottom">
              <spacer flex="1"></spacer>
              <label class="time-picker-more-control-label" value="»" onclick="clickMore()"></label>
            </hbox>
          </vbox>
          <vbox class="time-picker-one-minute-grid-box" flex="1" hidden="true">
            <vbox class="time-picker-one-minute-grid" flex="1">
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="0" label=":00" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="1" label=":01" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="2" label=":02" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="3" label=":03" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="4" label=":04" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="5" label=":05" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="6" label=":06" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="7" label=":07" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="8" label=":08" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="9" label=":09" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="10" label=":10" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="11" label=":11" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="12" label=":12" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="13" label=":13" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="14" label=":14" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="15" label=":15" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="16" label=":16" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="17" label=":17" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="18" label=":18" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="19" label=":19" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="20" label=":20" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="21" label=":21" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="22" label=":22" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="23" label=":23" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="24" label=":24" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="25" label=":25" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="26" label=":26" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="27" label=":27" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="28" label=":28" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="29" label=":29" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="30" label=":30" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="31" label=":31" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="32" label=":32" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="33" label=":33" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="34" label=":34" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="35" label=":35" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="36" label=":36" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="37" label=":37" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="38" label=":38" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="39" label=":39" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="40" label=":40" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="41" label=":41" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="42" label=":42" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="43" label=":43" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="44" label=":44" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="45" label=":45" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="46" label=":46" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="47" label=":47" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="48" label=":48" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="49" label=":49" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="50" label=":50" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="51" label=":51" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="52" label=":52" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="53" label=":53" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="54" label=":54" flex="1"></timepicker-minute>
              </hbox>
              <hbox flex="1">
                <timepicker-minute class="time-picker-one-minute-class" value="55" label=":55" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="56" label=":56" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="57" label=":57" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="58" label=":58" flex="1"></timepicker-minute>
                <timepicker-minute class="time-picker-one-minute-class" value="59" label=":59" flex="1"></timepicker-minute>
              </hbox>
            </vbox>
            <hbox class="time-picker-minutes-bottom">
              <spacer flex="1"></spacer>
              <label class="time-picker-more-control-label" value="«" onclick="clickLess()"></label>
            </hbox>
          </vbox>
        </vbox>
      `);
    }

    connectedCallback() {
      if (!this.hasChildNodes()) {
        this.appendChild(document.importNode(this.content, true));
      }

      // set by onPopupShowing
      this.mPicker = null;

      // The currently selected time
      this.mSelectedTime = new Date();
      // The selected hour and selected minute items
      this.mSelectedHourItem = null;
      this.mSelectedMinuteItem = null;
      // constants use to specify one and five minute view
      this.kMINUTE_VIEW_FIVE = 5;
      this.kMINUTE_VIEW_ONE = 1;
    }

    /**
     * Sets new mSelectedTime.
     *
     * @param {string | Array} val        new mSelectedTime value
     */
    set value(val) {
      if (typeof val == "string") {
        val = parseTime(val);
      } else if (Array.isArray(val)) {
        const [hours, minutes] = val;
        val = new Date();
        val.setHours(hours);
        val.setMinutes(minutes);
      }
      this.mSelectedTime = val;
    }

    /**
     * @returns {Array} An array containing mSelectedTime hours and mSelectedTime minutes
     */
    get value() {
      return [this.mSelectedTime.getHours(), this.mSelectedTime.getMinutes()];
    }

    /**
     * Set up the picker, called when the popup pops.
     */
    onPopupShowing() {
      // select the hour item
      const hours24 = this.mSelectedTime.getHours();
      const hourItem = this.querySelector(`.time-picker-hour-box-class[value="${hours24}"]`);
      this.selectHourItem(hourItem);

      // Show the five minute view if we are an even five minutes,
      // otherwise one minute view
      const minutesByFive = this.calcNearestFiveMinutes(this.mSelectedTime);

      if (minutesByFive == this.mSelectedTime.getMinutes()) {
        this.clickLess();
      } else {
        this.clickMore();
      }
    }

    /**
     * Switches popup to minute view and selects the selected minute item.
     */
    clickMore() {
      // switch to one minute view
      this.switchMinuteView(this.kMINUTE_VIEW_ONE);

      // select minute box corresponding to the time
      const minutes = this.mSelectedTime.getMinutes();
      const oneMinuteItem = this.querySelector(`.time-picker-one-minute-class[value="${minutes}"]`);
      this.selectMinuteItem(oneMinuteItem);
    }

    /**
     * Switches popup to five-minute view and selects the five-minute item nearest to selected
     * minute item.
     */
    clickLess() {
      // switch to five minute view
      this.switchMinuteView(this.kMINUTE_VIEW_FIVE);

      // select closest five minute box,
      // BUT leave the selected time at what may NOT be an even five minutes
      // So that If they click more again the proper non-even-five minute
      // box will be selected
      const minutesByFive = this.calcNearestFiveMinutes(this.mSelectedTime);
      const fiveMinuteItem = this.querySelector(
        `.time-picker-five-minute-class[value="${minutesByFive}"]`
      );
      this.selectMinuteItem(fiveMinuteItem);
    }

    /**
     * Selects the hour item which was clicked.
     *
     * @param {Node} hourItem - Hour item which was clicked
     * @param {number} hourNumber - Hour value of the clicked hour item
     */
    clickHour(hourItem, hourNumber) {
      // select the item
      this.selectHourItem(hourItem);

      // Change the hour in the selected time.
      this.mSelectedTime.setHours(hourNumber);

      this.hasChanged = true;
    }

    /**
     * Called when one of the hour boxes is double clicked.
     * Sets the time to the selected hour, on the hour, and closes the popup.
     *
     * @param {Node} hourItem - Hour item which was clicked
     * @param {number} hourNumber - Hour value of the clicked hour item
     */
    doubleClickHour(hourItem, hourNumber) {
      this.clickHour(hourItem, hourNumber);

      // set the minutes to :00
      this.mSelectedTime.setMinutes(0);

      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Changes selectedTime's minute, calls the client's onchange and closes
     * the popup.
     *
     * @param {Node} minuteItem - Minute item which was clicked
     * @param {number} minuteNumber - Minute value of the clicked minute item
     */
    clickMinute(minuteItem, minuteNumber) {
      // set the minutes in the selected time
      this.mSelectedTime.setMinutes(minuteNumber);
      this.selectMinuteItem(minuteItem);
      this.hasChanged = true;

      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Helper function to switch between "one" and "five" minute views.
     *
     * @param {number} view - Number representing minute view
     */
    switchMinuteView(view) {
      const fiveMinuteBox = this.querySelector(".time-picker-five-minute-grid-box");
      const oneMinuteBox = this.querySelector(".time-picker-one-minute-grid-box");

      if (view == this.kMINUTE_VIEW_ONE) {
        fiveMinuteBox.setAttribute("hidden", true);
        oneMinuteBox.setAttribute("hidden", false);
      } else {
        fiveMinuteBox.setAttribute("hidden", false);
        oneMinuteBox.setAttribute("hidden", true);
      }
    }

    /**
     * Selects an hour item.
     *
     * @param {Node} hourItem - Hour item node to be selected
     */
    selectHourItem(hourItem) {
      // clear old selection, if there is one
      if (this.mSelectedHourItem != null) {
        this.mSelectedHourItem.removeAttribute("selected");
      }
      // set selected attribute, to cause the selected style to apply
      hourItem.setAttribute("selected", "true");
      // remember the selected item so we can deselect it
      this.mSelectedHourItem = hourItem;
    }

    /**
     * Selects a minute item.
     *
     * @param {Node} minuteItem - Minute item node to be selected
     */
    selectMinuteItem(minuteItem) {
      // clear old selection, if there is one
      if (this.mSelectedMinuteItem != null) {
        this.mSelectedMinuteItem.removeAttribute("selected");
      }
      // set selected attribute, to cause the selected style to apply
      minuteItem.setAttribute("selected", "true");
      // remember the selected item so we can deselect it
      this.mSelectedMinuteItem = minuteItem;
    }

    /**
     * Moves minute by the number passed and handle rollover cases where the minutes gets
     * greater than 59 or less than 60.
     *
     * @param {number} number - Moves minute by the number 'number'
     */
    moveMinutes(number) {
      if (!this.mSelectedTime) {
        return;
      }

      let idPrefix = ".time-picker-one-minute-class";

      // Everything above assumes that we are showing the one-minute-grid,
      // If not, we need to do these corrections;
      const fiveMinuteBox = this.querySelector(".time-picker-five-minute-grid-box");

      if (!fiveMinuteBox.hidden) {
        number *= 5;
        idPrefix = ".time-picker-five-minute-class";

        // If the detailed view was shown before, then mSelectedTime.getMinutes
        // might not be a multiple of 5.
        this.mSelectedTime.setMinutes(this.calcNearestFiveMinutes(this.mSelectedTime));
      }

      let newMinutes = this.mSelectedTime.getMinutes() + number;

      // Handle rollover cases
      if (newMinutes < 0) {
        newMinutes += 60;
      }
      if (newMinutes > 59) {
        newMinutes -= 60;
      }

      this.mSelectedTime.setMinutes(newMinutes);

      const minuteItemId = `${idPrefix}[value="${this.mSelectedTime.getMinutes()}"]`;
      const minuteItem = this.querySelector(minuteItemId);

      this.selectMinuteItem(minuteItem);
      this.mPicker.kTextBox.value = this.mPicker.formatTime(this.mSelectedTime);
      this.hasChanged = true;
    }

    /**
     * Moves hours by the number passed and handle rollover cases where the hours gets greater
     * than 23 or less than 0.
     *
     * @param {number} number - Moves hours by the number 'number'
     */
    moveHours(number) {
      if (!this.mSelectedTime) {
        return;
      }

      let newHours = this.mSelectedTime.getHours() + number;

      // Handle rollover cases
      if (newHours < 0) {
        newHours += 24;
      }
      if (newHours > 23) {
        newHours -= 24;
      }

      this.mSelectedTime.setHours(newHours);

      const hourItemId = `.time-picker-hour-box-class[value="${this.mSelectedTime.getHours()}"]`;
      const hourItem = this.querySelector(hourItemId);

      this.selectHourItem(hourItem);
      this.mPicker.kTextBox.value = this.mPicker.formatTime(this.mSelectedTime);
      this.hasChanged = true;
    }

    /**
     * Calculates the nearest even five minutes.
     *
     * @param {calDateTime} time - Time near to which nearest five minutes have to be found
     */
    calcNearestFiveMinutes(time) {
      const minutes = time.getMinutes();
      let minutesByFive = Math.round(minutes / 5) * 5;

      if (minutesByFive > 59) {
        minutesByFive = 55;
      }
      return minutesByFive;
    }

    /**
     * Changes to 12 hours format by showing am/pm label.
     *
     * @param {string} amLabel - amLabelBox value
     * @param {string} pmLabel - pmLabelBox value
     */
    changeTo12HoursFormat(amLabel, pmLabel) {
      if (!this.firstElementChild) {
        this.appendChild(document.importNode(this.content, true));
      }

      const amLabelBox = this.querySelector(".amLabelBox");
      amLabelBox.removeAttribute("hidden");
      amLabelBox.firstElementChild.setAttribute("value", amLabel);
      const pmLabelBox = this.querySelector(".pmLabelBox");
      pmLabelBox.removeAttribute("hidden");
      pmLabelBox.firstElementChild.setAttribute("value", pmLabel);
      this.querySelector(".time-picker-hour-box-class[value='0']").setAttribute("label", "12");
      for (let i = 13; i < 24; i++) {
        this.querySelector(`.time-picker-hour-box-class[value="${i}"]`).setAttribute(
          "label",
          i - 12
        );
      }
      this.querySelector(".time-picker-hour-grid").setAttribute("format12hours", "true");
    }
  }

  class CalendarDatePicker extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.prepend(CalendarDatePicker.fragment.cloneNode(true));
      this._menulist = this.querySelector(".datepicker-menulist");
      this._inputField = this._menulist._inputField;
      this._popup = this._menulist.menupopup;
      this._minimonth = this.querySelector("calendar-minimonth");

      if (this.getAttribute("type") == "forever") {
        this._valueIsForever = false;
        this._foreverString = cal.l10n.getString(
          "calendar-event-dialog",
          "eventRecurrenceForeverLabel"
        );

        this._foreverItem = document.createXULElement("button");
        this._foreverItem.setAttribute("label", this._foreverString);
        this._popup.appendChild(document.createXULElement("menuseparator"));
        this._popup.appendChild(this._foreverItem);

        this._foreverItem.addEventListener("command", () => {
          this.value = "forever";
          this._popup.hidePopup();
        });
      }

      this.value = this.getAttribute("value") || new Date();

      // Other attributes handled in inheritedAttributes.
      this._handleMutation = () => {
        this.value = this.getAttribute("value");
      };
      this._attributeObserver = new MutationObserver(this._handleMutation);
      this._attributeObserver.observe(this, {
        attributes: true,
        attributeFilter: ["value"],
      });

      this.initializeAttributeInheritance();

      this.addEventListener("keydown", event => {
        if (event.key == "Escape") {
          this._popup.hidePopup();
        }
      });
      this._menulist.addEventListener("change", event => {
        event.stopPropagation();

        const value = parseDateTime(this._inputBoxValue);
        if (!value) {
          this._inputBoxValue = this._minimonthValue;
          return;
        }
        this._inputBoxValue = this._minimonthValue = value;
        this._valueIsForever = false;

        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      });
      this._popup.addEventListener("popupshown", () => {
        this._minimonth.focusDate(this._minimonthValue);
        const calendar = this._minimonth.querySelector(".minimonth-calendar");
        calendar.querySelector("td[selected]").focus();
      });
      this._minimonth.addEventListener("change", event => {
        event.stopPropagation();
      });
      this._minimonth.addEventListener("select", () => {
        this._inputBoxValue = this._minimonthValue;
        this._valueIsForever = false;
        this._popup.hidePopup();

        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      });
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      this._attributeObserver.disconnect();

      if (this._menulist) {
        this._menulist.remove();
        this._menulist = null;
        this._inputField = null;
        this._popup = null;
        this._minimonth = null;
        this._foreverItem = null;
      }
    }

    static get fragment() {
      // Accessibility information of these nodes will be
      // presented on XULComboboxAccessible generated from <menulist>;
      // hide these nodes from the accessibility tree.
      const frag = document.importNode(
        MozXULElement.parseXULToFragment(`
          <menulist is="menulist-editable" class="datepicker-menulist" editable="true" sizetopopup="false">
            <menupopup ignorekeys="true" popupanchor="bottomright" popupalign="topright">
              <calendar-minimonth tabindex="0"/>
            </menupopup>
          </menulist>
        `),
        true
      );

      Object.defineProperty(this, "fragment", { value: frag });
      return frag;
    }

    static get inheritedAttributes() {
      return { ".datepicker-menulist": "disabled" };
    }

    set value(val) {
      const wasForever = this._valueIsForever;
      if (this.getAttribute("type") == "forever" && val == "forever") {
        this._valueIsForever = true;
        this._inputBoxValue = val;
        if (!wasForever) {
          this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
        }
        return;
      } else if (typeof val == "string") {
        val = parseDateTime(val);
      }

      const existingValue = this._minimonthValue;
      this._valueIsForever = false;
      this._inputBoxValue = this._minimonthValue = val;

      if (
        wasForever ||
        existingValue.getFullYear() != val.getFullYear() ||
        existingValue.getMonth() != val.getMonth() ||
        existingValue.getDate() != val.getDate()
      ) {
        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      }
    }

    get value() {
      if (this._valueIsForever) {
        return "forever";
      }
      return this._minimonth.value;
    }

    focus() {
      this._menulist.focus();
    }

    set _inputBoxValue(val) {
      if (val == "forever") {
        this._inputField.value = this._foreverString;
        return;
      }
      this._inputField.value = formatDate(val);
    }

    get _inputBoxValue() {
      return this._inputField.value;
    }

    set _minimonthValue(val) {
      if (val == "forever") {
        return;
      }
      this._minimonth.value = val;
    }

    get _minimonthValue() {
      return this._minimonth.value;
    }
  }

  const MenuBaseControl = MozElements.BaseControlMixin(MozElements.MozElementMixin(XULMenuElement));
  MenuBaseControl.implementCustomInterface(CalendarDatePicker, [
    Ci.nsIDOMXULMenuListElement,
    Ci.nsIDOMXULSelectControlElement,
  ]);

  class CalendarTimePicker extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this.prepend(CalendarTimePicker.fragment.cloneNode(true));
      this._menulist = this.firstElementChild;
      this._inputField = this._menulist._inputField;
      this._popup = this._menulist.menupopup;
      this._grid = this._popup.firstElementChild;

      this.value = this.getAttribute("value") || new Date();

      // Change the grids in the timepicker-grids for 12-hours time format.
      if (ampmIndex) {
        // Find the locale strings for the AM/PM prefix/suffix.
        let amTime = new Date(2000, 0, 1, 6, 12, 34);
        let pmTime = new Date(2000, 0, 1, 18, 12, 34);
        amTime = timeFormatter.format(amTime);
        pmTime = timeFormatter.format(pmTime);
        const amLabel = parseTimeRegExp.exec(amTime)[ampmIndex] || "AM";
        const pmLabel = parseTimeRegExp.exec(pmTime)[ampmIndex] || "PM";

        this._grid.changeTo12HoursFormat(amLabel, pmLabel);
      }

      // Other attributes handled in inheritedAttributes.
      this._handleMutation = () => {
        this.value = this.getAttribute("value");
      };
      this._attributeObserver = new MutationObserver(this._handleMutation);
      this._attributeObserver.observe(this, {
        attributes: true,
        attributeFilter: ["value"],
      });

      this.initializeAttributeInheritance();

      this._inputField.addEventListener("change", event => {
        event.stopPropagation();

        const value = parseTime(this._inputBoxValue);
        if (!value) {
          this._inputBoxValue = this._gridValue;
          return;
        }
        this.value = value;
      });
      this._menulist.menupopup.addEventListener("popupshowing", () => {
        this._grid.onPopupShowing();
      });
      this._menulist.menupopup.addEventListener("popuphiding", () => {
        this.value = this._gridValue;
      });
      this._grid.addEventListener("select", event => {
        event.stopPropagation();

        this.value = this._gridValue;
        this._popup.hidePopup();
      });
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      this._attributeObserver.disconnect();

      if (this._menulist) {
        this._menulist.remove();
        this._menulist = null;
        this._inputField = null;
        this._popup = null;
        this._grid = null;
      }
    }

    static get fragment() {
      // Accessibility information of these nodes will be
      // presented on XULComboboxAccessible generated from <menulist>;
      // hide these nodes from the accessibility tree.
      const frag = document.importNode(
        MozXULElement.parseXULToFragment(`
          <menulist is="menulist-editable" class="timepicker-menulist" editable="true" sizetopopup="false">
            <menupopup popupanchor="bottomright" popupalign="topright">
              <timepicker-grids/>
            </menupopup>
          </menulist>
        `),
        true
      );

      Object.defineProperty(this, "fragment", { value: frag });
      return frag;
    }

    static get inheritedAttributes() {
      return { ".timepicker-menulist": "disabled" };
    }

    set value(val) {
      if (typeof val == "string") {
        val = parseTime(val);
      } else if (Array.isArray(val)) {
        const [hours, minutes] = val;
        val = new Date();
        val.setHours(hours);
        val.setMinutes(minutes);
      }
      if (val.getHours() != this._hours || val.getMinutes() != this._minutes) {
        const settingInitalValue = this._hours === undefined;

        this._inputBoxValue = this._gridValue = val;
        [this._hours, this._minutes] = this._gridValue;

        if (!settingInitalValue) {
          this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
        }
      }
    }

    get value() {
      return [this._hours, this._minutes];
    }

    focus() {
      this._menulist.focus();
    }

    set _inputBoxValue(val) {
      if (typeof val == "string") {
        val = parseTime(val);
      } else if (Array.isArray(val)) {
        const [hours, minutes] = val;
        val = new Date();
        val.setHours(hours);
        val.setMinutes(minutes);
      }
      this._inputField.value = formatTime(val);
    }

    get _inputBoxValue() {
      return this._inputField.value;
    }

    set _gridValue(val) {
      this._grid.value = val;
    }

    get _gridValue() {
      return this._grid.value;
    }
  }

  MenuBaseControl.implementCustomInterface(CalendarTimePicker, [
    Ci.nsIDOMXULMenuListElement,
    Ci.nsIDOMXULSelectControlElement,
  ]);

  class CalendarDateTimePicker extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }

      this._datepicker = document.createXULElement("datepicker");
      this._datepicker.classList.add("datetimepicker-datepicker");
      this._datepicker.setAttribute("anonid", "datepicker");
      this._timepicker = document.createXULElement("timepicker");
      this._timepicker.classList.add("datetimepicker-timepicker");
      this._timepicker.setAttribute("anonid", "timepicker");
      this.appendChild(this._datepicker);
      this.appendChild(this._timepicker);

      if (this.getAttribute("value")) {
        this._datepicker.value = this.getAttribute("value");
        this._timepicker.value = this.getAttribute("value");
      }

      this.initializeAttributeInheritance();

      this._datepicker.addEventListener("change", event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      });
      this._timepicker.addEventListener("change", event => {
        event.stopPropagation();
        this.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      });
    }

    disconnectedCallback() {
      super.disconnectedCallback();

      if (this._datepicker) {
        this._datepicker.remove();
      }
      if (this._timepicker) {
        this._timepicker.remove();
      }
    }

    static get inheritedAttributes() {
      return {
        ".datetimepicker-datepicker": "value,disabled,disabled=datepickerdisabled",
        ".datetimepicker-timepicker": "value,disabled,disabled=timepickerdisabled",
      };
    }

    set value(val) {
      this._datepicker.value = this._timepicker.value = val;
    }

    get value() {
      const dateValue = this._datepicker.value;
      const [hours, minutes] = this._timepicker.value;
      dateValue.setHours(hours);
      dateValue.setMinutes(minutes);
      dateValue.setSeconds(0);
      dateValue.setMilliseconds(0);
      return dateValue;
    }

    focus() {
      this._datepicker.focus();
    }
  }

  initDateFormat();
  initTimeFormat();
  customElements.define("timepicker-minute", MozTimepickerMinute);
  customElements.define("timepicker-hour", MozTimepickerHour);
  customElements.define("timepicker-grids", MozTimepickerGrids);
  customElements.whenDefined("menulist-editable").then(() => {
    customElements.define("datepicker", CalendarDatePicker);
    customElements.define("timepicker", CalendarTimePicker);
    customElements.define("datetimepicker", CalendarDateTimePicker);
  });

  /**
   * Parameter aValue may be a date or a date time. Dates are
   * read according to locale/OS setting (d-m-y or m-d-y or ...).
   * (see initDateFormat). Uses parseTime() for times.
   */
  function parseDateTime(aValue) {
    let tempDate = null;
    if (!probeSucceeded) {
      return null; // avoid errors accessing uninitialized data.
    }

    let year = Number.MIN_VALUE;
    let month = -1;
    let day = -1;
    let timeString = null;

    if (alphaMonths == null) {
      // SHORT NUMERIC DATE, such as 2002-03-04, 4/3/2002, or CE2002Y03M04D.
      // Made of digits & nonDigits.  (Nondigits may be unicode letters
      // which do not match \w, esp. in CJK locales.)
      // (.*)? binds to null if no suffix.
      const parseNumShortDateRegex = /^\D*(\d+)\D+(\d+)\D+(\d+)(.*)?$/;
      const dateNumbersArray = parseNumShortDateRegex.exec(aValue);
      if (dateNumbersArray != null) {
        year = Number(dateNumbersArray[yearIndex]);
        month = Number(dateNumbersArray[monthIndex]) - 1; // 0-based
        day = Number(dateNumbersArray[dayIndex]);
        timeString = dateNumbersArray[4];
      }
    } else {
      // SHORT DATE WITH ALPHABETIC MONTH, such as "dd MMM yy" or "MMMM dd, yyyy"
      // (\d+|[^\d\W]) is digits or letters, not both together.
      // Allows 31dec1999 (no delimiters between parts) if OS does (w2k does not).
      // Allows Dec 31, 1999 (comma and space between parts)
      // (Only accepts ASCII month names; JavaScript RegExp does not have an
      // easy way to describe unicode letters short of a HUGE character range
      // regexp derived from the Alphabetic ranges in
      // http://www.unicode.org/Public/UNIDATA/DerivedCoreProperties.txt)
      // (.*)? binds to null if no suffix.
      const parseAlphShortDateRegex =
        /^\s*(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)(.*)?$/;
      const datePartsArray = parseAlphShortDateRegex.exec(aValue);
      if (datePartsArray != null) {
        year = Number(datePartsArray[yearIndex]);
        const monthString = datePartsArray[monthIndex].toUpperCase();
        for (let monthIdx = 0; monthIdx < alphaMonths.length; monthIdx++) {
          if (monthString == alphaMonths[monthIdx]) {
            month = monthIdx;
            break;
          }
        }
        day = Number(datePartsArray[dayIndex]);
        timeString = datePartsArray[4];
      }
    }
    if (year != Number.MIN_VALUE && month != -1 && day != -1) {
      // year, month, day successfully parsed
      if (year >= 0 && year < 100) {
        // If 0 <= year < 100, treat as 2-digit year (like formatDate):
        //   parse year as up to 30 years in future or 69 years in past.
        //   (Covers 30-year mortgage and most working people's birthdate.)
        // otherwise will be treated as four digit year.
        const currentYear = new Date().getFullYear();
        const currentCentury = currentYear - (currentYear % 100);
        year = currentCentury + year;
        if (year < currentYear - 69) {
          year += 100;
        }
        if (year > currentYear + 30) {
          year -= 100;
        }
      }
      // if time is also present, parse it
      let hours = 0;
      let minutes = 0;
      let seconds = 0;
      if (timeString != null) {
        const time = parseTime(timeString);
        if (time != null) {
          hours = time.getHours();
          minutes = time.getMinutes();
          seconds = time.getSeconds();
        }
      }
      tempDate = new Date(year, month, day, hours, minutes, seconds, 0);
    } // else did not match regex, not a valid date
    return tempDate;
  }

  /**
   * Parse a variety of time formats so that cut and paste is likely to work.
   * separator:            ':'         '.'        ' '        symbol        none
   *                       "12:34:56"  "12.34.56" "12 34 56" "12h34m56s"   "123456"
   * seconds optional:     "02:34"     "02.34"    "02 34"    "02h34m"      "0234"
   * minutes optional:     "12"        "12"       "12"       "12h"         "12"
   * 1st hr digit optional:"9:34"      " 9.34"     "9 34"     "9H34M"       "934am"
   * skip nondigit prefix  " 12:34"    "t12.34"   " 12 34"   "T12H34M"     "T0234"
   * am/pm optional        "02:34 a.m.""02.34pm"  "02 34 A M" "02H34M P.M." "0234pm"
   * am/pm prefix          "a.m. 02:34""pm02.34"  "A M 02 34" "P.M. 02H34M" "pm0234"
   * am/pm cyrillic        "02:34\u0430.\u043c."  "02 34 \u0420 \u041c"
   * am/pm arabic          "\u063502:34" (RTL 02:34a) "\u0645 02.34" (RTL 02.34 p)
   * above/below noon      "\u4e0a\u534802:34"    "\u4e0b\u5348 02 34"
   * noon before/after     "\u5348\u524d02:34"    "\u5348\u5f8c 02 34"
   */
  function parseTime(aValue) {
    const now = new Date();

    const noon = cal.l10n.getDateFmtString("noon");
    if (aValue.toLowerCase() == noon.toLowerCase()) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    }

    const midnight = cal.l10n.getDateFmtString("midnight");
    if (aValue.toLowerCase() == midnight.toLowerCase()) {
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    }

    let time = null;
    const timePartsArray = parseTimeRegExp.exec(aValue);
    const PRE_INDEX = 1,
      HR_INDEX = 2,
      MIN_INDEX = 4,
      SEC_INDEX = 6,
      POST_INDEX = 8;

    if (timePartsArray != null) {
      const hoursString = timePartsArray[HR_INDEX];
      let hours = Number(hoursString);
      if (!(hours >= 0 && hours < 24)) {
        return null;
      }

      const minutesString = timePartsArray[MIN_INDEX];
      const minutes = minutesString == null ? 0 : Number(minutesString);
      if (!(minutes >= 0 && minutes < 60)) {
        return null;
      }

      const secondsString = timePartsArray[SEC_INDEX];
      const seconds = secondsString == null ? 0 : Number(secondsString);
      if (!(seconds >= 0 && seconds < 60)) {
        return null;
      }

      let ampmCode = null;
      if (timePartsArray[PRE_INDEX] || timePartsArray[POST_INDEX]) {
        if (ampmIndex && timePartsArray[ampmIndex]) {
          // try current format order first
          const ampmString = timePartsArray[ampmIndex];
          if (amRegExp.test(ampmString)) {
            ampmCode = "AM";
          } else if (pmRegExp.test(ampmString)) {
            ampmCode = "PM";
          }
        }
        if (ampmCode == null) {
          // not yet found
          // try any format order
          const preString = timePartsArray[PRE_INDEX];
          const postString = timePartsArray[POST_INDEX];
          if (
            (preString && amRegExp.test(preString)) ||
            (postString && amRegExp.test(postString))
          ) {
            ampmCode = "AM";
          } else if (
            (preString && pmRegExp.test(preString)) ||
            (postString && pmRegExp.test(postString))
          ) {
            ampmCode = "PM";
          } // else no match, ignore and treat as 24hour time.
        }
      }
      if (ampmCode == "AM") {
        if (hours == 12) {
          hours = 0;
        }
      } else if (ampmCode == "PM") {
        if (hours < 12) {
          hours += 12;
        }
      }
      time = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds, 0);
    } // else did not match regex, not valid time
    return time;
  }

  function initDateFormat() {
    // probe the dateformat
    yearIndex = -1;
    monthIndex = -1;
    dayIndex = -1;
    alphaMonths = null;
    probeSucceeded = false;

    // SHORT NUMERIC DATE, such as 2002-03-04, 4/3/2002, or CE2002Y03M04D.
    // Made of digits & nonDigits.  (Nondigits may be unicode letters
    // which do not match \w, esp. in CJK locales.)
    parseShortDateRegex = /^\D*(\d+)\D+(\d+)\D+(\d+)\D?$/;
    // Make sure to use UTC date and timezone here to avoid the pattern
    // detection to fail if the probe date output would have an timezone
    // offset due to our lack of support of historic timezone definitions.
    const probeDate = new Date(Date.UTC(2002, 3, 6)); // month is 0-based
    let probeString = formatDate(probeDate, cal.dtz.UTC);
    let probeArray = parseShortDateRegex.exec(probeString);
    if (probeArray) {
      // Numeric month format
      for (let i = 1; i <= 3; i++) {
        switch (Number(probeArray[i])) {
          case 2: // falls through
          case 2002:
            yearIndex = i;
            break;
          case 4:
            monthIndex = i;
            break;
          case 5: // falls through for OS timezones western to GMT
          case 6:
            dayIndex = i;
            break;
        }
      }
      // All three indexes are set (not -1) at this point.
      probeSucceeded = true;
    } else {
      // SHORT DATE WITH ALPHABETIC MONTH, such as "dd MMM yy" or "MMMM dd, yyyy"
      // (\d+|[^\d\W]) is digits or letters, not both together.
      // Allows 31dec1999 (no delimiters between parts) if OS does (w2k does not).
      // Allows Dec 31, 1999 (comma and space between parts)
      // (Only accepts ASCII month names; JavaScript RegExp does not have an
      // easy way to describe unicode letters short of a HUGE character range
      // regexp derived from the Alphabetic ranges in
      // http://www.unicode.org/Public/UNIDATA/DerivedCoreProperties.txt)
      parseShortDateRegex = /^\s*(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\W{0,2}(\d+|[^\d\W]+)\s*$/;
      probeArray = parseShortDateRegex.exec(probeString);
      if (probeArray != null) {
        for (let j = 1; j <= 3; j++) {
          switch (Number(probeArray[j])) {
            case 2: // falls through
            case 2002:
              yearIndex = j;
              break;
            case 5: // falls through for OS timezones western to GMT
            case 6:
              dayIndex = j;
              break;
            default:
              monthIndex = j;
              break;
          }
        }
        if (yearIndex != -1 && dayIndex != -1 && monthIndex != -1) {
          probeSucceeded = true;
          // Fill alphaMonths with month names.
          alphaMonths = new Array(12);
          for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
            probeDate.setMonth(monthIdx);
            probeString = formatDate(probeDate);
            probeArray = parseShortDateRegex.exec(probeString);
            if (probeArray) {
              alphaMonths[monthIdx] = probeArray[monthIndex].toUpperCase();
            } else {
              probeSucceeded = false;
            }
          }
        }
      }
    }
    if (!probeSucceeded) {
      dump("\nOperating system short date format is not recognized: " + probeString + "\n");
    }
  }

  /**
   * Time format in 24-hour format or 12-hour format with am/pm string.
   * Should match formats
   *      HH:mm,       H:mm,       HH:mm:ss,       H:mm:ss
   *      hh:mm tt,    h:mm tt,    hh:mm:ss tt,    h:mm:ss tt
   *   tt hh:mm,    tt h:mm,    tt hh:mm:ss,    tt h:mm:ss
   * where
   * HH is 24 hour digits, with leading 0.  H is 24 hour digits, no leading 0.
   * hh is 12 hour digits, with leading 0.  h is 12 hour digits, no leading 0.
   * mm and ss are is minutes and seconds digits, with leading 0.
   * tt is localized AM or PM string.
   * ':' may be ':' or a units marker such as 'h', 'm', or 's' in  15h12m00s
   * or may be omitted as in 151200.
   */
  function initTimeFormat() {
    // probe the Time format
    ampmIndex = null;
    // Digits         HR           sep          MIN         sep          SEC         sep
    //   Index:       2            3            4           5            6           7
    // prettier-ignore
    const digitsExpr = "(\\d?\\d)\\s?(\\D)?\\s?(?:(\\d\\d)\\s?(\\D)?\\s?(?:(\\d\\d)\\s?(\\D)?\\s?)?)?";
    // digitsExpr has 6 captures, so index of first ampmExpr is 1, of last is 8.
    const probeTimeRegExp = new RegExp("^\\s*(\\D*)\\s?" + digitsExpr + "\\s?(\\D*)\\s*$");
    const PRE_INDEX = 1,
      HR_INDEX = 2,
      // eslint-disable-next-line no-unused-vars
      MIN_INDEX = 4,
      SEC_INDEX = 6,
      POST_INDEX = 8;
    const amProbeTime = new Date(2000, 0, 1, 6, 12, 34);
    const pmProbeTime = new Date(2000, 0, 1, 18, 12, 34);
    const amProbeString = timeFormatter.format(amProbeTime);
    const pmProbeString = timeFormatter.format(pmProbeTime);
    let amFormatExpr = null,
      pmFormatExpr = null;
    if (amProbeString != pmProbeString) {
      const amProbeArray = probeTimeRegExp.exec(amProbeString);
      const pmProbeArray = probeTimeRegExp.exec(pmProbeString);
      if (amProbeArray != null && pmProbeArray != null) {
        if (
          amProbeArray[PRE_INDEX] &&
          pmProbeArray[PRE_INDEX] &&
          amProbeArray[PRE_INDEX] != pmProbeArray[PRE_INDEX]
        ) {
          ampmIndex = PRE_INDEX;
        } else if (amProbeArray[POST_INDEX] && pmProbeArray[POST_INDEX]) {
          if (amProbeArray[POST_INDEX] == pmProbeArray[POST_INDEX]) {
            // check if need to append previous character,
            // captured by the optional separator pattern after seconds digits,
            // or after minutes if no seconds, or after hours if no minutes.
            for (let k = SEC_INDEX; k >= HR_INDEX; k -= 2) {
              const nextSepI = k + 1;
              const nextDigitsI = k + 2;
              if (
                (k == SEC_INDEX || (!amProbeArray[nextDigitsI] && !pmProbeArray[nextDigitsI])) &&
                amProbeArray[nextSepI] &&
                pmProbeArray[nextSepI] &&
                amProbeArray[nextSepI] != pmProbeArray[nextSepI]
              ) {
                amProbeArray[POST_INDEX] = amProbeArray[nextSepI] + amProbeArray[POST_INDEX];
                pmProbeArray[POST_INDEX] = pmProbeArray[nextSepI] + pmProbeArray[POST_INDEX];
                ampmIndex = POST_INDEX;
                break;
              }
            }
          } else {
            ampmIndex = POST_INDEX;
          }
        }
        if (ampmIndex) {
          const makeFormatRegExp = function (string) {
            // make expr to accept either as provided, lowercased, or uppercased
            let regExp = string.replace(/(\W)/g, "[$1]"); // escape punctuation
            const lowercased = string.toLowerCase();
            if (string != lowercased) {
              regExp += "|" + lowercased;
            }
            const uppercased = string.toUpperCase();
            if (string != uppercased) {
              regExp += "|" + uppercased;
            }
            return regExp;
          };
          amFormatExpr = makeFormatRegExp(amProbeArray[ampmIndex]);
          pmFormatExpr = makeFormatRegExp(pmProbeArray[ampmIndex]);
        }
      }
    }
    // International formats ([roman, cyrillic]|arabic|chinese/kanji characters)
    // covering languages of U.N. (en,fr,sp,ru,ar,zh) and G8 (en,fr,de,it,ru,ja).
    // See examples at parseTimeOfDay.
    let amExpr = "[Aa\u0410\u0430][. ]?[Mm\u041c\u043c][. ]?|\u0635|\u4e0a\u5348|\u5348\u524d";
    let pmExpr = "[Pp\u0420\u0440][. ]?[Mm\u041c\u043c][. ]?|\u0645|\u4e0b\u5348|\u5348\u5f8c";
    if (ampmIndex) {
      amExpr = amFormatExpr + "|" + amExpr;
      pmExpr = pmFormatExpr + "|" + pmExpr;
    }
    const ampmExpr = amExpr + "|" + pmExpr;
    // Must build am/pm formats into parse time regexp so that it can
    // match them without mistaking the initial char for an optional divider.
    // (For example, want to be able to parse both "12:34pm" and
    // "12H34M56Spm" for any characters H,M,S and any language's "pm".
    // The character between the last digit and the "pm" is optional.
    // Must recognize "pm" directly, otherwise in "12:34pm" the "S" pattern
    // matches the "p" character so only "m" is matched as ampm suffix.)
    //
    // digitsExpr has 6 captures, so index of first ampmExpr is 1, of last is 8.
    parseTimeRegExp = new RegExp(
      "(" + ampmExpr + ")?\\s?" + digitsExpr + "(" + ampmExpr + ")?\\s*$"
    );
    amRegExp = new RegExp("^(?:" + amExpr + ")$");
    pmRegExp = new RegExp("^(?:" + pmExpr + ")$");
  }

  function formatDate(aDate, aTimezone) {
    // Usually, floating is ok here, so no need to pass aTimezone - we just need to pass
    // it in if we need to make sure formatting happens without a timezone conversion.
    const formatter = aTimezone
      ? new Services.intl.DateTimeFormat(undefined, {
          dateStyle: "short",
          timeZone: aTimezone.tzid,
        })
      : dateFormatter;
    return formatter.format(aDate);
  }

  function formatTime(aValue) {
    return timeFormatter.format(aValue);
  }
}
