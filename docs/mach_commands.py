# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import fnmatch
import json
import os
import re
import sys
import tempfile
import time
from functools import partial

import sentry_sdk
import yaml
from mozfile import load_source

import mozpack.path as mozpath
from mach.decorators import Command, CommandArgument
from mozbuild.util import cpu_count, memoize

here = os.path.abspath(os.path.dirname(__file__))
topsrcdir = os.path.abspath(os.path.dirname(os.path.dirname(here)))
topcommdir = os.path.join(topsrcdir, "comm")
DOC_ROOT = os.path.join(topsrcdir, "docs")


@Command(
    "tb-doc",
    category="thunderbird",
    virtualenv_name="tb_docs",
    description="Generate and serve documentation from the tree.",
)
@CommandArgument(
    "path",
    default=None,
    metavar="DIRECTORY",
    nargs="?",
    help="Path to documentation to build and display.",
)
@CommandArgument("--format", default="html", dest="fmt", help="Documentation format to write.")
@CommandArgument("--outdir", default=None, metavar="DESTINATION", help="Where to write output.")
@CommandArgument(
    "--no-open",
    dest="auto_open",
    default=True,
    action="store_false",
    help="Don't automatically open HTML docs in a browser.",
)
@CommandArgument(
    "--no-serve",
    dest="serve",
    default=True,
    action="store_false",
    help="Don't serve the generated docs after building.",
)
@CommandArgument(
    "--http",
    default="localhost:5500",
    metavar="ADDRESS",
    help="Serve documentation on the specified host and port, default 'localhost:5500'.",
)
@CommandArgument(
    "-j",
    "--jobs",
    default=str(cpu_count()),
    dest="jobs",
    help="Distribute the build over N processes in parallel.",
)
@CommandArgument("--linkcheck", action="store_true", help="Check if the links are still valid")
@CommandArgument("--dump-trees", default=None, help="Dump the Sphinx trees to specified file.")
@CommandArgument(
    "--disable-fatal-errors",
    dest="disable_fatal_errors",
    action="store_true",
    help="Disable fatal errors.",
)
@CommandArgument(
    "--disable-fatal-warnings",
    dest="disable_fatal_warnings",
    action="store_true",
    help="Disable fatal warnings.",
)
@CommandArgument(
    "--check-num-warnings",
    action="store_true",
    help="Check that the upper bound on the number of warnings is respected.",
)
@CommandArgument("--verbose", action="store_true", help="Run Sphinx in verbose mode")
@CommandArgument(
    "--no-autodoc",
    action="store_true",
    help="Disable generating Python/JS API documentation",
)
def build_docs(
    command_context,
    path=None,
    fmt="html",
    outdir=None,
    auto_open=True,
    serve=True,
    http="",
    jobs=None,
    linkcheck=None,
    dump_trees=None,
    disable_fatal_errors=False,
    disable_fatal_warnings=False,
    check_num_warnings=False,
    verbose=False,
    no_autodoc=False,
):
    # TODO: Bug 1704891 - move the ESLint setup tools to a shared place.
    # This really has nothing to do with ESLint - it's only here to get nodejs
    # in the PATH.
    import setup_helper

    setup_helper.set_project_root(command_context.topsrcdir)

    if not setup_helper.check_node_executables_valid():
        return 1

    setup_helper.eslint_maybe_setup()

    # Set the path so that Sphinx can find jsdoc, unfortunately there isn't
    # a way to pass this to Sphinx itself at the moment.
    os.environ["PATH"] = os.pathsep.join(
        [
            str(mozpath.join(command_context.topsrcdir, "node_modules", ".bin")),
            _node_path(),
            os.environ["PATH"],
        ]
    )

    import webbrowser

    from livereload import Server

    outdir = outdir or os.path.join(command_context.topobjdir, "comm/docs")
    savedir = os.path.join(outdir, fmt)

    if path is None:
        path = topcommdir
    path = os.path.normpath(os.path.abspath(path))

    docdir = _find_doc_dir(path)
    if not docdir:
        print(_dump_sphinx_backtrace())
        return die(
            "failed to generate documentation:\n" "%s: could not find docs at this location" % path
        )

    if linkcheck:
        # We want to verify if the links are valid or not
        fmt = "linkcheck"
    if no_autodoc:
        if check_num_warnings:
            return die("'--no-autodoc' flag may not be used with '--check-num-warnings'")
        toggle_no_autodoc()

    status, warnings = _run_sphinx(docdir, savedir, fmt=fmt, jobs=jobs, verbose=verbose)
    if status != 0:
        print(_dump_sphinx_backtrace())
        return die(
            "failed to generate documentation:\n" "%s: sphinx return code %d" % (path, status)
        )
    else:
        print("\nGenerated documentation:\n%s" % savedir)
    msg = ""

    with open(os.path.join(DOC_ROOT, "config.yml"), "r") as fh:
        docs_config = yaml.safe_load(fh)

    if not disable_fatal_errors:
        fatal_errors = _check_sphinx_errors(warnings, docs_config)
        if fatal_errors:
            msg += f"Error: Got fatal errors:\n{''.join(fatal_errors)}"
    if not disable_fatal_warnings:
        fatal_warnings = _check_sphinx_fatal_warnings(warnings, docs_config)
        if fatal_warnings:
            msg += f"Error: Got fatal warnings:\n{''.join(fatal_warnings)}"
    if check_num_warnings:
        [num_new, num_actual] = _check_sphinx_num_warnings(warnings, docs_config)
        print("Logged %s warnings\n" % num_actual)
        if num_new:
            msg += f"Error: {num_new} new warnings have been introduced compared to the limit in docs/config.yml"

    if msg:
        return dieWithTestFailure(msg)

    if dump_trees is not None:
        parent = os.path.dirname(dump_trees)
        if parent and not os.path.isdir(parent):
            os.makedirs(parent)
        with open(dump_trees, "w") as fh:
            json.dump(manager().trees, fh)

    if not serve:
        index_path = os.path.join(savedir, "index.html")
        if auto_open and os.path.isfile(index_path):
            webbrowser.open(index_path)
        return

    # Create livereload server. Any files modified in the specified docdir
    # will cause a re-build and refresh of the browser (if open).
    try:
        host, port = http.split(":", 1)
        port = int(port)
    except ValueError:
        return die("invalid address: %s" % http)

    server = Server()

    sphinx_trees = manager().trees or {savedir: docdir}
    for _, src in sphinx_trees.items():
        run_sphinx = partial(_run_sphinx, src, savedir, fmt=fmt, jobs=jobs, verbose=verbose)
        server.watch(src, run_sphinx)
    server.serve(
        host=host,
        port=port,
        root=savedir,
        open_url_delay=0.1 if auto_open else None,
    )


def _dump_sphinx_backtrace():
    """
    If there is a sphinx dump file, read and return
    its content.
    By default, it isn't displayed.
    """
    pattern = "sphinx-err-*"
    output = ""
    tmpdir = "/tmp"

    if not os.path.isdir(tmpdir):
        # Only run it on Linux
        return
    files = os.listdir(tmpdir)
    for name in files:
        if fnmatch.fnmatch(name, pattern):
            pathFile = os.path.join(tmpdir, name)
            stat = os.stat(pathFile)
            output += "Name: {0} / Creation date: {1}\n".format(
                pathFile, time.ctime(stat.st_mtime)
            )
            with open(pathFile) as f:
                output += f.read()
    return output


def _run_sphinx(docdir, savedir, config=None, fmt="html", jobs=None, verbose=None):
    import sphinx.cmd.build

    config = config or manager().conf_py_path
    # When running sphinx with sentry, it adds significant overhead
    # and makes the build generation very very very slow
    # So, disable it to generate the doc faster
    sentry_sdk.init(None)
    warn_fd, warn_path = tempfile.mkstemp()
    os.close(warn_fd)
    try:
        args = [
            "-a",
            "-T",
            "-b",
            fmt,
            "-c",
            os.path.dirname(config),
            "-w",
            warn_path,
            docdir,
            savedir,
        ]
        if jobs:
            args.extend(["-j", jobs])
        if verbose:
            args.extend(["-v", "-v"])
        print("Run sphinx with:")
        print(" ".join(args))
        status = sphinx.cmd.build.build_main(args)
        with open(warn_path) as warn_file:
            warnings = warn_file.readlines()
        return status, warnings
    finally:
        try:
            os.unlink(warn_path)
        except Exception as ex:
            print(ex)


def _check_sphinx_fatal_warnings(warnings, docs_config):
    fatal_warnings_regex = [re.compile(item) for item in docs_config["fatal warnings"]]
    fatal_warnings = []
    for warning in warnings:
        if any(item.search(warning) for item in fatal_warnings_regex):
            fatal_warnings.append(warning)
    return fatal_warnings


def _check_sphinx_errors(warnings, docs_config):
    allowed_errors_regex = [re.compile(item) for item in docs_config["allowed_errors"]]
    errors = []
    for warning in warnings:
        if warning in ["ERROR", "CRITICAL"]:
            if not (any(item.search(warning) for item in allowed_errors_regex)):
                errors.append(warning)
    return errors


def _check_sphinx_num_warnings(warnings, docs_config):
    # warnings file contains other strings as well
    num_warnings = len([w for w in warnings if "WARNING" in w])
    max_num = docs_config["max_num_warnings"]
    if num_warnings > max_num:
        return [num_warnings - max_num, num_warnings]
    return [0, num_warnings]


def manager():
    from rocbuild.roctreedocs import manager

    return manager


def toggle_no_autodoc():
    from rocbuild import roctreedocs

    roctreedocs.CCSphinxManager.NO_AUTODOC = True


@memoize
def _read_project_properties():
    path = os.path.normpath(manager().conf_py_path)
    conf = load_source("doc_conf", path)

    # Prefer the Mozilla project name, falling back to Sphinx's
    # default variable if it isn't defined.
    _project = getattr(conf, "moz_project_name", None)
    if not _project:
        _project = conf.project.replace(" ", "_")

    return {"project": _project, "version": getattr(conf, "version", None)}


def project():
    return _read_project_properties()["project"]


def version():
    return _read_project_properties()["version"]


def _node_path():
    from mozbuild.nodeutil import find_node_executable

    node, _ = find_node_executable()

    return os.path.dirname(str(node))


def _find_doc_dir(path: str) -> str | None:
    if os.path.isfile(path):
        return

    valid_doc_dirs = ("doc", "docs")
    for d in valid_doc_dirs:
        p = os.path.join(path, d)
        if os.path.isdir(p):
            path = p

    for index_file in ["index.rst", "index.md"]:
        if os.path.exists(os.path.join(path, index_file)):
            return path


def die(msg, exit_code=1):
    msg = "%s %s: %s" % (sys.argv[0], sys.argv[1], msg)
    print(msg, file=sys.stderr)
    return exit_code


def dieWithTestFailure(msg, exit_code=1):
    for m in msg.split("\n"):
        msg = "TEST-UNEXPECTED-FAILURE | %s %s | %s" % (sys.argv[0], sys.argv[1], m)
        print(msg, file=sys.stderr)
    return exit_code
