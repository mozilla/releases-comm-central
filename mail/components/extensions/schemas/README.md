# Thunderbird WebExtension API Schema Files

This folder contains Thunderbird's WebExtension API schema files.

## Best Practice Suggestions

### Adding new `choices` entries

Always append new entries to the end of the `choices` array. Changing the order
of existing entries can cause the [webext-schemas-generator][1] to assign incorrect
`version_added` values — the version when support for the choice was first introduced.

### Removing `choices` entries

Do **not** delete `choices` entries outright. Instead, mark them with either:

- `"deprecated": true` – to indicate the choice should no longer be used, or
- `"unsupported": true` – to indicate support for the choice was removed.

This ensures [webext-schemas-generator][1] will correctly generate `version_added`
and `version_removed` metadata.

### Using `"type": "object"` vs. `"$ref": "<type-id>"`

When defining an object parameter with multiple properties, you can either:

- Inline the definition using `"type": "object"`, or
- Define a reusable named type and reference it via `"$ref": "<type-id>"`.

**Suggestions:**

- If the object appears as one of several `choices`, prefer a dedicated `type`.
- If the object has **more than 5 properties**, consider using a dedicated `type`.

---

[1]: https://github.com/thunderbird/webext-schemas-generator
