import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60 select-none";
const variants: Record<Variant, string> = {
  primary: "bg-green text-white hover:bg-green-strong active:bg-green-strong",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink-soft hover:bg-sunk",
  ghost: "text-ink-soft hover:bg-sunk hover:text-ink",
  danger: "border border-red/30 bg-surface text-red hover:bg-red-tint",
};
const sizes: Record<Size, string> = {
  sm: "min-h-9 px-3 text-sm",
  md: "min-h-11 px-4 text-[15px]",
  lg: "min-h-13 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  "href" | "className"
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}
