"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { projectGlass, type GlassShape } from "./glass-geometry";
import { glassPose, glassProgress } from "./glass-motion";
import "./landing-motion.css";

/** Direct native-scroll choreography, with a separate slow clock for 3D rotation. */
export function LandingMotion({ children, className, id }: { children: ReactNode; className: string; id: string }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sections = Array.from(element.querySelectorAll<HTMLElement>("main > section"));
    const scenes = new Map(sections.map((section, variant) => [section, {
      variant, top: 0, width: 0, height: 0, seconds: 0, closing: section.matches('.studio-closing'),
      sculptures: Array.from(section.querySelectorAll<SVGSVGElement>("[data-glass-shape]")).map(svg => ({
        orbit: svg.closest<HTMLElement>(".glass-orbit")!,
        mesh: svg.querySelector<SVGGElement>("[data-glass-mesh]")!,
        shape: svg.dataset.glassShape as GlassShape,
        reverse: svg.dataset.glassReverse === "true",
        unit: 0,
        faces: new Map(Array.from(svg.querySelectorAll<SVGPathElement>("[data-glass-face]")).map(face => [face.dataset.glassFace!, face])),
        order: "",
      })),
    }]));
    let frame = 0, lastTime = 0;
    let needsMeasure = true;
    let targetScroll = window.scrollY;
    const entrances = Array.from(element.querySelectorAll<HTMLElement>("main h1, main h2, main a.ui-button, .studio-intro, .hero-description"));
    entrances.forEach(target => {
      if (target.matches("a")) target.dataset.motionAction = "true";
      if (target.matches("p")) target.dataset.motionCopy = "true";
    });
    const entranceObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        // Observe once: animated geometry must never retrigger its own entrance
        // when it crosses an intersection threshold at the viewport edge.
        (entry.target as HTMLElement).dataset.motionEntered = "true";
        entranceObserver.unobserve(entry.target);
      });
    }, { threshold: .2, rootMargin: "-32px 0px -48px" });
    entrances.forEach(target => entranceObserver.observe(target));

    const project = (section: HTMLElement, progress?: number) => {
      const scene = scenes.get(section)!;
      scene.sculptures.forEach((sculpture, index) => {
        const pose = progress === undefined ? undefined : glassPose(progress, index, scene.variant, scene.seconds);
        const faces = projectGlass(sculpture.shape, sculpture.reverse, pose);
        if (pose) {
          let x = pose.x * scene.width;
          if (scene.closing) {
            const scale = sculpture.unit / 100;
            const left = Math.min(...faces.map(face=>face.left)) * scale;
            const right = Math.max(...faces.map(face=>face.right)) * scale;
            const center = Math.max(8-left, Math.min(scene.width-8-right, x+sculpture.unit/2));
            x = center - sculpture.unit/2;
          }
          sculpture.orbit.style.setProperty("--glass-x", `${x.toFixed(3)}px`);
        } else {
          sculpture.orbit.style.removeProperty("--glass-x");
        }
        const order = faces.map(face => face.id).join(',');
        faces.forEach(face => {
          const node = sculpture.faces.get(face.id)!;
          node.setAttribute("d", face.path);
          node.setAttribute("opacity", String(face.opacity));
          if (order !== sculpture.order) sculpture.mesh.appendChild(node);
        });
        sculpture.order = order;
      });
    };

    const update = (time: number) => {
      frame = 0;
      // A media change may arrive between the scheduled frame and its change
      // event. Settle the scene immediately instead of leaving a partial pose.
      if (preference.matches || document.hidden) { sync(); return; }
      const viewport = window.innerHeight;
      const small = window.innerWidth < 760;
      const elapsed = lastTime ? Math.min((time - lastTime) / 1000, .05) : 1 / 60;
      lastTime = time;
      if (needsMeasure) {
        // Prime all section geometry before it enters view. Reads are cached
        // until resize and batched before any styles or SVG paths are written.
        sections.forEach(section => {
          const bounds = section.getBoundingClientRect(), scene = scenes.get(section)!;
          scene.top = bounds.top + window.scrollY; scene.width = bounds.width; scene.height = bounds.height;
          scene.sculptures.forEach(sculpture => { sculpture.unit = sculpture.orbit.clientWidth; });
        });
        needsMeasure = false;
      }
      let spinning = false;
      sections.forEach(section => {
        const scene = scenes.get(section)!;
        const top = scene.top - targetScroll;
        const inView = top < viewport && top + scene.height > 0;
        section.dataset.motionActive = String(inView);
        // Set the next scene's scroll pose before its artwork reaches the screen.
        if (top > viewport + 240 || top + scene.height < -240) return;
        if (inView) scene.seconds += elapsed;
        spinning ||= inView && scene.sculptures.length > 0;
        const drift = Math.max(-1, Math.min(1, (viewport / 2 - top - scene.height / 2) / ((viewport + scene.height) / 2)));
        const progress = glassProgress(targetScroll, scene.top, scene.height, scene.width, viewport, section.matches(".studio-hero"));
        section.style.setProperty("--scroll-drift", `${(drift * (small ? 12 : 20)).toFixed(3)}px`);
        section.style.setProperty("--scroll-turn", `${(drift * 30).toFixed(3)}deg`);
        // Type stays neutral in the reading zone. Its small departure follows
        // the actual section position, with no delayed catch-up.
        const focus = (viewport / 2 - (scene.top - targetScroll + Math.min(scene.height, viewport) / 2)) / viewport;
        const departure = Math.sign(focus) * Math.min(1, Math.max(0, Math.abs(focus) - .18) / .65);
        section.style.setProperty("--type-departure", departure.toFixed(4));
        section.style.setProperty("--type-depth", Math.abs(departure).toFixed(4));
        project(section, progress);
      });
      element.dataset.motionSettled = "true";
      if (spinning) frame = requestAnimationFrame(update);
      else lastTime = 0;
    };
    const schedule = () => {
      if (!frame && !preference.matches && !document.hidden) frame = requestAnimationFrame(update);
    };
    const scroll = () => {
      targetScroll = window.scrollY;
      schedule();
    };
    const measure = () => { needsMeasure = true; scroll(); };
    const sync = () => {
      element.dataset.scrollMotion = preference.matches ? "off" : "on";
      element.dataset.motionHidden = String(document.hidden);
      sections.forEach(section => {
        if (document.hidden || preference.matches) section.dataset.motionActive = "false";
        if (preference.matches) {
          ["--scroll-drift", "--scroll-turn", "--type-departure", "--type-depth"].forEach(name => section.style.removeProperty(name));
          project(section);
        }
      });
      if (document.hidden || preference.matches) {
        cancelAnimationFrame(frame); frame = 0; lastTime = 0;
        element.dataset.motionSettled = "true";
      } else measure();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    sync();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", sync);

    return () => {
      cancelAnimationFrame(frame);
      entranceObserver.disconnect(); resize.disconnect();
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", sync);
      preference.removeEventListener("change", sync);
    };
  }, []);

  return <div ref={root} className={`landing-motion ${className}`} id={id}>{children}</div>;
}
