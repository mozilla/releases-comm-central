# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import fnmatch
import multiprocessing
import os
import sys
import tempfile
import time
from functools import partial

import sentry_sdk
from mach.decorators import Command, CommandArgument


@Command(
    "tb-doc",
    category="thunderbird",
    virtualenv_name="tb_docs",
    description="Generate and serve documentation from the tree.",
)
@CommandArgument(
    "--format", default="html", dest="fmt", help="Documentation format to write."
)
@CommandArgument(
    "--outdir", default=None, metavar="DESTINATION", help="Where to write output."
)
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
    help="Serve documentation on the specified host and port, "
         'default "localhost:5500".',
)
@CommandArgument(
    "-j",
    "--jobs",
    default=str(multiprocessing.cpu_count()),
    dest="jobs",
    help="Distribute the build over N processes in parallel.",
)
@CommandArgument("--verbose", action="store_true", help="Run Sphinx in verbose mode")
@CommandArgument(
    "--no-autodoc",
    action="store_true",
    help="Disable generating Python/JS API documentation",
)
def build_docs(
        command_context,
        fmt="html",
        outdir=None,
        auto_open=True,
        serve=True,
        http=None,
        jobs=None,
        verbose=None,
        no_autodoc=False,
):
    import webbrowser

    from livereload import Server

    outdir = outdir or os.path.join(command_context.topobjdir, "docs")
    savedir = os.path.join(outdir, fmt)

    docdir = os.path.normpath(os.path.join(command_context.topsrcdir, "comm/docs"))

    #if no_autodoc:
    #    toggle_no_autodoc()

    status, warnings = _run_sphinx(docdir, savedir, fmt=fmt, jobs=jobs, verbose=verbose)
    if status != 0:
        print(_dump_sphinx_backtrace())
        return die(
            "failed to generate documentation:\n"
            "%s: sphinx return code %d" % (docdir, status)
        )
    else:
        print("\nGenerated documentation:\n%s" % savedir)
    msg = ""

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
    for src in [docdir]:
        run_sphinx = partial(
            _run_sphinx, src, savedir, fmt=fmt, jobs=jobs, verbose=verbose
        )
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
        print(args)
        status = sphinx.cmd.build.build_main(args)
        with open(warn_path) as warn_file:
            warnings = warn_file.readlines()
        return status, warnings
    finally:
        try:
            os.unlink(warn_path)
        except Exception as ex:
            print(ex)


def manager():
    from moztreedocs import _SphinxManager, build

    MAIN_DOC_PATH = os.path.normpath(os.path.join(build.topsrcdir, "comm/docs"))

    return _SphinxManager(build.topsrcdir, MAIN_DOC_PATH)


def die(msg, exit_code=1):
    msg = "%s %s: %s" % (sys.argv[0], sys.argv[1], msg)
    print(msg, file=sys.stderr)
    return exit_code
