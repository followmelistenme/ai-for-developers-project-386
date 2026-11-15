import { expect, test } from "./fixtures"

test("гость записывается с главной, сохраняет подтверждение, владелец видит встречу всех типов", async ({ page, request, context }) => {
  const create = async (name: string, durationMinutes: number) => {
    const type = await (await request.post("/api/owner/meeting-types", { data: { name, durationMinutes } })).json() as { id: string }
    await request.post(`/api/owner/meeting-types/${type.id}/publish`)
    return type
  }
  const type = await create("Разбор проекта", 45)
  const other = await create("Короткий звонок", 15)
  await page.goto("/")
  await page.getByRole("link", { name: "Перейти к записи", exact: true }).first().click()
  await page.getByRole("link", { name: "Подробнее о типе Разбор проекта" }).click()
  await page.getByRole("button", { name: "09:00–09:45", exact: true }).click()
  await page.getByLabel("Ваше имя", { exact: true }).fill("  Анна  ")
  await page.getByLabel("Email", { exact: true }).fill(" anna@example.com ")
  await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
  const confirmation = page.getByRole("region", { name: "Вы записаны на звонок" })
  await expect(confirmation).toContainText("Анна")
  await expect(confirmation).toContainText("anna@example.com")
  await expect(confirmation).toContainText("Разбор проекта")
  await expect(confirmation).toContainText("09:00–09:45 по Москве")
  await expect(confirmation).toContainText("Сохраните сведения самостоятельно")
  const meetings = await (await request.get("/api/owner/meetings")).json() as { id: string, callUrl: string, date: string }[]
  expect(meetings).toHaveLength(1)
  expect(meetings[0].id).not.toBe(type.id)
  await expect(page.getByLabel("Ссылка для звонка", { exact: true })).toHaveValue(`http://localhost/event/${meetings[0].id}`)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Копировать ссылку", exact: true }).click()
  await expect(page.getByRole("status")).toContainText("Ссылка скопирована")
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe(meetings[0].callUrl)
  await page.evaluate("window.dispatchEvent(new Event('focus'))")
  await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
  await page.goto(`/booking/${other.id}`)
  await expect(page.getByRole("button", { name: "09:00–09:15", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "09:30–09:45", exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "10:00–10:15", exact: true }).click()
  await page.getByLabel("Ваше имя", { exact: true }).fill("Борис")
  await page.getByLabel("Email", { exact: true }).fill("boris@example.com")
  await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
  await page.goto("/owner")
  const list = page.getByRole("region", { name: "Предстоящие встречи" })
  await expect(list.getByRole("article")).toHaveCount(2)
  await expect(list.getByRole("article").nth(0)).toContainText("Разбор проекта")
  await expect(list.getByRole("article").nth(0)).toContainText("Анна")
  await expect(list.getByRole("article").nth(0)).toContainText("anna@example.com")
  await expect(list.getByRole("article").nth(0)).toContainText("09:00–09:45 по Москве")
  await expect(list.getByRole("article").nth(1)).toContainText("Короткий звонок")
  await expect(list.getByRole("article").nth(1)).toContainText("Борис")
  await expect(list.getByRole("link", { name: "Ссылка для звонка", exact: true }).first()).toHaveAttribute("href", meetings[0].callUrl)
})

test("конфликт обновляет выбранную дату, сохраняет контакты и позволяет выбрать другой интервал", async ({ page, request }) => {
  const type = await (await request.post("/api/owner/meeting-types", { data: { name: "Конкурентная запись", durationMinutes: 60 } })).json() as { id: string }
  const other = await (await request.post("/api/owner/meeting-types", { data: { name: "Другой формат", durationMinutes: 15 } })).json() as { id: string }
  for (const item of [type, other]) await request.post(`/api/owner/meeting-types/${item.id}/publish`)
  const available = await (await request.get(`/api/meeting-types/${type.id}/slots`)).json() as { windowEnd: string }
  await page.goto(`/booking/${type.id}`)
  await page.getByLabel("Дата встречи по Москве").fill(available.windowEnd)
  await page.getByRole("button", { name: "09:00–10:00", exact: true }).click()
  await page.getByLabel("Ваше имя", { exact: true }).fill("Вера")
  await page.getByLabel("Email", { exact: true }).fill("vera@example.com")
  const winner = await request.post(`/api/meeting-types/${other.id}/meetings`, { data: { start: `${available.windowEnd}T09:30:00+03:00`, guestName: "Другой гость", guestEmail: "other@example.com" } })
  expect(winner.status()).toBe(201)
  await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Этот интервал уже занят")
  await expect(page.getByLabel("Дата встречи по Москве")).toHaveValue(available.windowEnd)
  await expect(page.getByRole("button", { name: "09:00–10:00", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "09:30–10:30", exact: true })).toHaveCount(0)
  await expect(page.getByText("other@example.com")).toHaveCount(0)
  await page.getByRole("button", { name: "10:00–11:00", exact: true }).click()
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue("Вера")
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("vera@example.com")
  await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
  await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
  const meetings = await (await request.get("/api/owner/meetings")).json() as unknown[]
  expect(meetings).toHaveLength(2)
})

test("контакты переживают обновление слотов, а ожидающая отправка и успех защищены от фокуса и полуночи", async ({ page, request, apiURL }) => {
  const type = await (await request.post("/api/owner/meeting-types", { data: { name: "Состояния подтверждения", durationMinutes: 30 } })).json() as { id: string }
  await request.post(`/api/owner/meeting-types/${type.id}/publish`)
  const available = await (await request.get(`/api/meeting-types/${type.id}/slots`)).json() as Record<string, unknown>
  await page.clock.install()
  await page.route("**/slots*", (route) => route.fulfill({ json: { ...available, serverTime: "2026-11-15T23:59:59+03:00", nextWindowUpdate: "2026-11-16T00:00:00+03:00" } }))
  await page.goto(`/booking/${type.id}`)
  await page.getByRole("button", { name: "09:00–09:30", exact: true }).click()
  await page.getByLabel("Ваше имя", { exact: true }).fill("Дина")
  await page.getByLabel("Email", { exact: true }).fill("dina@example.com")
  await page.evaluate("window.dispatchEvent(new Event('focus'))")
  await page.getByRole("button", { name: "09:00–09:30", exact: true }).click()
  await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue("Дина")
  let release: () => void = () => undefined
  const held = new Promise<void>((resolve) => { release = resolve })
  let intercepted: () => void = () => undefined
  const pending = new Promise<void>((resolve) => { intercepted = resolve })
  let submissions = 0
  await page.route("**/meetings", async (route) => {
    submissions++
    const response = await route.fetch({ url: `${apiURL}${new URL(route.request().url()).pathname}` })
    intercepted()
    await held
    await route.fulfill({ response })
  })
  try {
    await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
    await pending
    await page.evaluate("window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))")
    await page.clock.fastForward(1200)
    await expect(page.getByRole("button", { name: "Подтверждаем…", exact: true })).toBeDisabled()
    await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveValue("Дина")
    await expect(page.getByLabel("Дата встречи по Москве")).toBeDisabled()
    await expect(page.getByRole("button", { name: "09:30–10:00", exact: true })).toBeDisabled()
    release()
    await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
    await page.evaluate("window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange'))")
    await page.clock.fastForward(1000)
    await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
    expect(submissions).toBe(1)
  } finally { release() }
})

test("неполученный ответ сообщает неизвестный результат без повторной отправки", async ({ page, request, apiURL }) => {
  const type = await (await request.post("/api/owner/meeting-types", { data: { name: "Потерянный ответ", durationMinutes: 30 } })).json() as { id: string }
  await request.post(`/api/owner/meeting-types/${type.id}/publish`)
  await page.goto(`/booking/${type.id}`)
  await page.getByRole("button", { name: "09:00–09:30", exact: true }).click()
  await page.getByLabel("Ваше имя", { exact: true }).fill("Ева")
  await page.getByLabel("Email", { exact: true }).fill("eva@example.com")
  await page.route("**/meetings", async (route) => { await route.fetch({ url: `${apiURL}${new URL(route.request().url()).pathname}` }); await route.abort() }, { times: 1 })
  await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("Результат подтверждения неизвестен. Встреча могла быть создана")
  await page.evaluate("window.dispatchEvent(new Event('focus'))")
  await expect(page.getByRole("button", { name: "Подтвердить запись", exact: true })).toBeDisabled()
  const meetings = await (await request.get("/api/owner/meetings")).json() as unknown[]
  expect(meetings).toHaveLength(1)
})

test("проверка контактов и подтверждение доступны на компьютере и телефоне без переполнения", async ({ page, request }) => {
  const type = await (await request.post("/api/owner/meeting-types", { data: { name: "Обсудим вашу следующую идею", durationMinutes: 45 } })).json() as { id: string }
  await request.post(`/api/owner/meeting-types/${type.id}/publish`)
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/booking/${type.id}`)
    const slots = await (await request.get(`/api/meeting-types/${type.id}/slots`)).json() as { slots: { start: string, end: string }[] }
    const first = slots.slots[0]
    const time = (value: string) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
    await page.getByRole("button", { name: `${time(first.start)}–${time(first.end)}`, exact: true }).click()
    await page.getByLabel("Ваше имя", { exact: true }).fill(" ")
    await page.getByLabel("Email", { exact: true }).fill("неверный-email")
    await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
    await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveAttribute("aria-invalid", "true")
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "true")
    await page.getByLabel("Ваше имя", { exact: true }).fill("Александра Петрова")
    await page.getByLabel("Email", { exact: true }).fill("alexandra.petrova@example.com")
    await expect(page.getByLabel("Ваше имя", { exact: true })).toHaveAttribute("aria-invalid", "false")
    await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("aria-invalid", "false")
    await page.screenshot({ path: `/private/tmp/booking04-form-${width}.png`, fullPage: true })
    expect(await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")).toBe(false)
    await page.getByRole("button", { name: "Подтвердить запись", exact: true }).click()
    await expect(page.getByRole("heading", { name: "Вы записаны на звонок" })).toBeVisible()
    expect(await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")).toBe(false)
    await page.screenshot({ path: `/private/tmp/booking04-confirmation-${width}.png`, fullPage: true })
    await page.goto("/owner")
    const list = page.getByRole("region", { name: "Предстоящие встречи" })
    await expect(list.getByRole("article")).toHaveCount(width === 1280 ? 1 : width === 390 ? 2 : 3)
    expect(await page.evaluate("document.documentElement.scrollWidth > window.innerWidth")).toBe(false)
    await page.screenshot({ path: `/private/tmp/booking04-owner-${width}.png`, fullPage: true })
  }
})

test("список владельца обновляется при возврате фокуса и видимости", async ({ page, request }) => {
  const type = await (await request.post("/api/owner/meeting-types", { data: { name: "Новые встречи", durationMinutes: 30 } })).json() as { id: string }
  await request.post(`/api/owner/meeting-types/${type.id}/publish`)
  const slots = await (await request.get(`/api/meeting-types/${type.id}/slots`)).json() as { slots: { start: string }[] }
  await page.goto("/owner")
  const list = page.getByRole("region", { name: "Предстоящие встречи" })
  await expect(list).toContainText("Пока нет предстоящих встреч")
  const book = async (start: string, guestName: string) => {
    const result = await request.post(`/api/meeting-types/${type.id}/meetings`, { data: { start, guestName, guestEmail: "guest@example.com" } })
    expect(result.status()).toBe(201)
  }
  await book(slots.slots[0].start, "Первый гость")
  await page.evaluate("window.dispatchEvent(new Event('focus'))")
  await expect(list.getByRole("article")).toHaveCount(1)
  await book(slots.slots[1].start, "Второй гость")
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
  await expect(list.getByRole("article")).toHaveCount(2)
})
