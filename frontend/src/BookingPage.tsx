import { useEffect, useState } from "react"
import { ArrowLeft, ArrowUpRight, CalendarDays, Clock3 } from "lucide-react"
import { api } from "@/api/client"
import type { components } from "@/api/generated/schema"
import { Button } from "@/components/ui/button"

type MeetingType = components["schemas"]["MeetingType"]

export function BookingPage() {
  const path = window.location.pathname.replace(/\/+$/, "")
  const id = path.startsWith("/booking/") ? path.slice("/booking/".length) : undefined
  const [types, setTypes] = useState<MeetingType[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [missing, setMissing] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        if (id !== undefined) {
          if (id.includes("/")) { setMissing(true); return }
          const { data, response } = await api.GET("/api/meeting-types/{meetingTypeId}", { params: { path: { meetingTypeId: id } }, signal: controller.signal })
          if (controller.signal.aborted) return
          if (response.status === 404) { setMissing(true); return }
          if (!response.ok || !data) throw new Error("Failed to load meeting type")
          setTypes([data])
        } else {
          const { data, response } = await api.GET("/api/meeting-types", { signal: controller.signal })
          if (controller.signal.aborted) return
          if (!response.ok || !data) throw new Error("Failed to load catalogue")
          setTypes(data)
        }
      } catch {
        if (!controller.signal.aborted) setFailed(true)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [id, refresh])

  const detail = id !== undefined ? types[0] : undefined
  return (
    <main id="main" className="owner-page guest-page container" tabIndex={-1}>
      <Button asChild variant="outline" className="guest-back"><a href={id === undefined ? "/" : "/booking"}><ArrowLeft aria-hidden="true" /> {id === undefined ? "На главную" : "Все типы встреч"}</a></Button>
      <div className="owner-heading">
        <div>
          <p className="eyebrow">Календарь звонков</p>
          <h1>{missing ? "Тип встречи недоступен" : detail ? detail.name : id === undefined ? "Выберите тип встречи" : "Тип встречи"}</h1>
          {id === undefined && <p className="owner-description">Познакомьтесь с форматами звонков и выберите подходящий.</p>}
        </div>
      </div>
      {loading && <p className="owner-description" role="status">{id === undefined ? "Загружаем типы встреч…" : "Загружаем тип встречи…"}</p>}
      {failed && <section className="owner-panel guest-state">
        <p role="alert">Не удалось загрузить {id === undefined ? "типы встреч" : "тип встречи"}. Проверьте соединение и попробуйте ещё раз.</p>
        <Button variant="outline" onClick={() => { setLoading(true); setFailed(false); setRefresh((value) => value + 1) }}>Попробовать ещё раз</Button>
      </section>}
      {missing && <p className="owner-description">Возможно, ссылка устарела или тип ещё не опубликован. Выберите другой тип встречи в каталоге.</p>}
      {!loading && !failed && !missing && types.length === 0 && <section className="owner-panel owner-empty guest-state" aria-labelledby="guest-empty-heading">
        <span className="placeholder-icon"><CalendarDays aria-hidden="true" /></span>
        <h2 id="guest-empty-heading">Пока нет опубликованных типов встреч</h2>
        <p className="owner-description">Владелец календаря ещё не открыл типы встреч для гостей. Загляните позже.</p>
      </section>}
      {!loading && !failed && !missing && detail && <section className="owner-panel guest-detail">
        <p className="draft-duration"><Clock3 aria-hidden="true" /> {detail.durationMinutes} минут</p>
        {detail.description && <p className="draft-description">{detail.description}</p>}
        <p className="field-hint">Выбор времени и запись на звонок пока недоступны.</p>
      </section>}
      {!loading && !failed && id === undefined && types.length > 0 && <div className="guest-types">
        {types.map((type) => <article key={type.id} className="owner-panel" aria-labelledby={`guest-type-${type.id}`}>
          <span className="guest-type-icon"><CalendarDays aria-hidden="true" /></span>
          <h2 id={`guest-type-${type.id}`}>{type.name}</h2>
          <p className="draft-duration"><Clock3 aria-hidden="true" /> {type.durationMinutes} минут</p>
          {type.description && <p className="draft-description">{type.description}</p>}
          <Button asChild variant="outline"><a href={`/booking/${encodeURIComponent(type.id)}`}>Подробнее <ArrowUpRight aria-hidden="true" /><span className="sr-only"> о типе {type.name}</span></a></Button>
        </article>)}
      </div>}
    </main>
  )
}
