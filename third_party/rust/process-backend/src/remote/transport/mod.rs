use super::super::remote;
use remote::io;
use serde::{Deserialize, Serialize};

#[cfg(feature = "postcard")]
pub mod postcard;

pub trait Backend: core::fmt::Debug {
    fn max_response_output_len(&self) -> usize;
    fn send_request<'output, Req: Serialize, Resp: Deserialize<'output>>(
        &'output mut self,
        req: Req,
    ) -> Result<Resp, BackendError>;
}

pub trait Executor: core::fmt::Debug {
    fn read_request<'args, D: Deserialize<'args>>(&'args mut self) -> Result<D, ExecutorError>;
    fn write_response<S: Serialize>(&mut self, resp: S) -> Result<(), ExecutorError>;
}

#[derive(Debug, thiserror::Error, Deserialize, Serialize)]
pub enum BackendError {
    #[error("an error occurred serializing the request")]
    SerializeRequest(#[source] SerializeError),
    #[error("an error occurred deserializing the response")]
    DeserializeResponse(#[source] DeserializeError),
}

#[derive(Debug, thiserror::Error, Deserialize, Serialize)]
pub enum ExecutorError {
    #[error("an error occurred deserializing the request")]
    DeserializeRequest(#[source] DeserializeError),
    #[error("an error occurred serializing the response")]
    SerializeResponse(#[source] SerializeError),
}

#[derive(Debug, thiserror::Error, serde::Deserialize, serde::Serialize)]
pub enum SerializeError {
    #[cfg(feature = "postcard")]
    #[error("a Postcard-specific serialize error occurred")]
    Postcard(#[source] postcard::Error),
    #[error("an I/O occurred during serialization")]
    Io(#[source] io::Error),
}

#[derive(Debug, thiserror::Error, serde::Deserialize, serde::Serialize)]
pub enum DeserializeError {
    #[cfg(feature = "postcard")]
    #[error("a Postcard-specific deserialize error occurred")]
    Postcard(#[source] postcard::Error),
    #[error("an I/O occurred during deserialization")]
    Io(#[source] io::Error),
    #[error("the I/O buffer was too small")]
    BufferTooSmall,
}
