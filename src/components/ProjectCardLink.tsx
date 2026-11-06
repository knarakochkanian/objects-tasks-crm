import { useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

/** A normal accessible link with a small, pointer-only sense of depth. */
export function ProjectCardLink({ to, children }: { to: string; children: ReactNode }) {
  const card = useRef<HTMLAnchorElement>(null);

  useGSAP(
    () => {
      const element = card.current;
      if (!element) return;
      const media = gsap.matchMedia();
      media.add(
        '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
        () => {
          gsap.set(element, { transformPerspective: 1000 });
          const rotateX = gsap.quickTo(element, 'rotationX', {
            duration: 0.35,
            ease: 'power2.out',
          });
          const rotateY = gsap.quickTo(element, 'rotationY', {
            duration: 0.35,
            ease: 'power2.out',
          });
          const lift = gsap.quickTo(element, 'y', { duration: 0.25, ease: 'power2.out' });
          let bounds: DOMRect | null = null;
          const move = (event: PointerEvent) => {
            if (!bounds) return;
            const x = gsap.utils.clamp(
              -0.5,
              0.5,
              (event.clientX - bounds.left) / bounds.width - 0.5,
            );
            const y = gsap.utils.clamp(
              -0.5,
              0.5,
              (event.clientY - bounds.top) / bounds.height - 0.5,
            );
            rotateX(-y * 3);
            rotateY(x * 3);
          };
          const enter = (event: PointerEvent) => {
            bounds = element.getBoundingClientRect();
            lift(-3);
            move(event);
          };
          const reset = () => {
            bounds = null;
            rotateX(0);
            rotateY(0);
            lift(0);
          };
          element.addEventListener('pointerenter', enter);
          element.addEventListener('pointermove', move);
          element.addEventListener('pointerleave', reset);
          element.addEventListener('pointercancel', reset);
          window.addEventListener('blur', reset);
          return () => {
            element.removeEventListener('pointerenter', enter);
            element.removeEventListener('pointermove', move);
            element.removeEventListener('pointerleave', reset);
            element.removeEventListener('pointercancel', reset);
            window.removeEventListener('blur', reset);
          };
        },
      );
      return () => media.revert();
    },
    { scope: card },
  );

  return (
    <Link ref={card} className="project-card" to={to}>
      {children}
    </Link>
  );
}
