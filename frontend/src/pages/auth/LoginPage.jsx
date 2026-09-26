import { zodResolver } from '@hookform/resolvers/zod';
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
import { getErrorMessage } from '../../lib/errors';
import { emailSchema } from '../../lib/validation';

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [formError, setFormError] = useState(null);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (values) => {
    setFormError(null);
    try {
      const user = await login(values);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(redirectAfterLogin(user, params.get('redirect')), { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Welcome back</h1>
      <p className="mt-2 text-sm text-slate-500">
        New here?{' '}
        <Link to={`/register${params.get('redirect') ? `?redirect=${encodeURIComponent(params.get('redirect'))}` : ''}`} className="font-semibold text-brand-600 hover:text-brand-700">
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <Field label="Email" error={errors.email?.message}>
          {({ id }) => <Input id={id} type="email" autoComplete="email" placeholder="you@example.com" error={errors.email} {...register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {({ id }) => <PasswordInput id={id} autoComplete="current-password" placeholder="Your password" error={errors.password} {...register('password')} />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Log in
        </Button>
      </form>
    </div>
  );
}
