/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::collections::HashMap;

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{DeserializeOwned, Error as _},
    ser::Error as _,
};
use serde_json::{Value, value::RawValue};

use crate::Operation;

/// The endpoint location for Graph API batch operations.
/// See <https://learn.microsoft.com/en-us/graph/json-batching>
pub const GRAPH_BATCH_ENDPOINT: &str = "/v1.0/$batch";

/// The top level structure of a Graph API batch request.
///
/// See <https://learn.microsoft.com/en-us/graph/json-batching>
#[derive(Debug, Serialize, Eq, PartialEq)]
pub struct BatchRequest {
    requests: Vec<BatchRequestItem>,
}

/// A single Graph API batch request item.
///
/// See <https://learn.microsoft.com/en-us/graph/json-batching>
#[derive(Debug, Serialize, Eq, PartialEq)]
pub struct BatchRequestItem {
    // Note: We are forcing IDs to be numeric here and will fail if an ID is
    // non-numeric. This is because the current implementation needs to order by
    // ID to maintain the association between input and output data.
    #[serde(serialize_with = "serialize_integer_as_string")]
    id: usize,
    method: String,
    url: String,
    headers: HashMap<String, String>,
    #[serde(serialize_with = "serialize_as_json")]
    body: String,
}

/// The top level structure of a Graph API batch response.
///
/// See <https://learn.microsoft.com/en-us/graph/json-batching>
#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct BatchResponse<T> {
    pub responses: Vec<BatchResponseItem<T>>,
}

/// A single Graph API batch response item.
///
/// See <https://learn.microsoft.com/en-us/graph/json-batching>
#[derive(Debug, Deserialize, Eq, PartialEq)]
pub struct BatchResponseItem<T> {
    // Note: We are forcing IDs to be numeric here and deserialization
    // will fail if any ID is not parseable as an integer. This is because
    // the current implementation maintains the ordering between requests
    // and responses.
    #[serde(deserialize_with = "deserialize_integer_from_string")]
    pub id: usize,
    #[serde(deserialize_with = "deserialize_status_code_from_integer")]
    pub status: http::StatusCode,
    pub headers: HashMap<String, String>,
    pub body: T,
}

impl BatchRequest {
    /// Create a new Graph API [`BatchRequest`] from a collection of [`Operation`]s.
    ///
    /// This will construct a new Graph API batch request. Each item will be
    /// assigned an integer ID based on its order in the provided sequence.
    pub fn new<Op>(operations: Vec<Op>) -> BatchRequest
    where
        Op: Operation,
    {
        let requests = operations
            .into_iter()
            .enumerate()
            .filter_map(|(index, operation)| {
                let id = index;
                let method = <Op as Operation>::METHOD.to_string();

                let request = operation.build_request().ok()?;
                let url = request.uri().path().replace("/v1.0", "");

                let headers = request
                    .headers()
                    .iter()
                    .filter_map(|(k, v)| Some((k.to_string(), v.to_str().ok()?.to_string())))
                    .collect::<HashMap<String, String>>();
                let body = String::from_utf8(request.into_body()).ok()?;

                Some(BatchRequestItem {
                    id,
                    method,
                    url,
                    headers,
                    body,
                })
            })
            .collect();

        BatchRequest { requests }
    }
}

impl<T: DeserializeOwned> BatchResponse<T> {
    /// Create a new Graph API [`BatchResponse`] from JSON data.
    ///
    /// This implementation assumes that the IDs associated with the individual
    /// batch response items are integers, as assigned by [`BatchRequest::new`].
    /// The IDs are parsed as integers and the response items are ordered according
    /// to the order of those IDs. This will maintain the order of operations from
    /// a request created with [`BatchRequest::new`]. If any IDs cannot be parsed
    /// as integers, we fail the entire operation.
    pub fn new_from_json_slice(bytes: &[u8]) -> Result<Self, serde_json::Error> {
        let mut batch_response: BatchResponse<T> = serde_json::from_slice(bytes)?;

        // BatchRequest assigns IDs in numeric order. Order the response by
        // its ID so the indices align.
        batch_response.responses.sort_by_key(|x| x.id);
        Ok(batch_response)
    }
}

fn serialize_integer_as_string<S>(v: &usize, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    v.to_string().serialize(s)
}

fn serialize_as_json<S>(json: &str, s: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let v: &RawValue =
        serde_json::from_str(json).map_err(|_| S::Error::custom("Input is not valid JSON."))?;
    v.serialize(s)
}

fn deserialize_integer_from_string<'de, D>(deserializer: D) -> Result<usize, D::Error>
where
    D: Deserializer<'de>,
{
    let v = Value::deserialize(deserializer)?;
    let n_str = v
        .as_str()
        .ok_or(D::Error::custom(format!("Failed to read value {v}")))?;
    let n = n_str
        .parse::<usize>()
        .map_err(|_| D::Error::custom(format!("Failed to parse integer id from {v}")))?;
    Ok(n)
}

fn deserialize_status_code_from_integer<'de, D>(
    deserializer: D,
) -> Result<http::StatusCode, D::Error>
where
    D: Deserializer<'de>,
{
    let v = Value::deserialize(deserializer)?;
    let code = v
        .as_u64()
        .and_then(|c| u16::try_from(c).ok())
        .ok_or(D::Error::custom(format!(
            "Failed to parse status code from {v}"
        )))?;
    let code = http::StatusCode::from_u16(code)
        .map_err(|_| D::Error::custom(format!("Invalid status code {code}")))?;
    Ok(code)
}

#[cfg(test)]
mod test {
    use std::collections::HashMap;

    use http::request::Builder;
    use serde::Deserialize;

    use crate::{
        Operation,
        batching::{BatchRequest, BatchResponse, BatchResponseItem},
    };

    struct TestOp;

    #[derive(Deserialize, Debug, Eq, PartialEq)]
    struct TestResponse {
        a: i32,
    }

    impl Operation for TestOp {
        const METHOD: http::Method = http::Method::GET;

        type Response<'response> = TestResponse;

        fn build_request(self) -> Result<http::Request<Vec<u8>>, crate::Error> {
            Ok(Builder::new()
                .uri("http://example.com/a")
                .method(http::Method::GET)
                .header("Content-Type", "application/octet-stream")
                .body(r#"{"a":1}"#.as_bytes().to_vec())
                .unwrap())
        }
    }

    #[test]
    fn test_make_batch_request() {
        let operations = vec![TestOp, TestOp];
        let batch_request = BatchRequest::new(operations);
        let json = serde_json::to_string(&batch_request).unwrap();

        let expected = r#"{"requests":[{"id":"0","method":"GET","url":"/a","headers":{"content-type":"application/octet-stream"},"body":{"a":1}},{"id":"1","method":"GET","url":"/a","headers":{"content-type":"application/octet-stream"},"body":{"a":1}}]}"#;
        assert_eq!(json, expected);
    }

    #[test]
    fn test_read_batch_response() {
        let input = r#"{"responses":[{"id":"1","status":200,"headers":{"content-type":"application/octet-stream"},"body":{"a":1}},{"id":"0","status":200,"headers":{"content-type":"application/octet-stream"},"body":{"a":0}}]}"#;

        let batch_response: BatchResponse<TestResponse> =
            BatchResponse::new_from_json_slice(input.as_bytes()).unwrap();

        // Note the ordering difference: Responses can come back from Graph API
        // in any order, so we make sure our reading of batch responses orders
        // the incoming data by id.
        let expected = BatchResponse {
            responses: vec![
                BatchResponseItem {
                    id: 0,
                    status: http::StatusCode::OK,
                    headers: HashMap::from_iter([(
                        "content-type".to_string(),
                        "application/octet-stream".to_string(),
                    )]),
                    body: TestResponse { a: 0 },
                },
                BatchResponseItem {
                    id: 1,
                    status: http::StatusCode::OK,
                    headers: HashMap::from_iter([(
                        "content-type".to_string(),
                        "application/octet-stream".to_string(),
                    )]),
                    body: TestResponse { a: 1 },
                },
            ],
        };

        assert_eq!(batch_response, expected);
    }
}
