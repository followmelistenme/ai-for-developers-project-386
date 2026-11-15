import { useCallback, useEffect, useState } from "react"
import { CalendarDays, RefreshCw } from "lucide-react"
import { api } from "@/api/client"
import type { components } from "@/api/generated/schema"
import { Button } from "@/components/ui/button"

type Availability = components["schemas"]["AvailableSlots"]
type Slot = components["schemas"]["AvailableSlot"]
type View = { data?: Availability, loading: boolean, failed: boolean, missing: boolean, deadline?: number }

function timeLabel(instant: string, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(instant))
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-")
  return `${day}.${month}.${year}`
}

export function SlotPicker({ meetingTypeId }: { meetingTypeId: string }) {
  const [query, setQuery] = useState<{ date?: string, revision: number }>({ revision: 0 })
  const [view, setView] = useState<View>({ loading: true, failed: false, missing: false })
  const [selected, setSelected] = useState<Slot | null>(null)
  const effectiveDate = view.data?.selectedDate
  const refresh = useCallback(() => {
    setSelected(null)
    setView((current) => ({ ...current, loading: true, failed: false }))
    setQuery((current) => ({ date: effectiveDate, revision: current.revision + 1 }))
  }, [effectiveDate])

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      let started = performance.now()
      try {
        const options = { params: { path: { meetingTypeId }, query: query.date ? { date: query.date } : {} }, signal: controller.signal }
        let result = await api.GET("/api/meeting-types/{meetingTypeId}/slots", options)
        // A date can leave the live window while the page is open. Ask the server for its new first day.
        if (result.response.status === 400 && query.date && !controller.signal.aborted) {
          started = performance.now()
          result = await api.GET("/api/meeting-types/{meetingTypeId}/slots", { params: { path: { meetingTypeId } }, signal: controller.signal })
        }
        if (controller.signal.aborted) return
        if (result.response.status === 404) { setView({ loading: false, failed: false, missing: true }); return }
        if (!result.response.ok || !result.data) throw new Error("Failed to load slots")
        const data = result.data
        // Use server time and elapsed request time; the browser clock may be wrong.
        const deadline = started + Date.parse(data.nextWindowUpdate) - Date.parse(data.serverTime)
        setView({ data, loading: false, failed: false, missing: false, deadline })
      } catch {
        if (!controller.signal.aborted) setView((current) => ({ ...current, loading: false, failed: true }))
      }
    }
    void load()
    return () => controller.abort()
  }, [meetingTypeId, query])

  useEffect(() => {
    window.addEventListener("focus", refresh)
    function visible() { if (document.visibilityState === "visible") refresh() }
    document.addEventListener("visibilitychange", visible)
    return () => {
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [refresh])

  useEffect(() => {
    if (view.deadline === undefined || view.loading || view.failed) return
    const timer = window.setTimeout(refresh, Math.max(0, view.deadline - performance.now()) + 25)
    return () => window.clearTimeout(timer)
  }, [view.deadline, view.loading, view.failed, refresh])

  const data = view.data
  const ready = data && !view.loading && !view.failed && !view.missing
  return <section className="owner-panel slot-picker" aria-labelledby="slots-heading">
    <div className="slots-heading">
      <div><p className="eyebrow">Следующий шаг</p><h2 id="slots-heading">Выберите дату и время</h2></div>
      <CalendarDays aria-hidden="true" />
    </div>
    <p className="owner-description">Все даты и время — по Москве (Europe/Moscow).</p>
    {data && <div className="slot-date-row">
      <label className="slot-date-label" htmlFor="slot-date">Дата встречи по Москве
        <input id="slot-date" type="date" min={data.windowStart} max={data.windowEnd} value={query.date && view.loading ? query.date : data.selectedDate} onChange={(event) => {
          const date = event.target.value
          if (!date) return
          setSelected(null)
          setView((current) => ({ ...current, loading: true, failed: false }))
          setQuery((current) => ({ date, revision: current.revision + 1 }))
        }} />
      </label>
      <p className="field-hint">Окно записи: {dateLabel(data.windowStart)}–{dateLabel(data.windowEnd)}</p>
    </div>}
    {view.loading && <p role="status" className="owner-description">Загружаем свободные слоты…</p>}
    {view.failed && <div className="slot-state"><p role="alert">Не удалось загрузить свободные слоты. Проверьте соединение и попробуйте ещё раз.</p><Button variant="outline" onClick={refresh}>Попробовать ещё раз</Button></div>}
    {view.missing && <p role="alert">Тип встречи больше недоступен. Выберите другой тип в каталоге.</p>}
    {ready && <>
      <div className="slots-date-heading"><h3>{dateLabel(data.selectedDate)}</h3><Button variant="ghost" size="sm" onClick={refresh}><RefreshCw aria-hidden="true" /> Обновить слоты</Button></div>
      {data.slots.length === 0 ? <p role="status" className="owner-description">На эту дату нет свободных слотов. Выберите другую дату.</p> : <div className="slot-grid" role="group" aria-label="Свободные слоты по Москве">{data.slots.map((slot) => {
        const pressed = selected?.start === slot.start
        return <Button key={slot.start} variant={pressed ? "default" : "outline"} className="slot-button" aria-pressed={pressed} onClick={() => setSelected(slot)}>{timeLabel(slot.start, data.timeZone)}–{timeLabel(slot.end, data.timeZone)}</Button>
      })}</div>}
      {selected && <div className="slot-summary" role="status"><strong>Выбран интервал</strong><span>{dateLabel(data.selectedDate)}, {timeLabel(selected.start, data.timeZone)}–{timeLabel(selected.end, data.timeZone)} по Москве</span><p>Выбор не резервирует время. Запись на звонок пока недоступна.</p></div>}
    </>}
  </section>
}
