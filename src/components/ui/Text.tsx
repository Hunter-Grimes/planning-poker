import { HTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { HEADING_BASE, HEADING_TONES, HeadingTone } from './tokens';

interface SectionHeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  tone?: HeadingTone;
  as?: 'h2' | 'h3';
}

// Uppercase section label (e.g. "Players", "Results", "Waiting to join").
export function SectionHeading({
  tone = 'default',
  as: Tag = 'h2',
  className,
  ...props
}: SectionHeadingProps) {
  return <Tag className={cn(HEADING_BASE, HEADING_TONES[tone], 'mb-3', className)} {...props} />;
}

// Label sitting above a form field.
export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1', className)}
      {...props}
    />
  );
}

// Static rounded chip (e.g. a player's revealed vote in the results list).
export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white text-sm px-3 py-1 rounded-full',
        className,
      )}
      {...props}
    />
  );
}
