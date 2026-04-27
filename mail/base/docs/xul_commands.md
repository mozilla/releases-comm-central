# XUL Commands

The command infrastructure's main job is to handle the complex task of figuring
out what should happen for example when the user wants to paste something. So it
is a centralized concept to manage actions depending on the current UI state.
The core are command controllers, which provide the state and implementation for
individual commands. Often we don't directly change the implementation of the
controllers and instead use an interface they provide, like for tabs or
`<command>` elements.

In Thunderbird we often only use parts of the full command infrastructure and
will directly call the controllers when executing a command for example.
However, we also use upstream parts that will depend on commands working through
the full chain, like for example a `<menuitem>` invoking a command. As such, our
patterns are balanced to provide just enough to satisfy everyone, without giving
in too much into the old command structure patterns.

## Unified entry point

The command infrastructure fixes the issue of handling all the entry points
interactions can have. You might paste by using a keyboard shortcut, a context
menu item, a toolbar button, a menubar item. And all of those things are handled
in a different context (the toolbar and context menu probably know fairly well
where the paste should apply; but the menubar and keyboard handler are global
and have no idea), so being able to tell the command handling infrastructure to
handle a paste of some data allows it to then resolve where exactly the paste
should happen.

## Command registration

A [command controller](https://searchfox.org/firefox-main/source/dom/xul/nsIController.idl)
exposes three main features: a way to check if a command is available on it, a
check if that command is enabled, and a way to execute a command.

Commands have a string identifier, usually prefixed by "cmd_". When executing a
command, a payload can be passed along to the handler.

Commands used to be declared as `<command>` XUL element and would then be
handled based on where they are in the DOM tree. We're trying to move away from
this declarative binding approach and instead register command controllers that
implement the command handling on the owning window:

```js
window.controllers.insertControllerAt(0, commandController);
```

For documents that are opened in a tab, we have a helper module called
`CommandController.mjs` that implements the scaffolding to easily add commands
that apply to the entire page.

Example module to implement commands using the helper:
```js
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import commandController from "resource:///modules/CommandController.mjs";

commandController.registerCallback(
  "cmd_exampleCommand",
  (...args) => {
    actionsForExampleCommand(...args);
  },
  () => isExampleCommandEnabled(),
  () => isExampleCommandSupported(),
);
```

See also the documentation in
[the module](https://searchfox.org/comm-central/source/mail/modules/CommandController.mjs)
itself.

Whenever the state of a command changes (due to data changing or the active
context changing), `goUpdateCommand` should be called on the topmost window. Our
implementation of the function dispatches a `commandstate` event, which is used
by the UI (primarily the unified toolbar) to know that it should recheck the
state of a command. The event provides the name of the command as a detail:

```js
window.addEventListener("commandstate", (event) => {
  if (event.detail.command == "cmd_exampleCommand") {
    checkExampleCommandEnabled();
  }
});
```

Otherwise the only way for the UI to keep up to date on the state of a command
is to observe attributes of the `<command>` element for the specific command if
there is any.

## Command execution

To execute a command, call `goDoCommand` on the topmost window. That way
everything available is included in the resolution. This looks for the first
registered controller, where the command is available and enabled and then
executes the command on that controller.

## Command usage

As mentioned earlier, commands are often used to bundle various UI entry points
through to a single handler. However, they also provide a nice way to separate
tab contents from the outside world. As such it's encouraged to use commands on
a tab instead of calling methods in its scope (as mentioned in [ADR
0001](/adr/records/0001-technology-transitions)). See for example [the usage of
commands when delegating to the address book
tab](https://searchfox.org/comm-central/search?q=toAddressBook&path=&case=false&regexp=false).

Another example is the unified toolbar, where we [declare the name of a
command](https://searchfox.org/comm-central/rev/0a3a155011aa9faba7b61c41b86b6b2fec9d80d6/mail/components/unifiedtoolbar/content/unifiedToolbarCustomizableItems.inc.xhtml#330-336)
that will then [execute the
command](https://searchfox.org/comm-central/rev/75dbccf6295a24a0a8543bbb9283c55744b57241/mail/components/unifiedtoolbar/content/unified-toolbar-button.mjs#197-214)
and thus allowing the tab to provide the appropriate action, or indicating that
it doesn't have a command available.
