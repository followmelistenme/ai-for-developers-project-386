// Package memory stores one process-local calendar without persistence.
package memory

import (
	"crypto/rand"
	"errors"
	"slices"
	"sync"
	"time"

	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/availability"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/meeting"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/meetingtype"
)

// Calendar owns meeting types and meetings for a single calendar owner.
type Calendar struct {
	mu       sync.RWMutex
	types    []meetingtype.MeetingType
	meetings []meeting.Meeting
}

// AddDraft assigns a new identifier and saves a validated draft.
func (c *Calendar) AddDraft(draft meetingtype.MeetingType) meetingtype.MeetingType {
	c.mu.Lock()
	defer c.mu.Unlock()
	draft.ID = rand.Text()
	c.types = append(c.types, draft)
	return draft
}

// MeetingTypes returns a copy in creation order.
func (c *Calendar) MeetingTypes() []meetingtype.MeetingType {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return append([]meetingtype.MeetingType{}, c.types...)
}

// Publish exposes an existing type to guests, preserving all saved fields.
// Repeated publication returns the same type without adding another entry.
func (c *Calendar) Publish(id string) (meetingtype.MeetingType, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for i := range c.types {
		if c.types[i].ID == id {
			c.types[i].Status = meetingtype.Published
			return c.types[i], true
		}
	}
	return meetingtype.MeetingType{}, false
}

// PublishedMeetingTypes returns the guest-visible types in creation order.
func (c *Calendar) PublishedMeetingTypes() []meetingtype.MeetingType {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := []meetingtype.MeetingType{}
	for _, item := range c.types {
		if item.Status == meetingtype.Published {
			result = append(result, item)
		}
	}
	return result
}

// PublishedMeetingType returns a type only if guests may view it.
func (c *Calendar) PublishedMeetingType(id string) (meetingtype.MeetingType, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, item := range c.types {
		if item.ID == id && item.Status == meetingtype.Published {
			return item, true
		}
	}
	return meetingtype.MeetingType{}, false
}

// ErrTypeUnavailable means guests cannot book the requested type.
var ErrTypeUnavailable = errors.New("meeting type unavailable")

// ErrInvalidStart means the requested interval violates current calendar rules.
var ErrInvalidStart = errors.New("invalid meeting start")

// ErrBookingConflict means another meeting already occupies the interval.
var ErrBookingConflict = errors.New("meeting interval occupied")

// Confirm saves a meeting in the calendar shared by all meeting types.
func (c *Calendar) Confirm(id string, now time.Time, location *time.Location, start time.Time, name, email string) (meeting.Meeting, availability.Day, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, item := range c.types {
		if item.ID == id && item.Status == meetingtype.Published {
			start = start.In(location)
			day, err := availability.ForDate(now, location, start.Format(time.DateOnly), item.DurationMinutes)
			if err != nil || !slices.ContainsFunc(day.Slots, func(slot availability.Slot) bool { return slot.Start.Equal(start) }) {
				return meeting.Meeting{}, availability.Day{}, ErrInvalidStart
			}
			result := meeting.New(item, start, name, email)
			if c.overlaps(result.Start, result.End) {
				return meeting.Meeting{}, c.withFreeSlots(day), ErrBookingConflict
			}
			result.ID = rand.Text()
			c.meetings = append(c.meetings, result)
			return result, availability.Day{}, nil
		}
	}
	return meeting.Meeting{}, availability.Day{}, ErrTypeUnavailable
}

// Meetings returns future and ongoing meetings, ordered from the soonest.
func (c *Calendar) Meetings(now time.Time) []meeting.Meeting {
	c.mu.RLock()
	defer c.mu.RUnlock()
	result := []meeting.Meeting{}
	for _, item := range c.meetings {
		if item.End.After(now) {
			result = append(result, item)
		}
	}
	slices.SortFunc(result, func(a, b meeting.Meeting) int { return a.Start.Compare(b.Start) })
	return result
}

// Available returns a consistent snapshot of the published type's free intervals.
func (c *Calendar) Available(id string, now time.Time, location *time.Location, date string) (availability.Day, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for _, item := range c.types {
		if item.ID == id && item.Status == meetingtype.Published {
			day, err := availability.ForDate(now, location, date, item.DurationMinutes)
			if err != nil {
				return availability.Day{}, ErrInvalidStart
			}
			return c.withFreeSlots(day), nil
		}
	}
	return availability.Day{}, ErrTypeUnavailable
}

// Callers hold the calendar lock while checking occupancy and filtering slots.
func (c *Calendar) overlaps(start, end time.Time) bool {
	return slices.ContainsFunc(c.meetings, func(item meeting.Meeting) bool { return item.Overlaps(start, end) })
}

func (c *Calendar) withFreeSlots(day availability.Day) availability.Day {
	day.Slots = slices.DeleteFunc(day.Slots, func(slot availability.Slot) bool { return c.overlaps(slot.Start, slot.End) })
	return day
}
