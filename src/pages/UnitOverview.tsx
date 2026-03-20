import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const TERM_OPTIONS = ['Autumn', 'Spring', 'Summer'];

function formatUnitLabel(year: number, term: string, unitNumber: number): string | null {
  if (!year || term === 'Unknown' || !unitNumber) return null;
  return `Year ${year} · ${term} · Unit ${unitNumber}`;
}

export default function UnitOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const unitId = id ? parseInt(id, 10) : null;

  const [editing, setEditing] = useState(false);
  const [editYear, setEditYear] = useState('');
  const [editTerm, setEditTerm] = useState('');
  const [editUnitNumber, setEditUnitNumber] = useState('');
  const [saving, setSaving] = useState(false);

  const unit = useLiveQuery(
    () => (unitId !== null ? db.units.get(unitId) : undefined),
    [unitId]
  );

  const categories = useLiveQuery(
    () => (unitId !== null ? db.categories.where('unitId').equals(unitId).toArray() : []),
    [unitId]
  );

  const entryCount = useLiveQuery(
    () => (unitId !== null ? db.entries.where('unitId').equals(unitId).count() : 0),
    [unitId]
  );

  const dueCount = useLiveQuery(
    () =>
      unitId !== null
        ? db.flashcardProgress
            .where('unitId')
            .equals(unitId)
            .and((p) => p.nextDue <= new Date().toISOString())
            .count()
        : 0,
    [unitId]
  );

  if (unitId === null || isNaN(unitId)) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <p style={{ color: '#C0392B' }}>Invalid unit ID.</p>
      </div>
    );
  }

  if (unit === undefined) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <p style={{ color: '#7A6855' }}>Loading...</p>
      </div>
    );
  }

  if (unit === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 pt-8">
        <p style={{ color: '#C0392B' }}>Unit not found.</p>
      </div>
    );
  }

  const unitLabel = formatUnitLabel(unit.year, unit.term, unit.unitNumber);

  const startEditing = () => {
    setEditYear(unit.year ? String(unit.year) : '');
    setEditTerm(unit.term === 'Unknown' ? '' : (unit.term ?? ''));
    setEditUnitNumber(unit.unitNumber ? String(unit.unitNumber) : '');
    setEditing(true);
  };

  const handleSaveMetadata = async () => {
    if (!unitId) return;
    setSaving(true);
    try {
      await db.units.update(unitId, {
        year: Number(editYear) || 0,
        term: editTerm || 'Unknown',
        unitNumber: Number(editUnitNumber) || 0,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-8 pb-4">
      <header className="flex items-center gap-3 mb-8">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
          style={{ backgroundColor: '#EDE8E0' }}
          aria-label="Go back"
        >
          <svg className="w-5 h-5" style={{ color: '#2C2418' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold truncate" style={{ color: '#2C2418' }}>
            {unit.name}
          </h1>
          {unit.description && (
            <p className="text-sm mt-0.5 line-clamp-2" style={{ color: '#7A6855' }}>
              {unit.description}
            </p>
          )}
          {unitLabel && (
            <p className="text-xs mt-1 font-medium" style={{ color: '#C4713B' }}>
              {unitLabel}
            </p>
          )}
        </div>
      </header>

      {/* Unit metadata */}
      <div className="rounded-xl p-4 mb-6" style={{ backgroundColor: 'white' }}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold" style={{ color: '#2C2418' }}>Unit Grouping</h2>
          {!editing && (
            <button
              onClick={startEditing}
              className="text-xs px-3 py-1 rounded-lg min-h-[32px]"
              style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
              aria-label="Edit unit metadata"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>Year</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 9"
                  value={editYear}
                  onChange={(e) => setEditYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                  aria-label="School year"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>Term</label>
                <select
                  value={editTerm}
                  onChange={(e) => setEditTerm(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                  aria-label="Term"
                >
                  <option value="">Select...</option>
                  {TERM_OPTIONS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: '#7A6855' }}>Unit #</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 3"
                  value={editUnitNumber}
                  onChange={(e) => setEditUnitNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ borderColor: '#D4C8B8', color: '#2C2418' }}
                  aria-label="Unit number"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveMetadata}
                disabled={saving}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white min-h-[44px]"
                style={{ backgroundColor: '#C4713B', opacity: saving ? 0.7 : 1 }}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium min-h-[44px]"
                style={{ backgroundColor: '#EDE8E0', color: '#2C2418' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: '#7A6855' }}>
            {unitLabel ?? <span style={{ color: '#A89880' }}>No grouping set — tap Edit to add year, term, and unit number</span>}
          </p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'white' }}>
          <p className="text-3xl font-bold" style={{ color: '#C4713B' }}>
            {entryCount ?? '...'}
          </p>
          <p className="text-sm mt-0.5" style={{ color: '#7A6855' }}>
            Total entries
          </p>
        </div>
        <div className="rounded-xl p-4 text-center" style={{ backgroundColor: 'white' }}>
          <p className="text-3xl font-bold" style={{ color: '#C4713B' }}>
            {categories?.length ?? '...'}
          </p>
          <p className="text-sm mt-0.5" style={{ color: '#7A6855' }}>
            Categories
          </p>
        </div>
      </div>

      {/* Learning mode cards */}
      <div className="space-y-3 mb-6">
        <h2 className="font-semibold" style={{ color: '#2C2418' }}>
          Learning Modes
        </h2>
        <button
          onClick={() => navigate(`/unit/${unitId}/flashcards`)}
          className="w-full rounded-xl p-4 flex items-center gap-4 text-left min-h-[64px]"
          style={{ backgroundColor: 'white' }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EDE8E0' }}>
            <svg className="w-5 h-5" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-medium" style={{ color: '#2C2418' }}>Flashcards</p>
            <p className="text-sm" style={{ color: '#7A6855' }}>Tap to flip, rate your recall</p>
          </div>
          {dueCount !== undefined && dueCount > 0 && (
            <span
              className="text-xs font-semibold px-2 py-1 rounded-full"
              style={{ backgroundColor: '#C4713B', color: 'white' }}
            >
              {dueCount} due
            </span>
          )}
          <svg className="w-5 h-5 ml-auto" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => navigate(`/unit/${unitId}/builder`)}
          className="w-full rounded-xl p-4 flex items-center gap-4 text-left min-h-[64px]"
          style={{ backgroundColor: 'white' }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EDE8E0' }}>
            <svg className="w-5 h-5" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </div>
          <div>
            <p className="font-medium" style={{ color: '#2C2418' }}>Sentence Builder</p>
            <p className="text-sm" style={{ color: '#7A6855' }}>Drag words to build sentences</p>
          </div>
          <svg className="w-5 h-5 ml-auto" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <button
          onClick={() => navigate(`/unit/${unitId}/cloze`)}
          className="w-full rounded-xl p-4 flex items-center gap-4 text-left min-h-[64px]"
          style={{ backgroundColor: 'white' }}
        >
          <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EDE8E0' }}>
            <svg className="w-5 h-5" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <div>
            <p className="font-medium" style={{ color: '#2C2418' }}>Cloze Tests</p>
            <p className="text-sm" style={{ color: '#7A6855' }}>Fill in the blanks</p>
          </div>
          <svg className="w-5 h-5 ml-auto" style={{ color: '#C4713B' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Categories */}
      {categories && categories.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold" style={{ color: '#2C2418' }}>
            Categories
          </h2>
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl p-4"
              style={{ backgroundColor: 'white' }}
            >
              <p className="font-medium text-sm" style={{ color: '#2C2418' }}>{cat.name}</p>
              {cat.description && (
                <p className="text-xs mt-0.5" style={{ color: '#7A6855' }}>{cat.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
