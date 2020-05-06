Task Kinds
==========

This section lists and documents the additional task kinds that are specific
to Thunderbird and are implemented in it's source tree.

thirdparty
----------
Used to build third-party dependency libraries such as libotr.

Using
.....

- kind-dependencies:
    Must include `toolchain`
- transforms:
    Must include `comm_taskgraph.transforms.thirdparty:transforms`

Parameters
..........

- thirdparty:
    - script: Script to run, in `comm/taskcluster/scripts`
    - args: Optional list of arguments to pass to script
    - artifact: Filename of built artifact.
- toolchain:
    List of toolchains needed

.. important::
  Thirdparty library builds are cached between runs. They will rebuild based
  on `files-changed` optimization. To build a new version, make a change.

Build Environment
.................

The build script will have a limited mozilla- checkout with a complete comm-
checkout at `$GECKO_PATH`. It should be treated as read-only.
`$WORKSPACE` can be used during your build as needed. `$MOZ_FETCHES_DIR` will
typically be at `$WORKSPACE/fetches` and will have your toolchains unpacked
in separate directories.
When your build finishes, copy your artifacts to `$UPLOAD_DIR`.

When building for macOS, you must set `$TOOLTOOL_MANIFEST` in the environment
and set `tooltool-downloads` to `internal` in the run configuration. See the
build task configuration for an example.

Using built artifacts
.....................

TODO: Document how to configure a build task to include build artifacts from
a thirdparty task.


Example task configuration
..........................

.. code-block:: yaml

  libfoo-linux64:
    description: 'libfoo library'
    index:
      product: thunderbird
    treeherder:
      symbol: libfoo
      platform: linux64/opt
    worker:
      docker-image: {in-tree: "deb8-toolchain-build"}
    when:
      files-changed:
        - comm/thirdparty/libfoo
        - comm/thirdparty/README.libfoo
    thirdparty:
      script: 'build-libfoo.sh'
      args: ['arg1', 'arg2']
      artifact: 'libfoo.tar.xz'
    toolchain:
      - linux64-clang
      - linux64-binutils
