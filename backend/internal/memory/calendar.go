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
