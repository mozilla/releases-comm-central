use core::ffi::CStr;

/// A version of &CStr that is serialized and deserialized with null terminator
///
/// The default Serde `Serialize` for this serializes it without the NULL terminator, and as a
/// result `Deserialize` is only implemented for `CString` but not `&CStr` (since you can't have
/// a `&CStr` with no null terminator.
///
/// This is a wrapper around &CStr that serializes and deserializes the null terminator - which is
/// what we need for directly making syscalls.
#[derive(Debug)]
#[repr(transparent)]
pub(crate) struct CStrWithNull<'a>(&'a CStr);

impl<'a> From<CStrWithNull<'a>> for &'a CStr {
    fn from(value: CStrWithNull<'a>) -> Self {
        value.0
    }
}

impl<'a> From<&'a CStr> for CStrWithNull<'a> {
    fn from(value: &'a CStr) -> Self {
        Self(value)
    }
}

impl<'a> core::ops::Deref for CStrWithNull<'a> {
    type Target = CStr;
    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl<'a> serde::Serialize for CStrWithNull<'a> {
    fn serialize<S>(&self, serializer: S) -> core::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_bytes(self.0.to_bytes_with_nul())
    }
}

impl<'de: 'a, 'a> serde::Deserialize<'de> for CStrWithNull<'a> {
    fn deserialize<D>(deserializer: D) -> core::result::Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        struct Visitor<'a>(core::marker::PhantomData<&'a [u8]>);

        impl<'de: 'a, 'a> serde::de::Visitor<'de> for Visitor<'a> {
            type Value = CStrWithNull<'a>;

            fn expecting(&self, formatter: &mut core::fmt::Formatter) -> core::fmt::Result {
                write!(
                    formatter,
                    "a null-terminated byte slice borrowed from the Deserializer"
                )
            }

            fn visit_borrowed_bytes<E>(self, v: &'de [u8]) -> core::result::Result<Self::Value, E>
            where
                E: serde::de::Error,
            {
                CStr::from_bytes_with_nul(v).map(CStrWithNull).map_err(|_| {
                    serde::de::Error::invalid_value(serde::de::Unexpected::Bytes(v), &self)
                })
            }
        }

        deserializer.deserialize_bytes(Visitor(core::marker::PhantomData))
    }
}
