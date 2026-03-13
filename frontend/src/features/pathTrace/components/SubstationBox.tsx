import type { LayoutSubstation } from '../utils/layoutEngine';

interface SubstationBoxProps {
  substation: LayoutSubstation;
  highlightedNodeIds: Set<string>;
  sourceNodeIds: Set<string>;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

export function SubstationBox({
  substation,
  highlightedNodeIds,
  sourceNodeIds,
}: SubstationBoxProps) {
  return (
    <g>
      {/* Substation container */}
      <rect
        x={substation.x}
        y={substation.y}
        width={substation.width}
        height={substation.height}
        rx={8}
        fill="#f9fafb"
        stroke="#d1d5db"
        strokeWidth={1}
      />
      {/* Header text */}
      <text
        x={substation.x + 12}
        y={substation.y + 22}
        fontSize={13}
        fontWeight={600}
        fill="#374151"
      >
        {substation.substationName}
      </text>

      {/* Equipment pill nodes */}
      {substation.nodes.map((node) => {
        const isSource = sourceNodeIds.has(node.equipmentId);
        const isHighlighted = highlightedNodeIds.has(node.equipmentId);

        let fill = '#ffffff';
        let stroke = '#9ca3af';
        if (isSource) {
          fill = '#dbeafe';
          stroke = '#3b82f6';
        }

        return (
          <g
            key={node.equipmentId}
            opacity={isHighlighted ? 1 : 0.3}
          >
            <rect
              x={node.x}
              y={node.y}
              width={node.width}
              height={node.height}
              rx={node.height / 2}
              fill={fill}
              stroke={stroke}
              strokeWidth={isSource ? 2 : 1}
            >
              {isSource && (
                <animate
                  attributeName="stroke-opacity"
                  values="1;0.4;1"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              )}
            </rect>
            <text
              x={node.x + node.width / 2}
              y={node.y + node.height / 2 + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="#374151"
            >
              {truncate(node.equipmentName, 10)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
