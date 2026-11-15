// Package memory stores one process-local calendar without persistence.
package memory

import (
	"crypto/rand"
	"sync"

	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/meetingtype"
)

// Calendar owns the meeting types for a single calendar owner.
type Calendar struct {
	mu    sync.RWMutex
	types []meetingtype.MeetingType
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
