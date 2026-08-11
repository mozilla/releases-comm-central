/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// EDITS TO THIS FILE WILL BE OVERWRITTEN

#![doc = "Provides operations to manage the calendars property of the microsoft.graph.user entity.\n\nAuto-generated from [Microsoft OpenAPI metadata](https://github.com/microsoftgraph/msgraph-metadata/blob/master/openapi/v1.0/openapi.yaml) via `ms_graph_tb_extract openapi.yaml ms_graph_tb/`."]
pub mod events;
use crate::odata::{ExpansionList, Selection};
use crate::types::calendar::{Calendar, CalendarExpand, CalendarSelection};
use crate::{Error, Expand, Operation, OperationBody, Select};
use form_urlencoded::Serializer;
use http::method::Method;
#[derive(Debug)]
struct TemplateExpressions {
    endpoint: String,
    calendar_id: String,
}
fn format_path(template_expressions: &TemplateExpressions) -> String {
    let TemplateExpressions {
        endpoint,
        calendar_id,
    } = template_expressions;
    let endpoint = endpoint.trim_end_matches('/');
    format!("{endpoint}/me/calendars/{calendar_id}")
}
#[doc = "Get calendars from me\n\nThe user's calendars. Read-only. Nullable."]
#[derive(Debug)]
pub struct Get {
    template_expressions: TemplateExpressions,
    selection: Selection<CalendarSelection>,
    expansion: ExpansionList<CalendarExpand>,
}
impl Get {
    #[must_use]
    pub fn new(endpoint: String, calendar_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                calendar_id,
            },
            selection: Selection::default(),
            expansion: ExpansionList::default(),
        }
    }
}
impl Operation for Get {
    const METHOD: Method = Method::GET;
    type Response = Calendar;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        if let Some((select, selection)) = self.selection.pair() {
            params.append_pair(select, &selection);
        }
        if let Some((expand, expansion)) = self.expansion.pair() {
            params.append_pair(expand, &expansion);
        }
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let uri = if params.is_empty() {
            path.parse::<http::uri::Uri>().unwrap()
        } else {
            format!("{path}?{params}")
                .parse::<http::uri::Uri>()
                .unwrap()
        };
        let request = http::Request::builder().uri(uri).method(Self::METHOD);
        let request = request.body(vec![])?;
        Ok(request)
    }
}
impl Select for Get {
    type Properties = CalendarSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
impl Expand for Get {
    type Properties = CalendarExpand;
    fn expand<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.expansion.expand(properties);
    }
    fn extend_expand<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.expansion.extend(properties);
    }
}
#[doc = "Update the navigation property calendars in me"]
#[derive(Debug)]
pub struct Patch {
    template_expressions: TemplateExpressions,
    body: OperationBody<Calendar>,
    selection: Selection<CalendarSelection>,
}
impl Patch {
    #[must_use]
    pub fn new(endpoint: String, calendar_id: String, body: OperationBody<Calendar>) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                calendar_id,
            },
            body,
            selection: Selection::default(),
        }
    }
}
impl Operation for Patch {
    const METHOD: Method = Method::PATCH;
    type Response = Calendar;
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let mut params = Serializer::new(String::new());
        if let Some((select, selection)) = self.selection.pair() {
            params.append_pair(select, &selection);
        }
        let params = params.finish();
        let path = format_path(&self.template_expressions);
        let uri = if params.is_empty() {
            path.parse::<http::uri::Uri>().unwrap()
        } else {
            format!("{path}?{params}")
                .parse::<http::uri::Uri>()
                .unwrap()
        };
        let (body, content_type) = match self.body {
            OperationBody::JSON(body) => {
                (serde_json::to_vec(&body)?, String::from("application/json"))
            }
            OperationBody::Other { body, content_type } => (body, content_type),
        };
        let request = http::Request::builder()
            .uri(uri)
            .method(Self::METHOD)
            .header("Content-Type", content_type);
        let request = request.body(body)?;
        Ok(request)
    }
}
impl Select for Patch {
    type Properties = CalendarSelection;
    fn select<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.select(properties);
    }
    fn extend_selection<P: IntoIterator<Item = Self::Properties>>(&mut self, properties: P) {
        self.selection.extend(properties);
    }
}
#[doc = "Delete calendar\n\nDelete a calendar other than the default calendar.\n\nMore information available via [Microsoft documentation](https://learn.microsoft.com/graph/api/calendar-delete?view=graph-rest-1.0)."]
#[derive(Debug)]
pub struct Delete {
    template_expressions: TemplateExpressions,
}
impl Delete {
    #[must_use]
    pub fn new(endpoint: String, calendar_id: String) -> Self {
        Self {
            template_expressions: TemplateExpressions {
                endpoint,
                calendar_id,
            },
        }
    }
}
impl Operation for Delete {
    const METHOD: Method = Method::DELETE;
    type Response = ();
    fn build_request(self) -> Result<http::Request<Vec<u8>>, Error> {
        let uri = format_path(&self.template_expressions)
            .parse::<http::uri::Uri>()
            .unwrap();
        let request = http::Request::builder().uri(uri).method(Self::METHOD);
        let request = request.body(vec![])?;
        Ok(request)
    }
}
