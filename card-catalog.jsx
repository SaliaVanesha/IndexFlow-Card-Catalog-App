import { useState, useEffect, useMemo, useRef } from "react";

const FONT_LINK_ID = "card-catalog-fonts";

function useFonts() {
  useEffect(() => {
    if (document.getElementById(FONT_LINK_ID)) return;
    const link = document.createElement("link");
    link.id = FONT_LINK_ID;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Special+Elite&family=Work+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
    document.head.appendChild(link);
  }, []);
}

const COLORS = {
  bg: "#1E1B16",
  drawerLine: "#3A342A",
  paper: "#F4EEDD",
  paperShadow: "#DDD3B6",
  ink: "#2B2620",
  inkMuted: "#8C8370",
  textOnDark: "#EDE6D3",
  textMutedOnDark: "#8C8370",
  brass: "#B98B4E",
  teal: "#4F7A72",
  danger: "#D97757",
  surface: "rgba(255,255,255,0.04)",
};

const TAB_COLORS = [COLORS.teal, COLORS.brass, "#8A5A44", "#5B6E8C", "#6B8F5A", "#8C5B7A", "#A6763A", "#B06B6B", "#4A7A9C", "#9C7A4A"];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function normalizeTag(t) {
  return t.trim().toLowerCase().replace(/\s+/g, " ");
}
function tabColorFor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return TAB_COLORS[Math.abs(hash) % TAB_COLORS.length];
}
function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

async function callClaude(messages, systemPrompt) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await response.json();
  const text = (data.content || [])
    .map((block) => (block.type === "text" ? block.text : ""))
    .filter(Boolean)
    .join("\n");
  return text;
}

export default function App() {
  useFonts();
  const [entries, setEntries] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("catalog_entries", false);
        setEntries(res && res.value ? JSON.parse(res.value) : []);
      } catch (e) {
        setEntries([]);
      }
    })();
  }, []);

  const persist = async (next) => {
    setEntries(next);
    try {
      const res = await window.storage.set("catalog_entries", JSON.stringify(next), false);
      setSaveError(res ? "" : "Couldn't save — try again.");
    } catch (e) {
      setSaveError("Couldn't save — try again.");
    }
  };

  const active = useMemo(() => (entries || []).filter((e) => !e.archived), [entries]);
  const archived = useMemo(() => (entries || []).filter((e) => e.archived), [entries]);

  const tagIndex = useMemo(() => {
    const map = new Map();
    active.forEach((e) => {
      (e.tags || []).forEach((raw) => {
        const key = normalizeTag(raw);
        if (!key) return;
        if (!map.has(key)) map.set(key, { tag: raw.trim(), entries: [] });
        map.get(key).entries.push(e.title);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.entries.length - a.entries.length || a.tag.localeCompare(b.tag));
  }, [active]);

  const categoryCounts = useMemo(() => {
    const map = new Map();
    active.forEach((e) => {
      const cat = e.category?.trim() || "Uncategorized";
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [active]);

  const filteredEntries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter(
      (e) => e.title.toLowerCase().includes(q) || (e.category || "").toLowerCase().includes(q) || (e.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }, [active, query]);

  const filteredTags = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tagIndex;
    return tagIndex.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tagIndex, query]);

  const openNew = () =>
    setEditing({ id: null, title: "", category: "", notes: "", tags: [], archived: false, dueDate: "", createdAt: new Date().toISOString(), urgent: false, important: false });
  const openEdit = (entry) => setEditing({ ...entry, tags: [...(entry.tags || [])] });

  const saveEditing = () => {
    if (!editing.title.trim()) return;
    const stamped = { ...editing, updatedAt: new Date().toISOString() };
    const next = stamped.id ? entries.map((e) => (e.id === stamped.id ? stamped : e)) : [...entries, { ...stamped, id: uid() }];
    persist(next);
    setEditing(null);
  };

  const deleteEditing = () => {
    if (!editing.id) return setEditing(null);
    persist(entries.filter((e) => e.id !== editing.id));
    setEditing(null);
  };

  const toggleArchive = (id, value) => {
    persist(entries.map((e) => (e.id === id ? { ...e, archived: value } : e)));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "catalog-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (entries === null) {
    return (
      <div style={{ background: COLORS.bg, color: COLORS.textMutedOnDark, height: "100vh" }} className="flex items-center justify-center">
        <span style={{ fontFamily: "Work Sans, sans-serif" }}>Opening the drawer…</span>
      </div>
    );
  }

  const TABS = [
    { id: "dashboard", label: "Dashboard" },
    { id: "entries", label: "Entries" },
    { id: "calendar", label: "Calendar" },
    { id: "focus", label: "Focus" },
    { id: "matrix", label: "Matrix" },
    { id: "agent", label: "Agent" },
    { id: "tags", label: "Tag index" },
    { id: "archived", label: `Archived${archived.length ? ` (${archived.length})` : ""}` },
  ];

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.textOnDark, fontFamily: "Work Sans, sans-serif" }}>
      <Header tab={tab} setTab={setTab} tabs={TABS} onExport={exportData} />

      <main className="max-w-3xl mx-auto px-5 pb-24 pt-6">
        {(tab === "entries" || tab === "tags") && (
          <div className="flex gap-3 mb-6">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "entries" ? "Search entries, categories, tags…" : "Search tags…"}
              className="flex-1 px-4 py-2.5 rounded-lg outline-none"
              style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textOnDark, fontSize: 14 }}
            />
            {tab === "entries" && (
              <button onClick={openNew} className="px-4 py-2.5 rounded-lg font-medium whitespace-nowrap" style={{ background: COLORS.brass, color: "#1E1B16", fontSize: 14 }}>
                + New entry
              </button>
            )}
          </div>
        )}

        {saveError && <p style={{ color: COLORS.danger, fontSize: 13, marginBottom: 16 }}>{saveError}</p>}

        {tab === "dashboard" && <Dashboard active={active} archived={archived} tagIndex={tagIndex} categoryCounts={categoryCounts} onAdd={openNew} onOpen={openEdit} />}
        {tab === "entries" && <EntriesGrid entries={filteredEntries} onOpen={openEdit} tagIndex={tagIndex} />}
        {tab === "calendar" && <CalendarView entries={active} onOpen={openEdit} />}
        {tab === "focus" && <PomodoroTimer entries={active} />}
        {tab === "matrix" && <EisenhowerMatrix entries={active} onOpen={openEdit} />}
        {tab === "agent" && <AgentChat entries={active} tagIndex={tagIndex} />}
        {tab === "tags" && <TagIndexList tagIndex={filteredTags} />}
        {tab === "archived" && <ArchivedList entries={archived} onRestore={(id) => toggleArchive(id, false)} onOpen={openEdit} />}
      </main>

      {editing && (
        <EntryEditor
          editing={editing}
          setEditing={setEditing}
          onSave={saveEditing}
          onDelete={deleteEditing}
          onClose={() => setEditing(null)}
          onArchive={editing.id ? () => toggleArchive(editing.id, !editing.archived) : null}
          existingTags={tagIndex.map((t) => t.tag)}
          allEntries={active}
        />
      )}
    </div>
  );
}

function Header({ tab, setTab, tabs, onExport }) {
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.drawerLine}` }}>
      <div className="max-w-3xl mx-auto px-5 pt-8 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div aria-hidden style={{ width: 34, height: 24, border: `1px solid ${COLORS.brass}`, borderRadius: 2, position: "relative", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 12, height: 8, background: COLORS.brass, borderRadius: "2px 2px 0 0" }} />
            </div>
            <h1 style={{ fontFamily: "'Special Elite', monospace", fontSize: 22, letterSpacing: "0.02em" }}>The Catalog</h1>
          </div>
          <button onClick={onExport} className="px-3 py-1.5 rounded-full text-xs" style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
            Export JSON
          </button>
        </div>
        <p style={{ color: COLORS.textMutedOnDark, fontSize: 13.5, marginTop: 6 }}>
          A flexible digital card catalog to organize books, recipes, projects, and personal knowledge — with intelligent tag tracking and color-coded sorting.
        </p>

        <div className="flex gap-1 mt-5 flex-wrap" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-full text-sm focus:outline-none focus-visible:ring-2"
              style={{
                background: tab === t.id ? COLORS.brass : "transparent",
                color: tab === t.id ? "#1E1B16" : COLORS.textMutedOnDark,
                fontWeight: tab === t.id ? 600 : 400,
                border: tab === t.id ? "none" : `1px solid ${COLORS.drawerLine}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, letterSpacing: "0.05em" }}>{label.toUpperCase()}</p>
      <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 28, color: accent || COLORS.textOnDark, marginTop: 4 }}>{value}</p>
    </div>
  );
}

function Dashboard({ active, archived, tagIndex, categoryCounts, onAdd, onOpen }) {
  const repeatTags = tagIndex.filter((t) => t.entries.length > 1);
  const maxCount = categoryCounts[0]?.[1] || 1;

  const todayKey = new Date().toISOString().slice(0, 10);
  const in7Key = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const dueSoon = active
    .filter((e) => e.dueDate)
    .filter((e) => e.dueDate <= in7Key)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = dueSoon.filter((e) => e.dueDate < todayKey);
  const upcoming = dueSoon.filter((e) => e.dueDate >= todayKey);

  return (
    <div>
      {dueSoon.length > 0 && (
        <div className="rounded-xl p-4 mb-6" style={{ background: "rgba(217,119,87,0.08)", border: `1px solid ${COLORS.danger}55` }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.danger, letterSpacing: "0.05em", marginBottom: 10 }}>
            {overdue.length > 0 ? `⏰ OVERDUE & DUE SOON` : "⏰ DUE SOON"}
          </p>
          <div className="flex flex-col gap-2">
            {dueSoon.map((e) => {
              const isOverdue = e.dueDate < todayKey;
              const isToday = e.dueDate === todayKey;
              return (
                <button
                  key={e.id}
                  onClick={() => onOpen(e)}
                  className="text-left flex items-center justify-between gap-3 px-3 py-2 rounded-lg"
                  style={{ background: COLORS.surface }}
                >
                  <span style={{ fontSize: 13.5 }}>{e.title}</span>
                  <span
                    style={{
                      fontFamily: "JetBrains Mono, monospace",
                      fontSize: 11,
                      color: isOverdue ? COLORS.danger : isToday ? COLORS.brass : COLORS.teal,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isOverdue ? `overdue · ${e.dueDate}` : isToday ? "today" : e.dueDate}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Entries" value={active.length} />
        <StatCard label="Tags" value={tagIndex.length} />
        <StatCard label="Repeated tags" value={repeatTags.length} accent={repeatTags.length ? COLORS.teal : undefined} />
        <StatCard label="Archived" value={archived.length} />
      </div>

      <div className="flex flex-wrap gap-3 mb-6" style={{ fontSize: 11.5, color: COLORS.textMutedOnDark }}>
        {["Books", "Recipes", "Projects", "Personal Knowledge", "Movies & Shows", "Music", "Travel", "Quotes & Ideas", "Contacts", "Events"].map((preset) => (
          <span key={preset} className="flex items-center gap-1.5">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: tabColorFor(preset), display: "inline-block" }} />
            {preset}
          </span>
        ))}
      </div>

      {categoryCounts.length > 0 ? (
        <div className="rounded-xl p-4 mb-6" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, letterSpacing: "0.05em", marginBottom: 12 }}>
            BY CATEGORY
          </p>
          <div className="flex flex-col gap-2.5">
            {categoryCounts.map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-3">
                <span style={{ fontSize: 13, width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                <div className="flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", height: 8 }}>
                  <div style={{ width: `${(count / maxCount) * 100}%`, height: "100%", background: tabColorFor(cat) }} />
                </div>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: COLORS.textMutedOnDark, width: 20, textAlign: "right" }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16 rounded-xl mb-6" style={{ border: `1px dashed ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 17, color: COLORS.textOnDark, marginBottom: 6 }}>Nothing catalogued yet</p>
          <p style={{ fontSize: 13.5, marginBottom: 14 }}>Add your first entry to see stats here.</p>
          <button onClick={onAdd} className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: COLORS.brass, color: "#1E1B16" }}>
            + New entry
          </button>
        </div>
      )}

      {repeatTags.length > 0 && (
        <div className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, letterSpacing: "0.05em", marginBottom: 10 }}>
            MOST REUSED TAGS
          </p>
          <div className="flex flex-wrap gap-1.5">
            {repeatTags.slice(0, 8).map((t, i) => (
              <span
                key={i}
                style={{
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 11.5,
                  padding: "4px 9px",
                  borderRadius: 999,
                  background: "rgba(79,122,114,0.15)",
                  color: COLORS.teal,
                  boxShadow: `0 0 0 1px ${COLORS.teal}66`,
                }}
              >
                {t.tag} · {t.entries.length}×
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EntriesGrid({ entries, onOpen, tagIndex }) {
  const repeatSet = useMemo(() => new Set(tagIndex.filter((t) => t.entries.length > 1).map((t) => normalizeTag(t.tag))), [tagIndex]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl" style={{ border: `1px dashed ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 17, color: COLORS.textOnDark, marginBottom: 6 }}>Drawer's empty</p>
        <p style={{ fontSize: 13.5 }}>Add your first entry to start the catalog.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {entries.map((e) => (
        <button
          key={e.id}
          onClick={() => onOpen(e)}
          className="text-left rounded-lg overflow-hidden transition-transform"
          style={{ background: COLORS.paper, color: COLORS.ink, boxShadow: `0 2px 0 ${COLORS.paperShadow}` }}
        >
          <div style={{ height: 5, background: tabColorFor(e.category || e.title) }} />
          <div className="p-4">
            <h3 style={{ fontFamily: "'Special Elite', monospace", fontSize: 16 }}>{e.title}</h3>
            {e.category && (
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.inkMuted, marginTop: 4, letterSpacing: "0.04em" }}>
                {e.category.toUpperCase()}
              </p>
            )}
            {e.dueDate && (
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.teal, marginTop: 4 }}>
                Due {e.dueDate}
              </p>
            )}
            {e.notes && (
              <p style={{ fontSize: 13, color: COLORS.ink, marginTop: 8, opacity: 0.85 }}>{e.notes.length > 90 ? e.notes.slice(0, 90) + "…" : e.notes}</p>
            )}
            {(e.updatedAt || e.createdAt) && (
              <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9.5, color: COLORS.inkMuted, marginTop: 6, opacity: 0.7 }}>
                {e.updatedAt ? `Edited ${e.updatedAt.slice(0, 10)}` : `Added ${e.createdAt.slice(0, 10)}`}
              </p>
            )}
            {(e.tags || []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {e.tags.map((t, i) => {
                  const isRepeat = repeatSet.has(normalizeTag(t));
                  return (
                    <span
                      key={i}
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 11,
                        padding: "3px 8px",
                        borderRadius: 999,
                        background: isRepeat ? "rgba(79,122,114,0.15)" : "rgba(43,38,32,0.06)",
                        color: isRepeat ? COLORS.teal : COLORS.inkMuted,
                        boxShadow: isRepeat ? `0 0 0 1px ${COLORS.teal}66` : "none",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}

const DEFAULT_DURATIONS = { work: 25, short: 5, long: 15 }; // minutes

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function PomodoroTimer({ entries }) {
  const [durations, setDurations] = useState(DEFAULT_DURATIONS); // minutes per mode
  const [mode, setMode] = useState("work"); // work | short | long
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATIONS.work * 60);
  const [running, setRunning] = useState(false);
  const [cyclesCompleted, setCyclesCompleted] = useState(0);
  const [focusEntryId, setFocusEntryId] = useState("");
  const [justFinished, setJustFinished] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          setJustFinished(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const advanceMode = (nextMode) => {
    setMode(nextMode);
    setSecondsLeft(durations[nextMode] * 60);
    setJustFinished(false);
  };

  const handleSkip = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    if (mode === "work") {
      const nextCycles = cyclesCompleted + 1;
      setCyclesCompleted(nextCycles);
      advanceMode(nextCycles % 4 === 0 ? "long" : "short");
    } else {
      advanceMode("work");
    }
  };

  const handleReset = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setSecondsLeft(durations[mode] * 60);
    setJustFinished(false);
  };

  const updateDuration = (key, minutes) => {
    const clamped = Math.max(1, Math.min(180, minutes || 1));
    const next = { ...durations, [key]: clamped };
    setDurations(next);
    if (!running && mode === key) setSecondsLeft(clamped * 60);
  };

  const total = durations[mode] * 60;
  const progress = 1 - secondsLeft / total;
  const modeLabel = mode === "work" ? "Focus" : mode === "short" ? "Short break" : "Long break";
  const modeColor = mode === "work" ? COLORS.brass : COLORS.teal;
  const focusEntry = entries.find((e) => e.id === focusEntryId);

  return (
    <div className="flex flex-col items-center w-full">
      <div className="w-full max-w-xs flex justify-end mb-2">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs px-3 py-1.5 rounded-full"
          style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}
        >
          {showSettings ? "Hide durations" : "⚙ Adjust durations"}
        </button>
      </div>

      {showSettings && (
        <div className="w-full max-w-xs rounded-xl p-4 mb-5 flex flex-col gap-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
          {[
            { key: "work", label: "Focus" },
            { key: "short", label: "Short break" },
            { key: "long", label: "Long break" },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span style={{ fontSize: 13 }}>{label}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateDuration(key, durations[key] - 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}
                >
                  –
                </button>
                <input
                  type="number"
                  min={1}
                  max={180}
                  value={durations[key]}
                  onChange={(e) => updateDuration(key, parseInt(e.target.value, 10))}
                  className="text-center rounded-lg"
                  style={{ width: 48, background: COLORS.bg, border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textOnDark, fontSize: 13, padding: "4px 0" }}
                />
                <button
                  onClick={() => updateDuration(key, durations[key] + 1)}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}
                >
                  +
                </button>
                <span style={{ fontSize: 11, color: COLORS.textMutedOnDark, width: 24 }}>min</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <select
          value={focusEntryId}
          onChange={(e) => setFocusEntryId(e.target.value)}
          className="mb-6 px-3 py-2 rounded-lg text-sm w-full max-w-xs"
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textOnDark }}
        >
          <option value="">No entry selected</option>
          {entries.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title}
            </option>
          ))}
        </select>
      )}

      <div
        className="rounded-full flex items-center justify-center mb-6"
        style={{
          width: 220,
          height: 220,
          border: `3px solid ${modeColor}`,
          background: `conic-gradient(${modeColor} ${progress * 360}deg, rgba(255,255,255,0.04) 0deg)`,
        }}
      >
        <div
          className="rounded-full flex flex-col items-center justify-center"
          style={{ width: 190, height: 190, background: COLORS.bg }}
        >
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: modeColor, letterSpacing: "0.05em", marginBottom: 6 }}>
            {modeLabel.toUpperCase()}
          </p>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 40 }}>{formatTime(secondsLeft)}</p>
          {focusEntry && (
            <p style={{ fontSize: 11.5, color: COLORS.textMutedOnDark, marginTop: 6, maxWidth: 150, textAlign: "center" }}>
              {focusEntry.title}
            </p>
          )}
        </div>
      </div>

      {justFinished && (
        <p style={{ color: modeColor, fontSize: 13.5, marginBottom: 12 }}>
          {mode === "work" ? "Session done — nice work. Take a break." : "Break's over — back to it."}
        </p>
      )}

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: modeColor, color: "#1E1B16" }}
        >
          {running ? "Pause" : secondsLeft === total ? "Start" : "Resume"}
        </button>
        <button onClick={handleReset} className="px-4 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
          Reset
        </button>
        <button onClick={handleSkip} className="px-4 py-2.5 rounded-lg text-sm" style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
          Skip
        </button>
      </div>

      <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: COLORS.textMutedOnDark }}>
        {cyclesCompleted} focus session{cyclesCompleted === 1 ? "" : "s"} completed
      </p>
      <p style={{ fontSize: 11, color: COLORS.textMutedOnDark, marginTop: 10, maxWidth: 280, textAlign: "center" }}>
        Keep this tab open while running — the timer resets if you leave the app.
      </p>
    </div>
  );
}

function EisenhowerMatrix({ entries, onOpen }) {
  const quadrants = [
    { key: "do", label: "Do first", sub: "Urgent · Important", filter: (e) => e.urgent && e.important, color: COLORS.danger },
    { key: "schedule", label: "Schedule", sub: "Not urgent · Important", filter: (e) => !e.urgent && e.important, color: COLORS.brass },
    { key: "delegate", label: "Delegate", sub: "Urgent · Not important", filter: (e) => e.urgent && !e.important, color: COLORS.teal },
    { key: "eliminate", label: "Eliminate", sub: "Not urgent · Not important", filter: (e) => !e.urgent && !e.important, color: COLORS.textMutedOnDark },
  ];

  const hasAnyClassified = entries.some((e) => e.urgent || e.important);

  return (
    <div>
      {!hasAnyClassified && (
        <p style={{ fontSize: 13, color: COLORS.textMutedOnDark, marginBottom: 16 }}>
          Mark entries Urgent / Important in the editor to sort them here. Unmarked entries default to "Eliminate."
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {quadrants.map((q) => {
          const items = entries.filter(q.filter);
          return (
            <div key={q.key} className="rounded-xl p-4" style={{ background: COLORS.surface, border: `1px solid ${q.color}66` }}>
              <div className="flex items-baseline justify-between mb-1">
                <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 15, color: q.color }}>{q.label}</p>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: COLORS.textMutedOnDark }}>{items.length}</span>
              </div>
              <p style={{ fontSize: 10.5, color: COLORS.textMutedOnDark, marginBottom: 10, letterSpacing: "0.03em" }}>{q.sub.toUpperCase()}</p>
              {items.length === 0 ? (
                <p style={{ fontSize: 12.5, color: COLORS.textMutedOnDark, opacity: 0.7 }}>Nothing here</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {items.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => onOpen(e)}
                      className="text-left px-3 py-2 rounded-lg text-sm"
                      style={{ background: "rgba(255,255,255,0.04)", color: COLORS.textOnDark }}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CalendarView({ entries, onOpen }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(null);

  const createdMap = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (!e.createdAt) return;
      const key = e.createdAt.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }, [entries]);

  const dueMap = useMemo(() => {
    const map = new Map();
    entries.forEach((e) => {
      if (!e.dueDate) return;
      if (!map.has(e.dueDate)) map.set(e.dueDate, []);
      map.get(e.dueDate).push(e);
    });
    return map;
  }, [entries]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const keyFor = (d) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const selectedEntries = selectedDay
    ? [...(createdMap.get(selectedDay) || []), ...(dueMap.get(selectedDay) || [])].filter(
        (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i
      )
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="px-3 py-1.5 rounded-full text-sm"
          style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}
        >
          ‹
        </button>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 16 }}>
          {MONTH_NAMES[month]} {year}
        </p>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="px-3 py-1.5 rounded-full text-sm"
          style={{ border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: COLORS.textMutedOnDark, fontFamily: "JetBrains Mono, monospace" }}>
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = keyFor(d);
          const created = createdMap.get(key) || [];
          const due = dueMap.get(key) || [];
          const isSelected = selectedDay === key;
          const isToday = key === dateKey(new Date());
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(isSelected ? null : key)}
              className="rounded-lg flex flex-col items-center py-2"
              style={{
                background: isSelected ? "rgba(185,139,78,0.18)" : COLORS.surface,
                border: isToday ? `1px solid ${COLORS.brass}` : `1px solid ${COLORS.drawerLine}`,
              }}
            >
              <span style={{ fontSize: 12.5 }}>{d}</span>
              <div className="flex gap-0.5 mt-1" style={{ height: 5 }}>
                {created.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.brass }} />}
                {due.length > 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: COLORS.teal }} />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4" style={{ fontSize: 11.5, color: COLORS.textMutedOnDark }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.brass, display: "inline-block" }} /> added
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COLORS.teal, display: "inline-block" }} /> due
        </span>
      </div>

      {selectedDay && (
        <div className="mt-5">
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, letterSpacing: "0.05em", marginBottom: 8 }}>
            {selectedDay.toUpperCase()}
          </p>
          {selectedEntries.length === 0 ? (
            <p style={{ fontSize: 13, color: COLORS.textMutedOnDark }}>Nothing on this day.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedEntries.map((e) => (
                <button
                  key={e.id}
                  onClick={() => onOpen(e)}
                  className="text-left px-4 py-2.5 rounded-lg"
                  style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}
                >
                  <p style={{ fontSize: 14 }}>{e.title}</p>
                  <p style={{ fontSize: 11.5, color: COLORS.textMutedOnDark, marginTop: 2 }}>
                    {e.createdAt?.slice(0, 10) === selectedDay ? "Added" : ""}
                    {e.createdAt?.slice(0, 10) === selectedDay && e.dueDate === selectedDay ? " · " : ""}
                    {e.dueDate === selectedDay ? "Due" : ""}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AgentChat({ entries, tagIndex }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const systemPrompt = useMemo(() => {
    const summary = entries.map((e) => ({
      title: e.title,
      category: e.category || null,
      tags: e.tags || [],
      dueDate: e.dueDate || null,
      notes: e.notes ? e.notes.slice(0, 200) : null,
    }));
    return [
      "You are a helpful assistant embedded in a personal card-catalog app.",
      "The user's current catalog (JSON):",
      JSON.stringify(summary),
      "Reused tags across entries:",
      JSON.stringify(tagIndex.filter((t) => t.entries.length > 1).map((t) => t.tag)),
      "Answer questions about the catalog, suggest tags or categories for new or existing entries, help the user organize or spot duplicates. Be concise and specific. If asked to suggest tags, prefer reusing existing tags from the catalog where sensible.",
    ].join("\n\n");
  }, [entries, tagIndex]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const nextMessages = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const reply = await callClaude(nextMessages, systemPrompt);
      setMessages([...nextMessages, { role: "assistant", content: reply || "(no response)" }]);
    } catch (e) {
      setError("Couldn't reach the agent — try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "60vh" }}>
      <div ref={scrollRef} className="flex-1 overflow-y-auto rounded-xl p-4 mb-3" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
        {messages.length === 0 && (
          <p style={{ fontSize: 13.5, color: COLORS.textMutedOnDark }}>
            Ask about your catalog — "what tags do I use most?", "suggest tags for a sci-fi book entry", "any duplicate-ish entries?"
          </p>
        )}
        <div className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className="px-3 py-2 rounded-lg max-w-[85%]"
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? COLORS.brass : "rgba(255,255,255,0.06)",
                color: m.role === "user" ? "#1E1B16" : COLORS.textOnDark,
                fontSize: 13.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          ))}
          {loading && (
            <div className="px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", color: COLORS.textMutedOnDark, fontSize: 13.5, alignSelf: "flex-start" }}>
              Thinking…
            </div>
          )}
        </div>
      </div>

      {error && <p style={{ color: COLORS.danger, fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Ask the agent…"
          className="flex-1 px-4 py-2.5 rounded-lg outline-none"
          style={{ background: COLORS.bg, border: `1px solid ${COLORS.drawerLine}`, color: COLORS.textOnDark, fontSize: 14 }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="px-4 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: COLORS.brass, color: "#1E1B16", opacity: loading || !input.trim() ? 0.5 : 1 }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function TagIndexList({ tagIndex }) {
  if (tagIndex.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl" style={{ border: `1px dashed ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 17, color: COLORS.textOnDark, marginBottom: 6 }}>No tags yet</p>
        <p style={{ fontSize: 13.5 }}>Add tags to an entry to build the index.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {tagIndex.map((t, i) => {
        const isRepeat = t.entries.length > 1;
        return (
          <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg" style={{ background: COLORS.surface, borderLeft: `3px solid ${isRepeat ? COLORS.teal : COLORS.drawerLine}` }}>
            <div>
              <p style={{ fontSize: 14.5 }}>{t.tag}</p>
              <p style={{ color: COLORS.textMutedOnDark, fontSize: 12, marginTop: 2 }}>{t.entries.join(" · ")}</p>
            </div>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: isRepeat ? COLORS.teal : COLORS.textMutedOnDark, whiteSpace: "nowrap" }}>
              {isRepeat ? `used ${t.entries.length}×` : "unique"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ArchivedList({ entries, onRestore, onOpen }) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-16 rounded-xl" style={{ border: `1px dashed ${COLORS.drawerLine}`, color: COLORS.textMutedOnDark }}>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: 17, color: COLORS.textOnDark, marginBottom: 6 }}>Nothing archived</p>
        <p style={{ fontSize: 13.5 }}>Archived entries will show up here instead of being deleted.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {entries.map((e) => (
        <div key={e.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg" style={{ background: COLORS.surface, border: `1px solid ${COLORS.drawerLine}` }}>
          <button onClick={() => onOpen(e)} className="text-left flex-1">
            <p style={{ fontSize: 14.5 }}>{e.title}</p>
            {e.category && <p style={{ color: COLORS.textMutedOnDark, fontSize: 12, marginTop: 2 }}>{e.category}</p>}
          </button>
          <button onClick={() => onRestore(e.id)} className="px-3 py-1.5 rounded-full text-xs whitespace-nowrap" style={{ border: `1px solid ${COLORS.brass}`, color: COLORS.brass }}>
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

function EntryEditor({ editing, setEditing, onSave, onDelete, onClose, onArchive, existingTags, allEntries }) {
  const [tagInput, setTagInput] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestError, setSuggestError] = useState("");
  const [echoChecking, setEchoChecking] = useState(false);
  const [echoResults, setEchoResults] = useState(null);
  const [echoError, setEchoError] = useState("");
  const inputRef = useRef(null);

  const addTag = (value) => {
    const t = (value ?? tagInput).trim();
    if (!t) return;
    if (editing.tags.some((existing) => normalizeTag(existing) === normalizeTag(t))) {
      setTagInput("");
      return;
    }
    setEditing({ ...editing, tags: [...editing.tags, t] });
    setTagInput("");
    setSuggestions((prev) => prev.filter((s) => normalizeTag(s) !== normalizeTag(t)));
  };

  const removeTag = (idx) => setEditing({ ...editing, tags: editing.tags.filter((_, i) => i !== idx) });

  const suggestTags = async () => {
    setSuggesting(true);
    setSuggestError("");
    try {
      const prompt = [
        "Suggest 3-5 short tags for this catalog entry. Prefer reusing tags from the existing tag list when they fit.",
        `Title: ${editing.title || "(untitled)"}`,
        `Category: ${editing.category || "none"}`,
        `Notes: ${(editing.notes || "").slice(0, 300)}`,
        `Existing tags already on this entry: ${JSON.stringify(editing.tags)}`,
        `Tag vocabulary already in use across the catalog: ${JSON.stringify(existingTags)}`,
        "Respond ONLY with a JSON array of strings, nothing else, no markdown fences.",
      ].join("\n");
      const text = await callClaude([{ role: "user", content: prompt }], "You output only valid JSON arrays of short strings.");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      if (Array.isArray(parsed)) {
        setSuggestions(parsed.filter((s) => typeof s === "string" && !editing.tags.some((t) => normalizeTag(t) === normalizeTag(s))));
      }
    } catch (e) {
      setSuggestError("Couldn't get suggestions — try again.");
    } finally {
      setSuggesting(false);
    }
  };

  const checkEcho = async () => {
    setEchoChecking(true);
    setEchoError("");
    setEchoResults(null);
    try {
      const others = (allEntries || [])
        .filter((e) => e.id !== editing.id)
        .map((e) => ({ title: e.title, notes: (e.notes || "").slice(0, 500), tags: e.tags || [] }));
      const prompt = [
        "Compare the NEW entry below against the OTHER entries from the same catalog.",
        "Find specific words, phrases, or imagery in the new entry's notes that also appear in — or are very close in meaning to — language in the other entries. Ignore common/generic words; focus on distinctive phrases or imagery.",
        `NEW entry title: ${editing.title || "(untitled)"}`,
        `NEW entry notes: ${(editing.notes || "").slice(0, 800)}`,
        `OTHER entries (JSON): ${JSON.stringify(others)}`,
        'Respond ONLY with a JSON array like [{"phrase": "...", "matchedIn": "Other Entry Title", "note": "short reason"}]. If nothing overlaps, respond with [].',
        "No markdown fences, no extra text.",
      ].join("\n\n");
      const text = await callClaude([{ role: "user", content: prompt }], "You output only valid JSON arrays.");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setEchoResults(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      setEchoError("Couldn't run the echo check — try again.");
    } finally {
      setEchoChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-5 z-50" style={{ background: "rgba(10,9,7,0.7)" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "#241F19", border: `1px solid ${COLORS.drawerLine}` }}>
        <h2 style={{ fontFamily: "'Special Elite', monospace", fontSize: 18, marginBottom: 4 }}>{editing.id ? "Edit entry" : "New entry"}</h2>
        {(editing.createdAt || editing.updatedAt) && (
          <p style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, marginBottom: 16 }}>
            {editing.createdAt ? `Added ${editing.createdAt.slice(0, 10)}` : ""}
            {editing.createdAt && editing.updatedAt ? " · " : ""}
            {editing.updatedAt ? `Last edited ${editing.updatedAt.slice(0, 10)}` : ""}
          </p>
        )}

        <Field label="Title">
          <input autoFocus value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Entry title" style={inputStyle} />
        </Field>
        <Field label="Category">
          <input value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="e.g. Books, Recipes, Movies, Travel…" style={inputStyle} />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {["Books", "Recipes", "Projects", "Personal Knowledge", "Movies & Shows", "Music", "Travel", "Quotes & Ideas", "Contacts", "Events"].map((preset) => {
              const active = normalizeTag(editing.category || "") === normalizeTag(preset);
              return (
                <button
                  key={preset}
                  onClick={() => setEditing({ ...editing, category: preset })}
                  className="text-xs px-3 py-1.5 rounded-full"
                  style={{
                    border: `1px solid ${tabColorFor(preset)}`,
                    background: active ? tabColorFor(preset) : "transparent",
                    color: active ? "#1E1B16" : tabColorFor(preset),
                  }}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Due date">
          <input type="date" value={editing.dueDate || ""} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })} style={inputStyle} />
        </Field>
        <Field label="Priority (Eisenhower matrix)">
          <div className="flex gap-2">
            <button
              onClick={() => setEditing({ ...editing, urgent: !editing.urgent })}
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{
                background: editing.urgent ? COLORS.danger : "transparent",
                color: editing.urgent ? "#1E1B16" : COLORS.textMutedOnDark,
                border: `1px solid ${COLORS.danger}`,
                fontWeight: editing.urgent ? 600 : 400,
              }}
            >
              Urgent
            </button>
            <button
              onClick={() => setEditing({ ...editing, important: !editing.important })}
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{
                background: editing.important ? COLORS.brass : "transparent",
                color: editing.important ? "#1E1B16" : COLORS.textMutedOnDark,
                border: `1px solid ${COLORS.brass}`,
                fontWeight: editing.important ? 600 : 400,
              }}
            >
              Important
            </button>
          </div>
        </Field>
        <Field label="Notes">
          <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={4} placeholder="Any details worth keeping…" style={{ ...inputStyle, resize: "vertical" }} />
          <button
            onClick={checkEcho}
            disabled={echoChecking || !editing.notes?.trim()}
            className="text-xs px-3 py-1.5 rounded-full mt-2"
            style={{ border: `1px solid ${COLORS.brass}`, color: COLORS.brass, opacity: echoChecking || !editing.notes?.trim() ? 0.5 : 1 }}
          >
            {echoChecking ? "Scanning catalog…" : "🔁 Echo check — find repeated language"}
          </button>
          {echoError && <p style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{echoError}</p>}
          {echoResults && (
            echoResults.length === 0 ? (
              <p style={{ color: COLORS.teal, fontSize: 12.5, marginTop: 8 }}>No echoes found — this reads distinct from the rest of the catalog.</p>
            ) : (
              <div className="flex flex-col gap-2 mt-2.5">
                {echoResults.map((r, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg" style={{ background: "rgba(217,119,87,0.12)", boxShadow: `0 0 0 1px ${COLORS.danger}55` }}>
                    <p style={{ fontSize: 13, color: COLORS.textOnDark }}>"{r.phrase}"</p>
                    <p style={{ fontSize: 11.5, color: COLORS.textMutedOnDark, marginTop: 2 }}>
                      echoes <strong style={{ color: COLORS.danger }}>{r.matchedIn}</strong>{r.note ? ` — ${r.note}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            )
          )}
        </Field>
        <Field label="Tags">
          <div className="flex gap-2 mb-2">
            <input
              ref={inputRef}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Add a tag"
              style={inputStyle}
            />
            <button onClick={() => addTag()} className="px-3 rounded-lg text-sm" style={{ background: COLORS.brass, color: "#1E1B16", fontWeight: 600 }}>
              Add
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {editing.tags.map((t, i) => (
              <span key={i} className="flex items-center gap-1.5" style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11.5, padding: "4px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)", color: COLORS.textOnDark }}>
                {t}
                <button onClick={() => removeTag(i)} aria-label={`Remove ${t}`} style={{ color: COLORS.textMutedOnDark, lineHeight: 1 }}>
                  ×
                </button>
              </span>
            ))}
          </div>

          <button
            onClick={suggestTags}
            disabled={suggesting}
            className="text-xs px-3 py-1.5 rounded-full"
            style={{ border: `1px solid ${COLORS.teal}`, color: COLORS.teal, opacity: suggesting ? 0.6 : 1 }}
          >
            {suggesting ? "Asking agent…" : "✨ Suggest tags"}
          </button>
          {suggestError && <p style={{ color: COLORS.danger, fontSize: 12, marginTop: 6 }}>{suggestError}</p>}
          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => addTag(s)}
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 11.5,
                    padding: "4px 9px",
                    borderRadius: 999,
                    background: "rgba(79,122,114,0.15)",
                    color: COLORS.teal,
                    boxShadow: `0 0 0 1px ${COLORS.teal}66`,
                  }}
                >
                  + {s}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="flex justify-between items-center mt-6 pt-4 flex-wrap gap-2" style={{ borderTop: `1px solid ${COLORS.drawerLine}` }}>
          <div className="flex gap-3">
            {editing.id && (
              <button onClick={onDelete} style={{ color: COLORS.danger, fontSize: 13.5 }}>
                Delete
              </button>
            )}
            {onArchive && (
              <button onClick={onArchive} style={{ color: COLORS.brass, fontSize: 13.5 }}>
                {editing.archived ? "Restore" : "Archive"}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: COLORS.textMutedOnDark, border: `1px solid ${COLORS.drawerLine}` }}>
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!editing.title.trim()}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: editing.title.trim() ? COLORS.brass : COLORS.drawerLine, color: editing.title.trim() ? "#1E1B16" : COLORS.textMutedOnDark }}
            >
              Save entry
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10.5, color: COLORS.textMutedOnDark, letterSpacing: "0.05em", display: "block", marginBottom: 6 }}>
        {label.toUpperCase()}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  background: "#1E1B16",
  border: `1px solid ${COLORS.drawerLine}`,
  color: COLORS.textOnDark,
  borderRadius: 8,
  padding: "9px 12px",
  fontSize: 14,
  fontFamily: "Work Sans, sans-serif",
  outline: "none",
};
