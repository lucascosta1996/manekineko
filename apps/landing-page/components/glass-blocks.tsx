import { useId } from "react";
import { projectGlass } from "./glass-geometry";
import "./glass-blocks.css";

const compositions = {
  origin: ["portal", "ethereum", "stack"],
  rules: ["cross", "monolith"],
  rewards: ["steps", "ethereum"],
  possibilities: ["link", "cross"],
  join: ["stack", "portal"],
  unfold: ["arch", "ethereum"],
} as const;

export function GlassBlocks({ variant }: { variant: keyof typeof compositions }) {
  const id = useId().replace(/:/g, "");
  return <div className={`glass-field glass-field-${variant}`} aria-hidden="true" data-glass-variant={variant}>
    {compositions[variant].map((shape,index)=>{
      const gradient=`${id}-${index}`;
      return <div className={`glass-orbit glass-orbit-${index+1}`} key={index}>
        <div className="glass-float">
          <svg className="glass-sculpture" data-glass-shape={shape} data-glass-reverse={index===1} viewBox="-240 -240 480 480" focusable="false">
            <defs>
              <linearGradient id={gradient} x1="0" y1="0" x2="1" y2=".9" gradientUnits="objectBoundingBox">
                <stop stopColor="#ffffff" stopOpacity=".16" />
                <stop offset=".2" stopColor="#a5b1bc" stopOpacity=".08" />
                <stop offset=".43" stopColor="#ffffff" stopOpacity=".24" />
                <stop offset=".49" stopColor="#64727f" stopOpacity=".18" />
                <stop offset=".56" stopColor="#ffffff" stopOpacity=".03" />
                <stop offset=".84" stopColor="#4d5c69" stopOpacity=".22" />
                <stop offset="1" stopColor="#ffffff" stopOpacity=".32" />
              </linearGradient>
              <linearGradient id={`${gradient}-edge`} x1="0" y1="0" x2=".8" y2="1">
                <stop stopColor="#ffffff" stopOpacity=".95" />
                <stop offset=".22" stopColor="#aab5bd" stopOpacity=".55" />
                <stop offset=".46" stopColor="#354451" stopOpacity=".7" />
                <stop offset=".52" stopColor="#f7fafc" stopOpacity=".9" />
                <stop offset=".79" stopColor="#8f9ca7" stopOpacity=".4" />
                <stop offset="1" stopColor="#ffffff" stopOpacity=".85" />
              </linearGradient>
            </defs>
            <g data-glass-mesh>
              {projectGlass(shape,index===1).map(face=><path key={face.id} data-glass-face={face.id} data-glass-bevel={face.bevel} d={face.path} fill={`url(#${gradient}${face.bevel?'-edge':''})`} opacity={face.opacity} stroke={face.bevel?'#ffffff':'none'} strokeOpacity=".3" strokeWidth=".35" strokeLinejoin="round" />)}
            </g>
          </svg>
        </div>
      </div>;
    })}
  </div>;
}
