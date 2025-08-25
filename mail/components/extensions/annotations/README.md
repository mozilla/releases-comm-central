This folder contains additional information which are not available through the
schema files. The annotation files have the same structure as the schema files
and the entries which should get annotated are identified through hierarchy.

The additional information is provided in `annotations` arrays of annotation
objects. Each annotation object must contains exactly one of the following
properties:

- `text` - paragraph string
- `list`- array of list/paragraph strings
- `code` - path to a code snippet
- `image` - path to an image
- `hint` - hint string
- `note` - note string
- `warning` - warning string
- `version_added` - a boolean value indicating whether the specified API or property
is supported by Thunderbird, overriding automatically generated compat data from
the schema files (schemas read from mail/ default to `true`, schemas read from
browser/ and toolkit/ default to `false`), can also be an string with a version
number to override the automatically calculated first supporting version

Annotation objects may also include `min_manifest_version` and `max_manifest_version`
properties to specify for which manifest version the annotated information is valid.

Annotation `note` objects can include a boolean `bcd` property, to indicate that
the provided annotation should be added to the browser_compat_data [3] repository
(as `__compat.support.thunderbird.notes`).

The annotation files can also provide `enums` objects with `annotations` arrays
for the supported enum values.

The annotation information is used by the webext-schema-generator [1], which is
providing a post-processed set of authoritative schema files for the Thunderbird
project at [2]. These files can be used as the single source of truth for the
WebExtension API documentation and consumers like TypeScript definition generators
or WebExtension linters.

[1] : https://github.com/thunderbird/webext-schemas-generator
[2] : https://github.com/thunderbird/webext-schemas
[3] : https://github.com/mdn/browser-compat-data/tree/main/webextensions

Example:

```
[
  {
    "namespace": "windows",
    "annotations": [
      {
        "note": "This API can be used with Thunderbird's main window and popup windows."
      }
    ],
    "types": [
      {
        "id": "WindowType",
        "enums": {
          "messageCompose": {
            "annotations": [
              {
                "text": "A non-modal stand-alone message compose window."
              }
            ]
          }
        }
      }
    ]
  }
]

```

## url-placeholders.json

List of URL placeholders and their correct URL entries. The placeholders can be
used in schemas files and annotation files through:

    $(url:<placeholder>)

or

    $(url:<placeholder>)[Title]
