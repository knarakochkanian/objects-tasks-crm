import { useId, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import './construction-scene.css';

gsap.registerPlugin(useGSAP);

type Point = readonly [number, number, number];

// A shared isometric projection keeps facades, floor lines and crane aligned.
function project([x, y, z]: Point) {
  return [230 + (x - y) * 0.88, 200 + (x + y) * 0.44 - z];
}
function points(...vertices: Point[]) {
  return vertices.map((point) => project(point).join(',')).join(' ');
}
function edge(from: Point, to: Point) {
  return `M${project(from).join(',')}L${project(to).join(',')}`;
}

function Building({
  x,
  y,
  width,
  depth,
  height,
  floors,
  accent = false,
}: {
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  floors: number;
  accent?: boolean;
}) {
  const floorHeight = height / floors;
  return (
    <g className="construction-scene__building">
      <polygon
        points={points(
          [x, y + depth, 0],
          [x + width, y + depth, 0],
          [x + width, y + depth, height],
          [x, y + depth, height],
        )}
        fill="#d4e0e8"
      />
      <polygon
        points={points(
          [x + width, y, 0],
          [x + width, y + depth, 0],
          [x + width, y + depth, height],
          [x + width, y, height],
        )}
        fill="#7893a8"
      />
      <polygon
        points={points(
          [x, y, height],
          [x + width, y, height],
          [x + width, y + depth, height],
          [x, y + depth, height],
        )}
        fill="#f0f5f8"
      />
      <polygon
        points={points(
          [x + 5, y + 5, height + 0.5],
          [x + width - 5, y + 5, height + 0.5],
          [x + width - 5, y + depth - 5, height + 0.5],
          [x + 5, y + depth - 5, height + 0.5],
        )}
        fill="#b6c9d6"
        stroke="#dce8ef"
        strokeWidth="1"
      />
      {Array.from({ length: floors }, (_, floor) => {
        const bottom = floor * floorHeight + 4;
        const top = (floor + 1) * floorHeight - 5;
        return (
          <g key={floor}>
            {[0, 1, 2].map((column) => {
              const left = x + 5 + column * ((width - 10) / 3);
              const right = left + (width - 10) / 3 - 3;
              const back = y + 5 + column * ((depth - 10) / 3);
              const front = back + (depth - 10) / 3 - 3;
              return (
                <g key={column}>
                  <polygon
                    points={points(
                      [left, y + depth + 0.1, bottom],
                      [right, y + depth + 0.1, bottom],
                      [right, y + depth + 0.1, top],
                      [left, y + depth + 0.1, top],
                    )}
                    fill="#668398"
                  />
                  <polygon
                    points={points(
                      [x + width + 0.1, back, bottom],
                      [x + width + 0.1, front, bottom],
                      [x + width + 0.1, front, top],
                      [x + width + 0.1, back, top],
                    )}
                    fill="#405e74"
                  />
                </g>
              );
            })}
            {floor > 0 && (
              <path
                d={`${edge([x, y + depth + 0.2, floor * floorHeight], [x + width, y + depth + 0.2, floor * floorHeight])}${edge([x + width + 0.2, y, floor * floorHeight], [x + width + 0.2, y + depth, floor * floorHeight])}`}
                fill="none"
                stroke="#edf3f7"
                strokeWidth="1.2"
              />
            )}
          </g>
        );
      })}
      {accent && (
        <>
          <polygon
            points={points(
              [x, y + depth + 0.3, height - 5],
              [x + width, y + depth + 0.3, height - 5],
              [x + width, y + depth + 0.3, height - 1],
              [x, y + depth + 0.3, height - 1],
            )}
            fill="#ef925b"
          />
          <polygon
            points={points(
              [x + width + 0.3, y, height - 5],
              [x + width + 0.3, y + depth, height - 5],
              [x + width + 0.3, y + depth, height - 1],
              [x + width + 0.3, y, height - 1],
            )}
            fill="#cb692f"
          />
        </>
      )}
    </g>
  );
}

export function ConstructionScene() {
  const container = useRef<HTMLDivElement>(null);
  const shadowId = `site-shadow-${useId().replace(/:/g, '')}`;

  useGSAP(
    () => {
      const scene = container.current;
      if (!scene) return;
      const media = gsap.matchMedia();
      media.add(
        '(prefers-reduced-motion: no-preference)',
        () => {
          gsap.from(scene.querySelector('.construction-scene__ground'), {
            opacity: 0,
            duration: 0.65,
            ease: 'power2.out',
          });
          gsap.from(scene.querySelectorAll('.construction-scene__building'), {
            y: 20,
            opacity: 0,
            duration: 0.95,
            stagger: 0.13,
            delay: 0.1,
            ease: 'power3.out',
          });
          gsap.from(scene.querySelector('.construction-scene__crane'), {
            y: -10,
            opacity: 0,
            duration: 1,
            delay: 0.3,
            ease: 'power3.out',
          });
        },
        scene,
      );
      media.add(
        '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
        () => {
          const view = scene.querySelector('.construction-scene__view');
          gsap.set(view, { transformPerspective: 900, transformOrigin: '50% 60%' });
          const rotateX = gsap.quickTo(view, 'rotationX', { duration: 0.65, ease: 'power3.out' });
          const rotateY = gsap.quickTo(view, 'rotationY', { duration: 0.65, ease: 'power3.out' });
          let bounds: DOMRect;
          const enter = () => {
            bounds = scene.getBoundingClientRect();
          };
          const move = (event: PointerEvent) => {
            if (!bounds) return;
            const x = gsap.utils.clamp(
              -1,
              1,
              ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
            );
            const y = gsap.utils.clamp(
              -1,
              1,
              ((event.clientY - bounds.top) / bounds.height) * 2 - 1,
            );
            rotateX(-y * 2);
            rotateY(x * 3);
          };
          const leave = () => {
            rotateX(0);
            rotateY(0);
          };
          scene.addEventListener('pointerenter', enter);
          scene.addEventListener('pointermove', move);
          scene.addEventListener('pointerleave', leave);
          return () => {
            scene.removeEventListener('pointerenter', enter);
            scene.removeEventListener('pointermove', move);
            scene.removeEventListener('pointerleave', leave);
          };
        },
        scene,
      );
      return () => media.revert();
    },
    { scope: container },
  );

  return (
    <div className="construction-scene" ref={container} aria-hidden="true">
      <div className="construction-scene__view">
        <svg viewBox="0 0 460 300" fill="none" focusable="false">
          <defs>
            <radialGradient id={shadowId}>
              <stop stopColor="#0a1521" stopOpacity="0.6" />
              <stop offset="1" stopColor="#0a1521" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="233" cy="234" rx="185" ry="62" fill={`url(#${shadowId})`} />
          <g className="construction-scene__ground">
            <polygon
              points={points([-105, 75, -7], [100, 75, -7], [100, 75, 0], [-105, 75, 0])}
              fill="#354d62"
            />
            <polygon
              points={points([100, -80, -7], [100, 75, -7], [100, 75, 0], [100, -80, 0])}
              fill="#273d51"
            />
            <polygon
              points={points([-105, -80, 0], [100, -80, 0], [100, 75, 0], [-105, 75, 0])}
              fill="#415c72"
              stroke="#6e889d"
              strokeWidth="0.7"
            />
            {[-80, -40, 0, 40, 80].map((position) => (
              <path
                key={`x${position}`}
                d={edge([position, -80, 0.3], [position, 75, 0.3])}
                stroke="#96acbc"
                strokeOpacity="0.18"
                strokeWidth="0.6"
              />
            ))}
            {[-60, -20, 20, 60].map((position) => (
              <path
                key={`y${position}`}
                d={edge([-105, position, 0.3], [100, position, 0.3])}
                stroke="#96acbc"
                strokeOpacity="0.18"
                strokeWidth="0.6"
              />
            ))}
            <path
              d={`${edge([-90, 59, 0.5], [82, 59, 0.5])}${edge([82, 59, 0.5], [82, -65, 0.5])}`}
              stroke="#d2dfe8"
              strokeWidth="2"
              strokeOpacity="0.35"
            />
            <path
              d={edge([-90, 66, 0.5], [82, 66, 0.5])}
              stroke="#b9c9d6"
              strokeOpacity="0.45"
              strokeWidth="0.8"
              strokeDasharray="4 5"
            />
          </g>
          <g className="construction-scene__crane" strokeLinecap="round" strokeLinejoin="round">
            <path
              d={`${edge([-5, -68, 0], [-5, -68, 115])}${edge([1, -68, 0], [1, -68, 115])}`}
              stroke="#e89258"
              strokeWidth="2.1"
            />
            {[0, 20, 40, 60, 80, 100].map((z) => (
              <path
                key={z}
                d={`${edge([-5, -68, z], [1, -68, z + 15])}${edge([1, -68, z], [-5, -68, z + 15])}`}
                stroke="#cf7b47"
                strokeWidth="0.8"
              />
            ))}
            <path
              d={`${edge([-78, -68, 115], [67, -68, 115])}${edge([-78, -68, 120], [67, -68, 120])}`}
              stroke="#eeaa76"
              strokeWidth="2"
            />
            {[-75, -55, -35, -15, 5, 25, 45].map((x) => (
              <path
                key={x}
                d={`${edge([x, -68, 115], [x + 10, -68, 120])}${edge([x + 10, -68, 120], [x + 20, -68, 115])}`}
                stroke="#c9804f"
                strokeWidth="0.7"
              />
            ))}
            <path
              d={`${edge([-5, -68, 115], [-5, -68, 139])}${edge([-5, -68, 139], [-67, -68, 120])}${edge([-5, -68, 139], [58, -68, 120])}`}
              stroke="#9aafbf"
              strokeWidth="0.85"
            />
            <path d={edge([47, -68, 115], [47, -68, 48])} stroke="#cbd8e2" strokeWidth="0.7" />
            <path
              d={`${edge([43, -68, 47], [47, -68, 43])}${edge([47, -68, 43], [51, -68, 47])}`}
              stroke="#ed965b"
              strokeWidth="2"
            />
            <polygon
              points={points([-73, -72, 108], [-57, -72, 108], [-57, -72, 118], [-73, -72, 118])}
              fill="#6a8296"
            />
          </g>
          <Building x={44} y={-35} width={33} depth={42} height={67} floors={4} />
          <Building x={-23} y={-28} width={46} depth={42} height={106} floors={6} accent />
          <Building x={-82} y={-7} width={37} depth={38} height={54} floors={3} />
          <g className="construction-scene__details">
            <polygon
              points={points([22, 27, 0.7], [55, 27, 0.7], [55, 44, 0.7], [22, 44, 0.7])}
              fill="#263e51"
              stroke="#7f98ab"
              strokeWidth="0.6"
            />
            {[28, 39, 50].map((x) => (
              <path key={x} d={edge([x, 29, 1], [x, 42, 1])} stroke="#92a6b5" strokeWidth="0.6" />
            ))}
            <path
              d={edge([-95, 44, 1], [-62, 44, 1])}
              stroke="#ee9458"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
            <polygon
              points={points([-40, 28, 1], [-24, 28, 1], [-24, 42, 1], [-40, 42, 1])}
              fill="#acbfcf"
            />
            <polygon
              points={points([-40, 28, 5], [-24, 28, 5], [-24, 42, 5], [-40, 42, 5])}
              fill="#d1dce5"
            />
          </g>
        </svg>
      </div>
    </div>
  );
}
