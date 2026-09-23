import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { MapPin, Calendar as CalendarIcon, MessageCircle, Mail, Plus, Send, Users, Copy, Check, LogIn, ArrowRight, X } from "lucide-react";

// ────────────────────────────────────────────────────────────
// 1) PASTE YOUR FIREBASE CONFIG HERE (from Firebase console → Project settings → Your apps)
// ────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDi5eU3PutAsxDuMwoKgVovWy8lzM9Imhk",
  authDomain: "farside-app.firebaseapp.com",
  projectId: "farside-app",
  storageBucket: "farside-app.firebasestorage.app",
  messagingSenderId: "595873304429",
  appId: "1:595873304429:web:3a44e3533a792b4f6c1464",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const CITIES = [
  { name: "Copenhagen", country: "Denmark", tz: "Europe/Copenhagen", lat: 55.6761, lon: 12.5683 },
  { name: "New York", country: "USA", tz: "America/New_York", lat: 40.7128, lon: -74.0060 },
  { name: "Los Angeles", country: "USA", tz: "America/Los_Angeles", lat: 34.0522, lon: -118.2437 },
  { name: "London", country: "UK", tz: "Europe/London", lat: 51.5074, lon: -0.1278 },
  { name: "Paris", country: "France", tz: "Europe/Paris", lat: 48.8566, lon: 2.3522 },
  { name: "Berlin", country: "Germany", tz: "Europe/Berlin", lat: 52.5200, lon: 13.4050 },
  { name: "Tokyo", country: "Japan", tz: "Asia/Tokyo", lat: 35.6762, lon: 139.6503 },
  { name: "Seoul", country: "South Korea", tz: "Asia/Seoul", lat: 37.5665, lon: 126.9780 },
  { name: "Singapore", country: "Singapore", tz: "Asia/Singapore", lat: 1.3521, lon: 103.8198 },
  { name: "Sydney", country: "Australia", tz: "Australia/Sydney", lat: -33.8688, lon: 151.2093 },
  { name: "Mumbai", country: "India", tz: "Asia/Kolkata", lat: 19.0760, lon: 72.8777 },
  { name: "Dubai", country: "UAE", tz: "Asia/Dubai", lat: 25.2048, lon: 55.2708 },
  { name: "São Paulo", country: "Brazil", tz: "America/Sao_Paulo", lat: -23.5505, lon: -46.6333 },
  { name: "Mexico City", country: "Mexico", tz: "America/Mexico_City", lat: 19.4326, lon: -99.1332 },
  { name: "Toronto", country: "Canada", tz: "America/Toronto", lat: 43.6532, lon: -79.3832 },
  { name: "Cape Town", country: "South Africa", tz: "Africa/Johannesburg", lat: -33.9249, lon: 18.4241 },
  { name: "Bangkok", country: "Thailand", tz: "Asia/Bangkok", lat: 13.7563, lon: 100.5018 },
  { name: "Manila", country: "Philippines", tz: "Asia/Manila", lat: 14.5995, lon: 120.9842 },
  { name: "Moscow", country: "Russia", tz: "Europe/Moscow", lat: 55.7558, lon: 37.6173 },
  { name: "Beijing", country: "China", tz: "Asia/Shanghai", lat: 39.9042, lon: 116.4074 },
  { name: "Kathmandu", country: "Nepal", tz: "Asia/Kathmandu", lat: 27.7172, lon: 85.3240 },
];

function haversineKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
function localTimeIn(tz) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  } catch {
    return "--:--";
  }
}
function dayLabel(tz) {
  try {
    return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short" }).format(new Date());
  } catch {
    return "";
  }
}
function genCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / 86400000);
}

// ── Firestore data layer ────────────────────────────────────
// One document per couple, at spaces/{code}, containing meta/events/messages/memories/typing.
function spaceRef(code) {
  return doc(db, "spaces", code);
}
async function createSpace(code, member) {
  await setDoc(spaceRef(code), {
    meta: { code, createdAt: Date.now(), members: [member] },
    events: [],
    messages: [],
    memories: [],
    typing: {},
  });
}
async function fetchSpace(code) {
  const snap = await getDoc(spaceRef(code));
  return snap.exists() ? snap.data() : null;
}
async function joinSpace(code, member) {
  const space = await fetchSpace(code);
  if (!space) return { ok: false, error: "Couldn't find a space with that code." };
  const already = space.meta.members.some((m) => m.name === member.name);
  if (space.meta.members.length >= 2 && !already) {
    return { ok: false, error: "This space already has two people in it." };
  }
  if (!already) {
    const nextMembers = [...space.meta.members, member];
    await updateDoc(spaceRef(code), { "meta.members": nextMembers });
  }
  return { ok: true };
}
async function addMessage(code, msg) {
  await updateDoc(spaceRef(code), { messages: arrayUnion(msg) });
}
async function addEvent(code, evt) {
  await updateDoc(spaceRef(code), { events: arrayUnion(evt) });
}
async function removeEvent(code, evt) {
  await updateDoc(spaceRef(code), { events: arrayRemove(evt) });
}
async function addMemory(code, mem) {
  await updateDoc(spaceRef(code), { memories: arrayUnion(mem) });
}
async function setTyping(code, name, ts) {
  await updateDoc(spaceRef(code), { [`typing.${name}`]: ts });
}

const FONTS = (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
    .ldr-root {
      --night: #1B1F3B; --night-2: #262C52; --cream: #F7F1E3; --cream-2: #EFE6D0;
      --thread: #B5432E; --thread-dark: #8f331f; --gold: #C9A15A; --sage: #7C9885;
      --ink: #2B2A28; --muted: #7A7568;
      font-family: 'Inter', sans-serif; color: var(--ink);
    }
    .ldr-root .display { font-family: 'Fraunces', serif; }
    .ldr-root .mono { font-family: 'JetBrains Mono', monospace; }
    .ldr-stamp { border: 2px dashed var(--gold); border-radius: 4px; }
    .ldr-thread-line { background-image: repeating-linear-gradient(90deg, var(--thread), var(--thread) 6px, transparent 6px, transparent 12px); height: 2px; }
    .ldr-scroll::-webkit-scrollbar { width: 6px; }
    .ldr-scroll::-webkit-scrollbar-thumb { background: var(--cream-2); border-radius: 3px; }
    .ldr-btn-primary { background: var(--thread); color: var(--cream); transition: background .15s ease, transform .1s ease; }
    .ldr-btn-primary:hover { background: var(--thread-dark); transform: translateY(-1px); }
    .ldr-tab { transition: color .15s ease, border-color .15s ease; border-bottom: 2px solid transparent; }
    .ldr-tab.active { color: var(--thread); border-color: var(--thread); }
    .ldr-tab:not(.active) { color: var(--muted); }
    input, select, textarea { font-family: 'Inter', sans-serif; }
  `}</style>
);

function CitySelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-md border border-gray-300 bg-white text-sm">
      <option value="">Choose your city…</option>
      {CITIES.map((c) => (
        <option key={c.name} value={c.name}>{c.name}, {c.country}</option>
      ))}
    </select>
  );
}

function Onboard({ onEnter }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    if (!name || !city) return setError("Add your name and city first.");
    setBusy(true); setError("");
    const code = genCode();
    try {
      await createSpace(code, { name, city });
      onEnter({ code, myName: name });
    } catch (e) {
      setError("Couldn't reach the database. Check your Firebase config.");
    }
    setBusy(false);
  }

  async function handleJoin() {
    if (!name || !city || !codeInput) return setError("Fill in your name, city, and the code.");
    setBusy(true); setError("");
    const code = codeInput.trim().toUpperCase();
    try {
      const res = await joinSpace(code, { name, city });
      if (!res.ok) { setBusy(false); return setError(res.error); }
      onEnter({ code, myName: name });
    } catch (e) {
      setError("Couldn't reach the database. Check your Firebase config.");
    }
    setBusy(false);
  }

  return (
    <div className="ldr-root min-h-screen flex items-center justify-center p-6" style={{ background: "var(--night)" }}>
      {FONTS}
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto w-14 h-14 rounded-full flex items-center justify-center mb-4" style={{ background: "var(--gold)" }}>
            <Mail size={24} color="var(--night)" />
          </div>
          <h1 className="display text-3xl" style={{ color: "var(--cream)" }}>Farside</h1>
          <p className="text-sm mt-2" style={{ color: "var(--cream-2)" }}>A shared space for two people, two time zones.</p>
        </div>

        <div className="rounded-xl p-6" style={{ background: "var(--cream)" }}>
          {!mode && (
            <div className="space-y-3">
              <button onClick={() => setMode("create")} className="ldr-btn-primary w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                <Plus size={16} /> Start a new space
              </button>
              <button onClick={() => setMode("join")} className="w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border" style={{ borderColor: "var(--night-2)", color: "var(--night)" }}>
                <LogIn size={16} /> Join with a code
              </button>
            </div>
          )}
          {mode && (
            <div className="space-y-3">
              <button onClick={() => { setMode(null); setError(""); }} className="text-xs mb-1" style={{ color: "var(--muted)" }}>← back</button>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mira" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Your city</label>
                <CitySelect value={city} onChange={setCity} />
              </div>
              {mode === "join" && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: "var(--muted)" }}>Space code</label>
                  <input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder="e.g. 7K2XQP" className="mono w-full px-3 py-2 rounded-md border border-gray-300 text-sm tracking-widest" maxLength={6} />
                </div>
              )}
              {error && <p className="text-xs" style={{ color: "var(--thread)" }}>{error}</p>}
              <button disabled={busy} onClick={mode === "create" ? handleCreate : handleJoin} className="ldr-btn-primary w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60">
                {busy ? "One moment…" : mode === "create" ? "Create space" : "Join space"} <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
        <p className="text-center text-xs mt-4" style={{ color: "var(--cream-2)" }}>
          Anyone with your code can join this space — share it only with your person.
        </p>
      </div>
    </div>
  );
}

function DualClockHeader({ meta, myName }) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const members = meta.members || [];
  const me = members.find((m) => m.name === myName) || members[0];
  const them = members.find((m) => m.name !== myName) || members[1];
  const meCity = me && CITIES.find((c) => c.name === me.city);
  const themCity = them && CITIES.find((c) => c.name === them.city);
  const distance = meCity && themCity ? haversineKm(meCity, themCity) : null;

  const ClockCol = ({ person, cityObj, align }) => (
    <div className={`flex flex-col ${align === "right" ? "items-end text-right" : "items-start text-left"}`}>
      <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--cream-2)" }}>{person ? person.name : "Waiting…"}</span>
      <span className="display text-2xl" style={{ color: "var(--cream)" }}>{cityObj ? localTimeIn(cityObj.tz) : "--:--"}</span>
      <span className="text-[11px] flex items-center gap-1" style={{ color: "var(--cream-2)" }}>
        <MapPin size={10} /> {cityObj ? `${cityObj.name} · ${dayLabel(cityObj.tz)}` : "not joined yet"}
      </span>
    </div>
  );

  return (
    <div className="px-5 pt-5 pb-4" style={{ background: "var(--night)" }}>
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        <ClockCol person={me} cityObj={meCity} align="left" />
        <div className="flex-1 flex flex-col items-center px-4">
          <span className="mono text-[10px] mb-1" style={{ color: "var(--gold)" }}>{distance !== null ? `${distance.toLocaleString()} km` : "—"}</span>
          <div className="ldr-thread-line w-full" />
        </div>
        <ClockCol person={them} cityObj={themCity} align="right" />
      </div>
    </div>
  );
}

function HomeView({ events, memories, messages, go }) {
  const upcoming = [...events].sort((a, b) => a.date.localeCompare(b.date)).filter((e) => daysUntil(e.date) >= 0)[0];
  const lastMsg = messages[messages.length - 1];
  const lastMemory = [...memories].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div className="rounded-xl p-6 ldr-stamp text-center" style={{ background: "var(--cream)" }}>
        {upcoming ? (
          <>
            <p className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Next together</p>
            <p className="display text-5xl mt-1" style={{ color: "var(--thread)" }}>{daysUntil(upcoming.date)}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>days until "{upcoming.title}"</p>
          </>
        ) : (
          <>
            <p className="display text-xl" style={{ color: "var(--night)" }}>No date on the calendar yet</p>
            <button onClick={() => go("calendar")} className="ldr-btn-primary mt-3 px-4 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-1">
              <Plus size={14} /> Add a countdown
            </button>
          </>
        )}
      </div>
      <button onClick={() => go("chat")} className="w-full text-left rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--cream)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: "var(--muted)" }}><MessageCircle size={12} /> Chat</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink)" }}>{lastMsg ? `${lastMsg.sender}: ${lastMsg.text}` : "No messages yet — say hi."}</p>
        </div>
        <ArrowRight size={16} style={{ color: "var(--muted)" }} />
      </button>
      <button onClick={() => go("memories")} className="w-full text-left rounded-xl p-4 flex items-center justify-between" style={{ background: "var(--cream)" }}>
        <div>
          <p className="text-xs uppercase tracking-wide flex items-center gap-1" style={{ color: "var(--muted)" }}><Mail size={12} /> Memories</p>
          <p className="text-sm mt-1" style={{ color: "var(--ink)" }}>{lastMemory ? lastMemory.title : "No postcards yet — add your first memory."}</p>
        </div>
        <ArrowRight size={16} style={{ color: "var(--muted)" }} />
      </button>
    </div>
  );
}

function CalendarView({ code, events }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!title || !date) return;
    setSaving(true);
    await addEvent(code, { id: Date.now(), title, date });
    setTitle(""); setDate(""); setSaving(false);
  }
  async function handleRemove(evt) {
    await removeEvent(code, evt);
  }

  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <div className="rounded-xl p-4" style={{ background: "var(--cream)" }}>
        <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--muted)" }}>Add a date</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Flight home, anniversary…" className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <button onClick={handleAdd} disabled={saving} className="ldr-btn-primary px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1 justify-center">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
      <div className="space-y-2">
        {sorted.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--cream-2)" }}>Nothing on the calendar yet.</p>}
        {sorted.map((e) => {
          const d = daysUntil(e.date);
          return (
            <div key={e.id} className="rounded-lg p-3 flex items-center justify-between" style={{ background: "var(--cream)" }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex flex-col items-center justify-center ldr-stamp shrink-0">
                  <span className="display text-sm leading-none" style={{ color: d < 0 ? "var(--muted)" : "var(--thread)" }}>{Math.abs(d)}</span>
                  <span className="text-[8px] uppercase" style={{ color: "var(--muted)" }}>{d < 0 ? "ago" : "days"}</span>
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>{e.title}</p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>{e.date}</p>
                </div>
              </div>
              <button onClick={() => handleRemove(e)} className="p-1" style={{ color: "var(--muted)" }}><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatView({ code, myName, messages, typing }) {
  const [text, setText] = useState("");
  const bottomRef = useRef(null);
  const throttleRef = useRef(0);

  const partnerTyping = Object.entries(typing || {}).some(([who, ts]) => who !== myName && Date.now() - ts < 3000);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, partnerTyping]);

  function handleTyping(val) {
    setText(val);
    const now = Date.now();
    if (now - throttleRef.current < 1200) return;
    throttleRef.current = now;
    setTyping(code, myName, now);
  }

  async function send() {
    if (!text.trim()) return;
    await addMessage(code, { id: Date.now(), sender: myName, text: text.trim(), ts: Date.now() });
    setText("");
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: "calc(100vh - 190px)" }}>
      <div className="flex-1 overflow-y-auto ldr-scroll p-5 space-y-2">
        {messages.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--cream-2)" }}>No messages yet — say hi.</p>}
        {messages.map((m) => {
          const mine = m.sender === myName;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
  <div className={`max-w-[75%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
    {!mine && <p className="text-[10px] mb-0.5 ml-1" style={{ color: "var(--cream-2)" }}>{m.sender}</p>}
    <div
      className="inline-block w-fit px-3 py-2 rounded-2xl text-sm"
      style={{
        background: mine ? "var(--thread)" : "var(--cream)",
        color: mine ? "var(--cream)" : "var(--ink)",
        borderBottomRightRadius: mine ? 4 : 16,
        borderBottomLeftRadius: mine ? 16 : 4,
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
      }}
    >
      {m.text}
    </div>
  </div>
</div>
          );
        })}
        {partnerTyping && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-2xl text-sm flex gap-1 items-center" style={{ background: "var(--cream)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.15s" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0.3s" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-3 flex items-center gap-2" style={{ background: "var(--night-2)" }}>
        <input
          value={text}
          onChange={(e) => handleTyping(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type something…"
          className="flex-1 px-3 py-2 rounded-full border-none text-sm"
          style={{ background: "var(--cream)" }}
        />
        <button onClick={send} className="ldr-btn-primary w-10 h-10 rounded-full flex items-center justify-center shrink-0">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function MemoriesView({ code, myName, memories }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function handleAdd() {
    if (!title) return;
    await addMemory(code, { id: Date.now(), title, note, date, author: myName, photoUrl: photoUrl.trim() });
    setTitle(""); setNote(""); setPhotoUrl(""); setOpen(false);
  }

  const sorted = [...memories].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-4">
      <button onClick={() => setOpen((o) => !o)} className="ldr-btn-primary px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1">
        <Plus size={14} /> Add a postcard
      </button>
      {open && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--cream)" }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened…" rows={3} className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="Photo link (optional) — paste an image URL" className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="px-3 py-2 rounded-md border border-gray-300 text-sm" />
          <button onClick={handleAdd} className="ldr-btn-primary px-4 py-2 rounded-md text-sm font-medium">Save postcard</button>
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {sorted.length === 0 && <p className="text-sm sm:col-span-2 text-center py-8" style={{ color: "var(--cream-2)" }}>No postcards yet.</p>}
        {sorted.map((m) => (
          <div key={m.id} className="rounded-lg p-4 relative ldr-stamp overflow-hidden" style={{ background: "var(--cream)" }}>
            <div className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center z-10" style={{ background: "var(--gold)" }}>
              <Mail size={14} color="var(--night)" />
            </div>
            {m.photoUrl && (
              <img src={m.photoUrl} alt={m.title} className="w-full h-36 object-cover rounded-md mb-3" onError={(e) => { e.target.style.display = "none"; }} />
            )}
            <p className="display text-lg pr-8" style={{ color: "var(--night)" }}>{m.title}</p>
            <p className="text-sm mt-1" style={{ color: "var(--ink)" }}>{m.note}</p>
            <p className="text-[11px] mt-3" style={{ color: "var(--muted)" }}>{m.date} · {m.author}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-medium shadow-lg flex items-center gap-2" style={{ background: "var(--gold)", color: "var(--night)" }}>
      {toast}
    </div>
  );
}

export default function FarsideApp() {
  const [session, setSession] = useState(null); // { code, myName }
  const [space, setSpace] = useState(null); // live doc: { meta, events, messages, memories, typing }
  const [view, setView] = useState("home");
  const [copied, setCopied] = useState(false);
  const [unread, setUnread] = useState({ chat: false, calendar: false, memories: false });
  const [toast, setToast] = useState(null);
  const viewRef = useRef(view);
  const toastTimer = useRef(null);
  const prevCounts = useRef(null);

  useEffect(() => {
    viewRef.current = view;
    if (view === "chat" || view === "calendar" || view === "memories") {
      setUnread((u) => ({ ...u, [view]: false }));
    }
  }, [view]);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }

  // Single real-time subscription — Firestore pushes updates instantly, no polling needed.
  useEffect(() => {
    if (!session) return;
    const unsub = onSnapshot(spaceRef(session.code), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();

      if (prevCounts.current) {
        const p = prevCounts.current;
        if (data.messages.length > p.messages) {
          const latest = data.messages[data.messages.length - 1];
          if (latest.sender !== session.myName) {
            if (viewRef.current !== "chat") setUnread((u) => ({ ...u, chat: true }));
            showToast(`💬 ${latest.sender}: ${latest.text.slice(0, 40)}`);
          }
        }
        if (data.events.length > p.events) {
          if (viewRef.current !== "calendar") setUnread((u) => ({ ...u, calendar: true }));
          showToast("📅 A new date was added to the calendar");
        }
        if (data.memories.length > p.memories) {
          if (viewRef.current !== "memories") setUnread((u) => ({ ...u, memories: true }));
          showToast("💌 A new postcard was added");
        }
      }
      prevCounts.current = { messages: data.messages.length, events: data.events.length, memories: data.memories.length };
      setSpace(data);
    });
    return () => unsub();
  }, [session]);

  function copyCode() {
    if (!session) return;
    navigator.clipboard?.writeText(session.code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!session || !space) {
    return <Onboard onEnter={setSession} />;
  }

  const tabs = [
    { id: "home", label: "Home", icon: Users },
    { id: "calendar", label: "Calendar", icon: CalendarIcon },
    { id: "chat", label: "Chat", icon: MessageCircle },
    { id: "memories", label: "Memories", icon: Mail },
  ];

  return (
    <div className="ldr-root min-h-screen" style={{ background: "var(--night)" }}>
      {FONTS}
      <Toast toast={toast} />
      <DualClockHeader meta={space.meta} myName={session.myName} />
      <div className="flex items-center justify-between px-5 max-w-3xl mx-auto" style={{ background: "var(--night)" }}>
        <div className="flex gap-4">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setView(t.id)} className={`ldr-tab relative flex items-center gap-1 pb-2 pt-1 text-xs font-medium ${view === t.id ? "active" : ""}`}>
              <t.icon size={13} /> {t.label}
              {unread[t.id] && <span className="absolute -top-0.5 -right-1.5 w-1.5 h-1.5 rounded-full" style={{ background: "var(--thread)" }} />}
            </button>
          ))}
        </div>
        <button onClick={copyCode} className="mono text-[10px] flex items-center gap-1 pb-2" style={{ color: "var(--gold)" }}>
          {copied ? <Check size={11} /> : <Copy size={11} />} {session.code}
        </button>
      </div>
      <div style={{ background: "var(--cream-2)", minHeight: "calc(100vh - 130px)" }}>
        {view === "home" && <HomeView events={space.events} memories={space.memories} messages={space.messages} go={setView} />}
        {view === "calendar" && <CalendarView code={session.code} events={space.events} />}
        {view === "chat" && <ChatView code={session.code} myName={session.myName} messages={space.messages} typing={space.typing} />}
        {view === "memories" && <MemoriesView code={session.code} myName={session.myName} memories={space.memories} />}
      </div>
    </div>
  );
}
