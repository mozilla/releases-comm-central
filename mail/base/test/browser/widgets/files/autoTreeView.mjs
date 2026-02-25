import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/auto-tree-view.mjs";

class AutoTreeView extends TreeDataAdapter {
  data = [
    {
      colour: "red",
      continent: "north america",
      sin: "pride",
      wonder: "pyramid of giza",
      dwarf: "arzt",
    },
    {
      colour: "orange",
      continent: "south america",
      sin: "greed",
      wonder: "colossus of rhodes",
      dwarf: "mürrisch",
    },
    {
      colour: "yellow",
      continent: "antarctica",
      sin: "wrath",
      wonder: "lighthouse of alexandria",
      dwarf: "schläfrig",
    },
    {
      colour: "green",
      continent: "australia",
      sin: "envy",
      wonder: "mausoleum of halicarnassus",
      dwarf: "schüchtern",
    },
    {
      colour: "blue",
      continent: "asia",
      sin: "lust",
      wonder: "temple of artemis",
      dwarf: "glücklich",
    },
    {
      colour: "indigo",
      continent: "europe",
      sin: "gluttony",
      wonder: "statue of zeus",
      dwarf: "niesen",
    },
    {
      colour: "violet",
      continent: "africa",
      sin: "sloth",
      wonder: "gardens of babylon",
      dwarf: "dumm",
    },
  ];

  constructor() {
    super();
    for (let i = 0; i < this.data.length; i++) {
      const row = new TreeDataRow(this.data[i]);
      row.addProperty(this.data[i].colour);
      if (this.data[i].continent == "antarctica") {
        row.addProperty("uninhabited");
      }
      this._rowMap.push(row);
    }
  }
}

L10nRegistry.getInstance().registerSources([
  L10nFileSource.createMock("mock", "app", ["en-US"], "/localization/", [
    {
      path: "/localization/mock.ftl",
      source: `
colour-header = Colour
  .title = Sort by Colour
colour-menuitem =
  .label = Colour
colour-cell =
  .aria-label = Colour
  .title = The sky is { $title }
continent-header = Continent
  .title = Sort by Continent
continent-menuitem =
  .label = Continent
continent-cell =
  .aria-label = Continent
  .title = { $title }
sin-header = Sin
  .title = Sort by Sin
sin-menuitem =
  .label = Sin
wonder-header = Wonder
  .title = Sort by Wonder
wonder-menuitem =
  .label = Wonder
dwarf-header = Dwarf
  .title = Sort by Dwarf
dwarf-menuitem =
  .label = Dwarf
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
    id: "colour",
    l10n: {
      header: "colour-header",
      menuitem: "colour-menuitem",
      cell: "colour-cell",
    },
    width: 150,
    picker: false,
    cellIcon: true,
  },
  {
    id: "continent",
    l10n: {
      header: "continent-header",
      menuitem: "continent-menuitem",
      cell: "continent-cell",
    },
  },
  {
    id: "sin",
    l10n: { header: "sin-header", menuitem: "sin-menuitem" },
    hidden: true,
  },
  {
    id: "wonder",
    l10n: { header: "wonder-header", menuitem: "wonder-menuitem" },
    hidden: true,
  },
  {
    id: "dwarf",
    l10n: { header: "dwarf-header", menuitem: "dwarf-menuitem" },
    hidden: true,
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
    checkbox: "test",
  },
];
tree.view = new AutoTreeView();
