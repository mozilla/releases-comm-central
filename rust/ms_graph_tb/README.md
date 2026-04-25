# ms_graph_tb

Rust representations of
[Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/overview)
types and basic requests, primarily intended for use with Thunderbird.

This crate is currently under heavy development, and makes no stability
guarantees. The intent is to generate as much of it as practical from the
[OpenAPI representation](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml)
using the `ms_graph_tb_extract` program.

Assuming you are working on Thunderbird, the easiest way to update the generated
source code is to run `mach ms-graph-tb-extract`. This uses a pinned version of
the OpenAPI representation, downloading it if necessary. If you want to update
the version pinned, change the values of `MS_GRAPH_OPENAPI_URL` and
`MS_GRAPH_OPENAPI_SHA256` in `comm/python/rocbuild/rocbuild/rust.py`. Support
for extracting more types and paths can be added by including their names in the
`./ms_graph_tb_extract/supported_types.txt` and
`./ms_graph_tb_extract/supported_paths.txt` files, respectively.

To manually extract types, download the
[raw `openapi.yaml` file](https://github.com/microsoftgraph/msgraph-metadata/raw/refs/heads/master/openapi/v1.0/openapi.yaml),
then run `cargo run --manifest-path ms_graph_tb_extract/Cargo.toml path/to/openapi.yaml .`
from the directory with this README. The generated code will not have any
formatting by default, so run `cargo clippy --fix` and `cargo fmt` before
viewing or committing the new code.
