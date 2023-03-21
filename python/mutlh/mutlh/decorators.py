#  This Source Code Form is subject to the terms of the Mozilla Public
#  License, v. 2.0. If a copy of the MPL was not distributed with this
#  file, You can obtain one at https://mozilla.org/MPL/2.0/.

import argparse
import os

from mach.decorators import _MachCommand
from mozbuild.base import MachCommandBase


class MutlhCommandBase(MachCommandBase):
    @property
    def virtualenv_manager(self):
        from mozboot.util import get_state_dir

        from .site import MutlhCommandSiteManager

        if self._virtualenv_manager is None:
            self._virtualenv_manager = MutlhCommandSiteManager.from_environment(
                self.topsrcdir,
                lambda: get_state_dir(specific_to_topsrcdir=True, topsrcdir=self.topsrcdir),
                self._virtualenv_name,
                os.path.join(self.topobjdir, "_virtualenvs"),
            )

        return self._virtualenv_manager


class _MutlhCommand(_MachCommand):
    def create_instance(self, context, virtualenv_name):
        metrics = None
        if self.metrics_path:
            metrics = context.telemetry.metrics(self.metrics_path)

        # This ensures the resulting class is defined inside `mach` so that logging
        # works as expected, and has a meaningful name
        subclass = type(self.name, (MutlhCommandBase,), {})

        if virtualenv_name is None:
            virtualenv_name = "tb_common"

        return subclass(
            context,
            virtualenv_name=virtualenv_name,
            metrics=metrics,
            no_auto_log=self.no_auto_log,
        )


class Command(object):
    def __init__(self, name, metrics_path=None, **kwargs):
        self._mach_command = _MutlhCommand(name=name, **kwargs)
        self._mach_command.metrics_path = metrics_path

    def __call__(self, func):
        if not hasattr(func, "_mach_command"):
            func._mach_command = _MutlhCommand()

        func._mach_command |= self._mach_command
        func._mach_command.register(func)

        return func


class SubCommand(object):
    global_order = 0

    def __init__(
        self,
        command,
        subcommand,
        description=None,
        parser=None,
        metrics_path=None,
        virtualenv_name=None,
    ):
        self._mach_command = _MutlhCommand(
            name=command,
            subcommand=subcommand,
            description=description,
            parser=parser,
            virtualenv_name=virtualenv_name,
        )
        self._mach_command.decl_order = SubCommand.global_order
        SubCommand.global_order += 1

        self._mach_command.metrics_path = metrics_path

    def __call__(self, func):
        if not hasattr(func, "_mach_command"):
            func._mach_command = _MutlhCommand()

        func._mach_command |= self._mach_command
        func._mach_command.register(func)

        return func


class CommandArgument(object):
    def __init__(self, *args, **kwargs):
        if kwargs.get("nargs") == argparse.REMAINDER:
            # These are the assertions we make in dispatcher.py about
            # those types of CommandArguments.
            assert len(args) == 1
            assert all(k in ("default", "nargs", "help", "group", "metavar") for k in kwargs)
        self._command_args = (args, kwargs)

    def __call__(self, func):
        if not hasattr(func, "_mach_command"):
            func._mach_command = _MutlhCommand()

        func._mach_command.arguments.insert(0, self._command_args)

        return func


class CommandArgumentGroup(object):
    def __init__(self, group_name):
        self._group_name = group_name

    def __call__(self, func):
        if not hasattr(func, "_mach_command"):
            func._mach_command = _MutlhCommand()

        func._mach_command.argument_group_names.insert(0, self._group_name)

        return func
