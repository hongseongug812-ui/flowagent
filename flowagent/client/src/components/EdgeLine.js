import React, { useState } from "react";
import { NODE_TYPES } from "../utils/constants";

export default function EdgeLine({ from, to, nodes, animated, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const a = nodes.find((n) => n.id === from);
  const b = nodes.find((n) => n.id === to);
  if (!a || !b) return null;

  const x1 = a.x + 227, y1 = a.y + 45;
  const x2 = b.x - 7, y2 = b.y + 45;
  const cx1 = x1 + Math.abs(x2 - x1) * 0.45;
  const cx2 = x2 - Math.abs(x2 - x1) * 0.45;

  const col1 = NODE_TYPES[a.type]?.color || "#666";
  const col2 = NODE_TYPES[b.type]?.color || "#666";
  const gid = `g-${from}-${to}`;

  // Midpoint for delete button
  const t = 0.5;
  const mx = (1-t)**3*x1 + 3*(1-t)**2*t*cx1 + 3*(1-t)*t**2*cx2 + t**3*x2;
  const my = (1-t)**3*y1 + 3*(1-t)**2*t*y1 + 3*(1-t)*t**2*y2 + t**3*y2;

  return (
    <g
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ pointerEvents: "all" }}
    >
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={col1} />
          <stop offset="100%" stopColor={col2} />
        </linearGradient>
      </defs>
      {/* Invisible wide path for easier hover */}
      <path
        d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
        fill="none"
        stroke="transparent"
        strokeWidth={14}
      />
      <path
        d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
        fill="none"
        stroke={hovered ? "#EF444488" : `url(#${gid})`}
        strokeWidth={hovered ? 3 : 2.5}
        strokeDasharray={animated ? "8 4" : "none"}
        style={animated ? { animation: "dash 0.6s linear infinite" } : {}}
        opacity={hovered ? 1 : 0.7}
      />
      {/* Delete button on hover */}
      {hovered && onDelete && (
        <g
          onClick={(e) => { e.stopPropagation(); onDelete(from, to); }}
          style={{ cursor: "pointer" }}
        >
          <circle cx={mx} cy={my} r={9} fill="#1A1A2E" stroke="#EF4444" strokeWidth={1.5} />
          <text x={mx} y={my + 4} textAnchor="middle" fontSize={10} fill="#EF4444" style={{ userSelect: "none" }}>✕</text>
        </g>
      )}
    </g>
  );
}
