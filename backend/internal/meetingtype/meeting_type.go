// Package meetingtype defines meeting types independently of HTTP and storage.
package meetingtype

import (
	"strings"
	"unicode/utf8"
)

// MeetingType is a saved draft owned by the calendar owner.
type MeetingType struct {
	ID              string
	Name            string
	Description     string
	DurationMinutes int
}

// NewDraft normalizes the input for a new meeting type.
func NewDraft(name, description string, durationMinutes int) (MeetingType, map[string]string) {
	name = strings.TrimSpace(name)
	fields := map[string]string{}
	if length := utf8.RuneCountInString(name); length < 1 || length > 100 {
		fields["name"] = "Введите название от 1 до 100 символов"
	}
	if utf8.RuneCountInString(description) > 500 {
		fields["description"] = "Описание должно быть не длиннее 500 символов"
	}
	switch durationMinutes {
	case 15, 30, 45, 60:
	default:
		fields["durationMinutes"] = "Выберите 15, 30, 45 или 60 минут"
	}
	return MeetingType{Name: name, Description: description, DurationMinutes: durationMinutes}, fields
}
