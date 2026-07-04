import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { clearAuthToken } from '@/lib/apiClient';
import {
  ProfileDetails,
  CountryOption,
  StateOption,
  TargetingAttribute,
  getMyProfileDetails,
  updateMyProfile,
  changePassword,
  deleteMyAccount,
  getCountries,
  getStates,
  getTargetingAttributes,
  getMyTargeting,
  setMyTargeting as saveMyTargeting,
} from '@/lib/game-utils';
import { TargetingGroupsInput } from '@/components/TargetingGroupsInput';

interface Props {
  onClose: () => void;
  onDeleted: () => void;
}

const EditProfileModal: React.FC<Props> = ({ onClose, onDeleted }) => {
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);
  const [saving, setSaving] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [city, setCity] = useState('');
  const [countryId, setCountryId] = useState<number | null>(null);
  const [stateId, setStateId] = useState<number | null>(null);

  const [targetingAttributes, setTargetingAttributes] = useState<TargetingAttribute[]>([]);
  const [myTargeting, setMyTargeting] = useState<Set<number>>(new Set());

  const [showPassword, setShowPassword] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  useEffect(() => {
    getMyProfileDetails().then((p) => {
      setProfile(p);
      setFirstName(p.first_name ?? '');
      setLastName(p.last_name ?? '');
      setUsername(p.username ?? '');
      setCity(p.city ?? '');
      setCountryId(p.country_id);
      setStateId(p.state_id);
    }).catch(() => toast.error('Failed to load profile'));

    getCountries().then(setCountries).catch(() => {});
    getTargetingAttributes().then((d) => setTargetingAttributes(d.attributes)).catch(() => {});
    getMyTargeting().then((d) => setMyTargeting(new Set(d.targeting_value_ids))).catch(() => {});
  }, []);

  useEffect(() => {
    if (countryId) {
      getStates(countryId).then(setStates).catch(() => setStates([]));
    } else {
      setStates([]);
      setStateId(null);
    }
  }, [countryId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        updateMyProfile({ first_name: firstName, last_name: lastName, username, city, country_id: countryId, state_id: stateId }),
        saveMyTargeting([...myTargeting]),
      ]);
      toast.success('Profile updated!');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPw !== confirmPw) { toast.error('Passwords do not match'); return; }
    if (newPw.length < 8) { toast.error('New password must be at least 8 characters'); return; }
    setChangingPw(true);
    try {
      await changePassword(currentPw, newPw);
      toast.success('Password changed!');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setShowPassword(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to change password');
    } finally {
      setChangingPw(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete your account? This cannot be undone.')) return;
    try {
      await deleteMyAccount();
      clearAuthToken();
      onDeleted();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete account');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="text-lg font-bold text-slate-800">Edit Profile</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {profile && (
            <p className="text-xs text-slate-400 font-mono">GR8-{profile.player_number} · {profile.email}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">First Name</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Last Name</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">Username</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={username} onChange={e => setUsername(e.target.value)} />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block">City</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={city} onChange={e => setCity(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Country</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={countryId ?? ''} onChange={e => { setCountryId(e.target.value ? Number(e.target.value) : null); setStateId(null); }}>
                <option value="">Select…</option>
                {countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Province / State</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" value={stateId ?? ''} onChange={e => setStateId(e.target.value ? Number(e.target.value) : null)} disabled={!countryId || states.length === 0}>
                <option value="">Select…</option>
                {states.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <TargetingGroupsInput
            attributes={targetingAttributes}
            targeting={myTargeting}
            onChange={setMyTargeting}
          />

          <button onClick={handleSave} disabled={saving} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl transition-colors">
            {saving ? 'Saving…' : 'Save Changes'}
          </button>

          {/* Password change */}
          <div className="border-t pt-4">
            <button onClick={() => setShowPassword(!showPassword)} className="text-sm text-indigo-600 hover:underline font-medium">
              {showPassword ? 'Cancel password change' : 'Change Password'}
            </button>
            {showPassword && (
              <div className="mt-3 space-y-3">
                <input type="password" placeholder="Current password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
                <input type="password" placeholder="New password (min 8 chars)" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={newPw} onChange={e => setNewPw(e.target.value)} />
                <input type="password" placeholder="Confirm new password" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} />
                <button onClick={handleChangePassword} disabled={changingPw} className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white font-semibold py-2 rounded-xl text-sm transition-colors">
                  {changingPw ? 'Changing…' : 'Change Password'}
                </button>
              </div>
            )}
          </div>

          {/* Delete account */}
          <div className="border-t pt-4">
            <button onClick={handleDelete} className="w-full bg-red-50 hover:bg-red-100 text-red-600 font-semibold py-2 rounded-xl text-sm transition-colors border border-red-200">
              Delete My Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditProfileModal;
