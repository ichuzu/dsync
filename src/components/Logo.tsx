import { useState, type ReactNode } from "react";
import { resolveLogo } from "@/lib/logos";
import { cn } from "@/lib/utils";

interface LogoProps {
  /** Key into the logo registry (see src/lib/logos.ts). */
  name: string;
  alt?: string;
  className?: string;
  /** Rendered when the key is unknown or the image fails to load. */
  fallback?: ReactNode;
}

/**
 * Renders a registered logo image by key, falling back to a letter mark when
 * the file is missing — so an unconfigured or broken logo never breaks layout.
 */
export const Logo = ({ name, alt, className, fallback }: LogoProps) => {
  const src = resolveLogo(name);
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <>
        {fallback ?? (
          <span className={cn("inline-flex items-center justify-center font-bold", className)}>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? `${name} logo`}
      className={className}
      onError={() => setFailed(true)}
      loading="lazy"
    />
  );
};
