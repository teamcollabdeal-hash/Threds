/**
 * Реєстр можливостей Threads API (перевірено: листопад 2026).
 * Функції, яких немає в офіційному API, позначені supported:false — UI показує їх як недоступні,
 * а не імітує. Коли Meta додасть підтримку — реалізувати адаптер і змінити прапорець.
 */
export interface Capability { key: string; label: string; supported: boolean; note: string }

export const CAPABILITIES: Capability[] = [
  { key: "publish_text", label: "Текстові пости", supported: true, note: "До 500 символів, ≤5 унікальних посилань" },
  { key: "publish_image", label: "Фото", supported: true, note: "JPEG/PNG ≤8 МБ, публічний URL" },
  { key: "publish_video", label: "Відео", supported: true, note: "MP4/MOV, ≤5 хв, ≤1 ГБ, публічний URL" },
  { key: "publish_carousel", label: "Карусель", supported: true, note: "2–20 елементів, рахується як 1 пост" },
  { key: "native_schedule", label: "Нативне планування в Threads", supported: false,
    note: "API не має відкладеної публікації — планування виконує власний Automation Engine" },
  { key: "edit_published", label: "Редагування опублікованого поста", supported: false,
    note: "Через API недоступно. Можна редагувати лише заплановані (ще не опубліковані) пости" },
  { key: "delete_published", label: "Видалення опублікованого поста", supported: true, note: "DELETE /{media-id}" },
  { key: "insights", label: "Статистика взаємодій", supported: true, note: "views, likes, replies, reposts, quotes, shares" },
  { key: "password_login", label: "Вхід за логіном/паролем", supported: false,
    note: "Лише OAuth через Meta. Паролі акаунтів сервіс не приймає і не зберігає" },
  { key: "dm", label: "Особисті повідомлення", supported: false, note: "Відсутні в Threads API" },
];

export const LIMITS = {
  textMax: 500,
  maxLinks: 5,
  postsPer24h: 250,
  repliesPer24h: 1000,
  carouselMin: 2,
  carouselMax: 20,
  containerWaitMs: 30_000,
  tokenTtlDays: 60,
  tokenMinAgeHoursForRefresh: 24,
};
