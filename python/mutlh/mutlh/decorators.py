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


def mach2MutlhCommand(cmd: str, new_func=None, **replacekws):
    """
    Change a registered _MachCommand to a _MutlhCommand

    :param str cmd: The name of the existing command
    :param function new_func: New implementation function
    :param dict replacekws: keyword arguments to replace
    :return _MutlhCommand: replacement
    """
    from mach.registrar import Registrar

    def get_mach_command(cmd_name):
        mach_cmd = Registrar.command_handlers.get(cmd_name)
        if mach_cmd:
            del Registrar.command_handlers[cmd_name]
            return mach_cmd
        raise Exception(f"{cmd_name} unknown!")

    mach_cmd = get_mach_command(cmd)

    if mach_cmd.subcommand_handlers:
        raise Exception("Commands with SubCommands not implemented!")

    if "parser" in replacekws:
        replacekws["_parser"] = replacekws["parser"]
        del replacekws["parser"]

    arg_names = (
        "name",
        "subcommand",
        "category",
        "description",
        "conditions",
        "_parser",
        "virtualenv_name",
        "ok_if_tests_disabled",
        "order",
        "no_auto_log",
    )
    kwargs = dict([(k, getattr(cmd, k)) for k in arg_names])
    kwargs.update(dict([(k, v) for k, v in replacekws.items() if k in arg_names]))
    if "_parser" in kwargs:
        kwargs["parser"] = kwargs["_parser"]
        del kwargs["_parser"]

    mutlh_cmd = _MutlhCommand(**kwargs)
    post_args = (
        "arguments",
        "argument_group_names",
        "metrics_path",
        "subcommand_handlers",
        "decl_order",
    )
    for arg in post_args:
        value = replacekws.get(arg, getattr(mach_cmd, arg))
        setattr(mutlh_cmd, arg, value)

    if new_func is None:
        new_func = mach_cmd.func
        delattr(new_func, "_mach_command")
    if not hasattr(new_func, "_mach_command"):
        new_func._mach_command = _MutlhCommand()

    new_func._mach_command |= mutlh_cmd
    mutlh_cmd.register(new_func)

    return mutlh_cmd
