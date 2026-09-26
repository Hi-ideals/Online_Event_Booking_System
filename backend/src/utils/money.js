// Money is calculated in paise (integers) to avoid floating-point rounding errors.
export const toPaise = (rupees) => Math.round(Number(rupees) * 100);
export const toRupees = (paise) => paise / 100;

/** Percentage of an amount in rupees, rounded to the nearest paisa. */
export const percentOf = (rupees, percent) => toRupees(Math.round((toPaise(rupees) * Number(percent)) / 100));

export const formatInr = (rupees) =>
  `INR ${Number(rupees).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
