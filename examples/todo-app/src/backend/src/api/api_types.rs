use super::json_encode;
use ic_http_certification::{HttpResponse, StatusCode};
use serde::Serialize;
use std::borrow::Cow;

#[derive(Debug, Clone, Serialize)]
pub enum ApiResponseBody<T = ()> {
    #[serde(rename = "ok")]
    Ok { data: T },
    #[serde(rename = "err")]
    Err { code: u16, message: String },
}

pub struct ApiResponse<T = ()> {
    body: ApiResponseBody<T>,
    status_code: StatusCode,
}

impl<'a, T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> HttpResponse<'a> {
        Self::success(StatusCode::OK, data).build()
    }

    #[allow(dead_code)]
    pub fn no_content(data: T) -> HttpResponse<'a> {
        Self::success(StatusCode::NO_CONTENT, data).build()
    }

    pub fn created(data: T) -> HttpResponse<'a> {
        Self::success(StatusCode::CREATED, data).build()
    }

    pub fn bad_request(message: String) -> HttpResponse<'a> {
        Self::failure(StatusCode::BAD_REQUEST, message).build()
    }

    #[allow(dead_code)]
    pub fn not_found() -> HttpResponse<'a> {
        Self::failure(StatusCode::NOT_FOUND, "Not found".to_string()).build()
    }

    #[allow(dead_code)]
    pub fn not_allowed() -> HttpResponse<'a> {
        Self::failure(
            StatusCode::METHOD_NOT_ALLOWED,
            "Method not allowed".to_string(),
        )
        .build()
    }

    fn success(status_code: StatusCode, data: T) -> Self {
        Self {
            status_code,
            body: ApiResponseBody::Ok { data },
        }
    }

    fn failure(status_code: StatusCode, message: String) -> Self {
        Self {
            status_code,
            body: ApiResponseBody::Err {
                code: status_code.as_u16(),
                message,
            },
        }
    }

    fn build(self) -> HttpResponse<'a> {
        create_response(self.status_code, json_encode(&self.body))
    }
}

pub type ErrorResponse<'a> = ApiResponse<()>;

fn create_response<'a>(
    status_code: StatusCode,
    body: impl Into<Cow<'a, [u8]>>,
) -> HttpResponse<'a> {
    HttpResponse::builder()
        .with_status_code(status_code)
        .with_headers(vec![
            ("content-type".to_string(), "application/json".to_string()),
            (
                "strict-transport-security".to_string(),
                "max-age=31536000; includeSubDomains".to_string(),
            ),
            ("x-content-type-options".to_string(), "nosniff".to_string()),
            ("referrer-policy".to_string(), "no-referrer".to_string()),
            (
                "cache-control".to_string(),
                "no-store, max-age=0".to_string(),
            ),
            ("pragma".to_string(), "no-cache".to_string()),
        ])
        .with_body(body)
        .build()
}
