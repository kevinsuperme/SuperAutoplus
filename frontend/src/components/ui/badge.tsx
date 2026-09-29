import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium leading-4 [overflow-wrap:anywhere]',
  {
    variants: {
      variant: {
        default: 'border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent-ink)]',
        success: 'border-[var(--success)]/20 bg-[var(--success-soft)] text-[var(--success)]',
        warning: 'border-[var(--warning)]/20 bg-[var(--warning-soft)] text-[var(--warning)]',
        danger: 'border-[var(--danger)]/20 bg-[var(--danger-soft)] text-[var(--danger)]',
        secondary: 'border-[var(--border-soft)] bg-[var(--chip-bg)] text-[var(--text-secondary)]',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
