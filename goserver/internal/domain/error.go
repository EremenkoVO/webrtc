package domain

import (
	"net/http"

	"github.com/EremenkoVO/webrtc/goserver/internal/gen/api"
)

type ErrorResponse struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type AppError struct {
	Code       string
	Message    string
	StatusCode int
}

func (e *AppError) Error() string {
	return e.Message
}

func (e *AppError) ToErrorResponse() api.ErrorResponse {
	return api.ErrorResponse{
		Code:    api.ErrorResponseCode(e.Code),
		Message: e.Message,
	}
}

func ToErrorResponse(err error) api.ErrorResponse {
	if appErr, ok := err.(*AppError); ok {
		return appErr.ToErrorResponse()
	}
	return api.ErrorResponse{
		Code:    api.SERVERERROR,
		Message: "Internal server error",
	}
}

func GetStatusCode(err error) int {
	if appErr, ok := err.(*AppError); ok {
		return appErr.StatusCode
	}
	return http.StatusInternalServerError
}

var (
	ErrValidation         = &AppError{Code: "VALIDATION_ERROR", Message: "Invalid input data", StatusCode: 400}
	ErrInvalidCredentials = &AppError{
		Code:       "INVALID_CREDENTIALS",
		Message:    "Invalid username or password",
		StatusCode: 401,
	}
	ErrUnauthorized = &AppError{Code: "UNAUTHORIZED", Message: "Missing or invalid access token", StatusCode: 401}
	ErrForbidden    = &AppError{Code: "FORBIDDEN", Message: "Insufficient permissions", StatusCode: 403}
	ErrPrimaryAdminProtected = &AppError{
		Code:       "PRIMARY_ADMIN_PROTECTED",
		Message:    "The first administrator cannot be demoted",
		StatusCode: 403,
	}
	ErrUserExists   = &AppError{
		Code:       "USER_EXISTS",
		Message:    "User with this username already exists",
		StatusCode: 409,
	}
	ErrAdminAlreadyInitialized = &AppError{
		Code:       "ADMIN_ALREADY_INITIALIZED",
		Message:    "Admin panel is already initialized",
		StatusCode: 409,
	}
	ErrInvalidRefreshToken = &AppError{Code: "INVALID_REFRESH_TOKEN", Message: "Invalid refresh token", StatusCode: 401}
	ErrUserNotFound        = &AppError{Code: "NOT_FOUND", Message: "User not found", StatusCode: 404}
	ErrServerError         = &AppError{Code: "SERVER_ERROR", Message: "Internal server error", StatusCode: 500}
)
