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

use mail_builder::MessageBuilder;

fn main() {
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
}
