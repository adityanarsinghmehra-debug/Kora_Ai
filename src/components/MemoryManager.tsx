import React, { useMemo, useState } from 'react';
import { Bookmark, Check, Edit3, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import {
  type CommunicationStyle,
  type MemoryCategory,
  type UserMemory,
  type UserProfile,
} from '../types/chat';

interface MemoryManagerProps {
  profile: UserProfile;
  memories: UserMemory[];
  isCloudSynced: boolean;
  onUpdateProfile: (next: UserProfile) => void;
  onAddMemory: (content: string, category: MemoryCategory) => Promise<void> | void;
  onUpdateMemory: (id: string, content: string, category: MemoryCategory, pinned: boolean) => Promise<void> | void;
  onTogglePin: (memory: UserMemory) => Promise<void> | void;
  onDeleteMemory: (id: string) => Promise<void> | void;
}

const CATEGORIES: { value: MemoryCategory; label: string }[] = [
  { value: 'preference', label: 'Preference' },
  { value: 'fact', label: 'Personal Fact' },
  { value: 'goal', label: 'Goal' },
  { value: 'context', label: 'Project Context' },
];

const STYLE_OPTIONS: { value: CommunicationStyle; label: string; desc: string }[] = [
  { value: 'balanced', label: 'Balanced', desc: 'Clear structure with helpful detail' },
  { value: 'concise', label: 'Concise', desc: 'Direct answers without extra prose' },
  { value: 'detailed', label: 'Detailed', desc: 'Thorough explanations with examples' },
  { value: 'step-by-step', label: 'Step-by-step', desc: 'Numbered sequences easy to follow' },
];

export const MemoryManager: React.FC<MemoryManagerProps> = ({
  profile,
  memories,
  isCloudSynced,
  onUpdateProfile,
  onAddMemory,
  onUpdateMemory,
  onTogglePin,
  onDeleteMemory,
}) => {
  const [preferredName, setPreferredName] = useState(profile.preferredName);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('preference');
  const [filterCategory, setFilterCategory] = useState<'all' | MemoryCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editCategory, setEditCategory] = useState<MemoryCategory>('fact');
  const [savedNotice, setSavedNotice] = useState(false);

  const filteredMemories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...memories]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
      .filter((m) => (filterCategory === 'all' ? true : m.category === filterCategory))
      .filter((m) => (!q ? true : m.content.toLowerCase().includes(q)));
  }, [memories, filterCategory, searchQuery]);

  const handleSaveProfilePrefs = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({ ...profile, preferredName: preferredName.trim() });
    setSavedNotice(true);
    window.setTimeout(() => setSavedNotice(false), 2200);
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;
    await onAddMemory(newContent.trim(), newCategory);
    setNewContent('');
  };

  const startEdit = (m: UserMemory) => {
    setEditingId(m.id);
    setEditDraft(m.content);
    setEditCategory(m.category);
  };

  const saveEdit = async (m: UserMemory) => {
    if (!editDraft.trim()) return;
    await onUpdateMemory(m.id, editDraft.trim(), editCategory, m.pinned);
    setEditingId(null);
  };

  return (
    <div className="space-y-8">
      {/* Identity & Response Preferences */}
      <section
        aria-labelledby="memory-profile-heading"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black p-6 space-y-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="memory-profile-heading"
              className="text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300"
            >
              Personal Profile &amp; Memory Rules
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white mt-0.5">
              Personalizes both text replies and real-time voice conversations.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 high-contrast:text-yellow-300 tabular-nums">
            {isCloudSynced ? 'Cloud Sync Active' : 'Local Device Storage'} · {memories.length} memories
          </span>
        </div>

        <form onSubmit={handleSaveProfilePrefs} className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-2">
            <label
              htmlFor="preferred-name-input"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-white"
            >
              Preferred Name
            </label>
            <div className="flex gap-2">
              <input
                id="preferred-name-input"
                type="text"
                maxLength={80}
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                placeholder="How Kora should address you"
                className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3.5 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
              />
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-sky-500 dark:hover:bg-sky-400 high-contrast:bg-yellow-400 high-contrast:text-black text-white dark:text-slate-950 text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {savedNotice ? 'Saved' : 'Save Name'}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor="comm-style-select"
              className="block text-sm font-medium text-slate-800 dark:text-slate-200 high-contrast:text-white"
            >
              Communication Style
            </label>
            <select
              id="comm-style-select"
              value={profile.communicationStyle}
              onChange={(e) =>
                onUpdateProfile({
                  ...profile,
                  communicationStyle: e.target.value as CommunicationStyle,
                })
              }
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3.5 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
            >
              {STYLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2 pt-1">
            <label className="inline-flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={profile.crossChatMemoryEnabled}
                onChange={(e) =>
                  onUpdateProfile({ ...profile, crossChatMemoryEnabled: e.target.checked })
                }
                className="w-5 h-5 rounded border-slate-400 accent-sky-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-200 high-contrast:text-white">
                Share personalized memories &amp; recent context across all chats and voice sessions
              </span>
            </label>
          </div>
        </form>
      </section>

      {/* Memory Bank */}
      <section
        aria-labelledby="memory-bank-heading"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 high-contrast:border-yellow-400 bg-white dark:bg-slate-900 high-contrast:bg-black p-6 space-y-6"
      >
        <div>
          <h2
            id="memory-bank-heading"
            className="text-lg font-semibold text-slate-900 dark:text-white high-contrast:text-yellow-300"
          >
            Stored Memories
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 high-contrast:text-white mt-0.5">
            Memories are captured automatically from conversations or added manually below. Pin key items to always keep them in context.
          </p>
        </div>

        {/* Add Memory Form */}
        <form onSubmit={(e) => void handleCreateMemory(e)} className="flex flex-col sm:flex-row gap-3">
          <label htmlFor="new-memory-input" className="sr-only">
            New memory content
          </label>
          <input
            id="new-memory-input"
            type="text"
            maxLength={600}
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Add a fact, preference, or goal (e.g., I am preparing for a Python interview)"
            className="flex-1 min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3.5 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
          />
          <label htmlFor="new-memory-category" className="sr-only">
            Memory category
          </label>
          <select
            id="new-memory-category"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value as MemoryCategory)}
            className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black px-3 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 high-contrast:bg-yellow-400 high-contrast:text-black text-white text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Add Memory</span>
          </button>
        </form>

        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div role="tablist" aria-label="Filter memories by category" className="flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 high-contrast:bg-black high-contrast:border high-contrast:border-white">
            <button
              type="button"
              role="tab"
              aria-selected={filterCategory === 'all'}
              onClick={() => setFilterCategory('all')}
              className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filterCategory === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white high-contrast:bg-yellow-400 high-contrast:text-black shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All
            </button>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                role="tab"
                aria-selected={filterCategory === cat.value}
                onClick={() => setFilterCategory(cat.value)}
                className={`min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterCategory === cat.value
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white high-contrast:bg-yellow-400 high-contrast:text-black shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <label htmlFor="search-memories" className="sr-only">
              Search saved memories
            </label>
            <input
              id="search-memories"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 high-contrast:border-white bg-slate-50 dark:bg-slate-800 high-contrast:bg-black pl-10 pr-3.5 text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white"
            />
          </div>
        </div>

        {/* Memory List */}
        {filteredMemories.length === 0 ? (
          <div className="py-10 text-center space-y-2 border-t border-slate-100 dark:border-slate-800">
            <Bookmark className="w-7 h-7 mx-auto text-slate-400" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 high-contrast:text-white">
              {memories.length === 0 ? 'No memories stored yet' : 'No memories match your filter'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Tell Kora about your preferences in chat or voice, or add one above so Kora remembers it across sessions.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800 high-contrast:divide-slate-700">
            {filteredMemories.map((m) => {
              const isEditing = editingId === m.id;
              return (
                <li key={m.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {isEditing ? (
                    <div className="flex-1 flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        aria-label="Edit memory text"
                        className="flex-1 min-h-[44px] rounded-xl border border-sky-400 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-white"
                      />
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as MemoryCategory)}
                        aria-label="Edit memory category"
                        className="min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-white"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void saveEdit(m)}
                          aria-label="Save memory edit"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-sky-600 text-white hover:bg-sky-700"
                        >
                          <Check className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel memory edit"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm text-slate-900 dark:text-slate-100 high-contrast:text-white leading-relaxed">
                          {m.content}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 high-contrast:text-yellow-300 tabular-nums">
                          <span className="capitalize">{m.category}</span>
                          <span aria-hidden="true">·</span>
                          <span>Captured via {m.source}</span>
                          {m.pinned && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-semibold text-sky-700 dark:text-sky-400 high-contrast:text-yellow-300">
                                Pinned
                              </span>
                            </>
                          )}
                          <span aria-hidden="true">·</span>
                          <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void onTogglePin(m)}
                          aria-pressed={m.pinned}
                          aria-label={m.pinned ? `Unpin memory: ${m.content}` : `Pin memory: ${m.content}`}
                          className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${
                            m.pinned
                              ? 'text-sky-700 dark:text-sky-400 high-contrast:text-yellow-300 bg-sky-50 dark:bg-sky-950/60'
                              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Pin className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(m)}
                          aria-label={`Edit memory: ${m.content}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Edit3 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteMemory(m.id)}
                          aria-label={`Delete memory: ${m.content}`}
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
