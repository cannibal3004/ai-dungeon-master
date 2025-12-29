import { ReactNode, useMemo } from 'react';

interface WorldEntity {
  id: string;
  name: string;
  description?: string;
}

interface EntityHighlightProps {
  text: string;
  entities: {
    locations: WorldEntity[];
    npcs: WorldEntity[];
    shops: WorldEntity[];
    items: WorldEntity[];
  };
}

/**
 * Highlights entity names in text and shows descriptions on hover
 */
export function HighlightedText({ text, entities }: EntityHighlightProps): ReactNode {
  const allEntities = useMemo(() => {
    // Combine all entities and sort by name length (longest first to avoid partial matches)
    const combined = [
      ...entities.locations,
      ...entities.npcs,
      ...entities.shops,
      ...entities.items,
    ].sort((a, b) => b.name.length - a.name.length);
    
    return combined;
  }, [entities]);

  // Create a map of entity names to their data for quick lookup
  const entityMap = useMemo(() => {
    const map = new Map<string, WorldEntity>();
    allEntities.forEach(entity => {
      map.set(entity.name.toLowerCase(), entity);
    });
    return map;
  }, [allEntities]);

  // Split text and highlight entity mentions
  const parts: (string | { entity: WorldEntity; text: string })[] = [];
  let remaining = text;
  let lastIndex = 0;

  // Find all entity mentions (case-insensitive)
  const mentions: Array<{ start: number; end: number; entity: WorldEntity }> = [];
  
  allEntities.forEach(entity => {
    const regex = new RegExp(`\\b${entity.name}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      mentions.push({
        start: match.index,
        end: match.index + match[0].length,
        entity,
      });
    }
  });

  // Sort mentions by start position
  mentions.sort((a, b) => a.start - b.start);

  // Remove overlapping mentions (keep the first one)
  const nonOverlapping = mentions.reduce<typeof mentions>((acc, current) => {
    const lastMention = acc[acc.length - 1];
    if (!lastMention || current.start >= lastMention.end) {
      acc.push(current);
    }
    return acc;
  }, []);

  // Build result
  nonOverlapping.forEach(mention => {
    if (mention.start > lastIndex) {
      parts.push(text.substring(lastIndex, mention.start));
    }
    parts.push({
      entity: mention.entity,
      text: text.substring(mention.start, mention.end),
    });
    lastIndex = mention.end;
  });

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return (
    <>
      {parts.map((part, idx) =>
        typeof part === 'string' ? (
          part
        ) : (
          <span
            key={idx}
            style={{
              backgroundColor: '#ffd700',
              color: '#1a1a2e',
              padding: '0.1rem 0.3rem',
              borderRadius: '3px',
              fontWeight: 'bold',
              cursor: part.entity.description ? 'help' : 'default',
              borderBottom: part.entity.description ? '1px dotted #333' : 'none',
            }}
            title={part.entity.description || 'No description available'}
          >
            {part.text}
          </span>
        )
      )}
    </>
  );
}
