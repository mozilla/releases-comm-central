# Writing documentation

## Extending the documentation

To add new documentation to the Thunderbird source docs, you submit a patch to comm-central like you would for a code change.

Documentation is either in a `docs` folder within a component or in the `docs/` folder in the root of the repository and written in either Markdown or reStructuredText.

To add a new documentation topic, add it in `docs/config.yml` and if necessary also in `docs/index.rst`. If you're adding a page to an existing topic, refer to it from the `index.md`'s TOC to add it to the documentation tree.

## Building the docs

To build the docs locally, run `../mach tb-doc`. It will build the docs and then open them in your browser.

There are a bunch of flags that can be passed to the command which can bypass build failures that might be irrelevant to your changes. Check out `../mach tb-doc --help`.

When your patch has landed, the documentation site should automatically update with your changes.

## Further reading

This documentation is based on [Sphinx](https://www.sphinx-doc.org/en/master/) with the read the docs theme.
