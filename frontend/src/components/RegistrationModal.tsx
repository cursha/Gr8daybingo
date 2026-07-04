import React, { useEffect, useState } from 'react';
import {
  ProfileStatus,
  getRegistrationStatus,
  registerProfile,
  getCountries,
  getStates,
  CountryOption,
  StateOption,
} from '@/lib/game-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Gift, Loader2 } from 'lucide-react';

interface RegistrationModalProps {
  enforce?: boolean;
  onCompleted?: (status: ProfileStatus) => void;
}

const RegistrationModal: React.FC<RegistrationModalProps> = ({ enforce = true, onCompleted }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [countryId, setCountryId] = useState<number | ''>('');
  const [stateId, setStateId] = useState<number | ''>('');
  const [bonusAmount, setBonusAmount] = useState<number>(15);

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [states, setStates] = useState<StateOption[]>([]);

  useEffect(() => {
    getCountries().then(setCountries).catch(() => {});
  }, []);

  useEffect(() => {
    if (countryId) {
      setStateId('');
      getStates(countryId as number).then(setStates).catch(() => setStates([]));
    } else {
      setStates([]);
      setStateId('');
    }
  }, [countryId]);

  useEffect(() => {
    let cancelled = false;
    const checkStatus = async () => {
      try {
        const status = await getRegistrationStatus();
        if (cancelled) return;
        if (typeof status?.signup_bonus_amount === 'number') {
          setBonusAmount(status.signup_bonus_amount);
        }
        if (status?.profile_completed) {
          setOpen(false);
          onCompleted?.(status);
        } else {
          setEmail(status?.email ?? '');
          setFirstName(status?.first_name ?? '');
          setLastName(status?.last_name ?? '');
          setCity((status as any)?.city ?? '');
          setCountryId((status as any)?.country_id ?? '');
          setStateId((status as any)?.state_id ?? '');
          setOpen(true);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    checkStatus();
    return () => { cancelled = true; };
  }, [onCompleted]);

  const selectedCountry = countries.find((c) => c.id === countryId);
  const bonusLabel = `$${bonusAmount.toFixed(bonusAmount % 1 === 0 ? 0 : 2)}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fn = firstName.trim();
    const ln = lastName.trim();
    const mail = email.trim();
    if (!fn || !ln || !mail) {
      toast.error('Please fill in all required fields.');
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(mail)) {
      toast.error('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const data = await registerProfile({
        first_name: fn,
        last_name: ln,
        email: mail,
        city: city.trim() || undefined,
        country_id: countryId || undefined,
        state_id: stateId || undefined,
        province_state: states.find((s) => s.id === stateId)?.name || undefined,
        country: selectedCountry?.name || undefined,
      });
      if (data?.bonus_granted) {
        toast.success(`🎉 Welcome! ${bonusLabel} has been credited to your wallet.`);
      } else {
        toast.success('Profile saved.');
      }
      setOpen(false);
      onCompleted?.({
        profile_completed: true,
        signup_bonus_granted: !!data?.bonus_granted,
        first_name: data?.first_name,
        last_name: data?.last_name,
        email: data?.email,
        signup_bonus_amount: bonusAmount,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (enforce && !next) return;
        setOpen(next);
      }}
    >
      <DialogContent
        className="sm:max-w-md max-h-[90vh] overflow-y-auto"
        onInteractOutside={(e) => { if (enforce) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (enforce) e.preventDefault(); }}
      >
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-emerald-500 text-white shadow-md">
            <Gift className="h-6 w-6" />
          </div>
          <DialogTitle className="text-center text-xl">Complete Your Registration</DialogTitle>
          <DialogDescription className="text-center">
            {bonusAmount > 0 ? (
              <>Tell us a little about you and we'll credit{' '}
                <span className="font-semibold text-emerald-600">{bonusLabel}</span> to your wallet as a welcome gift.</>
            ) : (
              <>Tell us a little about you to finish setting up your account.</>
            )}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 pt-2" onSubmit={handleSubmit}>
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name <span className="text-red-500">*</span></Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="Your first name" autoComplete="given-name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name <span className="text-red-500">*</span></Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="Your last name" autoComplete="family-name" required />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email <span className="text-red-500">*</span></Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" autoComplete="email" required />
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <select
              id="country"
              value={countryId}
              onChange={(e) => setCountryId(e.target.value ? parseInt(e.target.value) : '')}
              className="w-full h-10 border border-input rounded-md bg-background px-3 text-sm"
            >
              <option value="">Select country…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {countryId !== '' && (
            <div className="space-y-1.5">
              <Label htmlFor="state">{selectedCountry?.code === 'CA' ? 'Province / Territory' : 'State / Province'}</Label>
              {states.length > 0 ? (
                <select
                  id="state"
                  value={stateId}
                  onChange={(e) => setStateId(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full h-10 border border-input rounded-md bg-background px-3 text-sm"
                >
                  <option value="">Select…</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <Input
                  id="state"
                  placeholder="State / Province / Region"
                  autoComplete="address-level1"
                />
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input id="city" value={city} onChange={(e) => setCity(e.target.value)}
              placeholder="Your city" autoComplete="address-level2" />
          </div>

          <Button type="submit" disabled={submitting}
            className="w-full bg-gradient-to-r from-indigo-600 to-emerald-500 text-white hover:opacity-95">
            {submitting ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…</>
            ) : bonusAmount > 0 ? (
              `Claim my ${bonusLabel} welcome bonus`
            ) : (
              'Complete Registration'
            )}
          </Button>
          <p className="text-center text-xs text-slate-500">
            Your info is only used for your Gr8Day Bingo account.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RegistrationModal;
