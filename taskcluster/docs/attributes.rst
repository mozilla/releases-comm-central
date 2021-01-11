===============
Task Attributes
===============

Additional task attributes for Thunderbird's taskgraph.

gecko_index
===========

The index path of a Firefox private toolchain build. It is passed to
a Taskcluster API call to find the matching task ID which is used to
download the toolchain artifact. The path to the artifact itself is
defined in `gecko_artifact_path`. Only valid on `macos-sdk-fetch`
toolchain jobs.

gecko_artifact_path
===================

This is used to download a copy of the macOS-11 SDk that is built as
a private artifact in Firefox builds. This is the path of the artifact
as found in the Firefox toolchain build configuration. Only valid on
`macos-sdk-fetch` toolchain jobs.
