import Link from "next/link";
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
} from "react";

type Variant = "primary" | "secondary" | "destructive" | "text";
type Size = "sm" | "md" | "lg";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  className?: string;
}

type ButtonAsButton = CommonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string };

type ButtonProps = ButtonAsButton | ButtonAsLink;

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-flare-600 text-white shadow-sm hover:bg-flare-500 active:bg-flare-600 disabled:bg-ink-100 disabled:text-ink-300 disabled:shadow-none",
  secondary:
    "bg-elevated text-ink-700 border border-ink-100 hover:border-ink-300 hover:bg-subtle active:bg-subtle disabled:text-ink-300 disabled:border-ink-100",
  destructive:
    "bg-verdict-fail text-white shadow-sm hover:opacity-90 active:opacity-100 disabled:bg-ink-100 disabled:text-ink-300 disabled:shadow-none",
  text: "text-ink-700 hover:text-ink-900 underline-offset-4 hover:underline disabled:text-ink-300 disabled:no-underline",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-[15px]",
  lg: "h-12 px-6 text-[17px]",
};

function classesFor(variant: Variant, size: Size, extra: string) {
  return `inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed no-underline ${variantClasses[variant]} ${sizeClasses[size]} ${extra}`;
}

export const Button = forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  ButtonProps
>(function Button(props, ref) {
  const { variant = "primary", size = "md", className = "" } = props;
  const cls = classesFor(variant, size, className);

  if ("href" in props && props.href !== undefined) {
    const { href, variant: _v, size: _s, className: _c, ...rest } = props;
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={cls}
        {...rest}
      />
    );
  }

  const { variant: _v, size: _s, className: _c, ...rest } = props;
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      className={cls}
      {...rest}
    />
  );
});
