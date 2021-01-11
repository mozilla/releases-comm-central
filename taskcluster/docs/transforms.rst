Transforms
==========

Overview
--------

Most transforms come from Firefox, and it's assumed that the reader is
familiar with those already.

The transforms here are mostly used to work around assumptions made in
Firefox transforms. The general idea is to keep Thunderbird-specific exceptions
to those assumptions in this tree.

Loaders
-------

See :doc:`loading`.


Transforms
----------

TODO: Document the transforms found in comm_taskgraph.transforms


Run-Using
---------

In order to build toolchains specific to Thunderbird, there is a ``run-using``
implementation in `comm_taskgraph.transforms.job.toolchain`:

* ``comm-toolchain-script``
* ``macos-sdk-fetch``
