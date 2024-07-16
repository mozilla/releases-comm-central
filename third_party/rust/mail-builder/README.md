# mail-builder

[![crates.io](https://img.shields.io/crates/v/mail-builder)](https://crates.io/crates/mail-builder)
[![build](https://github.com/stalwartlabs/mail-builder/actions/workflows/rust.yml/badge.svg)](https://github.com/stalwartlabs/mail-builder/actions/workflows/rust.yml)
[![docs.rs](https://img.shields.io/docsrs/mail-builder)](https://docs.rs/mail-builder)
[![crates.io](https://img.shields.io/crates/l/mail-builder)](http://www.apache.org/licenses/LICENSE-2.0)

_mail-builder_ is a flexible **e-mail builder library** written in Rust. It includes the following features:

- Generates **e-mail** messages conforming to the Internet Message Format standard (_RFC 5322_).
- Full **MIME** support (_RFC 2045 - 2049_) with automatic selection of the most optimal encoding for each message body part.
- **Fast Base64 encoding** based on Chromium's decoder ([the fastest non-SIMD encoder](https://github.com/lemire/fastbase64)).
- No dependencies (`gethostname` is optional).

Please note that this library does not support sending or parsing e-mail messages as these functionalities are provided by the crates [`mail-send`](https://crates.io/crates/mail-send) and [`mail-parser`](https://crates.io/crates/mail-parser).

## Usage Example

Build a simple e-mail message with a text body and one attachment:

```rust
    // Build a simple text message with a single attachment
    let eml = MessageBuilder::new()
        .from(("John Doe", "john@doe.com"))
        .to("jane@doe.com")
        .subject("Hello, world!")
        .text_body("Message contents go here.")
        .attachment("image/png", "image.png", [1, 2, 3, 4].as_ref())
        .write_to_string()
        .unwrap();
        
    // Print raw message
    println!("{}", eml);
```

More complex messages with grouped addresses, inline parts and 
multipart/alternative sections can also be easily built:

```rust
    // Build a multipart message with text and HTML bodies,
    // inline parts and attachments.
    MessageBuilder::new()
        .from(("John Doe", "john@doe.com"))

        // To recipients
        .to(vec![
            ("Antoine de Saint-Exupéry", "antoine@exupery.com"),
            ("안녕하세요 세계", "test@test.com"),
            ("Xin chào", "addr@addr.com"),
        ])

        // BCC recipients using grouped addresses
        .bcc(vec![
            (
                "My Group",
                vec![
                    ("ASCII name", "addr1@addr7.com"),
                    ("ハロー・ワールド", "addr2@addr6.com"),
                    ("áéíóú", "addr3@addr5.com"),
                    ("Γειά σου Κόσμε", "addr4@addr4.com"),
                ],
            ),
            (
                "Another Group",
                vec![
                    ("שלום עולם", "addr5@addr3.com"),
                    ("ñandú come ñoquis", "addr6@addr2.com"),
                    ("Recipient", "addr7@addr1.com"),
                ],
            ),
        ])

        // Set RFC and custom headers
        .subject("Testing multipart messages") 
        .in_reply_to(vec!["message-id-1", "message-id-2"])
        .header("List-Archive", URL::new("http://example.com/archive"))

        // Set HTML and plain text bodies
        .text_body("This is the text body!\n") 
        .html_body("<p>HTML body with <img src=\"cid:my-image\"/>!</p>") 

        // Include an embedded image as an inline part
        .inline("image/png", "cid:my-image", [0, 1, 2, 3, 4, 5].as_ref())
        .attachment("text/plain", "my fíle.txt", "Attachment contents go here.") 

        // Add text and binary attachments
        .attachment(
            "text/plain",
            "ハロー・ワールド",
            b"Binary contents go here.".as_ref(),
        )

        // Write the message to a file
        .write_to(File::create("message.eml").unwrap())
        .unwrap();
```

Nested MIME body structures can be created using the `body` method:

```rust
    // Build a nested multipart message
    MessageBuilder::new()
        .from(Address::new_address("John Doe".into(), "john@doe.com"))
        .to(Address::new_address("Jane Doe".into(), "jane@doe.com"))
        .subject("Nested multipart message")

        // Define the nested MIME body structure
        .body(MimePart::new(
            "multipart/mixed",
            vec![
                MimePart::new("text/plain", "Part A contents go here...").inline(),
                MimePart::new(
                    "multipart/mixed",
                    vec![
                        MimePart::new(
                            "multipart/alternative",
                            vec![
                                MimePart::new(
                                    "multipart/mixed",
                                    vec![
                                        MimePart::new("text/plain", "Part B contents go here...").inline(),
                                        MimePart::new(
                                            "image/jpeg",
                                            "Part C contents go here...".as_bytes(),
                                        )
                                        .inline(),
                                        MimePart::new("text/plain", "Part D contents go here...").inline(),
                                    ],
                                ),
                                MimePart::new(
                                    "multipart/related",
                                    vec![
                                        MimePart::new("text/html", "Part E contents go here...").inline(),
                                        MimePart::new(
                                            "image/jpeg",
                                            "Part F contents go here...".as_bytes(),
                                        ),
                                    ],
                                ),
                            ],
                        ),
                        MimePart::new("image/jpeg", "Part G contents go here...".as_bytes())
                            .attachment("image_G.jpg"),
                        MimePart::new(
                            "application/x-excel",
                            "Part H contents go here...".as_bytes(),
                        ),
                        MimePart::new(
                            "x-message/rfc822",
                            "Part J contents go here...".as_bytes(),
                        ),
                    ],
                ),
                MimePart::new("text/plain", "Part K contents go here...").inline(),
            ],
        ))
        
        // Write the message to a file
        .write_to(File::create("nested-message.eml").unwrap())
        .unwrap();
```

## Testing

To run the testsuite:

```bash
 $ cargo test --all-features
```

or, to run the testsuite with MIRI:

```bash
 $ cargo +nightly miri test --all-features
```

## License

Licensed under either of

 * Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or http://www.apache.org/licenses/LICENSE-2.0)
 * MIT license ([LICENSE-MIT](LICENSE-MIT) or http://opensource.org/licenses/MIT)

at your option.

## Copyright

Copyright (C) 2020-2022, Stalwart Labs Ltd.

See [COPYING] for the license.

[COPYING]: https://github.com/stalwartlabs/mail-builder/blob/main/COPYING
