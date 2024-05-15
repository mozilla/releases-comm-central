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

use mail_builder::{headers::url::URL, MessageBuilder};

fn main() {
    // Build a multipart message with text and HTML bodies,
    // inline parts and attachments.
    MessageBuilder::new()
        .from(("John Doe", "john@doe.com"))
        .to(vec![
            // To recipients
            ("Antoine de Saint-Exupéry", "antoine@exupery.com"),
            ("안녕하세요 세계", "test@test.com"),
            ("Xin chào", "addr@addr.com"),
        ])
        .bcc(vec![
            // BCC recipients using grouped addresses
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
        .subject("Testing multipart messages") // Set RFC and custom headers
        .in_reply_to(vec!["message-id-1", "message-id-2"])
        .header("List-Archive", URL::new("http://example.com/archive"))
        .text_body("This is the text body!\n") // Set HTML and plain text bodies
        .html_body("<p>HTML body with <img src=\"cid:my-image\"/>!</p>") // Include an embedded image as an inline part
        .inline("image/png", "cid:my-image", [0, 1, 2, 3, 4, 5].as_ref())
        .attachment("text/plain", "my fíle.txt", "Attachment contents go here.") // Add a text and a binary attachment
        .attachment(
            "text/plain",
            "ハロー・ワールド",
            b"Binary contents go here.".as_ref(),
        )
        // Write the message to a file
        .write_to(File::create("message.eml").unwrap())
        .unwrap();
}
