# Writing Documentation

The Thunderbird source documentation is based on [Sphinx](https://www.sphinx-doc.org/en/master/)
with the Read the Docs theme.

Sphinx documentation expects all documentation pages to be located within one
`docs` directory however we have multiple `docs` directories spread across the
Thunderbird codebase. This approach allows us to document code alongside the
code as well as have one central `comm/docs/` directory for technical
documentation that is not specific to a single piece of code.

In order to make this approach work with Sphinx, we have some logic that gathers
all of the `docs` directories across our codebase into one `docs` directory,
according to the layout defined in our `comm/docs/config.yaml`, and then calls
Sphinx on that one centralized `docs` directory.

## Extending the documentation

To add new documentation to the Thunderbird source docs, you submit a patch to
comm-central like you would for a code change.

**Documentation must live in a `docs` folder.** That can be either the root
`comm/docs` folder or in a `docs` folder near the code it is documenting. For
example, our documentation on our rust code can be found in `comm/rust/docs`.

**Each `docs` folder must have an index file** written in Markdown or
reStructuredText, so either an `index.md` or `index.rst`. While you are welcome
to write reStructuredText, most people are more familiar with Markdown.

### Documentation Placement Guidelines

Here are the guidelines for where a documentation page should go:
* `comm/docs/` is for documentation regarding the code but in a broader sense,
such as general architecture documentation, coding best practices, etc.
* Specific `docs/` somewhere within the `comm` codebase is for documentation of
that *area* of code. A good example is the storybook documentation that details
the frontend workshop for building UI components; the storybook documentation
can be found in `comm/mail/components/storybook/docs`.

### Documentation Checklist

Below is a list of things you should double check are completed, in order to
make sure your new documentation page is included:

- [ ] Documentation lives in a `docs` folder somewhere within `comm`. If you added
some documentation to a component in an area that didn't already have a `docs`
folder then create one. That new `docs` folder should have an index file as well
as your new documentation page.
- [ ] Add the path to this new docs folder in `comm/docs/config.yaml`, under the
`doc_trees` section. Even sub-folders of `comm/docs/` need to be added.

### Linking to other pages

You can use normal markdown links to refer to other pages. The reliable way of
finding out how to refer to a page is to run the following command from your
`comm` folder with the docs built. You will have to replace `$OBJDIR` with the
name of the build output directory for your system.
```shell
../mach python --virtualenv tb_docs -m sphinx.ext.intersphinx ../$OBJDIR/comm/docs/html/objects.inv

```

This will give you a list of references you can use in the first column, followed
by the title and resulting path. These references are all provided as absolute
paths, so to use them, prepend a `/` to your reference.

For example to link to this page from anywhere we can use the following markdown:
```md
[Documentation documentation](/documentation/index)
```
This code will result in the following output:
[Documentation documentation](/documentation/index)

If your reference is not correct, it might be removed (leading to just text
without link), or you get either a `WARNING: unknown document` or
`WARNING: 'myst' cross-reference target not found` warning when building the
documentation.

## Building the docs

To build the docs locally, run `../mach tb-doc`. It will build the docs and then
open them in your browser.

There are a bunch of flags that can be passed to the command which can bypass
build failures that might be irrelevant to your changes. Check out `../mach
tb-doc --help`.

When your patch has landed, the documentation site should automatically update
with your changes.
