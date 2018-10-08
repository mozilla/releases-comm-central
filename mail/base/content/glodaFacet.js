/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global HTMLElement, DateFacetVis, FacetContext */
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

customElements.define("facet-date", MozFacetDate);
