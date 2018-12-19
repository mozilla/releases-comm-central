/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global HTMLElement, DateFacetVis, FacetContext, glodaFacetStrings */
class MozFacetDate extends HTMLElement {
  get build() {
    return this.buildFunc;
  }

  get brushItems() {
    return (aItems) => this.vis.hoverItems(aItems);
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

class MozFacetBoolean extends HTMLElement {
  constructor() {
    super();

    this.addEventListener("mouseover", (event) => {
      FacetContext.hoverFacet(
        this.faceter,
        this.faceter.attrDef,
        true, this.trueValues
      );
    });

    this.addEventListener("mouseout", (event) => {
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
    this.bubble.addEventListener("click", (event) => {
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
        FacetContext.addFacetConstraint(
          this.faceter,
          true,
          this.trueGroups
        );
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

  extraSetup() { }

  checkStateChanged() { }

  brushItems() { }

  clearBrushedItems() { }

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
    if (!this.faceter.constraint && (this.orderedGroups.length <= 1)) {
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
    for (let groupPair of this.orderedGroups) {
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
    this.bubble.addEventListener("click", (event) => {
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

    this.filterNode.addEventListener("change", (event) => this.filterChanged(event));

    this.selectedValue = "all";
  }

  build(firstTime) {
    if (firstTime) {
      this.labelNode.textContent = this.facetDef.strings.facetNameLabel;
      this.checkbox.setAttribute("aria-label", this.facetDef.strings.facetNameLabel);
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
      for (let groupPair of this.orderedGroups) {
        if (groupPair[0] != null)
          count += groupPair[1].length;
      }
      this.countNode.textContent = count.toLocaleString();
      return;
    }

    while (this.filterNode.hasChildNodes()) {
      this.filterNode.lastChild.remove();
    }

    let allNode = document.createElement("option");
    allNode.textContent =
      glodaFacetStrings.get(
        "glodaFacetView.facets.filter." + this.attrDef.attributeName + ".allLabel"
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
    let selectNodes = [];
    for (let groupPair of this.orderedGroups) {
      if (groupPair[0] === null) {
        this.falseValues.push.apply(this.falseValues, groupPair[1]);
      } else {
        this.trueValues.push.apply(this.trueValues, groupPair[1]);

        let groupValue = groupPair[0];
        let selNode = document.createElement("option");
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
    selectNodes.forEach((selNode) => { this.filterNode.appendChild(selNode); });

    this.disabled = !this.trueValues.length;

    this.countNode.textContent = this.trueValues.length.toLocaleString();
  }

  checkStateChanged() {
    // if they un-check us, revert our value to all.
    if (!this.checked)
      this.selectedValue = "all";
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
      let groupValue = this.realTrueGroups[parseInt(this.filterNode.value)];
      this.selectedValue = groupValue.category;
      FacetContext.addFacetConstraint(this.faceter, true, [groupValue], false, true);
    }
  }
}


customElements.define("facet-date", MozFacetDate);
customElements.define("facet-boolean", MozFacetBoolean);
customElements.define("facet-boolean-filtered", MozFacetBooleanFiltered);
