import React from "react";
import { NODE_TYPES } from "../utils/constants";

export default function EdgeLine({ from, to, nodes, animated }) {
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

  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={col1} />
          <stop offset="100%" stopColor={col2} />
        </linearGradient>
      </defs>
      <path
        d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth={2.5}
        strokeDasharray={animated ? "8 4" : "none"}
        style={animated ? { animation: "dash 0.6s linear infinite" } : {}}
        opacity={0.7}
      />
    </g>
  );
}
