/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    Select, notnull,
    pagination::{DeltaItem, DeltaResponse},
    paths::me::calendars::calendar_id::events,
    types::event::EventSelection,
};
use protocol_shared::{
    EXCHANGE_MAX_PAGE_SIZE, ServerType, client::DoOperation,
    safe_xpcom::event_listener::SafeGraphCalendarEventListener,
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoSyncCalendarItems<'a> {
    pub listener: &'a SafeGraphCalendarEventListener,
    pub calendar_id: String,
    pub sync_state_token: Option<String>,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoSyncCalendarItems<'_>
{
    const NAME: &'static str = "sync calendar";
    type Okay = ();
    type Listener = SafeGraphCalendarEventListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let mut response = match self.sync_state_token {
            Some(ref token) => {
                let mut request = events::delta::GetDelta::try_from(token.as_str())?;
                request.set_max_page_size(EXCHANGE_MAX_PAGE_SIZE);
                client
                    .send_request_json_response(request, Default::default())
                    .await?
            }
            None => {
                let select_properties = vec![
                    EventSelection::Subject,
                    EventSelection::Start,
                    EventSelection::End,
                ];
                let base_url = client.base_api_url()?;
                let mut request =
                    events::delta::Get::new(base_url.to_string(), self.calendar_id.clone());
                request.set_max_page_size(EXCHANGE_MAX_PAGE_SIZE);
                request.select(select_properties);
                client
                    .send_request_json_response(request, Default::default())
                    .await?
            }
        };

        loop {
            let events = response.extract_response();

            for event in events {
                match event {
                    DeltaItem::Present(event) => {
                        let id =
                            event
                                .outlook_item
                                .entity
                                .id
                                .ok_or(XpComGraphError::Processing {
                                    message: "Event ID is not present.".to_string(),
                                })?;
                        let title = match event.subject {
                            notnull!(title) => title,
                            _ => String::new(),
                        };

                        let start_date_time = event.start.and_then(|start| start.date_time).ok_or(
                            XpComGraphError::Processing {
                                message: "Event start time not present.".to_string(),
                            },
                        )?;
                        let end_date_time = event.end.and_then(|end| end.date_time).ok_or(
                            XpComGraphError::Processing {
                                message: "Event end time not present.".to_string(),
                            },
                        )?;

                        self.listener
                            .on_event_present(id, title, start_date_time, end_date_time);
                    }
                    DeltaItem::Removed(event) => {
                        let event_id = event.id().to_string();
                        log::debug!("Deleting event with id {event_id}");
                        self.listener.on_event_deleted(event_id)?;
                    }
                }
            }
            match response {
                DeltaResponse::NextLink { mut next_page, .. } => {
                    next_page.set_max_page_size(EXCHANGE_MAX_PAGE_SIZE);
                    response = client
                        .send_request_json_response(next_page, Default::default())
                        .await?;
                }
                DeltaResponse::DeltaLink { delta_link, .. } => {
                    self.listener.on_sync_state_token_changed(&delta_link)?;
                    self.sync_state_token = Some(delta_link);
                    break;
                }
            }
        }

        Ok(())
    }

    fn into_success_arg(self, _ok: Self::Okay) {}

    fn into_failure_arg(self) {}
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    pub(crate) async fn sync_calendar_items(
        self: Arc<XpComGraphClient<ServerT>>,
        listener: SafeGraphCalendarEventListener,
        calendar_id: String,
        sync_state_token: Option<String>,
    ) {
        let operation = DoSyncCalendarItems {
            listener: &listener,
            calendar_id,
            sync_state_token,
        };

        operation.handle_operation(&self, &listener).await;
    }
}
