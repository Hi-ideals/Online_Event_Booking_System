import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Ticket } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import Button from '../../components/ui/Button';
import { Alert } from '../../components/ui/Feedback';
import { Field, Input, PasswordInput } from '../../components/ui/Form';
import { redirectAfterLogin, useAuth } from '../../context/AuthContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import cn from '../../lib/cn';
import { applyServerErrors, getErrorMessage } from '../../lib/errors';
import { emailSchema, optionalPhone, optionalText, passwordSchema } from '../../lib/validation';

const base = {
  name: z.string().trim().min(2, 'Enter your full name').max(120),
  email: emailSchema,
  phone: optionalPhone,
  password: passwordSchema,
  confirmPassword: z.string(),
};

const organizerFields = z.object({
  organizationName: z.string().trim().min(2, 'Enter your organization name').max(160),
  city: optionalText(100),
  website: z
    .string()
    .trim()
    .transform((v) => v || undefined)
    .refine((v) => v === undefined || /^https?:\/\/.+\..+/.test(v), 'Enter a full URL, e.g. https://example.com')
    .optional(),
});

const matchPasswords = (v) => v.password === v.confirmPassword;
const mismatch = { message: 'Passwords do not match', path: ['confirmPassword'] };

const attendeeSchema = z.object({ ...base }).refine(matchPasswords, mismatch);
const organizerSchema = z.object({ ...base, organizer: organizerFields }).refine(matchPasswords, mismatch);

const ROLES = [
  { value: 'attendee', label: 'Book tickets', description: 'Discover and attend events', icon: Ticket },
  { value: 'organizer', label: 'Host events', description: 'Sell tickets as an organizer', icon: Building2 },
];

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const role = params.get('role') === 'organizer' ? 'organizer' : 'attendee';
  const [formError, setFormError] = useState(null);

  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(role === 'organizer' ? organizerSchema : attendeeSchema),
  });

  const chooseRole = (value) => {
    const next = new URLSearchParams(params);
    if (value === 'organizer') next.set('role', 'organizer');
    else next.delete('role');
    setParams(next, { replace: true });
  };

  const onSubmit = async ({ confirmPassword: _confirm, ...values }) => {
    setFormError(null);
    try {
      const user = await registerUser({ ...values, role });
      if (role === 'organizer') {
        toast.success('Account created! We will review it shortly.');
      } else {
        toast.success(`Welcome, ${user.name.split(' ')[0]}!`);
      }
      navigate(redirectAfterLogin(user, params.get('redirect')), { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, setError)) setFormError(getErrorMessage(error));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Create your account</h1>
      <p className="mt-2 text-sm text-slate-500">
        Already registered?{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
          Log in
        </Link>
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Account type">
        {ROLES.map(({ value, label, description, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={role === value}
            onClick={() => chooseRole(value)}
            className={cn(
              'rounded-xl p-3 text-left ring-1 transition sm:p-4',
              role === value ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-white ring-slate-200 hover:ring-slate-300'
            )}
          >
            <Icon className={cn('h-5 w-5', role === value ? 'text-brand-600' : 'text-slate-400')} />
            <p className="mt-2 text-sm font-semibold text-slate-900">{label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate key={role}>
        {formError && <Alert tone="error">{formError}</Alert>}

        <Field label="Full name" required error={errors.name?.message}>
          {({ id }) => <Input id={id} autoComplete="name" placeholder="Asha Rao" error={errors.name} {...register('name')} />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required error={errors.email?.message}>
            {({ id }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" error={errors.email} {...register('email')} />}
          </Field>
          <Field label="Phone" error={errors.phone?.message}>
            {({ id }) => <Input id={id} type="tel" autoComplete="tel" placeholder="9876543210" error={errors.phone} {...register('phone')} />}
          </Field>
        </div>

        {role === 'organizer' && (
          <div className="space-y-4 rounded-xl bg-slate-100/70 p-4">
            <p className="text-sm font-semibold text-slate-700">Organization details</p>
            <Field label="Organization name" required error={errors.organizer?.organizationName?.message}>
              {({ id }) => <Input id={id} placeholder="Bengaluru Live Events" error={errors.organizer?.organizationName} {...register('organizer.organizationName')} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City" error={errors.organizer?.city?.message}>
                {({ id }) => <Input id={id} placeholder="Bengaluru" error={errors.organizer?.city} {...register('organizer.city')} />}
              </Field>
              <Field label="Website" error={errors.organizer?.website?.message}>
                {({ id }) => <Input id={id} type="url" placeholder="https://" error={errors.organizer?.website} {...register('organizer.website')} />}
              </Field>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" required error={errors.password?.message} hint="8+ characters with a letter and a number">
            {({ id }) => <PasswordInput id={id} autoComplete="new-password" error={errors.password} {...register('password')} />}
          </Field>
          <Field label="Confirm password" required error={errors.confirmPassword?.message}>
            {({ id }) => <PasswordInput id={id} autoComplete="new-password" error={errors.confirmPassword} {...register('confirmPassword')} />}
          </Field>
        </div>

        {role === 'organizer' && (
          <Alert tone="info">Organizer accounts are reviewed by our team before you can publish events.</Alert>
        )}

        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {role === 'organizer' ? 'Create organizer account' : 'Create account'}
        </Button>
      </form>
    </div>
  );
}
