/** Human-readable message from an API/axios error. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.code === 'ERR_NETWORK') return 'Cannot reach the server. Check your connection.';
  return error.message || fallback;
}

/**
 * Copies server validation errors ("body.organizer.organizationName") onto react-hook-form fields.
 * Returns true if at least one field error was applied.
 */
export function applyServerErrors(error, setError) {
  const errors = error.response?.data?.errors;
  if (!Array.isArray(errors)) return false;
  let applied = false;
  for (const { field, message } of errors) {
    const name = field.replace(/^(body|query|params)\./, '');
    if (name) {
      setError(name, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
