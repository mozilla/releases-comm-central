/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    Select, notnull,
    pagination::{DeltaItem, DeltaResponse},
    paths::users::user_id::calendars::calendar_id::events,
    types::{attendee_type::AttendeeType, event::EventSelection, response_type::ResponseType},
};
use protocol_shared::{
    EXCHANGE_MAX_PAGE_SIZE, ServerType,
    client::DoOperation,
    safe_xpcom::event_listener::{CalendarEventData, SafeGraphCalendarEventListener},
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
                    EventSelection::Attendees,
                ];
                let base_url = client.base_api_url()?;
                let mut request = events::delta::Get::new(
                    base_url.to_string(),
                    client.user_id().clone(),
                    self.calendar_id.clone(),
                );
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

                        let start = event.start.ok_or(XpComGraphError::Processing {
                            message: "Event start time not present.".to_string(),
                        })?;
                        let end = event.end.ok_or(XpComGraphError::Processing {
                            message: "Event end time not present.".to_string(),
                        })?;

                        let start_date_time =
                            start.date_time.ok_or(XpComGraphError::Processing {
                                message: "Event start dateTime not present.".to_string(),
                            })?;
                        let end_date_time = end.date_time.ok_or(XpComGraphError::Processing {
                            message: "Event end dateTime not present.".to_string(),
                        })?;

                        let attendees = event.attendees.unwrap_or(Vec::new());
                        let mut attendee_email_addresses = Vec::with_capacity(attendees.len());
                        let mut attendee_common_names = Vec::with_capacity(attendees.len());
                        let mut attendee_response_statuses = Vec::with_capacity(attendees.len());
                        let mut attendee_types = Vec::with_capacity(attendees.len());

                        for attendee in attendees {
                            let email_address = attendee
                                .attendee_base
                                .recipient
                                .email_address
                                .ok_or(XpComGraphError::Processing {
                                    message: "Missing identity information for meeting attendee."
                                        .to_string(),
                                })?;
                            // The only thing we'll hard require here is the address. We'll try and
                            // use sensible defaults for everything else.
                            let address_value = match email_address.address {
                                notnull!(value) => Ok(value),
                                _ => Err(XpComGraphError::Processing {
                                    message: "Missing email address value.".to_string(),
                                }),
                            }?;
                            attendee_email_addresses.push(address_value.clone());

                            let common_name = match email_address.name {
                                notnull!(name) => name,
                                _ => address_value,
                            };
                            attendee_common_names.push(common_name);

                            attendee_response_statuses.push(
                                attendee
                                    .status
                                    .and_then(|s| s.response)
                                    .map_or(ResponseType::None.to_string(), |s| s.to_string()),
                            );

                            attendee_types.push(
                                attendee
                                    .attendee_base
                                    .r#type
                                    .map_or(AttendeeType::Optional.to_string(), |t| t.to_string()),
                            );
                        }

                        self.listener.on_event_present(CalendarEventData {
                            id,
                            title,
                            start_date_time,
                            end_date_time,
                            start_time_zone: start
                                .time_zone
                                .flatten()
                                .unwrap_or_else(|| "UTC".to_string()),
                            end_time_zone: end
                                .time_zone
                                .flatten()
                                .unwrap_or_else(|| "UTC".to_string()),
                            attendee_email_addresses,
                            attendee_common_names,
                            attendee_response_statuses,
                            attendee_types,
                        });
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
