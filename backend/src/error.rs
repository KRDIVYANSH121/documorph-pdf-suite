use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Unsupported format or unreachable conversion path: {0}")]
    UnsupportedConversion(String),

    #[error("Security policy violation: {0}")]
    SecurityViolation(String),

    #[error("Payload exceeds configured size limit")]
    PayloadTooLarge,

    #[error("Job not found or expired")]
    NotFound,

    #[error("Required conversion engine '{0}' is unavailable on this host")]
    EngineUnavailable(String),

    #[error("Conversion timed out after exceeding resource limits")]
    Timeout,

    #[error("Conversion processing failed")]
    ProcessingFailed(String),

    #[error("Internal service error")]
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
    message: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, public_msg) = match &self {
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone()),
            AppError::UnsupportedConversion(msg) => (
                StatusCode::UNPROCESSABLE_ENTITY,
                "UNSUPPORTED_CONVERSION",
                msg.clone(),
            ),
            AppError::SecurityViolation(msg) => {
                tracing::warn!(reason = %msg, "Rejected request by security guard");
                (
                    StatusCode::BAD_REQUEST,
                    "SECURITY_POLICY_VIOLATION",
                    msg.clone(),
                )
            }
            AppError::PayloadTooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "PAYLOAD_TOO_LARGE",
                "Uploaded file exceeds maximum allowed size".to_string(),
            ),
            AppError::NotFound => (
                StatusCode::NOT_FOUND,
                "NOT_FOUND",
                "Requested job or artifact was not found".to_string(),
            ),
            AppError::EngineUnavailable(engine) => (
                StatusCode::SERVICE_UNAVAILABLE,
                "ENGINE_UNAVAILABLE",
                format!(
                    "Conversion requires engine '{engine}' which is not installed in the current runtime. Run inside the bundled Docker worker or install '{engine}'."
                ),
            ),
            AppError::Timeout => (
                StatusCode::GATEWAY_TIMEOUT,
                "CONVERSION_TIMEOUT",
                "Conversion exceeded the maximum allowed execution time".to_string(),
            ),
            AppError::ProcessingFailed(internal) => {
                tracing::error!(detail = %internal, "Conversion pipeline failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "PROCESSING_FAILED",
                    "Conversion failed while processing the input file".to_string(),
                )
            }
            AppError::Internal(internal) => {
                tracing::error!(detail = %internal, "Internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An unexpected internal error occurred".to_string(),
                )
            }
        };

        (
            status,
            Json(ErrorBody {
                error: code,
                message: public_msg,
            }),
        )
            .into_response()
    }
}
