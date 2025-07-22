# Exchange Web Services

This rust crate holds types that represent data structures and operations for
the [Exchange Web Services
API](https://learn.microsoft.com/en-us/exchange/client-developer/web-service-reference/ews-reference-for-exchange),
as well as the necessary infrastructure to serialize and deserialize them
to/from XML.

## Documentation

The Cargo documentation for this repository is not currently hosted online. It
can be accessed locally after cloning this repository and generating it:

```bash
git clone https://github.com/thunderbird/ews-rs.git
cd ews-rs
cargo doc --open
```

## Report issues

The GitHub issue tracker for this repository is disabled to help us handle
EWS-related Thunderbird-adjacent bugs more easily. To report an issue or file a
feature request for this crate, please do so in [Bugzilla under
`Networking:Exchange`](https://bugzilla.mozilla.org/enter_bug.cgi?product=MailNews%20Core&component=Networking:%20Exchange).

## Minimum Supported Rust Version

The `ews` crate follows the [Firefox MSRV policy](https://firefox-source-docs.mozilla.org/writing-rust-code/update-policy.html#minimum-supported-rust-version).
It is therefore safe to assume the crate's effective MSRV is the one matching
the latest Firefox release.

## License

The `ews` crate is available under the terms of the Mozilla Public License,
version 2.0. See either our [LICENSE](LICENSE) file or [https://www.mozilla.org/en-US/MPL/2.0/].
