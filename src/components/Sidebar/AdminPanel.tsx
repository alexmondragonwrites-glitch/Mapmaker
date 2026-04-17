/**
 * Admin panel for the Story Map editor.
 *
 * Password-gated: first use sets a password, subsequent visits
 * require login. Behind the gate is the location/path editor
 * with forms for adding, editing, and deleting world data.
 */

import { useState, useCallback, useRef } from 'react';
import type { StoryLocation, WorldPath, LocationType, BiText } from '../../engine/generators/storymap/types';

interface AdminPanelProps {
    isAuthenticated: boolean;
    hasPassword: boolean;
    onSetPassword: (pw: string) => void;
    onLogin: (pw: string) => Promise<boolean>;
    onLogout: () => void;
    worldData: {
        locations: StoryLocation[];
        worldPaths: WorldPath[];
    } | null;
    onAddLocation: (loc: StoryLocation) => void;
    onUpdateLocation: (id: string, changes: Partial<StoryLocation>) => void;
    onDeleteLocation: (id: string) => void;
    onAddPath: (path: WorldPath) => void;
    onDeletePath: (id: string) => void;
    onExport: () => void;
    onImport: (file: File) => void;
    onReset: () => void;
    dirty: boolean;
    pendingCoords: { x: number; y: number } | null;
}

const LOCATION_TYPES: { value: LocationType; label: string }[] = [
    { value: 'village', label: 'Dorf' },
    { value: 'farm', label: 'Gehöft' },
    { value: 'water', label: 'Gewässer' },
    { value: 'landmark', label: 'Wahrzeichen' },
    { value: 'hollow', label: 'Senke / Höhle' },
    { value: 'shelter', label: 'Unterschlupf' },
    { value: 'cabin', label: 'Hütte' },
    { value: 'darkwood', label: 'Dunkelwald' },
];

export function AdminPanel(props: AdminPanelProps) {
    const {
        isAuthenticated, hasPassword,
        onSetPassword, onLogin, onLogout,
        worldData, onAddLocation, onUpdateLocation, onDeleteLocation,
        onAddPath, onDeletePath,
        onExport, onImport, onReset,
        dirty, pendingCoords,
    } = props;

    if (!isAuthenticated) {
        return <PasswordGate
            hasPassword={hasPassword}
            onSetPassword={onSetPassword}
            onLogin={onLogin}
        />;
    }

    return (
        <div className="admin-panel">
            <div className="admin-header">
                <span className="admin-badge">Admin</span>
                {dirty && <span className="admin-dirty">Nicht gespeichert</span>}
                <button className="admin-logout" onClick={onLogout}>Abmelden</button>
            </div>

            <LocationForm
                onAdd={onAddLocation}
                pendingCoords={pendingCoords}
                existingIds={worldData?.locations.map(l => l.id) ?? []}
            />

            <LocationList
                locations={worldData?.locations ?? []}
                onDelete={onDeleteLocation}
            />

            <PathForm
                locations={worldData?.locations ?? []}
                existingPaths={worldData?.worldPaths ?? []}
                onAdd={onAddPath}
            />

            <PathList
                paths={worldData?.worldPaths ?? []}
                onDelete={onDeletePath}
            />

            <div className="admin-actions">
                <button onClick={onExport}>JSON exportieren</button>
                <label className="admin-import-btn">
                    JSON importieren
                    <input
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={e => {
                            const f = e.target.files?.[0];
                            if (f) onImport(f);
                        }}
                    />
                </label>
                <button className="admin-danger" onClick={() => {
                    if (confirm('Alle Änderungen zurücksetzen?')) onReset();
                }}>Zurücksetzen</button>
            </div>
        </div>
    );
}

// ── Password Gate ───────────────────────────────────────────────

function PasswordGate({ hasPassword, onSetPassword, onLogin }: {
    hasPassword: boolean;
    onSetPassword: (pw: string) => void;
    onLogin: (pw: string) => Promise<boolean>;
}) {
    const [pw, setPw] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pw.trim()) return;
        if (!hasPassword) {
            onSetPassword(pw);
        } else {
            const ok = await onLogin(pw);
            if (!ok) setError('Falsches Passwort');
        }
    };

    return (
        <div className="admin-gate">
            <h3>{hasPassword ? 'Admin-Zugang' : 'Passwort festlegen'}</h3>
            <p className="admin-gate-hint">
                {hasPassword
                    ? 'Passwort eingeben um den Editor zu öffnen.'
                    : 'Lege ein Passwort für den Editor fest.'}
            </p>
            <form onSubmit={handleSubmit}>
                <input
                    type="password"
                    value={pw}
                    onChange={e => { setPw(e.target.value); setError(''); }}
                    placeholder="Passwort"
                    autoFocus
                />
                <button type="submit">{hasPassword ? 'Anmelden' : 'Festlegen'}</button>
            </form>
            {error && <p className="admin-error">{error}</p>}
        </div>
    );
}

// ── Location Form ───────────────────────────────────────────────

function LocationForm({ onAdd, pendingCoords, existingIds }: {
    onAdd: (loc: StoryLocation) => void;
    pendingCoords: { x: number; y: number } | null;
    existingIds: string[];
}) {
    const [name, setName] = useState('');
    const [type, setType] = useState<LocationType>('village');
    const [chapter, setChapter] = useState(0);
    const [cx, setCx] = useState(500);
    const [cy, setCy] = useState(325);
    const [desc, setDesc] = useState('');

    // Update coords when user clicks on map
    if (pendingCoords && (pendingCoords.x !== cx || pendingCoords.y !== cy)) {
        setCx(Math.round(pendingCoords.x));
        setCy(Math.round(pendingCoords.y));
    }

    const handleAdd = () => {
        if (!name.trim()) return;
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
        if (existingIds.includes(id)) {
            alert(`Ein Ort mit ID "${id}" existiert bereits.`);
            return;
        }
        const loc: StoryLocation = {
            id,
            type,
            name: { de: name, en: name } as BiText,
            description: { de: desc || name, en: desc || name } as BiText,
            coordinates: { x: cx, y: cy },
            hasSubMap: type === 'village' || type === 'farm' || type === 'cabin',
            destroyedMinChapter: null,
            buildings: [
                {
                    id: `${id}-main`,
                    type: type === 'village' ? 'house' : 'feature',
                    position: { x: 300, y: 240, w: 30, h: 24 },
                    label: { de: name, en: name } as BiText,
                    minChapter: chapter,
                },
            ],
        };
        onAdd(loc);
        setName('');
        setDesc('');
    };

    return (
        <div className="admin-section">
            <h4>Neuer Ort</h4>
            <div className="admin-form">
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Name des Ortes"
                />
                <select value={type} onChange={e => setType(e.target.value as LocationType)}>
                    {LOCATION_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                </select>
                <div className="admin-row">
                    <label>
                        X: <input type="number" value={cx} onChange={e => setCx(Number(e.target.value))} style={{ width: 70 }} />
                    </label>
                    <label>
                        Y: <input type="number" value={cy} onChange={e => setCy(Number(e.target.value))} style={{ width: 70 }} />
                    </label>
                </div>
                <p className="admin-hint">Tipp: Klicke auf die Karte um Koordinaten zu setzen</p>
                <label>
                    Ab Kapitel: <input type="number" min={0} max={20} value={chapter} onChange={e => setChapter(Number(e.target.value))} style={{ width: 50 }} />
                </label>
                <input
                    type="text"
                    value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder="Beschreibung (optional)"
                />
                <button onClick={handleAdd} disabled={!name.trim()}>Ort hinzufügen</button>
            </div>
        </div>
    );
}

// ── Location List ───────────────────────────────────────────────

function LocationList({ locations, onDelete }: {
    locations: StoryLocation[];
    onDelete: (id: string) => void;
}) {
    return (
        <div className="admin-section">
            <h4>Orte ({locations.length})</h4>
            <div className="admin-list">
                {locations.map(loc => (
                    <div key={loc.id} className="admin-list-item">
                        <span className="admin-item-name">{loc.name.de}</span>
                        <span className="admin-item-type">{loc.type}</span>
                        <span className="admin-item-coords">({loc.coordinates.x}, {loc.coordinates.y})</span>
                        <button
                            className="admin-item-delete"
                            onClick={() => {
                                if (confirm(`"${loc.name.de}" löschen?`)) onDelete(loc.id);
                            }}
                            title="Löschen"
                        >×</button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Path Form ───────────────────────────────────────────────────

function PathForm({ locations, existingPaths, onAdd }: {
    locations: StoryLocation[];
    existingPaths: WorldPath[];
    onAdd: (path: WorldPath) => void;
}) {
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');

    const handleAdd = () => {
        if (!from || !to || from === to) return;
        const fromLoc = locations.find(l => l.id === from);
        const toLoc = locations.find(l => l.id === to);
        if (!fromLoc || !toLoc) return;

        const id = `path-${from}-${to}`;
        if (existingPaths.some(p => p.id === id)) {
            alert('Dieser Pfad existiert bereits.');
            return;
        }

        const path: WorldPath = {
            id,
            from,
            to,
            name: {
                de: `Pfad: ${fromLoc.name.de} → ${toLoc.name.de}`,
                en: `Path: ${fromLoc.name.en ?? fromLoc.name.de} → ${toLoc.name.en ?? toLoc.name.de}`,
            } as BiText,
            style: { stroke: '#8a7a5a', dash: '5,4', width: 1.2 },
            svgPath: `M ${fromLoc.coordinates.x},${fromLoc.coordinates.y} L ${toLoc.coordinates.x},${toLoc.coordinates.y}`,
            description: {
                de: `Verbindung zwischen ${fromLoc.name.de} und ${toLoc.name.de}`,
                en: `Connection between ${fromLoc.name.en ?? fromLoc.name.de} and ${toLoc.name.en ?? toLoc.name.de}`,
            } as BiText,
        };
        onAdd(path);
        setFrom('');
        setTo('');
    };

    return (
        <div className="admin-section">
            <h4>Neuer Pfad</h4>
            <div className="admin-form">
                <select value={from} onChange={e => setFrom(e.target.value)}>
                    <option value="">Von...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name.de}</option>)}
                </select>
                <select value={to} onChange={e => setTo(e.target.value)}>
                    <option value="">Nach...</option>
                    {locations.map(l => <option key={l.id} value={l.id}>{l.name.de}</option>)}
                </select>
                <button onClick={handleAdd} disabled={!from || !to || from === to}>Pfad hinzufügen</button>
            </div>
        </div>
    );
}

// ── Path List ───────────────────────────────────────────────────

function PathList({ paths, onDelete }: {
    paths: WorldPath[];
    onDelete: (id: string) => void;
}) {
    if (paths.length === 0) return null;
    return (
        <div className="admin-section">
            <h4>Pfade ({paths.length})</h4>
            <div className="admin-list">
                {paths.map(p => (
                    <div key={p.id} className="admin-list-item">
                        <span className="admin-item-name">{p.name.de}</span>
                        <button
                            className="admin-item-delete"
                            onClick={() => {
                                if (confirm(`Pfad löschen?`)) onDelete(p.id);
                            }}
                            title="Löschen"
                        >×</button>
                    </div>
                ))}
            </div>
        </div>
    );
}
