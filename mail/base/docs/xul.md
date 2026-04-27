# XUL and HTML

Our UI is made up of XUL and HTML. Sometimes the documents are primarily XUL,
and sometimes they are primarily HTML, or even exclusively HTML. At the time of
writing slightly over half of all the elements declared in (X)HTML documents are
HTML elements.

## File extensions

Most of our markup files end with `.xhtml`. That means the document is a valid
XML document, typically with the root element being an HTML root element
(`<html>`). Some rare cases might still use an XUL root element (like
`<window>`).

If a document uses the `.html` extension its contents are purely HTML and no XUL
is allowed.

The `.inc.*` prefix is used to indicate that the file is not a fully valid
document and is expected to be included by the preprocessor into another
document.

## Namespaces

Typically `.xhtml` documents will declare an `xmlns`, `xmlns:xul` and
`xmlns:html` on the root element.

The namespace in the `xmlns` attribute decides what set the elements without any
namespace prefix come from. This is relevant because both XUL and HTML have a
`<button>` element for example, so depending on the default namespace this will
be an HTML or a XUL element. Sometimes we also override the namespace for a
subsection of the document like an html template, so we can omit the namespace
for newer sections that are fully or mostly written in HTML, while the old code
doesn't need to be refactored. In new documents the default namespace should
generally be HTML.

The `xmlns:xul` and `xmlns:html` attributes declare namespaces that can be used
in element tags to declare a differing namespace from the default namespace. So
an XUL button is `<xul:button>` and an HTML button is `<html:button>`.

Technically the namespace we use for HTML is the XHTML namespace, but it will
generally behave like HTML but has to be declared in valid XML. That means all
elements need to be closed (either with a closing tag or self-closing with `/>`)
and boolean attributes should have their own name as the declared value
(`attribute="attribute"`) when true in the markup.

A typical document would have a setup like this:
```xml
<?xml version="1.0"?>
<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:html="http://www.w3.org/1999/xhtml"
      xmlns:xul="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul">
</html>
```

## XUL Documentation

Most of XUL is at this point undocumented and existing documentation is outdated.
The best reference is thus usually the actual implementation sadly.

An example of old XUL documentation: https://www-archive.mozilla.org/docs/xul/xulnotes/xulnote_cheatsheet

```{toctree}
xul_commands.md
```

## Prefer HTML over XUL

HTML should be preferred over XUL whenever possible. There are some exceptions
where the XUL elements still provide features that are not attainable in HTML.
In [ADR 0001](xul-to-html-adr) this preference is documented and a few examples
of HTML equivalents for XUL elements are provided.

XUL elements that we still have to use:
- `<menuitem>`, `<menupopup>`, `<menu>`
- `<popup>`
- `<scrollbar>` (we usually don't directly use the element though)
- Custom elements that were implemented as inheriting from XUL elements (usually they had their origins as [XBL element](https://www-archive.mozilla.org/docs/xul/xulnotes/xulnote_xbl.html))
