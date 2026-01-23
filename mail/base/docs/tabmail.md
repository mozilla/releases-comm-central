# Tabmail

Tabmail is Thunderbird's tab UI mechanism, responsible for the tab toolbar, opening, closing,
switching and reordering tabs, and saving and restoring the current tabs when required.

It is somewhat analogous to Firefox's `tabbrowser` but evolved separately. Some of the code exists
purely to avoid things breaking when toolkit code expects to find `tabbrowser` but instead gets
`tabmail`. The main difference from Firefox is that Thunderbird supports different _types_ of tab,
whereas Firefox only has tabs for displaying web pages.

```{note}
This is just an overview. There's a large comment in [tabmail.js](https://searchfox.org/comm-central/source/mail/base/content/tabmail.js)
with much more detail.
```

## Useful properties

- `tabbox` - the element containing the content of all tabs
- `panelContainer` - the toolbar containing the `<tab>` elements
- `tabTypes` and `tabModes` - all of the tab types and modes, as described below
- `tabInfo` - tab info objects for all open tabs
- `currentTabInfo` - the tab info object of the current tab
- `currentAbout3Pane` - the `window` object showing about:3pane, if the current tab is a
  `mail3PaneTab` tab
- `currentAboutMessage` - the `window` object showing about:message, if the current tab is a
  `mailMessageTab` tab, or if it is a `mail3PaneTab` tab displaying a message

## Useful methods

- `openTab` - takes a tab mode name and an optional object argument, which it passes to `openTab`
  on the tab mode.
- `switchToTab` - switch to the given tab
- `closeTab` - closes a given tab, or the current tab
- `closeOtherTabs` - closes all closeable tabs except the given tab
- `getTabForBrowser` - given a `<browser>`, finds the related tab

## Tab types and tab modes

Components can register a tab _type_, implementing one or more tab _modes_. These days the
distinction between a type and a mode is blurry, and we probably don't need both, but here we are.

### `mail`

The primary mail UI:

- The `mail3PaneTab` mode, which displays about:3pane in a chrome `<browser>`. This is the first
  tab, that cannot be closed without closing the window. However, more instances can be opened (for
  example by opening a folder in a new tab), and these can be closed.
- The `mailMessageTab` mode, which displays about:message in a chrome `<browser>`.

As well as the usual properties of a tab, each of these tab modes has a `chromeBrowser` property
which points to the top-level `<browser>` element contained within. This differs from the `browser`
property, which points to the content `<browser>` displaying a message within the tab,
if there is one.

`mail3PaneTab`s have a `folder` property pointing to the currently selected folder, and tabs of
both modes have a `message` property pointing to the currently displayed message, if there is one.

### `addressBook`

The `addressBookTab` mode displays about:addressbook in a content `<browser>`. Only one instance
can be opened at a time.

### `calendar`

Provides the `calendar` tab mode, the day/week/multiweek/month views, and the `tasks` tab mode,
which is the tasks list. There can be only one of each open at a time.

Unlike most other tab modes, the calendar and tasks tabs consist of elements in the messenger.xhtml
document itself, rather than as a separate document in a `<browser>` element. This will change as
the calendar UI is rebuilt.

### `calendarItem`

This type provides the `calendarEvent` and `calendarTask` tab modes, which are used if calendar
item editing happens in a tab rather than a window.

### `chat`

The chat UI. Like the calendar modes, the `chat` tab mode has elements that are built-in to
messenger.xhtml.

### `glodaFacet`

The `glodaFacet` mode displays search results. It has a toolbar that is part of messenger.xhtml and
glodaFacetViewWrapper.xhtml displayed in an `<iframe>`. Unlike the calendar and chat types,
multiple instances can be open at a time. This tab type will be removed once there is a [new
database and new search tools](/panorama/index).

### `preferences`

The `preferencesTab` mode displays about:preferences in a content `<browser>`. Only one instance
can be opened at a time.

### `content`

This tab mode (`contentTab`) is used for just about anything else. Instances contain a content
`<browser>` and a location bar and find bar for it. The location bar is hidden for certain special
pages but otherwise visible. It is read-only as Thunderbird is not intended to be used for general
purpose browsing.

The page URL is set as the `url` property on the arguments object passed to `openTab`.

To define what happens when a user clicks on a link in a content tab (i.e. should Thunderbird open
the link, or should it send the link to an external browser), add a `linkHandler` property to the
`openTab` arguments object:

- the string `single-site` allows only URLs in the same domain as the page URL (including subdomains)
- the string `single-page` allows only URLs matching the page URL
- `null` applies no such restrictions
- all other links are sent to an external browser

## Tab info objects

Each tab in a window is represented by an object often called `TabInfo` — although there isn't
actually a class of this name, instances are just objects with some common properties — some of
which are described here:

- `tabId` - a numeric identifier for the tab
- `mode` - the tab mode
- `selected` - if this is the current tab
- `tabNode` - the `<tab>` element (in the tabs toolbar) associated with the tab
- `panel` - the element containing the tab's content
- `browser` - a content `<browser>` associated with the tab

Other properties may be added by the code for each tab type.

Many tabmail methods accept a `TabInfo` object, or the numeric identifier, or the `<tab>` element.
