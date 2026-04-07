import React, { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentCard {
  name: string;
  description: string;
  skills: Array<{ id: string; name: string; tags: string[] }>;
}

interface AgentInstance {
  id: string;
  profileId: string;
  url: string;
  platform: string;
  card: AgentCard;
  metadata: Record<string, unknown>;
  registeredAt: number;
  lastSeen: number;
  status: 'online' | 'offline' | 'degraded' | 'unknown';
}

interface AgentProfile {
  id: string;
  label: string;
  description: string;
  platform: string;
  skills: string[];
  tools: string[];
  tags: string[];
  cardTemplate: object;
}

type Coverage = Record<string, { online: number; offline: number; degraded: number }>;

const PLATFORMS = ['any', 'linux', 'cdm', 'windows', 'agentcore'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(epochMs: number): string {
  const secs = Math.floor((Date.now() - epochMs) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ProfileFormProps {
  initial?: AgentProfile | null;
  onSave: (profile: Partial<AgentProfile>) => Promise<void>;
  onCancel: () => void;
}

function ProfileForm({ initial, onSave, onCancel }: ProfileFormProps) {
  const [id, setId] = useState(initial?.id ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [platform, setPlatform] = useState(initial?.platform ?? 'any');
  const [skills, setSkills] = useState((initial?.skills ?? []).join(', '));
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: id.trim(),
        label: label.trim(),
        platform,
        skills: skills.split(',').map(s => s.trim()).filter(Boolean),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#1a1a2e',
    border: '1px solid #3d3d5c',
    borderRadius: 6,
    color: '#e0e0e0',
    padding: '5px 8px',
    fontSize: 12,
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: '#9090b0',
    marginBottom: 3,
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#1e1e38', border: '1px solid #3d3d5c', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label style={labelStyle}>ID</label>
          <input style={inputStyle} value={id} onChange={e => setId(e.target.value)} placeholder="my-agent" required disabled={!!initial} />
        </div>
        <div>
          <label style={labelStyle}>Label</label>
          <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)} placeholder="My Agent" required />
        </div>
        <div>
          <label style={labelStyle}>Platform</label>
          <select style={inputStyle} value={platform} onChange={e => setPlatform(e.target.value)}>
            {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Skills (comma-separated)</label>
          <input style={inputStyle} value={skills} onChange={e => setSkills(e.target.value)} placeholder="coding, files" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input style={inputStyle} value={tags} onChange={e => setTags(e.target.value)} placeholder="coding, terminal" />
        </div>
      </div>
      {error && <div style={{ color: '#ff6b6b', fontSize: 11, marginBottom: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="submit" disabled={saving} style={{ background: '#4a4aff', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} style={{ background: 'transparent', color: '#9090b0', border: '1px solid #3d3d5c', borderRadius: 6, padding: '5px 14px', fontSize: 12, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function AgentsPanel() {
  const [instances, setInstances] = useState<AgentInstance[]>([]);
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [coverage, setCoverage] = useState<Coverage>({});
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<AgentProfile | null>(null);
  const [spawningProfileId, setSpawningProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [instRes, profRes, covRes] = await Promise.all([
        fetch('/api/a2a/registry'),
        fetch('/api/a2a/profiles'),
        fetch('/api/a2a/coverage'),
      ]);
      if (instRes.ok) setInstances(await instRes.json());
      if (profRes.ok) setProfiles(await profRes.json());
      if (covRes.ok) setCoverage(await covRes.json());
    } catch {
      // silently ignore — panel will show stale data
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleDeregister = async (id: string) => {
    await fetch(`/api/a2a/registry/${id}`, { method: 'DELETE' });
    await refresh();
  };

  const handleSpawn = async (profile: AgentProfile) => {
    setSpawningProfileId(profile.id);
    try {
      await fetch('/api/a2a/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: profile.id, platform: profile.platform }),
      });
      setTimeout(() => refresh(), 2000);
    } catch {
      setError('Spawn failed');
    } finally {
      setSpawningProfileId(null);
    }
  };

  const handleSaveProfile = async (data: Partial<AgentProfile>) => {
    const isEdit = !!editingProfile;
    const url = isEdit ? `/api/a2a/profiles/${editingProfile!.id}` : '/api/a2a/profiles';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `HTTP ${res.status}`);
    }
    setShowProfileForm(false);
    setEditingProfile(null);
    await refresh();
  };

  // Profiles with no registered instance
  const unregisteredProfiles = profiles.filter(
    p => !instances.some(i => i.profileId === p.id)
  );

  // Platforms that have profiles but zero online instances
  const warnPlatforms = PLATFORMS.filter(platform => {
    const cov = coverage[platform];
    const hasProfiles = profiles.some(p => p.platform === platform);
    return hasProfiles && (!cov || cov.online === 0);
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 480,
    background: '#12122a',
    borderLeft: '1px solid #2d2d44',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 40,
    color: '#e0e0e0',
    fontFamily: 'inherit',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid #2d2d44',
    background: '#1a1a2e',
    flexShrink: 0,
  };

  const sectionStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderBottom: '1px solid #2d2d44',
    flexShrink: 0,
  };

  const badgeStyle = (online: boolean, degraded?: boolean): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    background: degraded ? '#3a3a1a' : online ? '#1a3a1a' : '#2a2a2a',
    border: `1px solid ${degraded ? '#6a6a2d' : online ? '#2d6a2d' : '#3d3d3d'}`,
    borderRadius: 12,
    padding: '2px 8px',
    fontSize: 11,
    color: degraded ? '#cfcf6f' : online ? '#6fcf6f' : '#888',
    fontWeight: 500,
  });

  const instanceRowStyle = (online: boolean, degraded?: boolean): React.CSSProperties => ({
    background: '#1e1e38',
    border: `1px solid ${degraded ? '#4a4a2d' : '#2d2d44'}`,
    borderRadius: 8,
    padding: '10px 12px',
    marginBottom: 8,
    opacity: online || degraded ? 1 : 0.55,
  });

  const btnStyle = (variant: 'danger' | 'primary' | 'secondary' = 'secondary'): React.CSSProperties => ({
    background: variant === 'danger' ? 'transparent' : variant === 'primary' ? '#4a4aff' : 'transparent',
    color: variant === 'danger' ? '#ff6b6b' : variant === 'primary' ? '#fff' : '#9090b0',
    border: `1px solid ${variant === 'danger' ? '#ff6b6b44' : variant === 'primary' ? '#4a4aff' : '#3d3d5c'}`,
    borderRadius: 6,
    padding: '3px 10px',
    fontSize: 11,
    cursor: 'pointer',
  });

  const platformBadge = (platform: string): React.CSSProperties => ({
    display: 'inline-block',
    background: '#2d2d44',
    borderRadius: 4,
    padding: '1px 6px',
    fontSize: 10,
    color: '#a0a0c0',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  });

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0' }}>🤖 Agents</span>
          <span style={{ fontSize: 11, color: '#666' }}>{instances.length} registered</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => { setShowProfileForm(true); setEditingProfile(null); }}
            style={btnStyle('primary')}
          >
            + New Profile
          </button>
          <button onClick={refresh} style={btnStyle()} title="Refresh">↻</button>
        </div>
      </div>

      {/* New Profile form */}
      {showProfileForm && !editingProfile && (
        <div style={{ padding: '0 16px 8px', borderBottom: '1px solid #2d2d44', flexShrink: 0 }}>
          <ProfileForm
            onSave={handleSaveProfile}
            onCancel={() => setShowProfileForm(false)}
          />
        </div>
      )}

      {/* Coverage bar */}
      <div style={sectionStyle}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform Coverage</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PLATFORMS.map(platform => {
            const cov = coverage[platform];
            const online = cov ? cov.online > 0 : false;
            const hasDegraded = cov ? (cov.degraded ?? 0) > 0 : false;
            return (
              <span key={platform} style={badgeStyle(online, hasDegraded)}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: hasDegraded ? '#cfcf6f' : online ? '#6fcf6f' : '#555', display: 'inline-block' }} />
                {platform}
                {cov && <span style={{ color: '#666', fontSize: 10 }}>({cov.online}/{(cov.online + (cov.degraded ?? 0) + cov.offline)})</span>}
              </span>
            );
          })}
        </div>

        {/* Warnings for platforms with profiles but no online instances */}
        {warnPlatforms.length > 0 && (
          <div style={{ marginTop: 8, background: '#2a1a00', border: '1px solid #5a3a00', borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#ffb347' }}>
            ⚠ No online instances for: {warnPlatforms.map(p => {
              const affected = profiles.filter(pr => pr.platform === p).map(pr => pr.label).join(', ');
              return `${p} (${affected})`;
            }).join(' · ')}
          </div>
        )}
      </div>

      {error && (
        <div style={{ padding: '6px 16px', background: '#2a0000', color: '#ff6b6b', fontSize: 11, flexShrink: 0 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#ff6b6b', cursor: 'pointer', fontSize: 11 }}>✕</button>
        </div>
      )}

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>

        {/* Online instances */}
        {instances.filter(i => i.status === 'online').length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Online</div>
            {instances.filter(i => i.status === 'online').map(inst => (
              <InstanceRow key={inst.id} instance={inst} profiles={profiles} onDeregister={handleDeregister} instanceRowStyle={instanceRowStyle} btnStyle={btnStyle} platformBadge={platformBadge} />
            ))}
          </div>
        )}

        {/* Offline instances */}
        {instances.filter(i => i.status !== 'online').length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Offline</div>
            {instances.filter(i => i.status !== 'online').map(inst => (
              <InstanceRow key={inst.id} instance={inst} profiles={profiles} onDeregister={handleDeregister} instanceRowStyle={instanceRowStyle} btnStyle={btnStyle} platformBadge={platformBadge} />
            ))}
          </div>
        )}

        {/* Catalog profiles with no instance */}
        {unregisteredProfiles.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Catalog (not running)</div>
            {unregisteredProfiles.map(profile => (
              <div key={profile.id}>
                <div style={{ background: '#1a1a2e', border: '1px solid #2d2d44', borderRadius: 8, padding: '10px 12px', marginBottom: editingProfile?.id === profile.id ? 0 : 8, opacity: 0.75 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#555', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontStyle: 'italic', color: '#a0a0c0', fontWeight: 500 }}>{profile.label}</span>
                      <span style={platformBadge(profile.platform)}>{profile.platform}</span>
                      <span style={{ fontSize: 10, color: '#555', background: '#1e1e38', border: '1px solid #2d2d44', borderRadius: 4, padding: '1px 6px' }}>not running</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => { setEditingProfile(profile); setShowProfileForm(false); }}
                        style={btnStyle()}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleSpawn(profile)}
                        disabled={spawningProfileId === profile.id}
                        style={{ ...btnStyle('primary'), opacity: spawningProfileId === profile.id ? 0.7 : 1 }}
                      >
                        {spawningProfileId === profile.id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            Spawning…
                          </span>
                        ) : 'Spawn'}
                      </button>
                    </div>
                  </div>
                  {profile.tags.length > 0 && (
                    <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {profile.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 10, background: '#2d2d44', borderRadius: 4, padding: '1px 6px', color: '#8080a0' }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                {editingProfile?.id === profile.id && (
                  <div style={{ marginBottom: 8 }}>
                    <ProfileForm
                      initial={editingProfile}
                      onSave={handleSaveProfile}
                      onCancel={() => setEditingProfile(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {instances.length === 0 && profiles.length === 0 && (
          <div style={{ textAlign: 'center', color: '#555', fontSize: 13, paddingTop: 40 }}>
            No agents registered yet.
          </div>
        )}
      </div>

      {/* Spinner keyframe */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── InstanceRow ───────────────────────────────────────────────────────────────

interface InstanceRowProps {
  instance: AgentInstance;
  profiles: AgentProfile[];
  onDeregister: (id: string) => void;
  instanceRowStyle: (online: boolean, degraded?: boolean) => React.CSSProperties;
  btnStyle: (variant?: 'danger' | 'primary' | 'secondary') => React.CSSProperties;
  platformBadge: (platform: string) => React.CSSProperties;
}

function InstanceRow({ instance, profiles, onDeregister, instanceRowStyle, btnStyle, platformBadge }: InstanceRowProps) {
  const online = instance.status === 'online';
  const degraded = instance.status === 'degraded';
  const profile = profiles.find(p => p.id === instance.profileId);
  const label = profile?.label ?? instance.card?.name ?? instance.profileId;
  const allTags = Array.from(new Set(
    (instance.card?.skills ?? []).flatMap(s => s.tags ?? [])
  ));
  const dotColor = online ? '#6fcf6f' : degraded ? '#cfcf6f' : '#e05555';
  const labelColor = online ? '#e0e0e0' : degraded ? '#cfcf6f' : '#888';

  return (
    <div style={instanceRowStyle(online, degraded)}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: labelColor }}>{label}</span>
            <span style={platformBadge(instance.platform)}>{instance.platform}</span>
            {degraded && <span style={{ fontSize: 10, color: '#cfcf6f', background: '#3a3a1a', borderRadius: 4, padding: '1px 6px' }}>needs attention</span>}
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#6060a0', wordBreak: 'break-all' }}>{instance.url}</div>
          {degraded && (instance as any).degradedReason && (
            <div style={{ marginTop: 3, fontSize: 10, color: '#cfcf6f' }}>⚠ {(instance as any).degradedReason}</div>
          )}
          {allTags.length > 0 && (
            <div style={{ marginTop: 5, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {allTags.map(tag => (
                <span key={tag} style={{ fontSize: 10, background: '#2d2d44', borderRadius: 4, padding: '1px 6px', color: '#8080a0' }}>{tag}</span>
              ))}
            </div>
          )}
          <div style={{ marginTop: 5, fontSize: 10, color: '#555', display: 'flex', gap: 12 }}>
            <span>last seen {timeAgo(instance.lastSeen)}</span>
          </div>
        </div>
        <button
          onClick={() => onDeregister(instance.id)}
          style={{ ...btnStyle('danger'), flexShrink: 0 }}
        >
          Deregister
        </button>
      </div>
    </div>
  );
}
