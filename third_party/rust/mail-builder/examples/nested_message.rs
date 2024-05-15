/*
 * Copyright Stalwart Labs Ltd. See the COPYING
 * file at the top-level directory of this distribution.
 *
 * Licensed under the Apache License, Version 2.0 <LICENSE-APACHE or
 * https://www.apache.org/licenses/LICENSE-2.0> or the MIT license
 * <LICENSE-MIT or https://opensource.org/licenses/MIT>, at your
 * option. This file may not be copied, modified, or distributed
 * except according to those terms.
 */

use std::fs::File;

use mail_builder::{headers::address::Address, mime::MimePart, MessageBuilder};

fn main() {
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
                                        MimePart::new("text/plain", "Part B contents go here...")
                                            .inline(),
                                        MimePart::new(
                                            "image/jpeg",
                                            "Part C contents go here...".as_bytes(),
                                        )
                                        .inline(),
                                        MimePart::new("text/plain", "Part D contents go here...")
                                            .inline(),
                                    ],
                                ),
                                MimePart::new(
                                    "multipart/related",
                                    vec![
                                        MimePart::new("text/html", "Part E contents go here...")
                                            .inline(),
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
                        MimePart::new("x-message/rfc822", "Part J contents go here...".as_bytes()),
                    ],
                ),
                MimePart::new("text/plain", "Part K contents go here...").inline(),
            ],
        ))
        // Write the message to a file
        .write_to(File::create("nested-message.eml").unwrap())
        .unwrap();
}
