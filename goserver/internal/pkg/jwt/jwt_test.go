package jwt_test

import (
	"testing"

	"github.com/EremenkoVO/webrtc/goserver/internal/pkg/jwt"
)

func TestJWTManager_ValidateToken(t *testing.T) {
	tests := []struct {
		name string // description of this test case
		// Named input parameters for receiver constructor.
		secret string
		// Named input parameters for target function.
		tokenString string
		want        string
		wantErr     bool
	}{
		// TODO: Add test cases.
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := jwt.NewJWTManager(tt.secret)
			got, gotErr := m.ValidateToken(tt.tokenString)
			if gotErr != nil {
				if !tt.wantErr {
					t.Errorf("ValidateToken() failed: %v", gotErr)
				}
				return
			}
			if tt.wantErr {
				t.Fatal("ValidateToken() succeeded unexpectedly")
			}
			// TODO: update the condition below to compare got with tt.want.
			if true {
				t.Errorf("ValidateToken() = %v, want %v", got, tt.want)
			}
		})
	}
}
