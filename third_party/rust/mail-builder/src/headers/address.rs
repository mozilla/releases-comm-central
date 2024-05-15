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

use std::borrow::Cow;

use crate::encoders::encode::rfc2047_encode;

use super::Header;

/// RFC5322 e-mail address
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct EmailAddress<'x> {
    pub name: Option<Cow<'x, str>>,
    pub email: Cow<'x, str>,
}

/// RFC5322 grouped e-mail addresses
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct GroupedAddresses<'x> {
    pub name: Option<Cow<'x, str>>,
    pub addresses: Vec<Address<'x>>,
}

/// RFC5322 address
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum Address<'x> {
    Address(EmailAddress<'x>),
    Group(GroupedAddresses<'x>),
    List(Vec<Address<'x>>),
}

impl<'x> Address<'x> {
    /// Create an RFC5322 e-mail address
    pub fn new_address(
        name: Option<impl Into<Cow<'x, str>>>,
        email: impl Into<Cow<'x, str>>,
    ) -> Self {
        Address::Address(EmailAddress {
            name: name.map(|v| v.into()),
            email: email.into(),
        })
    }

    /// Create an RFC5322 grouped e-mail address
    pub fn new_group(name: Option<impl Into<Cow<'x, str>>>, addresses: Vec<Address<'x>>) -> Self {
        Address::Group(GroupedAddresses {
            name: name.map(|v| v.into()),
            addresses,
        })
    }

    /// Create an address list
    pub fn new_list(items: Vec<Address<'x>>) -> Self {
        Address::List(items)
    }

    pub fn unwrap_address(&self) -> &EmailAddress<'x> {
        match self {
            Address::Address(address) => address,
            _ => panic!("Address is not an EmailAddress"),
        }
    }
}

impl<'x> From<(&'x str, &'x str)> for Address<'x> {
    fn from(value: (&'x str, &'x str)) -> Self {
        Address::Address(EmailAddress {
            name: Some(value.0.into()),
            email: value.1.into(),
        })
    }
}

impl<'x> From<(String, String)> for Address<'x> {
    fn from(value: (String, String)) -> Self {
        Address::Address(EmailAddress {
            name: Some(value.0.into()),
            email: value.1.into(),
        })
    }
}

impl<'x> From<&'x str> for Address<'x> {
    fn from(value: &'x str) -> Self {
        Address::Address(EmailAddress {
            name: None,
            email: value.into(),
        })
    }
}

impl<'x> From<String> for Address<'x> {
    fn from(value: String) -> Self {
        Address::Address(EmailAddress {
            name: None,
            email: value.into(),
        })
    }
}

impl<'x, T> From<Vec<T>> for Address<'x>
where
    T: Into<Address<'x>>,
{
    fn from(value: Vec<T>) -> Self {
        Address::new_list(value.into_iter().map(|x| x.into()).collect())
    }
}

impl<'x, T, U> From<(U, Vec<T>)> for Address<'x>
where
    T: Into<Address<'x>>,
    U: Into<Cow<'x, str>>,
{
    fn from(value: (U, Vec<T>)) -> Self {
        Address::Group(GroupedAddresses {
            name: Some(value.0.into()),
            addresses: value.1.into_iter().map(|x| x.into()).collect(),
        })
    }
}

impl<'x> Header for Address<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        match self {
            Address::Address(address) => {
                address.write_header(&mut output, bytes_written)?;
            }
            Address::Group(group) => {
                group.write_header(&mut output, bytes_written)?;
            }
            Address::List(list) => {
                for (pos, address) in list.iter().enumerate() {
                    if bytes_written
                        + (match address {
                            Address::Address(address) => {
                                address.email.len()
                                    + address.name.as_ref().map_or(0, |n| n.len() + 3)
                                    + 2
                            }
                            Address::Group(group) => {
                                group.name.as_ref().map_or(0, |name| name.len() + 2)
                            }
                            Address::List(_) => 0,
                        })
                        >= 76
                    {
                        output.write_all(b"\r\n\t")?;
                        bytes_written = 1;
                    }

                    match address {
                        Address::Address(address) => {
                            bytes_written += address.write_header(&mut output, bytes_written)?;
                            if pos < list.len() - 1 {
                                output.write_all(b", ")?;
                                bytes_written += 1;
                            }
                        }
                        Address::Group(group) => {
                            bytes_written += group.write_header(&mut output, bytes_written)?;
                            if pos < list.len() - 1 {
                                output.write_all(b"; ")?;
                                bytes_written += 1;
                            }
                        }
                        Address::List(_) => unreachable!(),
                    }
                }
            }
        }
        output.write_all(b"\r\n")?;
        Ok(0)
    }
}

impl<'x> Header for EmailAddress<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        if let Some(name) = &self.name {
            bytes_written += rfc2047_encode(name, &mut output)?;
            if bytes_written + self.email.len() + 2 >= 76 {
                output.write_all(b"\r\n\t")?;
                bytes_written = 1;
            } else {
                output.write_all(b" ")?;
                bytes_written += 1;
            }
        }

        output.write_all(b"<")?;
        output.write_all(self.email.as_bytes())?;
        output.write_all(b">")?;

        Ok(bytes_written + self.email.len() + 2)
    }
}

impl<'x> Header for GroupedAddresses<'x> {
    fn write_header(
        &self,
        mut output: impl std::io::Write,
        mut bytes_written: usize,
    ) -> std::io::Result<usize> {
        if let Some(name) = &self.name {
            bytes_written += rfc2047_encode(name, &mut output)? + 2;
            output.write_all(b": ")?;
        }

        for (pos, address) in self.addresses.iter().enumerate() {
            let address = address.unwrap_address();

            if bytes_written
                + address.email.len()
                + address.name.as_ref().map_or(0, |n| n.len() + 3)
                + 2
                >= 76
            {
                output.write_all(b"\r\n\t")?;
                bytes_written = 1;
            }

            bytes_written += address.write_header(&mut output, bytes_written)?;
            if pos < self.addresses.len() - 1 {
                output.write_all(b", ")?;
                bytes_written += 2;
            }
        }

        Ok(bytes_written)
    }
}
