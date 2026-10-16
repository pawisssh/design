import * as React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline';
  size?: 'default' | 'sm';
  asChild?: boolean;
};

export function Button({ variant = 'default', size = 'default', asChild = false, className, children, ...props }: ButtonProps) {
  const classes = ['button', `button-${variant}`, `button-${size}`, className].filter(Boolean).join(' ');
  if (asChild && React.isValidElement<{ className?: string }>(children)) {
    return React.cloneElement(children, { ...props, className: classes });
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
