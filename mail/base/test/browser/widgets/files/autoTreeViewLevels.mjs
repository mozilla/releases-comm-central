import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/auto-tree-view.mjs";

class AutoTreeView extends TreeDataAdapter {
  data = [
    {
      place: "north america",
      open: true,
      children: [
        {
          place: "canada",
          open: true,
          checked: true,
          children: [
            { place: "alberta" },
            {
              place: "british columbia",
              checked: true,
              children: [
                { place: "vancouver", checked: true },
                { place: "victoria" },
              ],
            },
            { place: "manitoba" },
            { place: "new brunswick" },
            { place: "newfoundland and labrador" },
            { place: "northwest territories" },
            { place: "nova scotia" },
            { place: "nunavut" },
            { place: "ontario" },
            { place: "prince edward island" },
            { place: "quebec", checked: true },
            { place: "saskatchewan" },
            { place: "yukon" },
          ],
        },
      ],
    },
    {
      place: "south america",
    },
    {
      place: "antarctica",
    },
    {
      place: "australia",
      checked: true,
      children: [
        { place: "new south wales", checked: true },
        { place: "northern territory" },
        { place: "queensland" },
        { place: "south australia" },
        { place: "tasmania" },
        { place: "victoria" },
        { place: "western australia" },
      ],
    },
    {
      place: "asia",
      checked: true,
    },
    {
      place: "europe",
      open: true,
      checked: true,
      children: [
        { place: "ireland", checked: true },
        {
          place: "united kingdom",
          checked: true,
          children: [
            { place: "england", checked: true },
            { place: "northern ireland" },
            { place: "scotland" },
            { place: "wales", checked: true },
          ],
        },
      ],
    },
    {
      place: "africa",
    },
  ];

  constructor() {
    super();
    for (const r of this.data) {
      this.addChild(this._rowMap, r);
    }

    this._rowMap[4].children.length = 2;
    this._rowMap[4].ensureChildren = function (dataAdapter, rootIndex) {
      if (this.children[0]) {
        return;
      }
      this.children[0] = new TreeDataRow();
      this.children[1] = new TreeDataRow();
      const { resolve, promise } = Promise.withResolvers();
      window.rowDataReady = resolve;
      promise.then(() => {
        this.children[0] = new TreeDataRow({ place: "japan" });
        this.children[1] = new TreeDataRow({ place: "singapore" });
        this.children[1].addProperty("visited");
        dataAdapter._clearFlatRowCache();
        dataAdapter._tree?.invalidateRange(rootIndex, rootIndex + 2);
      });
    };
  }

  addChild(parentArray, child) {
    const row = new TreeDataRow({ place: child.place });
    if (child.open) {
      row.open = true;
    }
    if (child.checked) {
      row.addProperty("visited");
    }
    parentArray.push(row);
    if (!child.children) {
      return;
    }
    for (const c of child.children) {
      this.addChild(row.children, c);
    }
  }
}

L10nRegistry.getInstance().registerSources([
  L10nFileSource.createMock("mock", "app", ["en-US"], "/localization/", [
    {
      path: "/localization/mock.ftl",
      source: `
place-header = Place
  .title = Place
place-menuitem =
  .label = Place
selected-header = Selected
  .title = Selected
selected-menuitem =
  .label = Selected
`,
    },
  ]),
]);
document.l10n.addResourceIds(["mock.ftl"]);

const tree = document.querySelector("auto-tree-view");
tree.setAttribute("rows", "auto-tree-view-table-row");
tree.defaultColumns = [
  {
    id: "place",
    l10n: {
      header: "place-header",
      menuitem: "place-menuitem",
    },
    twisty: true,
  },
  {
    id: "selected",
    l10n: {
      header: "selected-header",
      menuitem: "selected-menuitem",
    },
    width: 40,
    picker: false,
    sortable: false,
    checkbox: "visited",
  },
];
tree.view = new AutoTreeView();
