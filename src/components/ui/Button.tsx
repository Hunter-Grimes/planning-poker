import { ButtonHTMLAttributes } from 'react';
import { cn } from '../../cn';
import {
  BUTTON_SIZES,
  BUTTON_VARIANTS,
  ButtonSize,
  ButtonVariant,
  PILL_BASE,
  PILL_VARIANTS,
  PillVariant,
} from './tokens';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// Solid action button. Layout (w-full, flex-1, …) is supplied via className.
export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'font-semibold transition-colors',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PillVariant;
}

// Compact rounded chip used for room-header actions (copy code, theme, leave…).
export function PillButton({
  variant = 'neutral',
  type = 'button',
  className,
  ...props
}: PillButtonProps) {
  return (
    <button type={type} className={cn(PILL_BASE, PILL_VARIANTS[variant], className)} {...props} />
  );
}
