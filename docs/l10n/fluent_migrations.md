# Migrating Strings to Fluent Files

Like [Firefox](https://firefox-source-docs.mozilla.org/l10n/migrations/index.html),
Thunderbird developers are working on migrating strings from legacy formats to
Fluent. The process is very similar to how migrations are done for Firefox. The
differences are detailed below.

## Migration Recipes

When part of Thunderbird’s UI is migrated to Fluent, a migration recipe should
be included in the same patch that adds new strings to .ftl files. Recipes are
stored in [comm-central](https://hg.mozilla.org/comm-central/file/tip/python/l10n/tb_fluent_migrations).
After a patch with migrations landed, it will be run for all locales as part of
the [Thunderbird Cross-Channel string quarantining process](cross_channel.md).

Be sure to read [Migrating Legacy Formats](https://firefox-source-docs.mozilla.org/l10n/migrations/legacy.html)
along with the below example.

The migration recipe’s filename should start with a reference to the associated
bug number, and include a brief description of the bug, e.g. `bug_1805746_calendar_view.py`
for the below example.

### Example: Migrate Multiple DTD strings to Fluent

Often, strings are migrated as part of ongoing UI work to convert XUL code
to HTML. Multiple DTD strings may convert to a single Fluent string with
attributes. It really depends on the document structure and what the UI changes
are doing.

**Legacy strings are in `comm/calendar/locales/en-US/chrome/calendar/calendar.dtd`**

```dtd
<!ENTITY calendar.day.button.tooltip            "Switch to day view" >
<!ENTITY calendar.day.button.label              "Day" >
```

**The (simplified) XUL code**

```xml
<radio id="calendar-day-view-button"
       label="&calendar.day.button.label;"
       tooltiptext="&calendar.day.button.tooltip;" />
```

**The new HTML**

```html
<button id="calTabDay" data-l10n-id="calendar-view-toggle-day"></button>
```

**The new FTL string**

```fluent
calendar-view-toggle-day = Day
  .title = Switch to day view
```

**Renders as:**

```html
<button id="calTabDay" title="Switch to day view">Day</button>
```

This case migrates two DTD strings, `calendar.day.button.label` and `calendar.day.button.tooltip`
to create a single FTL string, `calendar-view-toggle-day`, with one (`title`)
attribute.

**The migration recipe:**

```python
# Any copyright is dedicated to the Public Domain.
# http://creativecommons.org/publicdomain/zero/1.0/

from fluent.migratetb.helpers import transforms_from
from fluent.migratetb import COPY

def migrate(ctx):
    """Bug 1805746 - Update Calendar View selection part {index}."""
    target = reference = "calendar/calendar/calendar-widgets.ftl"
    source = "calendar/chrome/calendar/calendar.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
            """
calendar-view-toggle-day = { COPY(from_path, "calendar.day.button.label") }
    .title = { COPY(from_path, "calendar.day.button.tooltip") }
""",
            from_path=source,
        ),
    )
```

Migrations are Python modules, and implement
a single `migrate(MigrationContext)` function. The `migrate()` function makes
calls into `MigrationContext.add_transforms()`.

The `add_transforms()` function takes three arguments:
- `target_path`: Path to the target l10n file
- `reference_path`: Path to the reference (en-US) file
- A list of Transforms, the `source_path` (legacy translated strings file) is
  set here

```{note}
For Thunderbird migrations, the target and reference path are the same.
```

Transforms are rather dense AST nodes. See
[Transforms](https://firefox-source-docs.mozilla.org/l10n/migrations/overview.html#transforms)
for the exact details.

There are some helper functions that simplify creating the ASTs. The above example uses the
`transforms_from()` helper function. It is equivalent to:

```python
target = reference = "calendar/calendar/calendar-widgets.ftl"
source = "calendar/chrome/calendar/calendar.dtd"

ctx.add_transforms(
    target,
    reference,
    [
        FTL.Message(
            id=FTL.Identifier("calendar-view-toggle-day"),
            value=COPY(source, "calendar.day.button.label"),
            attributes=[
                FTL.Attribute(
                    id=FTL.Identifier("title"),
                    value=COPY(
                        source,
                        "calendar.day.button.tooltip"
                    )
                )
            ]
        )
    ]
)
```

`transforms_from()` allows copying reference FTL strings, and replacing the value
of each message with a `COPY` Transform that copies values from the DTD file at
`from_path`.

There are other Transforms like `COPY`. See
[Migrating Legacy Formats](https://firefox-source-docs.mozilla.org/l10n/migrations/legacy.html)
for usage information.

### Thunderbird migration helpers

The `REPLACE` works with `transforms_from` if provided the extra context that
it needs.

Starting with `aboutDialog.dtd` containing:

```xml
<!ENTITY update.updateButton.label3               "Restart to update &brandShorterName;">
```

```python
from fluent.migratetb.helpers import TERM_REFERENCE, transforms_from

# This can't just be a straight up literal dict (eg: {"a":"b"}) because the
# validator fails... so make it a function call that returns a dict.. it works
about_replacements = dict({
    "&brandShorterName;": TERM_REFERENCE("brand-shorter-name"),
})


def migrate(ctx):
    """Bug 1816532 - Migrate aboutDialog.dtd strings to Fluent, part {index}"""
    target = reference = "mail/messenger/aboutDialog.ftl"
    source = "mail/chrome/messenger/aboutDialog.dtd"

    ctx.add_transforms(
        target,
        reference,
        transforms_from(
          """
update-update-button = { REPLACE(source, "update.updateButton.label3", about_replacements) }
    .accesskey = { COPY(source, "update.updateButton.accesskey") }
""", source=source, about_replacements=about_replacements))
```

The resulting `aboutDialog.ftl` will get:

```ftl
update-update-button = Restart to update { -brand-shorter-name }
    .accesskey = R
```
