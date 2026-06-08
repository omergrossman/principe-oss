// SPDX-License-Identifier: AGPL-3.0-or-later
import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  variant?: "elevated" | "subtle";
}

export function Card({
  children,
  variant = "elevated",
  className = "",
  ...rest
}: CardProps) {
  const bg = variant === "elevated" ? "bg-elevated" : "bg-subtle";
  const shadow = variant === "elevated" ? "shadow-sm" : "";
  return (
    <div
      className={`${bg} ${shadow} rounded-lg p-6 border border-ink-100/60 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function CardHeader({ title, description, action }: CardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
        {description && (
          <p className="text-sm text-ink-500 mt-1">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
