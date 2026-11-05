/**
 * `next/link` for the offline edition: an ordinary anchor into the hash router, so every page
 * and the shell keep their `<Link href="/sjekk">` exactly as written.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import { hrefFor } from '../navigation';

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  children: ReactNode;
};

export default function Link({ href, children, ...rest }: Props) {
  return (
    <a href={hrefFor(href)} {...rest}>
      {children}
    </a>
  );
}
