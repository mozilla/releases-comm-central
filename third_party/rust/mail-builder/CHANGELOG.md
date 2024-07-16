mail-builder 0.3.2
================================
- Made `gethostname` crate optional.

mail-builder 0.3.1
================================
- Added `MimePart::transfer_encoding` method to disable automatic Content-Transfer-Encoding detection and treat it as a raw MIME part.

mail-builder 0.3.0
================================
- Replaced all `Multipart::new*` methods with a single `Multipart::new` method.

mail-builder 0.2.4
================================
- Added "Ludicrous mode" unsafe option for fast encoding.

mail-builder 0.2.3
================================
- Removed chrono dependency.

mail-builder 0.2.2
================================
- Fix: Generate valid Message-IDs

mail-builder 0.2.1
================================
- Fixed URL serializing bug.
- Headers are stored in a `Vec` instead of `BTreeMap`.

mail-builder 0.2.0
================================
- Improved API
- Added `write_to_vec` and `write_to_string`.

mail-builder 0.1.3
================================
- Bug fixes.
- Headers are written sorted alphabetically.
- Improved ID boundary generation.
- Encoding type detection for `[u8]` text parts.
- Optimised quoted-printable encoding.

mail-builder 0.1.2
================================
- All functions now take `impl Cow<str>`.

mail-builder 0.1.1
================================
- API improvements.

mail-builder 0.1.0
================================
- Initial release.
