# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, # You can obtain one at http://mozilla.org/MPL/2.0/.

import glob
import os
import shutil
from pathlib import Path, PurePath

import sphinx
import sphinx.ext.apidoc
import sphinx.util
import sphinx.util.logging
import yaml

here = os.path.abspath(os.path.dirname(__file__))
topcommdir = Path(here).parent.parent.parent

MAIN_DOC_PATH = os.path.normpath(os.path.join(topcommdir, "docs"))

logger = sphinx.util.logging.getLogger(__name__)


def link_or_copy(src, dst):
    if os.name == "nt" or os.path.islink(src):
        return shutil.copy2(src, dst, follow_symlinks=False)
    return os.symlink(src, dst)


class CCSphinxManager(object):
    """Manages the generation of Sphinx documentation for comm-central."""

    NO_AUTODOC: bool = False

    def __init__(self, topcommdir, main_path):
        self.topcommdir = topcommdir
        self.conf_py_path = os.path.join(main_path, "conf.py")
        self.index_path = os.path.join(main_path, "index.rst")

        with open(os.path.join(MAIN_DOC_PATH, "config.yml"), "r") as fh:
            self.config = yaml.safe_load(fh)

        self.trees = self.config["doc_trees"]
        self.python_package_dirs = self.config["python_package_dirs"]

        # Instance variables that get set in self.generate_docs()
        self._staging_dir = None

    @property
    def staging_dir(self) -> os.PathLike:
        if self._staging_dir is not None:
            return self._staging_dir
        raise Exception("staging_dir not set")

    @staging_dir.setter
    def staging_dir(self, staging_dir):
        self._staging_dir = staging_dir

    def generate_docs(self, app):
        """Generate/stage documentation."""
        if self.NO_AUTODOC:
            logger.info("Python/JS API documentation generation will be skipped")
            app.config["extensions"].remove("sphinx.ext.autodoc")
            app.config["extensions"].remove("sphinx_js")
        self.staging_dir = os.path.join(app.outdir, "_staging")

        logger.info("Staging static documentation")
        self._synchronize_docs(app)

        if not self.NO_AUTODOC:
            self._generate_python_api_docs()

    def _generate_python_api_docs(self):
        """Generate Python API doc files."""
        out_dir = os.path.join(self.staging_dir, "python")
        base_args = ["--no-toc", "-o", out_dir]

        for p in sorted(self.python_package_dirs):
            full = str(self.topcommdir / p)

            dirs = {
                os.path.relpath(f, full)
                for f in glob.glob(f"{full}/**", recursive=True)
                if os.path.isdir(f)
            }

            test_dirs = {"test", "tests"}
            # Exclude directories whose path components match any in 'test_dirs'.
            excludes = {os.path.join(full, d) for d in dirs if set(PurePath(d).parts) & test_dirs}

            args = list(base_args)
            args.append(full)
            args.extend(excludes)

            sphinx.ext.apidoc.main(args)

    def _synchronize_docs(self, app):
        tree_config = self.config["categories"]

        staging_dir = Path(self.staging_dir)
        if staging_dir.exists():
            if staging_dir.is_dir():
                shutil.rmtree(staging_dir)
            else:
                staging_dir.unlink()

        staging_dir.mkdir(parents=True)

        conf_py_dst = staging_dir / "conf.py"
        link_or_copy(self.conf_py_path, conf_py_dst)

        for dest, source in sorted(self.trees.items()):
            source_dir = self.topcommdir / source
            target_dir = os.fspath(staging_dir / dest)
            shutil.copytree(source_dir, target_dir, copy_function=link_or_copy)

        with open(self.index_path, "r") as fh:
            data = fh.read()

        def is_toplevel(key):
            """Whether the tree is nested under the toplevel index, or is
            nested under another tree's index.
            """
            for k in self.trees:
                if k == key:
                    continue
                if key.startswith(k):
                    return False
            return True

        def format_paths(paths):
            source_doc = ["%s/index" % p for p in paths]
            return "\n   ".join(source_doc)

        toplevel_trees = {k: v for k, v in self.trees.items() if is_toplevel(k)}

        CATEGORIES = {}
        # generate the datastructure to deal with the tree
        for t in tree_config:
            CATEGORIES[t] = format_paths(tree_config[t])

        # During livereload, we don't correctly rebuild the full document
        # tree (Bug 1557020). The page is no longer referenced within the index
        # tree, thus we shall check categorisation only if complete tree is being rebuilt.
        if app.srcdir == self.topcommdir:
            indexes = set(
                [os.path.normpath(os.path.join(p, "index")) for p in toplevel_trees.keys()]
            )
            # Format categories like indexes
            cats = "\n".join(CATEGORIES.values()).split("\n")
            # Remove heading spaces
            cats = [os.path.normpath(x.strip()) for x in cats]
            indexes = tuple(set(indexes) - set(cats))
            if indexes:
                # In case a new doc isn't categorized
                print(indexes)
                raise Exception("Uncategorized documentation. Please add it in docs/config.yml")

        data = data.format(**CATEGORIES)

        with open(os.path.join(self.staging_dir, "index.rst"), "w") as fh:
            fh.write(data)


manager = CCSphinxManager(topcommdir, MAIN_DOC_PATH)
