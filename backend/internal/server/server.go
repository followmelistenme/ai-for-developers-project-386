// Package server wires the HTTP interface to an isolated in-memory calendar.
package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/getkin/kin-openapi/routers/legacy"
	"github.com/gin-gonic/gin"
	"github.com/oasdiff/yaml"

	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/api"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/meetingtype"
	"github.com/followmelistenme/ai-for-developers-project-386/backend/internal/memory"
)

type handler struct{ calendar *memory.Calendar }

// New returns a new calendar HTTP handler. Each call starts with empty data.
func New() (http.Handler, error) {
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
	router := gin.New()
	router.GET("/openapi.json", func(c *gin.Context) { c.Data(http.StatusOK, "application/json; charset=utf-8", jsonSpec) })
	router.GET("/openapi.yaml", func(c *gin.Context) { c.Data(http.StatusOK, "application/yaml; charset=utf-8", yamlSpec) })
	router.GET("/docs", func(c *gin.Context) { c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(documentation)) })
	group := router.Group("")
	group.Use(validateRequest(validator))
	api.RegisterHandlers(group, api.NewStrictHandlerWithOptions(&handler{calendar: &memory.Calendar{}}, nil, api.StrictGinServerOptions{
		RequestErrorHandlerFunc: func(c *gin.Context, _ error) {
			c.AbortWithStatusJSON(http.StatusBadRequest, api.ValidationError{Message: "Проверьте запрос", Fields: map[string]string{"body": "Некорректный JSON"}})
		},
	}))
	return router, nil
}

const documentation = `<!doctype html>
<html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Календарь звонков — API</title>
<style>body{font:16px/1.6 system-ui;max-width:780px;margin:40px auto;padding:0 24px;background:#0c0d11;color:#f1f2f6}a{color:#91aaff}pre{overflow:auto;padding:20px;background:#191c25}code{overflow-wrap:anywhere}</style>
<h1>Календарь звонков — API</h1>
<p>Один владелец календаря, без авторизации. Данные существуют до перезапуска процесса.</p>
<p>Контракт: <a href="/openapi.json">OpenAPI JSON</a> · <a href="/openapi.yaml">OpenAPI YAML</a></p>
<h2>GET /api/owner/meeting-types</h2>
<p>200: массив типов встреч в порядке создания, изначально пустой.</p>
<h2>POST /api/owner/meeting-types</h2>
<p>Content-Type: application/json. Создаёт черновик, недоступный гостям.</p>
<pre>{"name":"Знакомство","description":"Короткий разговор","durationMinutes":30}</pre>
<p>Название обязательно: 1–100 символов Unicode после обрезки пробелов по краям. Описание необязательно: обычный текст до 500 символов Unicode. Длительность: 15, 30, 45 или 60 минут. Одинаковые названия разрешены.</p>
<p>201: созданный тип с уникальным id, name, description, durationMinutes и status: draft.</p>
<p>400: данные не сохранены. message содержит общее сообщение, fields — ошибки по полям; body обозначает ошибку всего запроса.</p>
<pre>{"message":"Проверьте данные","fields":{"name":"Введите название от 1 до 100 символов"}}</pre>
</html>`

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
	return api.MeetingType{Id: draft.ID, Name: draft.Name, Description: draft.Description, DurationMinutes: api.MeetingTypeDurationMinutes(draft.DurationMinutes), Status: api.Draft}
}
