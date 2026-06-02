// Join conditional class names into one string, dropping falsy entries. Keeps
// the long, branchy Tailwind class lists in JSX readable and consistent — use
// this instead of `[...].join(' ')` or template-string concatenation.
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
