# mutlh

Mutlh (Klingon for *construct, assemble, put together*) is an extension of
Mozilla's Mach to meet the needs of Thunderbird developers.

### Why you might need this

When implementing a `mach` command in comm-central, you may need to utilize
some of the Python code in the repository. Often, `mach` commands have difficulty
importing these modules as they're not in sys.path usually.

### Use case: mach command needs to import a library not on sys.path

- In your `mach_commands.py` file, instead of importing from `mach.decorators`,
  import from `mutlh.decorators`.
- Implement your command as usual. `@Command`, `@CommandArgument`, `@SubCommand`,
  and `@CommandArgumentGroup` are available and work just like `mach.decorators`
  equivalents.
- By default, the "tb_common" site is used for MutlhCommands.

```python
from mutlh.decorators import Command, CommandArgument

@Command(
    "tb-add-missing-ftls",
    category="thunderbird",
    description="Add missing FTL files after l10n merge.",
)
@CommandArgument(
    "--merge",
    type=Path,
    help="Merge path base",
)
@CommandArgument(
    "locale",
    type=str,
    help="Locale code",
)
def tb_add_missing_ftls(command_context, merge, locale):
    """implementation"""
```

- The default "tb_common" virtualenv can be overridden by passing `virtualenv_name`
  to `@Command`.

```python
@Command(
  "crazytb",
  category="thunderbird",
  description="Something insane",
  virtualenv_name="crazyenv"
)
def crazytb(command_context, *args, **kwargs):
    command_context.activate_virtualenv()
    """Do stuff"""
```
