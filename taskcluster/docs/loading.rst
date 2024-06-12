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

merge
.....

Loads tasks for a kind from two Taskcluster base paths. The results are "merged"
together into a single kind, allowing for using the Firefox defined tasks as
a base and adding additional tasks.

First tasks are imported from Firefox's Taskcluster base path using the reference
loader. Then tasks are read from the kind directory using ``tasks-from``.

``docker-image`` and ``toolchain`` use this loader.
