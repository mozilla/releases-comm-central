use regex::Regex;
use serde::ser::Serialize;
use serde_json::ser::{CharEscape, Formatter};
use std::io::Write;
use std::string::FromUtf8Error as Utf8Error;
use thiserror::Error;

/// Implements the [serde_json::ser::Formatter] trait for serializing [serde_json::Value] objects into their
/// canonical string representation.
///
/// # Example
///
/// ```
/// use serde::Serialize;
/// use serde_json::json;
/// use canonical_json::JsonFormatter;
///
/// let input = json!(vec!["one", "two", "three"]);
/// let mut bytes = vec![];
/// let mut serializer = serde_json::Serializer::with_formatter(&mut bytes, JsonFormatter);
/// input.serialize(&mut serializer).unwrap();
///
/// assert_eq!(String::from_utf8(bytes).unwrap(), r#"["one","two","three"]"#);
/// ```
pub struct JsonFormatter;

#[derive(Debug, Error)]
pub enum CanonicalJSONError {
    #[error("UTF-8 related error: {0}")]
    Utf8Error(#[from] Utf8Error),
    #[error("JSON related error: {0}")]
    JSONError(#[from] serde_json::error::Error),
}

impl Formatter for JsonFormatter {
    fn write_f64<W: ?Sized>(&mut self, writer: &mut W, value: f64) -> Result<(), std::io::Error>
    where
        W: Write,
    {
        format_number(writer, value)?;
        Ok(())
    }

    fn write_char_escape<W: ?Sized>(
        &mut self,
        writer: &mut W,
        char_escape: CharEscape,
    ) -> Result<(), std::io::Error>
    where
        W: Write,
    {
        match char_escape {
            CharEscape::Quote => {
                writer.write_all(b"\\\"")?;
            }
            CharEscape::ReverseSolidus => {
                writer.write_all(b"\\\\")?;
            }
            CharEscape::LineFeed => {
                writer.write_all(b"\\n")?;
            }
            CharEscape::Tab => {
                writer.write_all(b"\\t")?;
            }
            CharEscape::CarriageReturn => {
                writer.write_all(b"\\r")?;
            }
            CharEscape::Solidus => {
                writer.write_all(b"\\/")?;
            }
            CharEscape::Backspace => {
                writer.write_all(b"\\b")?;
            }
            CharEscape::FormFeed => {
                writer.write_all(b"\\f")?;
            }
            CharEscape::AsciiControl(number) => {
                static HEX_DIGITS: [u8; 16] = *b"0123456789abcdef";
                let bytes = &[
                    b'\\',
                    b'u',
                    b'0',
                    b'0',
                    HEX_DIGITS[(number >> 4) as usize],
                    HEX_DIGITS[(number & 0xF) as usize],
                ];
                return writer.write_all(bytes);
            }
        }

        Ok(())
    }

    fn write_string_fragment<W: ?Sized>(
        &mut self,
        writer: &mut W,
        fragment: &str,
    ) -> Result<(), std::io::Error>
    where
        W: Write,
    {
        let formatted_string = fragment
            .to_string()
            .escape_default()
            .to_string()
            .replace(r#"\'"#, "'");

        normalize_unicode(writer, formatted_string).and(Ok(()))
    }
}

fn format_number<W: ?Sized>(writer: &mut W, number: f64) -> Result<(), std::io::Error>
where
    W: Write,
{
    let formatted = format!("{:e}", number);
    let normalized = normalize_number(formatted);
    writer.write_all(&normalized.into_bytes())?;
    Ok(())
}

// force capital-E exponent, remove + signs and leading zeroes
fn normalize_number(input: String) -> String {
    // https://github.com/gibson042/canonicaljson-go/blob/b9eb21a76/encode.go#L506-L514
    let re = Regex::new("(?:E(?:[+]0*|(-|)0+)|e(?:[+]|(-|))0*)([0-9])").unwrap();
    re.replace_all(&input, "E$1$2$3").to_string()
}

/// look for \u{X} \u{XX}, \u{XXX}, \u{XXXX} to remove the curly braces
fn normalize_unicode<W: ?Sized>(
    writer: &mut W,
    serialized_string: String,
) -> Result<(), std::io::Error>
where
    W: Write,
{
    let mut string_iter = serialized_string.chars().peekable();

    while let Some(curr_char) = string_iter.next() {
        if curr_char == '\\' && string_iter.peek() == Some(&'u') {
            writer.write_all("\\u".as_bytes())?;
            string_iter.next();

            if string_iter.peek() == Some(&'{') {
                // consume at most 4 characters till '}' is found
                let mut characters = String::new();
                string_iter.next(); // skip the '{' for now
                let mut index = 0;

                while index < 6 && string_iter.peek() != Some(&'}') && string_iter.peek() != None {
                    match string_iter.peek() {
                        Some(character) => characters.push(*character),
                        None => break,
                    };

                    string_iter.next();
                    index += 1;
                }

                if string_iter.peek() == None {
                    // could not find '}' bracket so must include '{' and following characters
                    writer.write_all("{".as_bytes())?;
                    writer.write_all(&characters.into_bytes())?;
                } else if string_iter.peek() == Some(&'}') {
                    // found '}' - remove '{' and '}' but must pad zeros
                    if characters.is_empty() {
                        writer.write_all("{}".as_bytes())?;
                    } else {
                        if characters.len() > 4 {
                            // Surrogates pairs.
                            match hex::decode(format!("{:0>6}", characters)) {
                                Ok(v) => {
                                    let codepoint = (v[2] as u32)
                                        + ((v[1] as u32) << 8)
                                        + ((v[0] as u32) << 16);
                                    let high = ((codepoint - 0x10000) / 0x400) + 0xD800;
                                    let low = ((codepoint - 0x10000) % 0x400) + 0xDC00;
                                    writer.write_all(format!("{:x}", high).as_bytes())?;
                                    writer.write_all(format!("\\u{:x}", low).as_bytes())?;
                                }
                                Err(_) => {
                                    writer.write_all(&characters.into_bytes())?;
                                }
                            };
                        } else {
                            writer.write_all(&"0".repeat(4 - characters.len()).into_bytes())?;
                            writer.write_all(&characters.into_bytes())?;
                        }
                        string_iter.next(); // skip '}'
                    }
                }
            }

            continue;
        }

        writer.write_all(curr_char.to_string().as_bytes())?;
    }

    Ok(())
}

/// Serialize a JSON value to String
///
/// # Examples
/// ```rust
/// # use canonical_json::ser::to_string;
/// # use serde_json::json;
/// # fn main() {
///     to_string(&json!(null)); // returns "null"
///
///     to_string(&json!("test")); // returns "test"
///
///     to_string(&json!(10.0_f64.powf(21.0))); // returns "1e+21"
///
///     to_string(&json!({
///         "a": "a",
///         "id": "1",
///         "b": "b"
///     })); // returns "{"a":"a","b":"b","id":"1"}"; (orders object keys)
///
///     to_string(&json!(vec!["one", "two", "three"])); // returns "["one","two","three"]"
/// # }
///
/// ```
pub fn to_string(input: &serde_json::Value) -> Result<String, CanonicalJSONError> {
    let string = vec![];
    let mut serializer = serde_json::Serializer::with_formatter(string, JsonFormatter);
    input.serialize(&mut serializer)?;
    let serialized_string = String::from_utf8(serializer.into_inner())?;
    Ok(serialized_string)
}

#[cfg(test)]
mod tests {
    use super::to_string;
    use serde_json::json;

    macro_rules! test_canonical_json {
        ($v:tt, $e:expr) => {
            match to_string(&json!($v)) {
                Ok(serialized_string) => {
                    println!("serialized is {}", serialized_string);
                    assert_eq!(serialized_string, $e)
                },
                Err(error) => { panic!("error serializing input : {:?}", error) }
            };
        };
    }

    #[test]
    fn test_to_string() {
        test_canonical_json!(null, "null");
        test_canonical_json!((std::f64::NAN), "null");
        test_canonical_json!((std::f64::INFINITY), "null");
        test_canonical_json!((std::f64::NEG_INFINITY), "null");
        test_canonical_json!(true, "true");
        test_canonical_json!(false, "false");
        test_canonical_json!(0, "0");
        test_canonical_json!(123, "123");
        test_canonical_json!((-123), "-123");
        test_canonical_json!(23.1, "2.31E1");
        test_canonical_json!(23, "23");
        test_canonical_json!(1_f64, "1E0");
        test_canonical_json!(0_f64, "0E0");
        test_canonical_json!(23.0, "2.3E1");
        test_canonical_json!((-23.0), "-2.3E1");
        test_canonical_json!(2300, "2300");
        test_canonical_json!(0.00099, "9.9E-4");
        test_canonical_json!(0.000011, "1.1E-5");
        test_canonical_json!(0.0000011, "1.1E-6");
        test_canonical_json!(0.000001, "1E-6");
        test_canonical_json!(5.6, "5.6E0");
        test_canonical_json!(0.00000099, "9.9E-7");
        test_canonical_json!(0.0000001, "1E-7");
        test_canonical_json!(0.000000930258908, "9.30258908E-7");
        test_canonical_json!(0.00000000000068272, "6.8272E-13");
        test_canonical_json!((10.000_f64.powf(21.0)), "1E21");
        test_canonical_json!((10.0_f64.powi(20)), "1E20");
        test_canonical_json!((10.0_f64.powi(15) + 0.1), "1.0000000000000001E15");
        test_canonical_json!((10.0_f64.powi(16) * 1.1), "1.1E16");

        // serialize string
        test_canonical_json!("", r#""""#);
        //escape quotes
        test_canonical_json!(
            " Preserve single quotes'in string",
            r#"" Preserve single quotes'in string""#
        );
        test_canonical_json!(" Escapes quotes \" ", r#"" Escapes quotes \" ""#);
        test_canonical_json!("test", r#""test""#);
        // escapes backslashes
        test_canonical_json!("This\\and this", r#""This\\and this""#);
        // convert unicode characters to unicode escape sequences
        test_canonical_json!("I ❤ testing", r#""I \u2764 testing""#);

        // serialize does not alter certain strings (newline, tab, carriagereturn, forwardslashes)
        test_canonical_json!("This is a sentence.\n", r#""This is a sentence.\n""#);
        test_canonical_json!("This is a \t tab.", r#""This is a \t tab.""#);
        test_canonical_json!(
            "This is a \r carriage return char.",
            r#""This is a \r carriage return char.""#
        );
        test_canonical_json!("image/jpeg", r#""image/jpeg""#);
        test_canonical_json!("image//jpeg", r#""image//jpeg""#);
        // serialize preserves scientific notation number within string
        test_canonical_json!("frequency at 10.0e+04", r#""frequency at 10.0e+04""#);
        // serialize preserves invalid unicode escape sequence
        test_canonical_json!("I \\u{} testing", r#""I \\u{} testing""#);
        // serialize preserves opening curly brackets when invalid unicode escape sequence
        test_canonical_json!("I \\u{1234 testing", r#""I \\u{1234 testing""#);
        test_canonical_json!("I \\u{{12345}} testing", r#""I \\u{{12345}} testing""#);

        // surrogates pairs
        test_canonical_json!("𝄞", r#""\ud834\udd1e""#);
        test_canonical_json!("𝗠𝗼𝘇", r#""\ud835\udde0\ud835\uddfc\ud835\ude07""#);
        // lowest and highest
        test_canonical_json!("\u{10000} \u{10FFFF}", r#""\ud800\udc00 \udbff\udfff""#);

        // serialize object
        test_canonical_json!(
            {
                "a": {},
                "b": "b"
            },
            r#"{"a":{},"b":"b"}"#
        );

        // serialize object with keys ordered
        test_canonical_json!(
            {
                "a": "a",
                "id": "1",
                "b": "b"
            },
            r#"{"a":"a","b":"b","id":"1"}"#
        );

        // serialize deeply nested objects
        test_canonical_json!(
            {
                "a": json!({
                    "b": "b",
                    "a": "a",
                    "c": json!({
                        "b": "b",
                        "a": "a",
                        "c": ["b", "a", "c"],
                        "d": json!({ "b": "b", "a": "a" }),
                        "id": "1",
                        "e": 1,
                        "f": [2, 3, 1],
                        "g": json!({
                            "2": 2,
                            "3": 3,
                            "1": json!({
                                "b": "b",
                                "a": "a",
                                "c": "c",
                            })
                        })
                    })
                }),
                "id": "1"
            },
            concat!(
                r#"{"a":{"a":"a","b":"b","c":{"a":"a","b":"b","c":["b","a","c"],"#,
                r#""d":{"a":"a","b":"b"},"e":1,"f":[2,3,1],"#,
                r#""g":{"1":{"a":"a","b":"b","c":"c"},"2":2,"3":3},"id":"1"}},"id":"1"}"#
            )
        );

        test_canonical_json!(
            {
                "b": vec!["two", "three"],
                "a": vec!["zero", "one"]
            },
            r#"{"a":["zero","one"],"b":["two","three"]}"#
        );

        test_canonical_json!(
            {
                "b": { "d": "d", "c": "c" },
                "a": { "b": "b", "a": "a" },
            },
            r#"{"a":{"a":"a","b":"b"},"b":{"c":"c","d":"d"}}"#
        );

        // escapes unicode characters in object keys
        test_canonical_json!({"é": "check"}, r#"{"\u00e9":"check"}"#);

        test_canonical_json!(
            {
                "def": "bar",
                "abc": json!(0.000000930258908),
                "ghi": json!(1000000000000000000000.0_f64),
                "rust": "❤",
                "zoo": [
                    "zorilla",
                    "anteater"
                ]
            },
            r#"{"abc":9.30258908E-7,"def":"bar","ghi":1E21,"rust":"\u2764","zoo":["zorilla","anteater"]}"#
        );

        // serialize empty array
        test_canonical_json!([], "[]");

        // serialize array should preserve array order
        test_canonical_json!((vec!["one", "two", "three"]), r#"["one","two","three"]"#);

        test_canonical_json!((vec![json!({ "key": "✓" })]), r#"[{"key":"\u2713"}]"#);

        // escapes unicode values with 1 preceding zeros
        test_canonical_json!((vec![json!({ "key": "ę" })]), r#"[{"key":"\u0119"}]"#);

        // escapes unicode values with 2 preceding zeros
        test_canonical_json!((vec![json!({ "key": "é" })]), r#"[{"key":"\u00e9"}]"#);

        // serialize array preserves data
        test_canonical_json!(
            (vec![
                json!({ "foo": "bar", "last_modified": "12345", "id": "1" }),
                json!({ "bar": "baz", "last_modified": "45678", "id": "2" }),
            ]),
            r#"[{"foo":"bar","id":"1","last_modified":"12345"},{"bar":"baz","id":"2","last_modified":"45678"}]"#
        );

        // serialize does not add space separators
        test_canonical_json!(
            (vec![
                json!({ "foo": "bar", "last_modified": "12345", "id": "1" }),
                json!({ "bar": "baz", "last_modified": "45678", "id": "2" }),
            ]),
            r#"[{"foo":"bar","id":"1","last_modified":"12345"},{"bar":"baz","id":"2","last_modified":"45678"}]"#
        );
    }
}
