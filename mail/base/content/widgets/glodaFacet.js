/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global DateFacetVis, FacetContext */

// Wrap in a block to prevent leaking to window scope.
{
  const { MailServices } = ChromeUtils.import(
    "resource:///modules/MailServices.jsm"
  );
  const { TagUtils } = ChromeUtils.import("resource:///modules/TagUtils.jsm");
  const { FacetUtils } = ChromeUtils.import(
    "resource:///modules/gloda/Facet.jsm"
  );
  const { PluralForm } = ChromeUtils.importESModule(
    "resource:///modules/PluralForm.sys.mjs"
  );
  const { Gloda } = ChromeUtils.import("resource:///modules/gloda/Gloda.jsm");

  var glodaFacetStrings = Services.strings.createBundle(
    "chrome://messenger/locale/glodaFacetView.properties"
  );

  class MozFacetDate extends HTMLElement {
    get build() {
      return this.buildFunc;
    }

    get brushItems() {
      return items => this.vis.hoverItems(items);
    }

    get clearBrushedItems() {
      return () => this.vis.clearHover();
    }

    connectedCallback() {
      const wrapper = document.createElement("div");
      wrapper.classList.add("facet", "date-wrapper");

      const h2 = document.createElement("h2");

      const canvas = document.createElement("div");
      canvas.classList.add("date-vis-frame");

      const zoomOut = document.createElement("div");
      zoomOut.classList.add("facet-date-zoom-out");
      zoomOut.setAttribute("role", "image");
      zoomOut.addEventListener("click", () => FacetContext.zoomOut());

      wrapper.appendChild(h2);
      wrapper.appendChild(canvas);
      wrapper.appendChild(zoomOut);
      this.appendChild(wrapper);

      this.canUpdate = true;
      this.canvasNode = canvas;
      this.vis = null;
      if ("faceter" in this) {
        this.buildFunc(true);
      }
    }

    buildFunc(aDoSize) {
      if (!this.vis) {
        this.vis = new DateFacetVis(this, this.canvasNode);
        this.vis.build();
      } else {
        while (this.canvasNode.hasChildNodes()) {
          this.canvasNode.lastChild.remove();
        }
        if (aDoSize) {
          this.vis.build();
        } else {
          this.vis.rebuild();
        }
      }
    }
  }

  customElements.define("facet-date", MozFacetDate);

  /**
   * MozFacetResultsMessage shows the search results for the string entered in gloda-searchbox.
   *
   * @augments {HTMLElement}
   */
  class MozFacetResultsMessage extends HTMLElement {
    connectedCallback() {
      const header = document.createElement("div");
      header.classList.add("results-message-header");

      this.countNode = document.createElement("h2");
      this.countNode.classList.add("results-message-count");

      this.toggleTimeline = document.createElement("button");
      this.toggleTimeline.setAttribute("id", "date-toggle");
      this.toggleTimeline.setAttribute("tabindex", 0);
      this.toggleTimeline.classList.add("gloda-timeline-button");
      this.toggleTimeline.addEventListener("click", () => {
        FacetContext.toggleTimeline();
      });

      const timelineImage = document.createElement("img");
      timelineImage.setAttribute(
        "src",
        "chrome://messenger/skin/icons/popular.svg"
      );
      timelineImage.setAttribute("alt", "");
      this.toggleTimeline.appendChild(timelineImage);

      this.toggleText = document.createElement("span");
      this.toggleTimeline.appendChild(this.toggleText);

      const sortDiv = document.createElement("div");
      sortDiv.classList.add("results-message-sort-bar");

      this.sortSelect = document.createElement("select");
      this.sortSelect.setAttribute("id", "sortby");
      const sortByPref = Services.prefs.getIntPref("gloda.facetview.sortby");

      const relevanceItem = document.createElement("option");
      relevanceItem.textContent = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.message.sort.relevance2"
      );
      relevanceItem.setAttribute("value", "-dascore");
      relevanceItem.toggleAttribute(
        "selected",
        sortByPref <= 0 || sortByPref == 2 || sortByPref > 3
      );
      this.sortSelect.appendChild(relevanceItem);

      const dateItem = document.createElement("option");
      dateItem.textContent = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.message.sort.date2"
      );
      dateItem.setAttribute("value", "-date");
      dateItem.toggleAttribute("selected", sortByPref == 1 || sortByPref == 3);
      this.sortSelect.appendChild(dateItem);

      this.messagesNode = document.createElement("div");
      this.messagesNode.classList.add("messages");

      header.appendChild(this.countNode);
      header.appendChild(this.toggleTimeline);
      header.appendChild(sortDiv);

      sortDiv.appendChild(this.sortSelect);

      this.appendChild(header);
      this.appendChild(this.messagesNode);
    }

    setMessages(messages) {
      const topMessagesPluralFormat = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.header.countLabel.NMessages"
      );
      const outOfPluralFormat = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.header.countLabel.ofN"
      );
      const groupingFormat = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.header.countLabel.grouping"
      );

      const displayCount = messages.length;
      const totalCount = FacetContext.activeSet.length;

      // set the count so CSS selectors can know what the results look like
      this.setAttribute("state", totalCount <= 0 ? "empty" : "some");

      const topMessagesStr = PluralForm.get(
        displayCount,
        topMessagesPluralFormat
      ).replace("#1", displayCount.toLocaleString());
      const outOfStr = PluralForm.get(totalCount, outOfPluralFormat).replace(
        "#1",
        totalCount.toLocaleString()
      );

      this.countNode.textContent = groupingFormat
        .replace("#1", topMessagesStr)
        .replace("#2", outOfStr);

      this.toggleText.textContent = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.results.message.timeline.label"
      );

      const sortByPref = Services.prefs.getIntPref("gloda.facetview.sortby");
      this.sortSelect.addEventListener("change", () => {
        if (sortByPref >= 2) {
          Services.prefs.setIntPref(
            "gloda.facetview.sortby",
            this.sortSelect.value == "-dascore" ? 2 : 3
          );
        }

        FacetContext.sortBy = this.sortSelect.value;
      });

      while (this.messagesNode.hasChildNodes()) {
        this.messagesNode.lastChild.remove();
      }
      try {
        // -- Messages
        for (const message of messages) {
          const msgNode = document.createElement("facet-result-message");
          msgNode.message = message;
          msgNode.setAttribute("class", "message");
          this.messagesNode.appendChild(msgNode);
        }
      } catch (e) {
        console.error(e);
      }
    }
  }

  customElements.define("facet-results-message", MozFacetResultsMessage);

  class MozFacetBoolean extends HTMLElement {
    constructor() {
      super();

      this.addEventListener("mouseover", event => {
        FacetContext.hoverFacet(
          this.faceter,
          this.faceter.attrDef,
          true,
          this.trueValues
        );
      });

      this.addEventListener("mouseout", event => {
        FacetContext.unhoverFacet(
          this.faceter,
          this.faceter.attrDef,
          true,
          this.trueValues
        );
      });
    }

    connectedCallback() {
      this.addChildren();

      this.canUpdate = true;
      this.bubble.addEventListener("click", event => {
        return this.bubbleClicked(event);
      });

      if ("faceter" in this) {
        this.build(true);
      }
    }

    addChildren() {
      this.bubble = document.createElement("span");
      this.bubble.classList.add("facet-checkbox-bubble");

      this.checkbox = document.createElement("input");
      this.checkbox.setAttribute("type", "checkbox");

      this.labelNode = document.createElement("span");
      this.labelNode.classList.add("facet-checkbox-label");

      this.countNode = document.createElement("span");
      this.countNode.classList.add("facet-checkbox-count");

      this.bubble.appendChild(this.checkbox);
      this.bubble.appendChild(this.labelNode);
      this.bubble.appendChild(this.countNode);

      this.appendChild(this.bubble);
    }

    set disabled(val) {
      if (val) {
        this.setAttribute("disabled", "true");
        this.checkbox.setAttribute("disabled", "true");
      } else {
        this.removeAttribute("disabled");
        this.checkbox.removeAttribute("disabled");
      }
    }

    get disabled() {
      return this.getAttribute("disabled") == "true";
    }

    set checked(val) {
      if (this.checked == val) {
        return;
      }
      this.checkbox.checked = val;
      if (val) {
        this.setAttribute("checked", "true");
        if (!this.disabled) {
          FacetContext.addFacetConstraint(this.faceter, true, this.trueGroups);
        }
      } else {
        this.removeAttribute("checked");
        this.checkbox.removeAttribute("checked");
        if (!this.disabled) {
          FacetContext.removeFacetConstraint(
            this.faceter,
            true,
            this.trueGroups
          );
        }
      }
      this.checkStateChanged();
    }

    get checked() {
      return this.getAttribute("checked") == "true";
    }

    extraSetup() {}

    checkStateChanged() {}

    brushItems() {}

    clearBrushedItems() {}

    build(firstTime) {
      if (firstTime) {
        this.labelNode.textContent = this.facetDef.strings.facetNameLabel;
        this.checkbox.setAttribute(
          "aria-label",
          this.facetDef.strings.facetNameLabel
        );
        this.trueValues = [];
      }

      // If we do not currently have a constraint applied and there is only
      //  one (or no) group, then: disable us, but reflect the underlying
      //  state of the data (checked or non-checked)
      if (!this.faceter.constraint && this.orderedGroups.length <= 1) {
        this.disabled = true;
        let count = 0;
        if (this.orderedGroups.length) {
          // true case?
          if (this.orderedGroups[0][0]) {
            count = this.orderedGroups[0][1].length;
            this.checked = true;
          } else {
            this.checked = false;
          }
        }
        this.countNode.textContent = count.toLocaleString();
        return;
      }
      // if we were disabled checked before, clear ourselves out
      if (this.disabled && this.checked) {
        this.checked = false;
      }
      this.disabled = false;

      // if we are here, we have our 2 groups, find true...
      // (note: it is possible to get jerked around by null values
      //  currently, so leave a reasonable failure case)
      this.trueValues = [];
      this.trueGroups = [true];
      for (const groupPair of this.orderedGroups) {
        if (groupPair[0]) {
          this.trueValues = groupPair[1];
        }
      }

      this.countNode.textContent = this.trueValues.length.toLocaleString();
    }

    bubbleClicked(event) {
      if (!this.disabled) {
        this.checked = !this.checked;
      }
      event.stopPropagation();
    }
  }

  customElements.define("facet-boolean", MozFacetBoolean);

  class MozFacetBooleanFiltered extends MozFacetBoolean {
    static get observedAttributes() {
      return ["checked", "disabled"];
    }

    connectedCallback() {
      super.addChildren();

      this.filterNode = document.createElement("select");
      this.filterNode.classList.add("facet-filter-list");
      this.appendChild(this.filterNode);

      this.canUpdate = true;
      this.bubble.addEventListener("click", event => {
        return super.bubbleClicked(event);
      });

      this.extraSetup();

      if ("faceter" in this) {
        this.build(true);
      }

      this._updateAttributes();
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    _updateAttributes() {
      if (!this.checkbox) {
        return;
      }

      if (this.hasAttribute("checked")) {
        this.checkbox.setAttribute("checked", this.getAttribute("checked"));
      } else {
        this.checkbox.removeAttribute("checked");
      }

      if (this.hasAttribute("disabled")) {
        this.checkbox.setAttribute("disabled", this.getAttribute("disabled"));
      } else {
        this.checkbox.removeAttribute("disabled");
      }
    }

    extraSetup() {
      this.groupDisplayProperty = this.getAttribute("groupDisplayProperty");

      this.filterNode.addEventListener("change", event =>
        this.filterChanged(event)
      );

      this.selectedValue = "all";
    }

    build(firstTime) {
      if (firstTime) {
        this.labelNode.textContent = this.facetDef.strings.facetNameLabel;
        this.checkbox.setAttribute(
          "aria-label",
          this.facetDef.strings.facetNameLabel
        );
        this.trueValues = [];
      }

      // Only update count if anything other than "all" is selected.
      // Otherwise we lose the set of attachment types in our select box,
      // and that makes us sad.  We do want to update on "all" though
      // because other facets may further reduce the number of attachments
      // we see.  (Or if this is not just being used for attachments, it
      // still holds.)
      if (this.selectedValue != "all") {
        let count = 0;
        for (const groupPair of this.orderedGroups) {
          if (groupPair[0] != null) {
            count += groupPair[1].length;
          }
        }
        this.countNode.textContent = count.toLocaleString();
        return;
      }

      while (this.filterNode.hasChildNodes()) {
        this.filterNode.lastChild.remove();
      }

      const allNode = document.createElement("option");
      allNode.textContent = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.facets.filter." +
          this.attrDef.attributeName +
          ".allLabel"
      );
      allNode.setAttribute("value", "all");
      if (this.selectedValue == "all") {
        allNode.setAttribute("selected", "selected");
      }
      this.filterNode.appendChild(allNode);

      // if we are here, we have our 2 groups, find true...
      // (note: it is possible to get jerked around by null values
      // currently, so leave a reasonable failure case)
      // empty true groups is for the checkbox
      this.trueGroups = [];
      // the real true groups is the actual true values for our explicit
      // filtering
      this.realTrueGroups = [];
      this.trueValues = [];
      this.falseValues = [];
      const selectNodes = [];
      for (const groupPair of this.orderedGroups) {
        if (groupPair[0] === null) {
          this.falseValues.push.apply(this.falseValues, groupPair[1]);
        } else {
          this.trueValues.push.apply(this.trueValues, groupPair[1]);

          const groupValue = groupPair[0];
          const selNode = document.createElement("option");
          selNode.textContent = groupValue[this.groupDisplayProperty];
          selNode.setAttribute("value", this.realTrueGroups.length);
          if (this.selectedValue == groupValue.category) {
            selNode.setAttribute("selected", "selected");
          }
          selectNodes.push(selNode);

          this.realTrueGroups.push(groupValue);
        }
      }
      selectNodes.sort((a, b) => {
        return a.textContent.localeCompare(b.textContent);
      });
      selectNodes.forEach(selNode => {
        this.filterNode.appendChild(selNode);
      });

      this.disabled = !this.trueValues.length;

      this.countNode.textContent = this.trueValues.length.toLocaleString();
    }

    checkStateChanged() {
      // if they un-check us, revert our value to all.
      if (!this.checked) {
        this.selectedValue = "all";
      }
    }

    filterChanged(event) {
      if (!this.checked) {
        return;
      }
      if (this.filterNode.value == "all") {
        this.selectedValue = "all";
        FacetContext.addFacetConstraint(
          this.faceter,
          true,
          this.trueGroups,
          false,
          true
        );
      } else {
        const groupValue = this.realTrueGroups[parseInt(this.filterNode.value)];
        this.selectedValue = groupValue.category;
        FacetContext.addFacetConstraint(
          this.faceter,
          true,
          [groupValue],
          false,
          true
        );
      }
    }
  }

  customElements.define("facet-boolean-filtered", MozFacetBooleanFiltered);

  class MozFacetDiscrete extends HTMLElement {
    constructor() {
      super();

      this.addEventListener("click", event => {
        this.showPopup(event);
      });

      this.addEventListener("keypress", event => {
        if (event.keyCode != KeyEvent.DOM_VK_RETURN) {
          return;
        }
        this.showPopup(event);
      });

      this.addEventListener("keypress", event => {
        this.activateLink(event);
      });

      this.addEventListener("mouseover", event => {
        // we dispatch based on the class of the thing we clicked on.
        // there are other ways we could accomplish this, but they all sorta suck.
        if (
          event.target.hasAttribute("class") &&
          event.target.classList.contains("bar-link")
        ) {
          this.barHovered(event.target.parentNode, true);
        }
      });

      this.addEventListener("mouseout", event => {
        // we dispatch based on the class of the thing we clicked on.
        // there are other ways we could accomplish this, but they all sorta suck.
        if (
          event.target.hasAttribute("class") &&
          event.target.classList.contains("bar-link")
        ) {
          this.barHoverGone(event.target.parentNode, true);
        }
      });
    }

    connectedCallback() {
      const facet = document.createElement("div");
      facet.classList.add("facet");

      this.nameNode = document.createElement("h2");

      this.contentBox = document.createElement("div");
      this.contentBox.classList.add("facet-content");

      this.includeLabel = document.createElement("h3");
      this.includeLabel.classList.add("facet-included-header");

      this.includeList = document.createElement("ul");
      this.includeList.classList.add("facet-included", "barry");

      this.remainderLabel = document.createElement("h3");
      this.remainderLabel.classList.add("facet-remaindered-header");

      this.remainderList = document.createElement("ul");
      this.remainderList.classList.add("facet-remaindered", "barry");

      this.excludeLabel = document.createElement("h3");
      this.excludeLabel.classList.add("facet-excluded-header");

      this.excludeList = document.createElement("ul");
      this.excludeList.classList.add("facet-excluded", "barry");

      this.moreButton = document.createElement("button");
      this.moreButton.classList.add("facet-more");
      this.moreButton.setAttribute("needed", "false");
      this.moreButton.setAttribute("tabindex", "0");

      this.contentBox.appendChild(this.includeLabel);
      this.contentBox.appendChild(this.includeList);
      this.contentBox.appendChild(this.remainderLabel);
      this.contentBox.appendChild(this.remainderList);
      this.contentBox.appendChild(this.excludeLabel);
      this.contentBox.appendChild(this.excludeList);
      this.contentBox.appendChild(this.moreButton);

      facet.appendChild(this.nameNode);
      facet.appendChild(this.contentBox);

      this.appendChild(facet);

      this.canUpdate = false;

      if ("faceter" in this) {
        this.build(true);
      }
    }

    build(firstTime) {
      // -- Header Building
      this.nameNode.textContent = this.facetDef.strings.facetNameLabel;

      // - include
      // setup the include label
      if ("includeLabel" in this.facetDef.strings) {
        this.includeLabel.textContent = this.facetDef.strings.includeLabel;
      } else {
        this.includeLabel.textContent = glodaFacetStrings.GetStringFromName(
          "glodaFacetView.facets.included.fallbackLabel"
        );
      }
      this.includeLabel.setAttribute("state", "empty");

      // - exclude
      // setup the exclude label
      if ("excludeLabel" in this.facetDef.strings) {
        this.excludeLabel.textContent = this.facetDef.strings.excludeLabel;
      } else {
        this.excludeLabel.textContent = glodaFacetStrings.GetStringFromName(
          "glodaFacetView.facets.excluded.fallbackLabel"
        );
      }
      this.excludeLabel.setAttribute("state", "empty");

      // - remainder
      // setup the remainder label
      if ("remainderLabel" in this.facetDef.strings) {
        this.remainderLabel.textContent = this.facetDef.strings.remainderLabel;
      } else {
        this.remainderLabel.textContent = glodaFacetStrings.GetStringFromName(
          "glodaFacetView.facets.remainder.fallbackLabel"
        );
      }

      // -- House-cleaning
      // -- All/Top mode decision
      this.modes = ["all"];
      if (this.maxDisplayRows >= this.orderedGroups.length) {
        this.mode = "all";
      } else {
        // top mode must be used
        this.modes.push("top");
        this.mode = "top";
        this.topGroups = FacetUtils.makeTopGroups(
          this.attrDef,
          this.orderedGroups,
          this.maxDisplayRows
        );
        // setup the more button string
        const groupCount = this.orderedGroups.length;
        this.moreButton.textContent = PluralForm.get(
          groupCount,
          glodaFacetStrings.GetStringFromName(
            "glodaFacetView.facets.mode.top.listAllLabel"
          )
        ).replace("#1", groupCount);
      }

      // -- Row Building
      this.buildRows();
    }

    changeMode(newMode) {
      this.mode = newMode;
      this.setAttribute("mode", newMode);
      this.buildRows();
    }

    buildRows() {
      const nounDef = this.nounDef;
      const useGroups =
        this.mode == "all" ? this.orderedGroups : this.topGroups;

      // should we just rely on automatic string coercion?
      this.moreButton.setAttribute(
        "needed",
        this.mode == "top" ? "true" : "false"
      );

      const constraint = this.faceter.constraint;

      // -- empty all of our display buckets...
      const remainderList = this.remainderList;
      while (remainderList.hasChildNodes()) {
        remainderList.lastChild.remove();
      }
      const includeList = this.includeList;
      const excludeList = this.excludeList;
      while (includeList.hasChildNodes()) {
        includeList.lastChild.remove();
      }
      while (excludeList.hasChildNodes()) {
        excludeList.lastChild.remove();
      }

      // -- first pass, check for ambiguous labels
      // It's possible that multiple groups are identified by the same short
      //  string, in which case we want to use the longer string to
      //  disambiguate.  For example, un-merged contacts can result in
      //  multiple identities having contacts with the same name.  In that
      //  case we want to display both the contact name and the identity
      //  name.
      // This is generically addressed by using the userVisibleString function
      //  defined on the noun type if it is defined.  It takes an argument
      //  indicating whether it should be a short string or a long string.
      // Our algorithm is somewhat dumb.  We get the short strings, put them
      //  in a dictionary that maps to whether they are ambiguous or not.  We
      //  do not attempt to map based on their id, so then when it comes time
      //  to actually build the labels, we must build the short string and
      //  then re-call for the long name.  We could be smarter by building
      //  a list of the input values that resulted in the output string and
      //  then using that to back-update the id map, but it's more compelx and
      //  the performance difference is unlikely to be meaningful.
      let ambiguousKeyValues;
      if ("userVisibleString" in nounDef) {
        ambiguousKeyValues = {};
        for (const groupPair of useGroups) {
          const [groupValue] = groupPair;

          // skip null values, they are handled by the none special-case
          if (groupValue == null) {
            continue;
          }

          const groupStr = nounDef.userVisibleString(groupValue, false);
          // We use hasOwnProperty because it is possible that groupStr could
          //  be the same as the name of one of the attributes on
          //  Object.prototype.
          if (ambiguousKeyValues.hasOwnProperty(groupStr)) {
            ambiguousKeyValues[groupStr] = true;
          } else {
            ambiguousKeyValues[groupStr] = false;
          }
        }
      }

      // -- create the items, assigning them to the right list based on
      //  existing constraint values
      for (const groupPair of useGroups) {
        const [groupValue, groupItems] = groupPair;
        const li = document.createElement("li");
        li.setAttribute("class", "bar");
        li.setAttribute("tabindex", "0");
        li.setAttribute("role", "link");
        li.setAttribute("aria-haspopup", "true");
        li.groupValue = groupValue;
        li.setAttribute("groupValue", groupValue);
        li.groupItems = groupItems;

        const countSpan = document.createElement("span");
        countSpan.setAttribute("class", "bar-count");
        countSpan.textContent = groupItems.length.toLocaleString();
        li.appendChild(countSpan);

        const label = document.createElement("span");
        label.setAttribute("class", "bar-link");

        // The null value is a special indicator for 'none'
        if (groupValue == null) {
          if ("noneLabel" in this.facetDef.strings) {
            label.textContent = this.facetDef.strings.noneLabel;
          } else {
            label.textContent = glodaFacetStrings.GetStringFromName(
              "glodaFacetView.facets.noneLabel"
            );
          }
        } else {
          // Otherwise stringify the group object
          let labelStr;
          if (ambiguousKeyValues) {
            labelStr = nounDef.userVisibleString(groupValue, false);
            if (ambiguousKeyValues[labelStr]) {
              labelStr = nounDef.userVisibleString(groupValue, true);
            }
          } else if ("labelFunc" in this.facetDef) {
            labelStr = this.facetDef.labelFunc(groupValue);
          } else {
            labelStr = groupValue.toLocaleString().substring(0, 80);
          }
          label.textContent = labelStr;
          label.setAttribute("title", labelStr);
        }
        li.appendChild(label);

        // root it under the appropriate list
        if (constraint) {
          if (constraint.isIncludedGroup(groupValue)) {
            li.setAttribute("variety", "include");
            includeList.appendChild(li);
          } else if (constraint.isExcludedGroup(groupValue)) {
            li.setAttribute("variety", "exclude");
            excludeList.appendChild(li);
          } else {
            li.setAttribute("variety", "remainder");
            remainderList.appendChild(li);
          }
        } else {
          li.setAttribute("variety", "remainder");
          remainderList.appendChild(li);
        }
      }

      this.updateHeaderStates();
    }

    /**
     * - Mark the include/exclude headers as "some" if there is anything in their
     * - lists, mark the remainder header as "needed" if either of include /
     * - exclude exist so we need that label.
     */
    updateHeaderStates(items) {
      this.includeLabel.setAttribute(
        "state",
        this.includeList.childElementCount ? "some" : "empty"
      );
      this.excludeLabel.setAttribute(
        "state",
        this.excludeList.childElementCount ? "some" : "empty"
      );
      this.remainderLabel.setAttribute(
        "needed",
        (this.includeList.childElementCount ||
          this.excludeList.childElementCount) &&
          this.remainderList.childElementCount
          ? "true"
          : "false"
      );

      // nuke the style attributes.
      this.includeLabel.removeAttribute("style");
      this.excludeLabel.removeAttribute("style");
      this.remainderLabel.removeAttribute("style");
    }

    brushItems(items) {}

    clearBrushedItems() {}

    afterListVisible(variety, callback) {
      const labelNode = this[variety + "Label"];
      const listNode = this[variety + "List"];

      // if there are already things displayed, no need
      if (listNode.childElementCount) {
        callback();
        return;
      }

      const remListVisible =
        this.remainderLabel.getAttribute("needed") == "true";
      const remListShouldBeVisible = this.remainderList.childElementCount > 1;

      labelNode.setAttribute("state", "some");

      let showNodes = [labelNode];
      if (remListVisible != remListShouldBeVisible) {
        showNodes = [labelNode, this.remainderLabel];
      }

      showNodes.forEach(node => (node.style.display = "block"));

      callback();
    }

    _flyBarAway(barNode, variety, callback) {
      function getRect(aElement) {
        const box = aElement.getBoundingClientRect();
        const documentElement = aElement.ownerDocument.documentElement;
        return {
          top: box.top + window.pageYOffset - documentElement.clientTop,
          left: box.left + window.pageXOffset - documentElement.clientLeft,
          width: box.width,
          height: box.height,
        };
      }
      // figure out our origin location prior to adding the target or it
      //  will shift us down.
      const origin = getRect(barNode);

      // clone the node into its target location
      const targetNode = barNode.cloneNode(true);
      targetNode.groupValue = barNode.groupValue;
      targetNode.groupItems = barNode.groupItems;
      targetNode.setAttribute("variety", variety);

      const targetParent = this[variety + "List"];
      targetParent.appendChild(targetNode);

      // create a flying clone
      const flyingNode = barNode.cloneNode(true);

      const dest = getRect(targetNode);

      // if the flying box wants to go higher than the content box goes, just
      //  send it to the top of the content box instead.
      const contentRect = getRect(this.contentBox);
      if (dest.top < contentRect.top) {
        dest.top = contentRect.top;
      }

      // likewise if it wants to go further south than the content box, stop
      //  that
      if (dest.top > contentRect.top + contentRect.height) {
        dest.top = contentRect.top + contentRect.height - dest.height;
      }

      flyingNode.style.position = "absolute";
      flyingNode.style.width = origin.width + "px";
      flyingNode.style.height = origin.height + "px";
      flyingNode.style.top = origin.top + "px";
      flyingNode.style.left = origin.left + "px";
      flyingNode.style.zIndex = 1000;

      flyingNode.style.transitionDuration =
        Math.abs(dest.top - origin.top) * 2 + "ms";
      flyingNode.style.transitionProperty = "top, left";

      flyingNode.addEventListener("transitionend", () => {
        barNode.remove();
        targetNode.style.display = "block";
        flyingNode.remove();

        if (callback) {
          setTimeout(callback, 50);
        }
      });

      document.body.appendChild(flyingNode);

      // Adding setTimeout to improve the facet-discrete animation.
      // See Bug 1439323 for more detail.
      setTimeout(() => {
        // animate the flying clone... flying!
        window.requestAnimationFrame(() => {
          flyingNode.style.top = dest.top + "px";
          flyingNode.style.left = dest.left + "px";
        });

        // hide the target (cloned) node
        targetNode.style.display = "none";

        // hide the original node and remove its JS properties
        barNode.style.visibility = "hidden";
        delete barNode.groupValue;
        delete barNode.groupItems;
      }, 100);
    }

    barClicked(barNode, variety) {
      const groupValue = barNode.groupValue;
      // These determine what goAnimate actually does.
      // flyAway allows us to cancel flying in the case the constraint is
      //  being fully dropped and so the facet is just going to get rebuilt
      let flyAway = true;

      const goAnimate = () => {
        setTimeout(() => {
          if (flyAway) {
            this.afterListVisible(variety, () => {
              this._flyBarAway(barNode, variety, () => {
                this.updateHeaderStates();
              });
            });
          }
        }, 0);
      };

      // Immediately apply the facet change, triggering the animation after
      //  the faceting completes.
      if (variety == "remainder") {
        const currentVariety = barNode.getAttribute("variety");
        const constraintGone = FacetContext.removeFacetConstraint(
          this.faceter,
          currentVariety == "include",
          [groupValue],
          goAnimate
        );

        // we will automatically rebuild if the constraint is gone, so
        //  just make the animation a no-op.
        if (constraintGone) {
          flyAway = false;
        }
      } else {
        // include/exclude
        const revalidate = FacetContext.addFacetConstraint(
          this.faceter,
          variety == "include",
          [groupValue],
          false,
          false,
          goAnimate
        );

        // revalidate means we need to blow away the other dudes, in which
        //  case it makes the most sense to just trigger a rebuild of ourself
        if (revalidate) {
          flyAway = false;
          this.build(false);
        }
      }
    }

    barHovered(barNode, aInclude) {
      const groupValue = barNode.groupValue;
      const groupItems = barNode.groupItems;

      FacetContext.hoverFacet(
        this.faceter,
        this.attrDef,
        groupValue,
        groupItems
      );
    }

    /**
     * HoverGone! HoverGone!
     * We know it's gone, but where has it gone?
     */
    barHoverGone(barNode, include) {
      const groupValue = barNode.groupValue;
      const groupItems = barNode.groupItems;

      FacetContext.unhoverFacet(
        this.faceter,
        this.attrDef,
        groupValue,
        groupItems
      );
    }

    includeFacet(node) {
      this.barClicked(
        node,
        node.getAttribute("variety") == "remainder" ? "include" : "remainder"
      );
    }

    undoFacet(node) {
      this.barClicked(
        node,
        node.getAttribute("variety") == "remainder" ? "include" : "remainder"
      );
    }

    excludeFacet(node) {
      this.barClicked(node, "exclude");
    }

    showPopup(event) {
      try {
        // event.target could be the <li> node, or a span inside
        // of it, or perhaps the facet-more button, or maybe something
        // else that we'll handle in the next version.  We walk up its
        // parent chain until we get to the right level of the DOM
        // hierarchy, or the facet-content which seems to be the root.
        if (this.currentNode) {
          this.currentNode.removeAttribute("selected");
        }

        let node = event.target;

        while (
          !(node && node.hasAttribute && node.hasAttribute("class")) ||
          (!node.classList.contains("bar") &&
            !node.classList.contains("facet-more") &&
            !node.classList.contains("facet-content"))
        ) {
          node = node.parentNode;
        }

        if (!(node && node.hasAttribute && node.hasAttribute("class"))) {
          return false;
        }

        this.currentNode = node;
        node.setAttribute("selected", "true");

        if (node.classList.contains("bar")) {
          document.querySelector("facet-popup-menu").show(event, this, node);
        } else if (node.classList.contains("facet-more")) {
          this.changeMode("all");
        }

        return false;
      } catch (e) {
        return console.error(e);
      }
    }

    activateLink(event) {
      try {
        let node = event.target;

        while (
          !node.hasAttribute("class") ||
          (!node.classList.contains("facet-more") &&
            !node.classList.contains("facet-content"))
        ) {
          node = node.parentNode;
        }

        if (node.classList.contains("facet-more")) {
          this.changeMode("all");
        }

        return false;
      } catch (e) {
        return console.error(e);
      }
    }
  }

  customElements.define("facet-discrete", MozFacetDiscrete);

  class MozFacetPopupMenu extends HTMLElement {
    constructor() {
      super();

      this.addEventListener("keypress", event => {
        switch (event.keyCode) {
          case KeyEvent.DOM_VK_ESCAPE:
            this.hide();
            break;

          case KeyEvent.DOM_VK_DOWN:
            this.moveFocus(event, 1);
            break;

          case KeyEvent.DOM_VK_TAB:
            if (event.shiftKey) {
              this.moveFocus(event, -1);
              break;
            }

            this.moveFocus(event, 1);
            break;

          case KeyEvent.DOM_VK_UP:
            this.moveFocus(event, -1);
            break;

          default:
            break;
        }
      });
    }

    connectedCallback() {
      const parentDiv = document.createElement("div");
      parentDiv.classList.add("parent");
      parentDiv.setAttribute("tabIndex", "0");

      this.includeNode = document.createElement("div");
      this.includeNode.classList.add("popup-menuitem", "top");
      this.includeNode.setAttribute("tabindex", "0");
      this.includeNode.onmouseover = () => {
        this.focus();
      };
      this.includeNode.onkeypress = event => {
        if (event.keyCode == event.DOM_VK_RETURN) {
          this.doInclude();
        }
      };
      this.includeNode.onmouseup = () => {
        this.doInclude();
      };

      this.excludeNode = document.createElement("div");
      this.excludeNode.classList.add("popup-menuitem", "bottom");
      this.excludeNode.setAttribute("tabindex", "0");
      this.excludeNode.onmouseover = () => {
        this.focus();
      };
      this.excludeNode.onkeypress = event => {
        if (event.keyCode == event.DOM_VK_RETURN) {
          this.doExclude();
        }
      };
      this.excludeNode.onmouseup = () => {
        this.doExclude();
      };

      this.undoNode = document.createElement("div");
      this.undoNode.classList.add("popup-menuitem", "undo");
      this.undoNode.setAttribute("tabindex", "0");
      this.undoNode.onmouseover = () => {
        this.focus();
      };
      this.undoNode.onkeypress = event => {
        if (event.keyCode == event.DOM_VK_RETURN) {
          this.doUndo();
        }
      };
      this.undoNode.onmouseup = () => {
        this.doUndo();
      };

      parentDiv.appendChild(this.includeNode);
      parentDiv.appendChild(this.excludeNode);
      parentDiv.appendChild(this.undoNode);

      this.appendChild(parentDiv);
    }

    _getLabel(facetDef, facetValue, groupValue, stringName) {
      let labelFormat;
      if (stringName in facetDef.strings) {
        labelFormat = facetDef.strings[stringName];
      } else {
        labelFormat = glodaFacetStrings.GetStringFromName(
          `glodaFacetView.facets.${stringName}.fallbackLabel`
        );
      }

      if (!labelFormat.includes("#1")) {
        return labelFormat;
      }

      return labelFormat.replace("#1", facetValue);
    }

    build(facetDef, facetValue, groupValue) {
      try {
        if (groupValue) {
          this.includeNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "mustMatchLabel"
          );
          this.excludeNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "cantMatchLabel"
          );
          this.undoNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "mayMatchLabel"
          );
        } else {
          this.includeNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "mustMatchNoneLabel"
          );
          this.excludeNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "mustMatchSomeLabel"
          );
          this.undoNode.textContent = this._getLabel(
            facetDef,
            facetValue,
            groupValue,
            "mayMatchAnyLabel"
          );
        }
      } catch (e) {
        console.error(e);
      }
    }

    moveFocus(event, delta) {
      try {
        // We probably want something quite generic in the long term, but that
        // is way too much for now (needs to skip over invisible items, etc)
        const focused = document.activeElement;
        if (focused == this.includeNode) {
          this.excludeNode.focus();
        } else if (focused == this.excludeNode) {
          this.includeNode.focus();
        }
        event.preventDefault();
        event.stopPropagation();
      } catch (e) {
        console.error(e);
      }
    }

    selectItem(event) {
      try {
        const focused = document.activeElement;
        if (focused == this.includeNode) {
          this.doInclude();
        } else if (focused == this.excludeNode) {
          this.doExclude();
        } else {
          this.doUndo();
        }
      } catch (e) {
        console.error(e);
      }
    }

    show(event, facetNode, barNode) {
      try {
        this.node = barNode;
        this.facetNode = facetNode;
        const facetDef = facetNode.facetDef;
        const groupValue = barNode.groupValue;
        const variety = barNode.getAttribute("variety");
        const label = barNode.querySelector(".bar-link").textContent;
        this.build(facetDef, label, groupValue);
        this.node.setAttribute("selected", "true");
        const rtl = window.getComputedStyle(this).direction == "rtl";
        /* We show different menus if we're on an "unselected" facet value,
         or if we're on a preselected facet value, whether included or
         excluded. The variety attribute handles that through CSS */
        this.setAttribute("variety", variety);
        const rect = barNode.getBoundingClientRect();
        let x, y;
        if (event.type == "click") {
          // center the menu on the mouse click
          if (rtl) {
            x = event.pageX + 10;
          } else {
            x = event.pageX - 10;
          }
          y = Math.max(20, event.pageY - 15);
        } else {
          if (rtl) {
            x = rect.left + rect.width / 2 + 20;
          } else {
            x = rect.left + rect.width / 2 - 20;
          }
          y = rect.top - 10;
        }
        if (rtl) {
          this.style.left = x - this.getBoundingClientRect().width + "px";
        } else {
          this.style.left = x + "px";
        }
        this.style.top = y + "px";

        if (variety == "remainder") {
          // include
          this.includeNode.focus();
        } else {
          // undo
          this.undoNode.focus();
        }
      } catch (e) {
        console.error(e);
      }
    }

    hide() {
      try {
        this.setAttribute("variety", "invisible");
        if (this.node) {
          this.node.removeAttribute("selected");
          this.node.focus();
        }
      } catch (e) {
        console.error(e);
      }
    }

    doInclude() {
      try {
        this.facetNode.includeFacet(this.node);
        this.hide();
      } catch (e) {
        console.error(e);
      }
    }

    doExclude() {
      this.facetNode.excludeFacet(this.node);
      this.hide();
    }

    doUndo() {
      this.facetNode.undoFacet(this.node);
      this.hide();
    }
  }

  customElements.define("facet-popup-menu", MozFacetPopupMenu);

  /**
   * MozResultMessage displays an excerpt of a message. Typically these are used in the gloda
   * results listing, showing the messages that matched.
   */
  class MozFacetResultMessage extends HTMLElement {
    constructor() {
      super();

      this.addEventListener("mouseover", event => {
        FacetContext.hoverFacet(
          FacetContext.fakeResultFaceter,
          FacetContext.fakeResultAttr,
          this.message,
          [this.message]
        );
      });

      this.addEventListener("mouseout", event => {
        FacetContext.unhoverFacet(
          FacetContext.fakeResultFaceter,
          FacetContext.fakeResultAttr,
          this.message,
          [this.message]
        );
      });
    }

    connectedCallback() {
      const messageHeader = document.createElement("div");

      const messageLine = document.createElement("div");
      messageLine.classList.add("message-line");

      const messageMeta = document.createElement("div");
      messageMeta.classList.add("message-meta");

      this.addressesGroup = document.createElement("div");
      this.addressesGroup.classList.add("message-addresses-group");

      this.authorGroup = document.createElement("div");
      this.authorGroup.classList.add("message-author-group");

      this.author = document.createElement("span");
      this.author.classList.add("message-author");

      this.date = document.createElement("div");
      this.date.classList.add("message-date");

      this.authorGroup.appendChild(this.author);
      this.authorGroup.appendChild(this.date);
      this.addressesGroup.appendChild(this.authorGroup);
      messageMeta.appendChild(this.addressesGroup);
      messageLine.appendChild(messageMeta);

      const messageSubjectGroup = document.createElement("div");
      messageSubjectGroup.classList.add("message-subject-group");

      this.star = document.createElement("span");
      this.star.classList.add("message-star");

      this.subject = document.createElement("span");
      this.subject.classList.add("message-subject");
      this.subject.setAttribute("tabindex", "0");
      this.subject.setAttribute("role", "link");

      this.tags = document.createElement("span");
      this.tags.classList.add("message-tags");

      this.recipientsGroup = document.createElement("div");
      this.recipientsGroup.classList.add("message-recipients-group");

      this.to = document.createElement("span");
      this.to.classList.add("message-to-label");

      this.recipients = document.createElement("div");
      this.recipients.classList.add("message-recipients");

      this.recipientsGroup.appendChild(this.to);
      this.recipientsGroup.appendChild(this.recipients);
      messageSubjectGroup.appendChild(this.star);
      messageSubjectGroup.appendChild(this.subject);
      messageSubjectGroup.appendChild(this.tags);
      messageSubjectGroup.appendChild(this.recipientsGroup);
      messageLine.appendChild(messageSubjectGroup);
      messageHeader.appendChild(messageLine);
      this.appendChild(messageHeader);

      this.snippet = document.createElement("pre");
      this.snippet.classList.add("message-body");

      this.attachments = document.createElement("div");
      this.attachments.classList.add("message-attachments");

      this.appendChild(this.snippet);
      this.appendChild(this.attachments);

      this.build();
    }

    /* eslint-disable complexity */
    build() {
      const message = this.message;

      const subject = this.subject;
      // -- eventify
      subject.onclick = event => {
        FacetContext.showConversationInTab(this, event.button == 1);
      };
      subject.onkeypress = event => {
        if (Event.keyCode == event.DOM_VK_RETURN) {
          FacetContext.showConversationInTab(this, event.shiftKey);
        }
      };

      // -- Content Poking
      if (message.subject.trim() == "") {
        subject.textContent = glodaFacetStrings.GetStringFromName(
          "glodaFacetView.result.message.noSubject"
        );
      } else {
        subject.textContent = message.subject;
      }
      const authorNode = this.author;
      authorNode.setAttribute("title", message.from.value);
      authorNode.textContent = message.from.contact.name;
      const toNode = this.to;
      toNode.textContent = glodaFacetStrings.GetStringFromName(
        "glodaFacetView.result.message.toLabel"
      );

      // this.author.textContent = ;
      const { makeFriendlyDateAgo } = ChromeUtils.import(
        "resource:///modules/TemplateUtils.jsm"
      );
      this.date.textContent = makeFriendlyDateAgo(message.date);

      // - Recipients
      try {
        const recipientsNode = this.recipients;
        if (message.recipients) {
          let recipientCount = 0;
          const MAX_RECIPIENTS = 3;
          const totalRecipientCount = message.recipients.length;
          const recipientSeparator = glodaFacetStrings.GetStringFromName(
            "glodaFacetView.results.message.recipientSeparator"
          );
          for (const index in message.recipients) {
            const recipNode = document.createElement("span");
            recipNode.setAttribute("class", "message-recipient");
            recipNode.textContent = message.recipients[index].contact.name;
            recipientsNode.appendChild(recipNode);
            recipientCount++;
            if (recipientCount == MAX_RECIPIENTS) {
              break;
            }
            if (index != totalRecipientCount - 1) {
              // add separators (usually commas)
              const sepNode = document.createElement("span");
              sepNode.setAttribute("class", "message-recipient-separator");
              sepNode.textContent = recipientSeparator;
              recipientsNode.appendChild(sepNode);
            }
          }
          if (totalRecipientCount > MAX_RECIPIENTS) {
            const nOthers = totalRecipientCount - recipientCount;
            const andNOthers = document.createElement("span");
            andNOthers.setAttribute("class", "message-recipients-andothers");

            const andOthersLabel = PluralForm.get(
              nOthers,
              glodaFacetStrings.GetStringFromName(
                "glodaFacetView.results.message.andOthers"
              )
            ).replace("#1", nOthers);

            andNOthers.textContent = andOthersLabel;
            recipientsNode.appendChild(andNOthers);
          }
        }
      } catch (e) {
        console.error(e);
      }

      // - Starred
      const starNode = this.star;
      if (message.starred) {
        starNode.setAttribute("starred", "true");
      }

      // - Attachments
      if (message.attachmentNames) {
        const attachmentsNode = this.attachments;
        const imgNode = document.createElement("div");
        imgNode.setAttribute("class", "message-attachment-icon");
        attachmentsNode.appendChild(imgNode);
        for (let attach of message.attachmentNames) {
          const attachNode = document.createElement("div");
          attachNode.setAttribute("class", "message-attachment");
          if (attach.length >= 28) {
            attach = attach.substring(0, 24) + "…";
          }
          attachNode.textContent = attach;
          attachmentsNode.appendChild(attachNode);
        }
      }

      // - Tags
      const tagsNode = this.tags;
      if ("tags" in message && message.tags.length) {
        for (const tag of message.tags) {
          const tagNode = document.createElement("span");
          tagNode.setAttribute("class", "message-tag");
          const color = MailServices.tags.getColorForKey(tag.key);
          if (color) {
            const textColor = !TagUtils.isColorContrastEnough(color)
              ? "white"
              : "black";
            tagNode.setAttribute(
              "style",
              "color: " + textColor + "; background-color: " + color + ";"
            );
          }
          tagNode.textContent = tag.tag;
          tagsNode.appendChild(tagNode);
        }
      }

      // - Body
      if (message.indexedBodyText) {
        let bodyText = message.indexedBodyText;

        const matches = [];
        if ("stashedColumns" in FacetContext.collection) {
          let collection;
          if (
            "IMCollection" in FacetContext &&
            message instanceof Gloda.lookupNounDef("im-conversation").clazz
          ) {
            collection = FacetContext.IMCollection;
          } else {
            collection = FacetContext.collection;
          }
          const offsets = collection.stashedColumns[message.id][0];
          const offsetNums = offsets.split(" ").map(x => parseInt(x));
          for (let i = 0; i < offsetNums.length; i += 4) {
            // i is the column index. The indexedBodyText is in the column 0.
            // Ignore matches for other columns.
            if (offsetNums[i] != 0) {
              continue;
            }

            // i+1 is the term index, indicating which queried term was found.
            // We can ignore for now...

            // i+2 is the *byte* offset at which the term is in the string.
            // i+3 is the term's length.
            matches.push([offsetNums[i + 2], offsetNums[i + 3]]);
          }

          // Sort the matches by index, just to be sure.
          // They are probably already sorted, but if they aren't it could
          // mess things up at the next step.
          matches.sort((a, b) => a[0] - b[0]);

          // Convert the byte offsets and lengths into character indexes.
          const charCodeToByteCount = c => {
            // UTF-8 stores:
            // - code points below U+0080 on 1 byte,
            // - code points below U+0800 on 2 bytes,
            // - code points U+D800 through U+DFFF are UTF-16 surrogate halves
            // (they indicate that JS has split a 4 bytes UTF-8 character
            // in two halves of 2 bytes each),
            // - other code points on 3 bytes.
            if (c < 0x80) {
              return 1;
            }
            if (c < 0x800 || (c >= 0xd800 && c <= 0xdfff)) {
              return 2;
            }
            return 3;
          };
          let byteOffset = 0;
          let offset = 0;
          for (const match of matches) {
            while (byteOffset < match[0]) {
              byteOffset += charCodeToByteCount(bodyText.charCodeAt(offset++));
            }
            match[0] = offset;
            for (let i = offset; i < offset + match[1]; ++i) {
              const size = charCodeToByteCount(bodyText.charCodeAt(i));
              if (size > 1) {
                match[1] -= size - 1;
              }
            }
          }
        }

        // how many lines of context we want before the first match:
        const kContextLines = 2;

        let startIndex = 0;
        if (matches.length > 0) {
          // Find where the snippet should begin to show at least the
          // first match and kContextLines of context before the match.
          startIndex = matches[0][0];
          for (let context = kContextLines; context >= 0; --context) {
            startIndex = bodyText.lastIndexOf("\n", startIndex - 1);
            if (startIndex == -1) {
              startIndex = 0;
              break;
            }
          }
        }

        // start assuming it's just one line that we want to show
        let idxNewline = -1;
        let ellipses = "…";

        let maxLineCount = 5;
        if (startIndex != 0) {
          // Avoid displaying an ellipses followed by an empty line.
          while (bodyText[startIndex + 1] == "\n") {
            ++startIndex;
          }
          bodyText = ellipses + bodyText.substring(startIndex);
          // The first line will only contain the ellipsis as the character
          // at startIndex is always \n, so we show an additional line.
          ++maxLineCount;
        }

        for (
          let newlineCount = 0;
          newlineCount < maxLineCount;
          newlineCount++
        ) {
          idxNewline = bodyText.indexOf("\n", idxNewline + 1);
          if (idxNewline == -1) {
            ellipses = "";
            break;
          }
        }
        let snippet = "";
        if (idxNewline > -1) {
          snippet = bodyText.substring(0, idxNewline);
        } else {
          snippet = bodyText;
        }
        if (ellipses) {
          snippet = snippet.trimRight() + ellipses;
        }

        const parent = this.snippet;
        let node = document.createTextNode(snippet);
        parent.appendChild(node);

        let offset = startIndex ? startIndex - 1 : 0; // The ellipsis takes 1 character.
        for (const match of matches) {
          if (idxNewline > -1 && match[0] > startIndex + idxNewline) {
            break;
          }
          const secondNode = node.splitText(match[0] - offset);
          node = secondNode.splitText(match[1]);
          offset += match[0] + match[1] - offset;
          const span = document.createElement("span");
          span.textContent = secondNode.data;
          if (!this.firstMatchText) {
            this.firstMatchText = secondNode.data;
          }
          span.setAttribute("class", "message-body-fulltext-match");
          parent.replaceChild(span, secondNode);
        }
      }

      // - Misc attributes
      if (!message.read) {
        this.setAttribute("unread", "true");
      }
    }
  }

  customElements.define("facet-result-message", MozFacetResultMessage);
}
