# ms_graph_tb

Rust representations of
[Microsoft Graph API](https://learn.microsoft.com/en-us/graph/api/overview)
types and basic requests, primarily intended for use with Thunderbird.

This crate is currently under heavy development, and makes no stability
guarantees. The intent is to generate as much of it as practical from the
[OpenAPI representation](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml)
using the `ms_graph_tb_extract` program. To extract types, download the
[raw `openapi.yaml` file](https://github.com/microsoftgraph/msgraph-metadata/raw/refs/heads/master/openapi/v1.0/openapi.yaml),
then run `cargo run --manifest-path ms_graph_tb_extract/Cargo.toml path/to/openapi.yaml .`
from the directory with this README. The generated code will not have any
formatting by default, so run `cargo clippy --fix` and `cargo fmt` before
viewing or committing the new code. Support for extracting more types can be
added by including their names in the `SUPPORTED_TYPES` constant near the top of
`ms_graph_tb_extract/src/main.rs`.
