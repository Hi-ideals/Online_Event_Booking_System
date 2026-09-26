import { Eye, EyeOff } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import cn from '../../lib/cn';

const controlBase =
  'block w-full rounded-lg border-0 bg-white px-3 text-sm text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

const ringFor = (error) => (error ? 'ring-rose-300 focus:ring-rose-500' : 'ring-slate-300 focus:ring-brand-600');

/** Label + control + hint/error. Pass the control as children; `id` is wired automatically. */
export function Field({ label, error, hint, required, className, children, id: idProp }) {
  const generated = useId();
  const id = idProp ?? generated;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-rose-500">*</span>}
        </label>
      )}
      {typeof children === 'function' ? children({ id, invalid: Boolean(error) }) : children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, error, ...props }, ref) {
  return <input ref={ref} className={cn(controlBase, 'h-10', ringFor(error), className)} aria-invalid={error ? 'true' : undefined} {...props} />;
});

export const PasswordInput = forwardRef(function PasswordInput({ className, error, ...props }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn(controlBase, 'h-10 pr-10', ringFor(error), className)}
        aria-invalid={error ? 'true' : undefined}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export const Textarea = forwardRef(function Textarea({ className, error, rows = 4, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(controlBase, 'py-2', ringFor(error), className)} aria-invalid={error ? 'true' : undefined} {...props} />;
});

export const Select = forwardRef(function Select({ className, error, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(controlBase, 'h-10 pr-8', ringFor(error), className)} aria-invalid={error ? 'true' : undefined} {...props}>
      {children}
    </select>
  );
});

export const Checkbox = forwardRef(function Checkbox({ label, description, className, ...props }, ref) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-3', className)}>
      <input ref={ref} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600" {...props} />
      <span className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-slate-500">{description}</span>}
      </span>
    </label>
  );
});
