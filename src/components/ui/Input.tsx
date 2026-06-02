import { InputHTMLAttributes, Ref } from 'react';
import { cn } from '../../cn';
import { INPUT_VARIANTS, InputVariant } from './tokens';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  inputRef?: Ref<HTMLInputElement>;
}

// Text input. `inputRef` exposes the underlying element (the backlog "add"
// field focuses itself after submitting).
export function Input({ variant = 'default', inputRef, className, ...props }: InputProps) {
  return <input ref={inputRef} className={cn(INPUT_VARIANTS[variant], className)} {...props} />;
}
