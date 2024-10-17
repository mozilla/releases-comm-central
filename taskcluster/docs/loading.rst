Loading
=======

Overview
--------

See the Firefox loading documentation. In addition to those loaders, in
``comm_taskgraph.loader`` there are loaders for Thunderbird.


comm_taskgraph.loader
---------------------

reference
.........

Loads selected tasks from a different taskgraph hierarchy.

The ``reference`` loader is used to import kinds from the Firefox Taskcluster
base path.

``packages``, and ``fetch`` use this loader.

When using the ``reference`` loader, optionally include ``reference-tasks``
in kind.yml to select which tasks to import. ``reference-tasks`` uses gitignore
style pattern matching via `pathspec`.

**Include patterns**

.. code-block:: yaml
  reference-tasks:
    - linux64-aarch64-compiler-rt-19
    - linux64-cargo-vet
    - linux64-cbindgen
    - linux64-cctools-port
    - linux64-clang-19-profile
    - linux64-clang-19-raw

**or use wildcards**

.. code-block:: yaml
  reference-tasks:
    - linux64-*
    - win64-*

**and exclude patterns**

.. code-block:: yaml
  reference-tasks:
    - "*"
    - "!ub22-arm64*"

***Note:***

When using exclude patterns only, first you must include everything with an "*"
entry.
The "*" line and the exclusion lines must be quoted due to ensure YAML interprets
those lines as strings.


merge
.....

Loads tasks for a kind from two Taskcluster base paths. The results are "merged"
together into a single kind, allowing for using the Firefox defined tasks as
a base and adding additional tasks.

First tasks are imported from Firefox's Taskcluster base path using the reference
loader. Then tasks are read from the kind directory using ``tasks-from``.

``docker-image`` and ``toolchain`` use this loader.
