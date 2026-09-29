import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-sm font-medium leading-5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-base)] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    variants: {
      variant: {
        default: 'bg-[var(--action-bg)] text-[var(--on-accent)] hover:bg-[var(--action-hover)] active:bg-[var(--action-hover)]',
        destructive: 'border border-[var(--danger)]/25 bg-[var(--danger-soft)] text-[var(--danger)] hover:border-[var(--danger)] active:bg-[var(--danger-soft)]',
        outline: 'border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] hover:border-[var(--accent-edge)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent-ink)] active:bg-[var(--bg-active)]',
        ghost: 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-ink)] active:bg-[var(--bg-active)]',
        link: 'underline-offset-4 hover:underline text-[var(--accent-ink)]',
      },
      size: {
        default: 'min-h-11 px-5 py-2.5 text-sm',
        sm: 'min-h-11 px-3.5 py-2 text-xs md:min-h-9',
        lg: 'min-h-12 px-7 py-3 text-base',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
