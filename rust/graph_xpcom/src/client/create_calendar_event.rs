/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use std::sync::Arc;

use ms_graph_tb::{
    OperationBody, notnull,
    paths::users::user_id::calendars::calendar_id::events,
    types::{date_time_time_zone::DateTimeTimeZone, event::Event},
};
use protocol_shared::{
    ServerType,
    client::DoOperation,
    safe_xpcom::{SafeExchangeSimpleOperationListener, UseLegacyFallback},
};

use crate::{client::XpComGraphClient, error::XpComGraphError};

struct DoCreateCalendarEvent {
    calendar_id: String,
    title: String,
    start_date_time: String,
    start_timezone: String,
    end_date_time: String,
    end_timezone: String,
}

impl<ServerT: ServerType> DoOperation<XpComGraphClient<ServerT>, XpComGraphError>
    for DoCreateCalendarEvent
{
    const NAME: &'static str = "create calendar event";
    type Okay = String;
    type Listener = SafeExchangeSimpleOperationListener;

    async fn do_operation(
        &mut self,
        client: &XpComGraphClient<ServerT>,
    ) -> Result<Self::Okay, XpComGraphError> {
        let event = Event {
            subject: notnull!(self.title.clone()),
            start: Some(DateTimeTimeZone {
                date_time: Some(self.start_date_time.clone()),
                time_zone: notnull!(self.start_timezone.clone()),
            }),
            end: Some(DateTimeTimeZone {
                date_time: Some(self.end_date_time.clone()),
                time_zone: notnull!(self.end_timezone.clone()),
            }),
            ..Default::default()
        };

        let base_url = client.base_api_url()?.to_string();
        let request = events::Post::new(
            base_url,
            client.user_id().clone(),
            self.calendar_id.clone(),
            OperationBody::JSON(event),
        );
        let event_id = client
            .send_request_json_response(request, Default::default())
            .await?
            .outlook_item
            .entity
            .id
            .ok_or(XpComGraphError::Processing {
                message: "Newly created event ID is missing.".to_string(),
            })?;

        Ok(event_id)
    }

    fn into_success_arg(
        self,
        event_id: Self::Okay,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnSuccessArg {
        (std::iter::once(event_id), UseLegacyFallback::No).into()
    }

    fn into_failure_arg(
        self,
    ) -> <Self::Listener as protocol_shared::safe_xpcom::SafeListener>::OnFailureArg {
    }
}

impl<ServerT: ServerType> XpComGraphClient<ServerT> {
    pub(crate) async fn create_calendar_event(
        self: Arc<XpComGraphClient<ServerT>>,
        calendar_id: String,
        title: String,
        start_date_time: String,
        start_timezone: String,
        end_date_time: String,
        end_timezone: String,
        listener: SafeExchangeSimpleOperationListener,
    ) {
        let operation = DoCreateCalendarEvent {
            calendar_id,
            title,
            start_date_time,
            start_timezone,
            end_date_time,
            end_timezone,
        };
        operation.handle_operation(&self, &listener).await;
    }
}
