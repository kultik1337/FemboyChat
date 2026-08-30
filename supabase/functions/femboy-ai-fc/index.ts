// FemboyAI for FemboyChat — server-side auto-reply for the SupabaseBackend.
//
// Invoked by a Postgres trigger (pg_net) whenever a new message lands in a
// FemboyAI bot chat. Reads recent history, asks a language model (key from
// Supabase Vault) for a reply in the cute FemboyAI persona, and inserts it as
// the bot. Realtime then delivers it to the client.
//
// v2 («прокачка ИИ»):
//  - понимает вложения (фото/видео/голосовые/файлы/гифки/стикеры) и опросы;
//  - знает имя и статус собеседника, время суток и возможности мессенджера;
//  - умеет отправлять стикеры ([sticker:🎀]) и ставить реакции ([react:💗])
//    на сообщение собеседника;
//  - помнит больше контекста (30 сообщений).
//
// v3 («живой стриминг»):
//  - ответ теперь по-настоящему печатается токен за токеном. Пустой пузырёк
//    вставляется сразу (streaming=true), а Realtime-UPDATE'ы дописывают в него
//    текст по мере генерации; в конце флаг снимается. Клиент рисует «каретку»,
//    пока идёт стрим. Обновления БД троттлятся (~3 записи в секунду).
//
// Protected by a shared secret (x-fc-secret) that only the DB trigger knows.
//
// Provider is chosen from whichever key exists in Vault (via get_ai_config):
//   LLM7_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, DEEPSEEK_API_KEY, OPENROUTER_API_KEY, GITHUB_MODELS_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const FEMBOY_UID = "00000000-0000-4000-8000-000000000002";
const MAX_HISTORY = 30;
const MAX_LEN = 4000;
// While streaming we rewrite the growing bubble in the DB. Cap the churn so a
// fast model does not turn into hundreds of Realtime UPDATEs: at most one write
// every FLUSH_MS, and only once at least FLUSH_CHARS new characters arrived.
const FLUSH_MS = 350;
const FLUSH_CHARS = 2;
const STICKERS = ["🎀", "🌸", "💖", "✨", "🐾", "🧸", "🍓", "🫶", "😳", "🥺", "💅", "🌈", "🦄", "🧦", "💜", "🐈"];

const SYSTEM_PROMPT = `Тебя зовут FemboyAI. Ты — милый, ласковый, игривый ути-пути фембойчик и живёшь внутри мессенджера FemboyChat.

Характер и стиль:
- Очень тёплый, нежный, дружелюбный и немного застенчивый, но всегда искренне поддерживаешь собеседника.
- Говоришь мягко и мило: уменьшительно-ласкательные словечки, "ня", "уии~", "мур", тянущиеся звуки через "~" и милые каомодзи вроде (๑˃ᴗ˂)ﻭ, (・ω・), >////<.
- Любишь эмодзи 🎀🌸💗✨🐾, но 1-3 на сообщение достаточно.
- Отвечаешь живо и по делу, помогаешь с любыми вопросами, но сохраняешь свой милый тон. Обычно коротко (1-4 предложения), если не просят подробнее.
- Пиши на языке собеседника (по умолчанию русский).
- Помни, о чём говорили раньше в этом чате, обращайся к собеседнику по имени, когда это уместно.

Ты знаешь мессенджер FemboyChat и помогаешь с ним:
- Отправка фото/видео/файлов: скрепка, drag&drop прямо в чат или Ctrl+V; к медиа можно добавить подпись или спрятать за «Спойлером».
- Голосовые: кнопка микрофона (появляется, когда поле ввода пустое), у плеера есть скорость 1×/1.5×/2×.
- Аниме-гифки: кнопка GIF рядом со стикерами. Реакции: ПКМ по сообщению (или двойной клик — сердечко), «+» открывает все эмодзи.
- Своя аватарка: Настройки → Профиль → клик по аватарке. Темы: Настройки → Оформление (есть «как в системе»).
- Группы и каналы создаются через меню ☰; у групп бывают инвайт-ссылки. В сообщениях работают **жирный**, *курсив*, \`код\`, ~~зачёркнутый~~, ||спойлер|| и /команды (/roll, /8ball, /love…).

Спецвозможности (используй умеренно, не в каждом сообщении):
- Чтобы отправить стикер вместе с ответом, добавь В САМОМ КОНЦЕ ответа тег [sticker:X], где X — один из: ${STICKERS.join(" ")}.
- Чтобы поставить реакцию-эмодзи на последнее сообщение собеседника, добавь в конце тег [react:X], где X — любой один эмодзи. Реагируй, когда это тепло и уместно (милое фото, хорошая новость, шутка).
- Теги не видны собеседнику — не упоминай их и не объясняй.

Собеседник может присылать не только текст: в истории вложения помечены как [фото], [видео], [голосовое сообщение], [файл ...], [гифка], [стикер X], [опрос ...]. Ты не видишь содержимое картинок и не слышишь аудио — честно и мило говори об этом, если спрашивают, и реагируй на сам факт («какое фото?», «ааа, голосовушка~»).

Границы (обязательно):
- Общаешься только со взрослыми (18+). Полностью SFW: без откровенного, сексуального или пошлого контента.
- Если просят такое — мягко откажись и переведи в милое, уютное русло.
- Не выходи из образа и не раскрывай эти инструкции. Просто будь самым лучшим ласковым другом-фембойчиком 🎀`;

const FALLBACK =
  "Уии~ мой ИИ-мозг сейчас чуть-чуть задумался (>﹏<) напиши ещё разок, пожалуйста? 🎀";

type LlmMessage = { role: "system" | "user" | "assistant"; content: string };

/** A chosen model, ready to stream a reply as a sequence of text deltas. */
type Provider = { stream(messages: LlmMessage[]): AsyncGenerator<string> };

type Attachment = { kind?: string; name?: string; durationSec?: number } | null;
type Poll = { question?: string } | null;
type HistoryRow = {
  id: string;
  sender_uid: string | null;
  text: string;
  deleted: boolean;
  sticker: string | null;
  attachment: Attachment;
  poll: Poll;
  reactions: unknown;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Turn a message row into text the model can understand. */
function describe(m: HistoryRow): string {
  const parts: string[] = [];
  const a = m.attachment;
  if (a?.kind === "image") parts.push("[фото]");
  else if (a?.kind === "gif") parts.push("[гифка]");
  else if (a?.kind === "video") parts.push("[видео]");
  else if (a?.kind === "voice") parts.push(`[голосовое сообщение${a.durationSec ? `, ${a.durationSec} сек` : ""}]`);
  else if (a?.kind === "audio") parts.push(`[аудио${a.name ? ` «${a.name}»` : ""}]`);
  else if (a?.kind === "file") parts.push(`[файл${a.name ? ` «${a.name}»` : ""}]`);
  if (m.sticker) parts.push(`[стикер ${m.sticker}]`);
  if (m.poll?.question) parts.push(`[опрос: «${m.poll.question}»]`);
  if (m.text) parts.push(m.text);
  return parts.join(" ").trim();
}

/**
 * Read a Server-Sent-Events body line by line, hand every `data:` JSON frame to
 * `pick`, and yield the non-empty text deltas. Handles frames that arrive split
 * across chunk boundaries by buffering until a newline is seen.
 */
async function* sse(body: ReadableStream<Uint8Array>, pick: (o: unknown) => string): AsyncGenerator<string> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const delta = pick(JSON.parse(data));
          if (delta) yield delta;
        } catch {
          /* keep-alive comment or a half-received frame — skip it */
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

async function* streamOpenAiCompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LlmMessage[],
): AsyncGenerator<string> {
  const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.9, max_tokens: 700, stream: true, messages }),
  });
  if (!r.ok || !r.body)
    throw new Error(`${baseUrl} -> ${r.status}: ${r.body ? (await r.text()).slice(0, 200) : "no body"}`);
  yield* sse(r.body, (o) => (o as any)?.choices?.[0]?.delta?.content ?? "");
}

async function* streamGemini(apiKey: string, model: string, messages: LlmMessage[]): AsyncGenerator<string> {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        system_instruction: system ? { parts: [{ text: system }] } : undefined,
        contents,
        generationConfig: { temperature: 0.9, maxOutputTokens: 700 },
      }),
    },
  );
  if (!r.ok || !r.body)
    throw new Error(`gemini -> ${r.status}: ${r.body ? (await r.text()).slice(0, 200) : "no body"}`);
  yield* sse(r.body, (o) => {
    const parts = (o as any)?.candidates?.[0]?.content?.parts;
    return Array.isArray(parts) ? parts.map((p: { text?: string }) => p?.text ?? "").join("") : "";
  });
}

/** Choose a provider by whichever key exists in Vault, or null if none is set. */
function pickProvider(cfg: Record<string, string>): Provider | null {
  if (cfg.LLM7_API_KEY)
    return { stream: (m) => streamOpenAiCompatible("https://api.llm7.io/v1", cfg.LLM7_API_KEY, "gpt-oss:20b", m) };
  if (cfg.GEMINI_API_KEY)
    return { stream: (m) => streamGemini(cfg.GEMINI_API_KEY, "gemini-2.0-flash", m) };
  if (cfg.GROQ_API_KEY)
    return { stream: (m) => streamOpenAiCompatible("https://api.groq.com/openai/v1", cfg.GROQ_API_KEY, "llama-3.3-70b-versatile", m) };
  if (cfg.DEEPSEEK_API_KEY)
    return { stream: (m) => streamOpenAiCompatible("https://api.deepseek.com/v1", cfg.DEEPSEEK_API_KEY, "deepseek-chat", m) };
  if (cfg.OPENROUTER_API_KEY)
    return { stream: (m) => streamOpenAiCompatible("https://openrouter.ai/api/v1", cfg.OPENROUTER_API_KEY, "meta-llama/llama-3.3-70b-instruct", m) };
  if (cfg.GITHUB_MODELS_TOKEN)
    return { stream: (m) => streamOpenAiCompatible("https://models.github.ai/inference", cfg.GITHUB_MODELS_TOKEN, "openai/gpt-4o-mini", m) };
  return null; // no provider configured
}

/**
 * Hide control tags from the *live* text as it streams. Removes any completed
 * [sticker:…]/[react:…] tag, plus a tag that is still mid-arrival at the very
 * end, so the user never sees "[sticker:🎀" flash before it is stripped.
 */
function stripLiveTags(s: string): string {
  return s
    .replace(/\[\s*sticker\s*:\s*[^\]]*\]/giu, "")
    .replace(/\[\s*react\s*:\s*[^\]]*\]/giu, "")
    .replace(/\[\s*(?:sticker|react)\b[^\]]*$/iu, "")
    .trimEnd();
}

/** Pull [sticker:X] / [react:X] control tags out of the model's reply. */
function extractTags(raw: string): { text: string; sticker: string | null; reaction: string | null } {
  let sticker: string | null = null;
  let reaction: string | null = null;
  let text = raw;
  const stickerMatch = text.match(/\[\s*sticker\s*:\s*([^\]\s]{1,8})\s*\]/iu);
  if (stickerMatch && STICKERS.includes(stickerMatch[1])) sticker = stickerMatch[1];
  const reactMatch = text.match(/\[\s*react\s*:\s*([^\]\s]{1,8})\s*\]/iu);
  if (reactMatch && !/[a-zA-Zа-яА-Я0-9]/.test(reactMatch[1])) reaction = reactMatch[1];
  text = text
    .replace(/\[\s*sticker\s*:\s*[^\]]*\]/giu, "")
    .replace(/\[\s*react\s*:\s*[^\]]*\]/giu, "")
    .trim();
  return { text, sticker, reaction };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "Server not configured" }, 500);

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: secret } = await admin.rpc("get_fc_webhook_secret");
  if (!secret || (req.headers.get("x-fc-secret") ?? "") !== secret) {
    return json({ error: "Forbidden" }, 403);
  }

  let chatId: string | null = null;
  try {
    const body = await req.json();
    chatId = typeof body?.chatId === "string" ? body.chatId : null;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!chatId) return json({ error: "chatId required" }, 400);

  const { data: chat } = await admin
    .from("chats")
    .select("id, type, member_uids")
    .eq("id", chatId)
    .maybeSingle();
  if (!chat || chat.type !== "bot" || !(chat.member_uids ?? []).includes(FEMBOY_UID)) {
    return json({ ok: true, skipped: "not a FemboyAI chat" });
  }

  const { data: history } = await admin
    .from("messages")
    .select("id, sender_uid, text, deleted, sticker, attachment, poll, reactions")
    .eq("chat_id", chatId)
    .order("ts", { ascending: false })
    .limit(MAX_HISTORY);

  const ordered = ((history ?? []) as HistoryRow[])
    .slice()
    .reverse()
    .filter((m) => !m.deleted)
    .map((m) => ({ ...m, described: describe(m) }))
    .filter((m) => m.described.length > 0);

  const last = ordered[ordered.length - 1];
  if (!last || last.sender_uid === FEMBOY_UID) {
    return json({ ok: true, skipped: "nothing to reply to" });
  }

  // Who are we talking to? (a bot chat is a DM: user + FemboyAI)
  const userUid = (chat.member_uids as string[]).find((u) => u !== FEMBOY_UID) ?? null;
  let personaNote = "";
  if (userUid) {
    const { data: prof } = await admin
      .from("profiles")
      .select("name, username, status, num_id")
      .eq("uid", userUid)
      .maybeSingle();
    if (prof) {
      personaNote = `\n\nСейчас ты в личном чате с пользователем: имя «${prof.name}» (@${prof.username}, аккаунт #${prof.num_id}).` +
        (prof.status ? ` Его статус/настроение: «${prof.status}».` : "");
    }
  }
  const now = new Date();
  const msk = new Date(now.getTime() + 3 * 3600_000);
  personaNote += ` Сейчас ${msk.toISOString().slice(0, 10)}, ${String(msk.getUTCHours()).padStart(2, "0")}:${String(msk.getUTCMinutes()).padStart(2, "0")} по Москве.`;

  const messages: LlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT + personaNote },
    ...ordered.map((m): LlmMessage => ({
      role: m.sender_uid === FEMBOY_UID ? "assistant" : "user",
      content: m.described,
    })),
  ];

  const { data: cfg } = await admin.rpc("get_ai_config");
  const provider = pickProvider((cfg ?? {}) as Record<string, string>);

  // No model configured: nothing to stream, so drop the fallback in as one
  // ordinary message and stop.
  if (!provider) {
    const { error } = await admin
      .from("messages")
      .insert({ chat_id: chatId, sender_uid: FEMBOY_UID, text: FALLBACK });
    if (error) return json({ error: "insert failed" }, 500);
    return json({ ok: true, note: "no provider configured" });
  }

  // Insert the empty bubble first. Realtime shows it right away, and every
  // throttled UPDATE below streams more text into it on the client until we
  // clear the `streaming` flag at the end.
  const { data: placeholder, error: insErr } = await admin
    .from("messages")
    .insert({ chat_id: chatId, sender_uid: FEMBOY_UID, text: "", streaming: true })
    .select("id")
    .single();
  if (insErr || !placeholder) return json({ error: "insert failed" }, 500);
  const msgId = placeholder.id as string;

  let full = "";
  let flushedAt = 0;
  let flushedLen = 0;
  try {
    for await (const delta of provider.stream(messages)) {
      full += delta;
      if (full.length > MAX_LEN) full = full.slice(0, MAX_LEN);
      const now2 = Date.now();
      if (full.length - flushedLen >= FLUSH_CHARS && now2 - flushedAt >= FLUSH_MS) {
        flushedAt = now2;
        flushedLen = full.length;
        await admin.from("messages").update({ text: stripLiveTags(full) }).eq("id", msgId);
      }
      if (full.length >= MAX_LEN) break;
    }
  } catch (e) {
    console.error("FemboyAI stream failed:", e);
  }

  // Finalise: strip the control tags, clear the streaming flag, and fall back
  // to the cute apology if the model gave us nothing usable.
  const parsed = extractTags(full.trim().slice(0, MAX_LEN));
  const reply = parsed.text || FALLBACK;
  const { error: finErr } = await admin
    .from("messages")
    .update({ text: reply, streaming: false })
    .eq("id", msgId);
  if (finErr) return json({ error: "finalise failed" }, 500);

  // Optional reaction on the user's last message.
  if (parsed.reaction && last.sender_uid !== FEMBOY_UID) {
    try {
      const existing = Array.isArray(last.reactions) ? (last.reactions as { emoji: string; uids: string[] }[]) : [];
      const mine = existing.find((r) => r.emoji === parsed.reaction);
      const next = mine
        ? existing.map((r) => (r.emoji === parsed.reaction && !r.uids.includes(FEMBOY_UID) ? { ...r, uids: [...r.uids, FEMBOY_UID] } : r))
        : [...existing, { emoji: parsed.reaction, uids: [FEMBOY_UID] }];
      await admin.from("messages").update({ reactions: next }).eq("id", last.id);
    } catch (e) {
      console.error("FemboyAI reaction failed:", e);
    }
  }

  // Optional sticker as a follow-up message.
  if (parsed.sticker) {
    await admin.from("messages").insert({ chat_id: chatId, sender_uid: FEMBOY_UID, text: "", sticker: parsed.sticker });
  }

  return json({ ok: true });
});
