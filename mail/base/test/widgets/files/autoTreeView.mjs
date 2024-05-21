import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/auto-tree-view.mjs";

class AutoTreeView extends TreeDataAdapter {
  collator = new Intl.Collator(undefined, { numeric: true });
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
      this._rowMap.push(
        new TreeDataRow(
          this.data[i],
          undefined,
          this.data[i].continent == "antarctica" ? "uninhabited" : ""
        )
      );
    }
  }

  sortBy(sortColumn, sortDirection, resort) {
    // Temporary implementation of the sorting code. This will be removed in a
    // subsequent revision.

    let selectionExists = false;
    if (this._tree) {
      const { selectedIndices, currentIndex } = this._tree;
      selectionExists = selectedIndices.length;
      // Remember what was selected.
      for (let i = 0; i < this._rowMap.length; i++) {
        this._rowMap[i].wasSelected = selectedIndices.includes(i);
        this._rowMap[i].wasCurrent = currentIndex == i;
      }
    }

    // Do the sort.
    if (
      sortColumn == this.sortColumn &&
      sortDirection == this.sortDirection &&
      !resort
    ) {
      return;
    }
    this._rowMap.sort((a, b) => {
      const aText = a.getText(sortColumn);
      const bText = b.getText(sortColumn);
      if (sortDirection == "descending") {
        return this.collator.compare(bText, aText);
      }
      return this.collator.compare(aText, bText);
    });

    // Restore what was selected.
    if (this._tree) {
      this._tree.reset();
      if (selectionExists) {
        for (let i = 0; i < this._rowMap.length; i++) {
          this._tree.toggleSelectionAtIndex(
            i,
            this._rowMap[i].wasSelected,
            true
          );
        }
        // Can't do this until updating the selection is finished.
        for (let i = 0; i < this._rowMap.length; i++) {
          if (this._rowMap[i].wasCurrent) {
            this._tree.currentIndex = i;
            break;
          }
        }
        this.selectionChanged();
      }
    }
    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
  }
}

L10nRegistry.getInstance().registerSources([
  L10nFileSource.createMock("mock", "app", ["en-US"], "/localization/", [
    {
      path: "/localization/mock.ftl",
      // Those weird column header names are a work-around for a bug that
      // means columns can only be dragged from the text of the header.
      // We need to have some text in the centre of the header cell.
      source: `
colour-header = ColourColourColourColourColour
  .title = Sort by Colour
colour-menuitem =
  .label = Colour
colour-cell =
  .aria-label = Colour
  .title = The sky is { $title }
continent-header = ContinentContinentContinent
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
];
tree.view = new AutoTreeView();
