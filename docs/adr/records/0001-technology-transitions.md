# ADR 0001 Technology Transitions

## In-Progress Technology Transitions

### Links

<!-- [Where to find more detail about reasoning and resolutions]

The complexity of the issue will dictate where the discussion occurred with the
details of the decision and below are some link suggestions of these possible
discussion locations.

-->

- [Mailing List Discussion](https://thunderbird.topicbox.com/groups/developers/T5e139726964557d3/adr-for-ongoing-technology-transitions)
- [Bug #1980226](https://bugzilla.mozilla.org/show_bug.cgi?id=1980226)

### Status

<!-- [Status from the options: accepted, deprecated, superseded]

- **Accepted**: The decision described in the ADR has been accepted and should be
adhered to.
- **Deprecated**: The decision described in the ADR is no longer
relevant due to changes in system context.
- **Superseded**: The decision described in the ADR has been replaced by
another decision. Link to the new ADR doc that supersedes the existing one.

See the "ADR Life Cycle" section in the docs/adr/README.md
-->

- **Status:** Accepted

### Context

<!-- [Description of the context and problem statement that the decision is
addressing. It should contain any relevant factors that influenced the
decision.] -->
This ADR is a catch-all to document past decisions for technology changes we're
already working on, but haven't completed yet. This means the code base
typically has both approaches present and it is not obvious which one should be
preferred.

Past records of information for these changes are collected where available, but
some of these changes have been fairly informal, or simply forced by the
upstream code in mozilla-central. If the change comes from mozilla-central the
related execution documentation from mozilla-central is linked.

The primary purpose of this ADR is to document these pre-existing decisions.

## Decision

<!-- [Description of the decision that was made. Detail the change that will be
implemented.] -->
### Use Fluent for localization

The existing localization systems using DTD in XML and properties in JS are
replaced with
[Fluent](https://firefox-source-docs.mozilla.org/l10n/fluent/index.html). To
migrate existing strings, there's tooling for
[Fluent Migrations](/l10n/fluent_migrations). Fluent encourages formatting as
late as possible and giving translators the freedoms required to adapt the
displayed strings to fit their language. To enable this, some previous practices
should be broken, including handling of placeables and reducing passing around
formatted localized strings in code.

#### References

- [DTD deprecation dev-platform post](https://groups.google.com/a/mozilla.org/g/dev-platform/c/DnpKUnDmHa0/m/ZzD1hIv5BwAJ)
- [mozilla-central localization string share by system tracking](https://www.arewefluentyet.com/)
- [Bug 1492751 - [meta] Thunderbird Fluent migration](https://bugzilla.mozilla.org/show_bug.cgi?id=1492751)

### Transitioning XUL to (X)HTML

Whenever possible, HTML elements should be preferred over their XUL equivalents.
We also prefer documents to be (X)HTML first, and explicitly use XUL in a
namespace when needed. However, many older documents still work the other way
around. We've completed converting the documents themselves to be (X)HTML
documents instead of XUL documents (so with a `<html>` root element).

Here a list of example XUL elements and their preferred equivalents (with
namespaces for clarity):

- `xul:image` → `html:img`
- `xul:label` → `html:span`
- `xul:box`, `xul:vbox`, `xul:hbox` → `html:div`
- `xul:button` → `html:button[type="button"]`
- `xul:input` → `html:input`
- `xul:menulist` → `html:select`

Notably not all replacements are one to one and sometimes the XUL element might
have features that can't be replicated in HTML. In those cases, we still use the
XUL element.

A special case is the `xul:tree` element (and its descendants), for which we have
a custom element replacement solution.

#### References

- [tb-developers post after the top level document conversions](https://thunderbird.topicbox.com/groups/developers/T5f98d42870d700bb-Mce6b0dc97bbe0ba9f0ee84ac/were-top-level-html)
- [dev-platform: removal of XUL layout in mozilla-central](https://groups.google.com/a/mozilla.org/g/dev-platform/c/ZNPc1lUUNDQ/m/ODEj1_ITAgAJ)
- [XUL overlay removal Firefox browser architecture proposal](https://mozilla.github.io/firefox-browser-architecture/text/0014-xul-overlay-removal-review-packet.html)
- [Bug 1563415 - [meta] Start using HTML elements to replace XUL elements](https://bugzilla.mozilla.org/show_bug.cgi?id=1563415)
- [Bug 1724841 - [meta] Replace the XUL trees in Thunderbird with something better](https://bugzilla.mozilla.org/show_bug.cgi?id=1724841)

### Avoid XPCOM

This is a very handwavy rule, but compared to many years ago, when some of this
code was written, we try to only use XPCOM when necessary. That usually means
when languages need to mix, either for implementations or because we're crossing
from the native backend toward the JavaScript frontend.

#### References

- [Bug 105431 - [meta] DeCOMtamination tasks](https://bugzilla.mozilla.org/show_bug.cgi?id=105431)
- [Mozilla Wiki: Gecko:DeCOMtamination](https://wiki.mozilla.org/Gecko:DeCOMtamination)

### CSS Nesting

We try to use CSS nesting to group together relates CSS rules. A lot of existing
stylesheets have already been converted, but many more remain.

#### References

- [MDN: Using CSS nesting](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting/Using_CSS_nesting)

### CSS Custom Properties

We use custom properties in CSS to share values, instead of hard coding them.
CSS files like `colors.css` provide a bunch of "tokens" with values to use,
though sometimes we'll still want to have another layer of custom properties to
make it easier to handle different variations for theming or states.

### JS Doc

In JavaScript we try to document our functions, methods, class fields and types
using inline JSDoc. The linter tries to ensure the JSDoc looks sensible -
however there are some conflicts around type formatting required by tooling in
our codebase. Generally we're not consuming JSDoc with much more than the linter
at this time, so as long as linting is fine, the JSDoc is probably ok.

For
[custom element implementations we use some additional JSDoc properties](/frontend/custom_element_conventions)
that are consumed by Storybook for documentation generation.

#### References

- [tb-developers: Call for help on the mailing list for JSDoc](https://thunderbird.topicbox.com/groups/developers/T70b9a37f6596ec46-Me14a7a9e6effe754ff1744df/improving-our-jsdoc-comments-help-wanted)

### Prefer modules for front-end JavaScript

New JavaScript code should generally be placed in an ES module (.mjs) instead of
a normal script file (.js). This helps us break the code into smaller, more
manageable chunks and also enforces some containment, especially around globals.
Modules also enforce explicit dependency declaration by users of exported
features, making it easier to understand where code is used.

Custom elements help further with managing the life-cycle of front-end code
by binding it to the element.

#### References

- [Custom element conventions documentation](/frontend/custom_element_conventions)

### Content Security Policy

Most of our documents have a content security policy, enforcing primarily the
sources of styles and media loaded in the document.

We currently can't restrict JS much, since we often use inline listeners in HTML.
To eventually tighten the policies new inline listeners should be avoided.

#### References

- [Bug 1950666 - [meta] Enforce a strict CSP for all chrome documents](https://bugzilla.mozilla.org/show_bug.cgi?id=1950666)

### Use mach vendor for Third Party Dependencies and Place them in the third_party Folder

Third party code should be vendored into the `third_party` directory in the root
of the repository. To help with vendoring,
[`mach vendor`](https://firefox-source-docs.mozilla.org/mozbuild/vendor/index.html)
should be used. It automates the vendoring to make it repeatable, which is
useful when vendored code needs to be updated. It can even be used to
automatically update vendored code.

#### References

- [Bug 1837014 - [meta] Vendor  native dependencies using `mach vendor`](https://bugzilla.mozilla.org/show_bug.cgi?id=1837014)
- [Firefox source docs: Vendoring Third Party Components](https://firefox-source-docs.mozilla.org/mozbuild/vendor/index.html)
- [Bug 1618282 - [meta] Automatic Updating of Dependencies](https://bugzilla.mozilla.org/show_bug.cgi?id=1618282)
- [Bug 1830992 - Replace update_rnp.sh with a `mach vendor` config](https://bugzilla.mozilla.org/show_bug.cgi?id=1830992)

### Tabs Contain Documents

Currently, a bunch of our tabs are not their own document, but instead are part
of the main window. All tabs should be their own document, so their code is only
loaded when the tab is used.

To ask a tab to do something from outside the tab, "XUL" commands should be sent
to the tab.

### Omit `a` prefix for function arguments

Older code style guidance was to prefix all arguments in JavaScript and C++
functions with `a`, so an example argument name was `aParam`. The prefix is
no longer wanted, so new functions should omit it, which makes the example
argument name just `param`.

### Prefer moz-src for JS modules

JS modules should be loaded when possible with the `moz-src://` protocol, which has
a path matching the location in the source repository instead of an arbitrary
mapping. This is easier for developers and tooling alike. For now this primarily
affects modules loaded via `resource://` protocol.

#### References

- [Firefox Proposal: replace most of resource:// with moz-src URLs based on source tree paths](https://docs.google.com/document/d/1OPRC4ELE2923xx6qdse74rvJE8_pnwUpezzqvQcYfOI/view)
- [Firefox source docs: moz-src URLs](https://firefox-source-docs.mozilla.org/toolkit/internal-urls.html#moz-src-urls)
- [Bug 1979960 - [meta] Migrate Thunderbird internal JS modules to moz-src URIs](https://bugzilla.mozilla.org/show_bug.cgi?id=1979960)

### Consequences and Risks

<!-- [Explanation of the consequences of the decision. This includes both the
positive effects and any potential risks.] -->

#### Positive Consequences

- Continuous modernization of the code base
- These changes typically improve the developer experience

#### Potential Risks

- All changes make uplifting more complicated, especially to ESR
- Changes like these are hard to fully roll out
- We might be too slow to adopt some of the changes from mozilla-central and
  have to switch target mid-transition

### Alternatives

<!-- [Mention any alternative suggestions.] -->
As these are already in progress, alternatives are not considered here.

### Security Considerations

<!-- [Mention any security considerations that were brought up in the
discussion.] -->
None.

### Rollout Plan

As mentioned, all of these changes are already in-progress in the code base,
mostly on a "when you touch it, improve it" basis. However, some of the changes
might need more urgent updates as mozilla-central changes availability of the
status quo.

This also means that some of the changes might be completed, while others are
still being worked on.
