// Package server wires the HTTP interface to an isolated in-memory calendar.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	_ "time/tzdata"

	"github.com/getkin/kin-openapi/routers/legacy"
	"github.com/gin-gonic/gin"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/oasdiff/yaml"

	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/api"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/availability"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/meetingtype"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/memory"
)

type handler struct {
	calendar *memory.Calendar
	now      func() time.Time
	location *time.Location
}

// New returns a new calendar HTTP handler. Each call starts with empty data.
func New() (http.Handler, error) {
	return NewWithClock(time.Now)
}

// NewWithClock supplies the clock at the application boundary, without exposing it over HTTP.
func NewWithClock(now func() time.Time) (http.Handler, error) {
	if now == nil {
		now = time.Now
	}
	location, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		return nil, fmt.Errorf("load calendar time zone: %w", err)
	}

	spec, err := api.GetSpec()
	if err != nil {
		return nil, fmt.Errorf("load OpenAPI: %w", err)
	}
	validator, err := legacy.NewRouter(spec)
	if err != nil {
		return nil, fmt.Errorf("initialize OpenAPI validation: %w", err)
	}
	jsonSpec, err := json.MarshalIndent(spec, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("serialize OpenAPI JSON: %w", err)
	}
	yamlSpec, err := yaml.JSONToYAML(jsonSpec)
	if err != nil {
		return nil, fmt.Errorf("serialize OpenAPI YAML: %w", err)
	}
	docs, err := renderDocumentation(spec)
	if err != nil {
		return nil, fmt.Errorf("render OpenAPI documentation: %w", err)
	}
	router := gin.New()
	router.GET("/openapi.json", func(c *gin.Context) { c.Data(http.StatusOK, "application/json; charset=utf-8", jsonSpec) })
	router.GET("/openapi.yaml", func(c *gin.Context) { c.Data(http.StatusOK, "application/yaml; charset=utf-8", yamlSpec) })
	router.GET("/docs", func(c *gin.Context) { c.Data(http.StatusOK, "text/html; charset=utf-8", docs) })
	group := router.Group("")
	group.Use(validateRequest(validator))
	api.RegisterHandlers(group, api.NewStrictHandlerWithOptions(&handler{calendar: &memory.Calendar{}, now: now, location: location}, nil, api.StrictGinServerOptions{
		RequestErrorHandlerFunc: func(c *gin.Context, _ error) {
			c.AbortWithStatusJSON(http.StatusBadRequest, api.ValidationError{Message: "Проверьте запрос", Fields: map[string]string{"body": "Некорректный JSON"}})
		},
	}))
	return router, nil
}

func (h *handler) ListOwnerMeetingTypes(context.Context, api.ListOwnerMeetingTypesRequestObject) (api.ListOwnerMeetingTypesResponseObject, error) {
	result := api.ListOwnerMeetingTypes200JSONResponse{}
	for _, draft := range h.calendar.MeetingTypes() {
		result = append(result, toDTO(draft))
	}
	return result, nil
}

func (h *handler) CreateOwnerMeetingType(_ context.Context, request api.CreateOwnerMeetingTypeRequestObject) (api.CreateOwnerMeetingTypeResponseObject, error) {
	input := request.Body
	description := ""
	if input.Description != nil {
		description = *input.Description
	}
	draft, fields := meetingtype.NewDraft(input.Name, description, int(input.DurationMinutes))
	if len(fields) != 0 {
		return api.CreateOwnerMeetingType400JSONResponse{Message: "Проверьте данные", Fields: fields}, nil
	}
	return api.CreateOwnerMeetingType201JSONResponse(toDTO(h.calendar.AddDraft(draft))), nil
}

func toDTO(draft meetingtype.MeetingType) api.MeetingType {
	return api.MeetingType{Id: draft.ID, Name: draft.Name, Description: draft.Description, DurationMinutes: api.MeetingTypeDurationMinutes(draft.DurationMinutes), Status: api.MeetingTypeStatus(draft.Status)}
}

func (h *handler) PublishOwnerMeetingType(_ context.Context, request api.PublishOwnerMeetingTypeRequestObject) (api.PublishOwnerMeetingTypeResponseObject, error) {
	item, ok := h.calendar.Publish(request.MeetingTypeId)
	if !ok {
		return api.PublishOwnerMeetingType404JSONResponse{MeetingTypeNotFoundJSONResponse: api.MeetingTypeNotFoundJSONResponse{Message: "Тип встречи не найден"}}, nil
	}
	return api.PublishOwnerMeetingType200JSONResponse(toDTO(item)), nil
}

func (h *handler) ListPublishedMeetingTypes(context.Context, api.ListPublishedMeetingTypesRequestObject) (api.ListPublishedMeetingTypesResponseObject, error) {
	result := api.ListPublishedMeetingTypes200JSONResponse{}
	for _, item := range h.calendar.PublishedMeetingTypes() {
		result = append(result, toDTO(item))
	}
	return result, nil
}

func (h *handler) GetPublishedMeetingType(_ context.Context, request api.GetPublishedMeetingTypeRequestObject) (api.GetPublishedMeetingTypeResponseObject, error) {
	item, ok := h.calendar.PublishedMeetingType(request.MeetingTypeId)
	if !ok {
		return api.GetPublishedMeetingType404JSONResponse{MeetingTypeNotFoundJSONResponse: api.MeetingTypeNotFoundJSONResponse{Message: "Тип встречи недоступен"}}, nil
	}
	return api.GetPublishedMeetingType200JSONResponse(toDTO(item)), nil
}

func (h *handler) ListAvailableSlots(_ context.Context, request api.ListAvailableSlotsRequestObject) (api.ListAvailableSlotsResponseObject, error) {
	now := h.now()
	item, ok := h.calendar.PublishedMeetingType(request.MeetingTypeId)
	if !ok {
		return api.ListAvailableSlots404JSONResponse{MeetingTypeNotFoundJSONResponse: api.MeetingTypeNotFoundJSONResponse{Message: "Тип встречи недоступен"}}, nil
	}
	date := ""
	if request.Params.Date != nil {
		date = request.Params.Date.String()
	}
	result, err := availability.ForDate(now, h.location, date, item.DurationMinutes)
	if err != nil {
		return api.ListAvailableSlots400JSONResponse{Message: "Выберите дату в текущем окне записи", Fields: map[string]string{"date": "Дата вне окна записи"}}, nil
	}
	slots := make([]api.AvailableSlot, 0, len(result.Slots))
	for _, slot := range result.Slots {
		slots = append(slots, api.AvailableSlot{Start: slot.Start, End: slot.End})
	}
	return api.ListAvailableSlots200JSONResponse{
		ServerTime: now, NextWindowUpdate: result.WindowStart, TimeZone: api.EuropeMoscow,
		WindowStart: openapi_types.Date{Time: result.WindowStart}, WindowEnd: openapi_types.Date{Time: result.WindowEnd},
		SelectedDate: openapi_types.Date{Time: result.SelectedDate}, Slots: slots,
	}, nil
}
