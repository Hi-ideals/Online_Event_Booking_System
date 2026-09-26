import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, Landmark, LogOut, Store, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { authApi } from '../../api/auth';
import Button from '../../components/ui/Button';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Badge, PageHeader } from '../../components/ui/Feedback';
import { Field, Input, PasswordInput, Textarea } from '../../components/ui/Form';
import { useAuth } from '../../context/AuthContext';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { applyServerErrors, getErrorMessage } from '../../lib/errors';
import { formatDate, titleCase } from '../../lib/format';
import { optionalPhone, optionalText, passwordSchema } from '../../lib/validation';

const STATUS_TONE = { active: 'green', pending_approval: 'amber', rejected: 'red', suspended: 'red' };

/** Shared submit wrapper: toast on success, field errors or toast on failure. */
function useSubmit(setError, action, successMessage) {
  return async (values) => {
    try {
      await action(values);
      toast.success(successMessage);
    } catch (error) {
      if (!applyServerErrors(error, setError)) toast.error(getErrorMessage(error));
    }
  };
}

function ProfileForm({ user, onSaved }) {
  const schema = z.object({ name: z.string().trim().min(2, 'Enter your full name').max(120), phone: optionalPhone.transform((v) => v ?? null) });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty }, reset } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: user.name, phone: user.phone ?? '' },
  });
  const submit = useSubmit(setError, async (values) => {
    const { user: updated } = await authApi.updateProfile(values);
    onSaved(updated);
    reset({ name: updated.name, phone: updated.phone ?? '' });
  }, 'Profile updated');

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.message}>
          {({ id }) => <Input id={id} error={errors.name} {...register('name')} />}
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          {({ id }) => <Input id={id} type="tel" error={errors.phone} {...register('phone')} />}
        </Field>
        <Field label="Email" hint="Email cannot be changed" className="sm:col-span-2">
          {({ id }) => <Input id={id} value={user.email} disabled readOnly />}
        </Field>
      </CardBody>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

function OrganizationForm({ user, onSaved }) {
  const profile = user.organizerProfile ?? {};
  const schema = z.object({
    organizationName: z.string().trim().min(2, 'Enter your organization name').max(160),
    contactPhone: optionalPhone.transform((v) => v ?? null),
    website: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || /^https?:\/\/.+\..+/.test(v), 'Enter a full URL, e.g. https://example.com'),
    address: optionalText(500, { clearable: true }),
    city: optionalText(100, { clearable: true }),
    gstNumber: optionalText(20, { clearable: true }),
    description: optionalText(2000, { clearable: true }),
  });
  const defaults = {
    organizationName: profile.organizationName ?? '',
    contactPhone: profile.contactPhone ?? '',
    website: profile.website ?? '',
    address: profile.address ?? '',
    city: profile.city ?? '',
    gstNumber: profile.gstNumber ?? '',
    description: profile.description ?? '',
  };
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm({ resolver: zodResolver(schema), defaultValues: defaults });
  const submit = useSubmit(
    (name, err) => setError(name.replace(/^organizer\./, ''), err),
    async (organizer) => {
      const { user: updated } = await authApi.updateProfile({ organizer });
      onSaved(updated);
      reset(organizer, { keepValues: true });
    },
    'Organization details saved'
  );

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" required error={errors.organizationName?.message}>
          {({ id }) => <Input id={id} error={errors.organizationName} {...register('organizationName')} />}
        </Field>
        <Field label="Contact phone" error={errors.contactPhone?.message}>
          {({ id }) => <Input id={id} type="tel" error={errors.contactPhone} {...register('contactPhone')} />}
        </Field>
        <Field label="Website" error={errors.website?.message}>
          {({ id }) => <Input id={id} type="url" placeholder="https://" error={errors.website} {...register('website')} />}
        </Field>
        <Field label="GST number" error={errors.gstNumber?.message}>
          {({ id }) => <Input id={id} placeholder="29ABCDE1234F1Z5" error={errors.gstNumber} {...register('gstNumber')} />}
        </Field>
        <Field label="Address" error={errors.address?.message}>
          {({ id }) => <Input id={id} error={errors.address} {...register('address')} />}
        </Field>
        <Field label="City" error={errors.city?.message}>
          {({ id }) => <Input id={id} error={errors.city} {...register('city')} />}
        </Field>
        <Field label="About your organization" error={errors.description?.message} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} rows={3} error={errors.description} {...register('description')} />}
        </Field>
      </CardBody>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save organization
        </Button>
      </div>
    </form>
  );
}

function PayoutForm({ user, onSaved }) {
  const payout = user.organizerProfile?.payoutDetails ?? {};
  const text = (max) => z.string().trim().max(max).transform((v) => v || undefined).optional();
  const schema = z.object({
    accountHolderName: text(120),
    bankName: text(120),
    accountNumber: z.string().trim().transform((v) => v || undefined).refine((v) => !v || /^[0-9]{6,20}$/.test(v), 'Enter a valid account number').optional(),
    ifscCode: z.string().trim().toUpperCase().transform((v) => v || undefined).refine((v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), 'Enter a valid IFSC code').optional(),
    upiId: text(100),
  });
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting, isDirty } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      accountHolderName: payout.accountHolderName ?? '',
      bankName: payout.bankName ?? '',
      accountNumber: payout.accountNumber ?? '',
      ifscCode: payout.ifscCode ?? '',
      upiId: payout.upiId ?? '',
    },
  });
  const submit = useSubmit(
    (name, err) => setError(name.replace(/^organizer\.payoutDetails\./, ''), err),
    async (payoutDetails) => {
      const { user: updated } = await authApi.updateProfile({ organizer: { payoutDetails } });
      onSaved(updated);
      reset(undefined, { keepValues: true });
    },
    'Payout details saved'
  );

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <CardBody className="grid gap-4 sm:grid-cols-2">
        <Field label="Account holder name" error={errors.accountHolderName?.message}>
          {({ id }) => <Input id={id} error={errors.accountHolderName} {...register('accountHolderName')} />}
        </Field>
        <Field label="Bank name" error={errors.bankName?.message}>
          {({ id }) => <Input id={id} error={errors.bankName} {...register('bankName')} />}
        </Field>
        <Field label="Account number" error={errors.accountNumber?.message}>
          {({ id }) => <Input id={id} inputMode="numeric" error={errors.accountNumber} {...register('accountNumber')} />}
        </Field>
        <Field label="IFSC code" error={errors.ifscCode?.message}>
          {({ id }) => <Input id={id} className="uppercase" error={errors.ifscCode} {...register('ifscCode')} />}
        </Field>
        <Field label="UPI ID" hint="Optional, e.g. name@okbank" error={errors.upiId?.message} className="sm:col-span-2">
          {({ id }) => <Input id={id} error={errors.upiId} {...register('upiId')} />}
        </Field>
      </CardBody>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
          Save payout details
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { clearSession } = useAuth();
  const navigate = useNavigate();
  const schema = z
    .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordSchema, confirmPassword: z.string() })
    .refine((v) => v.newPassword === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const submit = async ({ currentPassword, newPassword }) => {
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      toast.success('Password changed. Please log in again.');
      clearSession();
      navigate('/login', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, setError)) setError('currentPassword', { message: getErrorMessage(error) });
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} noValidate>
      <CardBody className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" error={errors.currentPassword?.message}>
          {({ id }) => <PasswordInput id={id} autoComplete="current-password" error={errors.currentPassword} {...register('currentPassword')} />}
        </Field>
        <Field label="New password" error={errors.newPassword?.message}>
          {({ id }) => <PasswordInput id={id} autoComplete="new-password" error={errors.newPassword} {...register('newPassword')} />}
        </Field>
        <Field label="Confirm new password" error={errors.confirmPassword?.message}>
          {({ id }) => <PasswordInput id={id} autoComplete="new-password" error={errors.confirmPassword} {...register('confirmPassword')} />}
        </Field>
      </CardBody>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6">
        <Button type="submit" loading={isSubmitting}>
          Change password
        </Button>
      </div>
    </form>
  );
}

export default function AccountPage() {
  useDocumentTitle('Account settings');
  const { user, setUser, clearSession } = useAuth();
  const navigate = useNavigate();
  const isOrganizer = user.role === 'organizer';

  const logoutEverywhere = async () => {
    try {
      await authApi.logoutAll();
    } finally {
      clearSession();
      toast.success('Logged out from all devices');
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="container-page max-w-4xl py-8 sm:py-10">
      <PageHeader
        title="Account settings"
        description={`Member since ${formatDate(user.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Badge tone="brand">{titleCase(user.role)}</Badge>
            <Badge tone={STATUS_TONE[user.status]}>{titleCase(user.status)}</Badge>
          </div>
        }
      />

      <div className="space-y-6">
        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><UserRound className="h-4 w-4 text-brand-600" />Profile</span>} description="Your name and contact details" />
          <ProfileForm user={user} onSaved={setUser} />
        </Card>

        {isOrganizer && (
          <>
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Store className="h-4 w-4 text-brand-600" />Organization</span>} description="Shown to attendees on your events and on invoices" />
              <OrganizationForm user={user} onSaved={setUser} />
            </Card>
            <Card>
              <CardHeader title={<span className="flex items-center gap-2"><Landmark className="h-4 w-4 text-brand-600" />Payout details</span>} description="Where we send your ticket earnings after each event" />
              <PayoutForm user={user} onSaved={setUser} />
            </Card>
          </>
        )}

        <Card>
          <CardHeader title={<span className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-brand-600" />Password</span>} description="Changing it signs you out on every device" />
          <PasswordForm />
        </Card>

        <Card>
          <CardHeader
            title={<span className="flex items-center gap-2"><LogOut className="h-4 w-4 text-brand-600" />Sessions</span>}
            description="Lost a device? Sign out everywhere."
            action={<Button variant="secondary" onClick={logoutEverywhere}>Log out of all devices</Button>}
          />
        </Card>
      </div>
    </div>
  );
}
